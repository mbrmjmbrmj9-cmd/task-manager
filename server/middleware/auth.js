const { readSession } = require('../config/session');
const Workspace = require('../models/Workspace');
const Organization = require('../models/Organization');
const Task = require('../models/Task');
const Project = require('../models/Project');
const { Types } = require('mongoose');
const { isValidObjectId } = require('./validate');

const AUTH_ERRORS = {
    NOT_AUTHENTICATED: 'يجب تسجيل الدخول',
    INVALID_SESSION: 'انتهت الجلسة أو أصبحت غير صالحة',
    INSUFFICIENT_PERMISSIONS: 'صلاحيات غير كافية',
    WORKSPACE_NOT_FOUND: 'مساحة العمل غير موجودة',
    TASK_NOT_FOUND: 'المهمة غير موجودة',
    PROJECT_NOT_FOUND: 'المشروع غير موجود',
    TENANT_ACCESS_DENIED: 'لا تملك صلاحية الوصول لهذه البيانات'
};

function authentication(audience) {
    return async (req, res, next) => {
        const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
        if (!match) return res.status(401).json({ error: AUTH_ERRORS.NOT_AUTHENTICATED });

        const user = await readSession(match[1], audience);
        if (!user) return res.status(401).json({ error: AUTH_ERRORS.INVALID_SESSION });
        req.user = user;
        next();
    };
}

const authenticate = authentication('nivora-app');
const adminAuth = authentication('nivora-admin');

function accessError(status, message) {
    return Object.assign(new Error(message), { status });
}

function sameId(first, second) {
    return first != null && second != null && String(first) === String(second);
}

function validateId(value) {
    if (value instanceof Types.ObjectId) return value;
    if (!isValidObjectId(value)) throw accessError(400, 'المعرّف غير صالح');
    return value;
}

async function requireWorkspace(id, userId) {
    const workspace = await Workspace.findById(validateId(id));
    if (!workspace || workspace.isActive === false) throw accessError(404, AUTH_ERRORS.WORKSPACE_NOT_FOUND);
    const membership = workspace.members.find(member => sameId(member.userId, userId));
    if (!membership) throw accessError(403, AUTH_ERRORS.TENANT_ACCESS_DENIED);

    if (workspace.organizationId) {
        const suspended = await Organization.exists({ _id: workspace.organizationId, status: 'suspended' });
        if (suspended) throw accessError(403, 'هذه المؤسسة معلّقة');
    }
    return { workspace, role: membership.role };
}

function requireRole(...roles) {
    return async (req, _res, next) => {
        const { workspace, role } = await requireWorkspace(req.params.id, req.user.id);
        if (roles.length && !roles.includes(role)) throw accessError(403, AUTH_ERRORS.INSUFFICIENT_PERMISSIONS);
        req.workspace = workspace;
        req.memberRole = role;
        next();
    };
}

const requireTenantAccess = requireRole();

async function authorizeResource(resource, userId, level, workspaceId = resource.workspaceId) {
    if (!workspaceId) {
        if (!sameId(resource.userId, userId)) throw accessError(403, AUTH_ERRORS.TENANT_ACCESS_DENIED);
        return null;
    }

    const access = await requireWorkspace(workspaceId, userId);
    const manager = ['owner', 'admin'].includes(access.role);
    const author = sameId(resource.userId, userId);
    const assignee = sameId(resource.assigneeId, userId);
    if (level === 'manage' && !manager && !author
        || level === 'edit' && !manager && !author && !assignee) {
        throw accessError(403, AUTH_ERRORS.INSUFFICIENT_PERMISSIONS);
    }
    return access.workspace;
}

async function getProject(id, userId, level = 'read') {
    const project = await Project.findById(validateId(id));
    if (!project) throw accessError(404, AUTH_ERRORS.PROJECT_NOT_FOUND);
    await authorizeResource(project, userId, level);
    return project;
}

async function getTask(id, userId, level = 'read') {
    const task = await Task.findById(validateId(id));
    if (!task) throw accessError(404, AUTH_ERRORS.TASK_NOT_FOUND);
    let workspaceId = task.workspaceId;
    if (task.projectId) {
        const project = await Project.findById(task.projectId);
        if (!project || (!project.workspaceId && !sameId(project.userId, userId))) {
            throw accessError(404, AUTH_ERRORS.PROJECT_NOT_FOUND);
        }
        if (workspaceId && !sameId(workspaceId, project.workspaceId)) {
            throw accessError(403, AUTH_ERRORS.TENANT_ACCESS_DENIED);
        }
        workspaceId = project.workspaceId;
    }
    const workspace = await authorizeResource(task, userId, level, workspaceId);
    return { task, workspace };
}

function taskAccess(level = 'read') {
    return async (req, _res, next) => {
        const { task, workspace } = await getTask(req.params.id, req.user.id, level);
        req.task = task;
        req.workspace = workspace;
        next();
    };
}

function projectAccess(level = 'read') {
    return async (req, _res, next) => {
        req.project = await getProject(req.params.id, req.user.id, level);
        next();
    };
}

async function listScope(workspaceId, userId) {
    if (!workspaceId) return { userId, workspaceId: null };
    await requireWorkspace(workspaceId, userId);
    return { workspaceId };
}

module.exports = {
    authenticate, adminAuth, requireRole, requireTenantAccess, requireWorkspace, getProject, getTask,
    taskAccess, projectAccess, listScope, validateId, sameId, accessError, AUTH_ERRORS
};
