const jwt = require('jsonwebtoken');
const Workspace = require('../models/Workspace');
const Task = require('../models/Task');
const Project = require('../models/Project');

const JWT_SECRET = process.env.JWT_SECRET || 'nivora_secret_2025';

// ✅ ثوابت رسائل الخطأ الموحدة
const AUTH_ERRORS = {
    NOT_AUTHENTICATED: 'يجب تسجيل الدخول',
    INVALID_SESSION: 'جلسة غير صالحة',
    NOT_AUTHORIZED: 'غير مصرح',
    NOT_MEMBER: 'لست عضواً في مساحة العمل',
    INSUFFICIENT_PERMISSIONS: 'صلاحيات غير كافية',
    WORKSPACE_NOT_FOUND: 'مساحة العمل غير موجودة',
    TASK_NOT_FOUND: 'المهمة غير موجودة',
    PROJECT_NOT_FOUND: 'المشروع غير موجود',
    ONLY_OWNER: 'فقط مالك مساحة العمل يستطيع القيام بهذا الإجراء',
    ONLY_OWNER_ADMIN: 'فقط المالك أو المدير يستطيع القيام بهذا الإجراء',
    NOT_TASK_OWNER: 'لا تملك صلاحية على هذه المهمة',
    NOT_PROJECT_OWNER: 'لا تملك صلاحية على هذا المشروع',
    ADMIN_REQUIRED: 'مطلوب تسجيل الدخول للوحة التحكم',
    ADMIN_NOT_AUTHORIZED: 'غير مصرح للوصول للوحة التحكم',
    TENANT_ACCESS_DENIED: 'لا تملك صلاحية الوصول لهذه البيانات'
};

/**
 * المصادقة - التحقق من JWT Token
 */
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: AUTH_ERRORS.NOT_AUTHENTICATED });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: AUTH_ERRORS.INVALID_SESSION });
        }
        req.user = user;
        next();
    });
}

/**
 * التحقق من الصلاحيات داخل Workspace
 */
function requireRole(...roles) {
    return async (req, res, next) => {
        try {
            const wsId = req.params.workspaceId || 
                         req.params.id || 
                         req.body.workspaceId || 
                         req.query.workspaceId;

            if (!wsId) {
                const ws = await Workspace.findOne({ 'members.userId': req.user.id });
                if (!ws) {
                    return res.status(404).json({ error: AUTH_ERRORS.WORKSPACE_NOT_FOUND });
                }
                
                const member = ws.members.find(m => m.userId.toString() === req.user.id);
                if (!member) {
                    return res.status(403).json({ error: AUTH_ERRORS.NOT_MEMBER });
                }
                
                if (!roles.includes(member.role)) {
                    return res.status(403).json({ error: AUTH_ERRORS.INSUFFICIENT_PERMISSIONS });
                }
                
                req.workspace = ws;
                req.memberRole = member.role;
                return next();
            }

            const ws = await Workspace.findById(wsId);
            if (!ws) {
                return res.status(404).json({ error: AUTH_ERRORS.WORKSPACE_NOT_FOUND });
            }

            const member = ws.members.find(m => m.userId.toString() === req.user.id);
            if (!member) {
                return res.status(403).json({ error: AUTH_ERRORS.NOT_MEMBER });
            }

            if (!roles.includes(member.role)) {
                return res.status(403).json({ error: AUTH_ERRORS.INSUFFICIENT_PERMISSIONS });
            }

            req.workspace = ws;
            req.memberRole = member.role;
            next();
        } catch (err) {
            console.error('خطأ في requireRole:', err);
            res.status(500).json({ error: 'خطأ في التحقق من الصلاحيات' });
        }
    };
}

/**
 * التحقق من ملكية المهمة
 */
