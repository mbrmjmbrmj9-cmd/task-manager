const express = require('express');
const { Types, connection } = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const { authenticate, projectAccess, listScope, requireWorkspace, accessError } = require('../middleware/auth');
const { removeStoredUpload } = require('../config/storage');

const router = express.Router();
router.use(authenticate);

const statuses = ['active', 'completed', 'archived'];
const views = ['list', 'kanban', 'gantt', 'calendar', 'table'];
const toggles = ['enableChat', 'enableFiles', 'enableGantt', 'enableCalendar', 'enableWorkflows', 'enableBudget', 'isPublic'];

function projectFields(input) {
    const fields = {};
    if (input.name !== undefined) {
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) {
            throw accessError(400, 'اسم المشروع مطلوب وبحد أقصى 120 حرفًا');
        }
        fields.name = input.name.trim();
    }
    if (input.description !== undefined) {
        if (typeof input.description !== 'string' || input.description.length > 3000) throw accessError(400, 'وصف المشروع غير صالح');
        fields.description = input.description.trim();
    }
    if (input.color !== undefined) {
        if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) throw accessError(400, 'لون المشروع غير صالح');
        fields.color = input.color;
    }
    return fields;
}

function settingsFields(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw accessError(400, 'إعدادات المشروع غير صالحة');
    const fields = {};
    for (const key of toggles) {
        if (input[key] === undefined) continue;
        if (typeof input[key] !== 'boolean') throw accessError(400, 'إعداد غير صالح');
        fields[key] = input[key];
    }
    if (input.defaultView !== undefined) {
        if (!views.includes(input.defaultView)) throw accessError(400, 'العرض الافتراضي غير صالح');
        fields.defaultView = input.defaultView;
    }
    return fields;
}

async function withStats(projects, userId) {
    if (!projects.length) return [];
    const workspaceId = projects[0].workspaceId;
    const filter = {
        projectId: { $in: projects.map(project => project._id) },
        status: { $ne: 'archived' }
    };
    if (workspaceId) filter.$or = [{ workspaceId }, { workspaceId: null }];
    else {
        filter.workspaceId = null;
        filter.userId = Types.ObjectId.createFromHexString(userId);
    }
    const counts = await Task.aggregate([
        { $match: filter },
        { $group: {
            _id: '$projectId',
            taskCount: { $sum: 1 },
            doneCount: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            inProgressCount: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
            overdueCount: { $sum: { $cond: [{ $and: [
                { $gt: ['$dueDate', null] }, { $lt: ['$dueDate', new Date()] }, { $ne: ['$status', 'done'] }
            ] }, 1, 0] } }
        } }
    ]);
    const byId = new Map(counts.map(({ _id, ...values }) => [String(_id), values]));
    return projects.map(project => {
        const stats = byId.get(String(project._id)) || { taskCount: 0, doneCount: 0, inProgressCount: 0, overdueCount: 0 };
        return { ...project, ...stats, completionRate: stats.taskCount ? Math.round(stats.doneCount * 100 / stats.taskCount) : 0 };
    });
}

router.get('/', async (req, res) => {
    const filter = await listScope(req.query.workspaceId, req.user.id);
    if (req.query.status !== undefined) {
        if (!statuses.includes(req.query.status)) throw accessError(400, 'حالة المشروع غير صالحة');
        filter.status = req.query.status;
    }
    const list = Project.find(filter).sort({ createdAt: -1, _id: -1 });
    if (req.query.view === 'options') {
        res.json(await list.select('name status').lean());
        return;
    }
    const projects = await list.lean();
    res.json(await withStats(projects, req.user.id));
});

router.get('/:id', projectAccess(), async (req, res) => {
    const [project] = await withStats([req.project.toObject()], req.user.id);
    res.json(project);
});

router.post('/', async (req, res) => {
    const input = req.body || {};
    const fields = projectFields(input);
    if (!fields.name) throw accessError(400, 'اسم المشروع مطلوب');
    let workspaceId = null;
    if (input.workspaceId) {
        const { workspace } = await requireWorkspace(input.workspaceId, req.user.id);
        workspaceId = workspace._id;
        const count = await Project.countDocuments({ workspaceId, status: { $ne: 'archived' } });
        if (count >= workspace.maxProjects) throw accessError(409, 'وصلت للحد الأقصى للمشاريع في خطتك');
    }
    const project = await Project.create({ ...fields, userId: req.user.id, workspaceId });
    res.status(201).json(project);
});

router.patch('/:id', projectAccess('manage'), async (req, res) => {
    const input = req.body || {};
    const project = req.project;
    project.set(projectFields(input));
    if (input.status !== undefined) setStatus(project, input.status, req.user.id);
    if (input.settings !== undefined) project.set('settings', { ...project.settings.toObject(), ...settingsFields(input.settings) });
    await project.save();
    res.json({ message: 'تم تحديث المشروع بنجاح', project });
});

router.delete('/:id', projectAccess('manage'), async (req, res) => {
    const project = req.project;
    if (project.status !== 'archived') throw accessError(409, 'أرشف المشروع قبل حذفه نهائيًا');
    const Folder = require('../models/Folder');
    const File = require('../models/File');
    const Message = require('../models/Message');
    const filter = { projectId: project._id };
    const storageKeys = await connection.transaction(async session => {
        const deleted = await Project.deleteOne({ _id: project._id, status: 'archived' }, { session });
        if (!deleted.deletedCount) throw accessError(409, 'تغيّرت حالة المشروع');
        const tasks = await Task.find(filter).select('attachments.storageKey').session(session).lean();
        const files = await File.find(filter).select('storageKey').session(session).lean();
        await Task.deleteMany(filter, { session });
        await File.deleteMany(filter, { session });
        await Folder.deleteMany(filter, { session });
        await Message.deleteMany(filter, { session });
        return [...files.map(file => file.storageKey), ...tasks.flatMap(task => task.attachments.map(file => file.storageKey))];
    });
    for (const key of new Set(storageKeys)) await removeStoredUpload(key);
    res.json({ message: 'تم حذف المشروع وبياناته' });
});

function setStatus(project, status, userId) {
    if (!statuses.includes(status)) throw accessError(400, 'حالة المشروع غير صالحة');
    if (project.status === status) return;
    project.status = status;
    project.archivedAt = status === 'archived' ? new Date() : null;
    project.archivedBy = status === 'archived' ? userId : null;
}

function updateStatus(status, message) {
    return async (req, res) => {
        setStatus(req.project, status, req.user.id);
        await req.project.save();
        res.json({ message, project: req.project });
    };
}

router.patch('/:id/archive', projectAccess('manage'), updateStatus('archived', 'تمت أرشفة المشروع'));
router.patch('/:id/restore', projectAccess('manage'), updateStatus('active', 'تمت استعادة المشروع'));

router.get('/:id/settings', projectAccess(), (req, res) => {
    const project = req.project;
    res.json({ projectId: project._id, projectName: project.name, settings: project.settings });
});

router.patch('/:id/settings', projectAccess('manage'), async (req, res) => {
    const project = req.project;
    project.set('settings', { ...project.settings.toObject(), ...settingsFields(req.body) });
    await project.save();
    res.json({ message: 'تم تحديث الإعدادات بنجاح', settings: project.settings });
});

module.exports = router;