async function requireTaskOwnership(req, res, next) {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ error: AUTH_ERRORS.TASK_NOT_FOUND });
        }
        
        if (task.userId.toString() === req.user.id) {
            req.task = task;
            return next();
        }
        
        if (task.workspaceId) {
            const ws = await Workspace.findById(task.workspaceId);
            if (ws) {
                const member = ws.members.find(m => m.userId.toString() === req.user.id);
                if (member && ['owner', 'admin'].includes(member.role)) {
                    req.task = task;
                    return next();
                }
            }
        }
        
        return res.status(403).json({ error: AUTH_ERRORS.NOT_TASK_OWNER });
    } catch (err) {
        console.error('خطأ في requireTaskOwnership:', err);
        res.status(500).json({ error: 'خطأ في التحقق من الملكية' });
    }
}

/**
 * التحقق من ملكية المشروع
 */
async function requireProjectOwnership(req, res, next) {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) {
            return res.status(404).json({ error: AUTH_ERRORS.PROJECT_NOT_FOUND });
        }
        
        if (project.userId.toString() === req.user.id) {
            req.project = project;
            return next();
        }
        
        if (project.workspaceId) {
            const ws = await Workspace.findById(project.workspaceId);
            if (ws) {
                const member = ws.members.find(m => m.userId.toString() === req.user.id);
                if (member && ['owner', 'admin'].includes(member.role)) {
                    req.project = project;
                    return next();
                }
            }
        }
        
        return res.status(403).json({ error: AUTH_ERRORS.NOT_PROJECT_OWNER });
    } catch (err) {
        console.error('خطأ في requireProjectOwnership:', err);
        res.status(500).json({ error: 'خطأ في التحقق من الملكية' });
    }
}

/**
 * مصادقة المدير (Super Admin)
 */
function adminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: AUTH_ERRORS.ADMIN_REQUIRED });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err || user.role !== 'super_admin') {
            return res.status(403).json({ error: AUTH_ERRORS.ADMIN_NOT_AUTHORIZED });
        }
        req.user = user;
        next();
    });
}

/**
 * التحقق من العضوية فقط
 */
async function requireMembership(req, res, next) {
    try {
        const wsId = req.params.workspaceId || 
                     req.params.id || 
                     req.body.workspaceId || 
                     req.query.workspaceId;

        if (!wsId) {
            return res.status(400).json({ error: 'معرف مساحة العمل مطلوب' });
        }

        const ws = await Workspace.findById(wsId);
        if (!ws) {
            return res.status(404).json({ error: AUTH_ERRORS.WORKSPACE_NOT_FOUND });
        }

        const member = ws.members.find(m => m.userId.toString() === req.user.id);
        if (!member) {
            return res.status(403).json({ error: AUTH_ERRORS.NOT_MEMBER });
        }

        req.workspace = ws;
        req.memberRole = member.role;
        next();
    } catch (err) {
        console.error('خطأ في requireMembership:', err);
        res.status(500).json({ error: 'خطأ في التحقق من العضوية' });
    }
}

/**
 * ✅ التحقق من الوصول إلى Tenant (Workspace)
 * يمنع الوصول غير المصرح لبيانات Workspaces أخرى
 */
async function requireTenantAccess(req, res, next) {
    try {
        const requestedWsId = req.params.workspaceId || 
                              req.body.workspaceId || 
                              req.query.workspaceId;

        // إذا لا يوجد workspaceId - السماح (المصادقة تكفي)
        if (!requestedWsId) {
            return next();
        }

        const ws = await Workspace.findById(requestedWsId);
        if (!ws) {
            return res.status(404).json({ error: AUTH_ERRORS.WORKSPACE_NOT_FOUND });
        }

        const isMember = ws.members.some(m => m.userId.toString() === req.user.id);
        if (!isMember) {
            return res.status(403).json({ error: AUTH_ERRORS.TENANT_ACCESS_DENIED });
        }

        req.workspace = ws;
        req.memberRole = ws.members.find(m => m.userId.toString() === req.user.id)?.role;
        next();
    } catch (err) {
        console.error('خطأ في requireTenantAccess:', err);
        res.status(500).json({ error: 'خطأ في التحقق من الوصول' });
    }
}

module.exports = { 
    authenticate, 
    requireRole, 
    requireTaskOwnership, 
    requireProjectOwnership, 
    adminAuth,
    requireMembership,
    requireTenantAccess,
    AUTH_ERRORS 
};