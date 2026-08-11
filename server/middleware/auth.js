const jwt = require('jsonwebtoken');
const Workspace = require('../models/Workspace');
const Task = require('../models/Task');
const Project = require('../models/Project');

const JWT_SECRET = process.env.JWT_SECRET || 'nivora_secret_2025';

/**
 * المصادقة - التحقق من JWT Token
 */
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'جلسة غير صالحة' });
        }
        req.user = user;
        next();
    });
}

/**
 * التحقق من الصلاحيات داخل Workspace
 * @param  {...string} roles - الأدوار المسموحة (owner, admin, member)
 */
function requireRole(...roles) {
    return async (req, res, next) => {
        try {
            // استخراج workspaceId من params أو body أو query
            const wsId = req.params.workspaceId || 
                         req.params.id || 
                         req.body.workspaceId || 
                         req.query.workspaceId;

            if (!wsId) {
                // إذا لم يكن هناك workspaceId، نبحث عن workspace ينتمي له المستخدم
                const ws = await Workspace.findOne({ 'members.userId': req.user.id });
                if (!ws) {
                    return res.status(404).json({ error: 'لا توجد مساحة عمل' });
                }
                
                const member = ws.members.find(m => m.userId.toString() === req.user.id);
                if (!member) {
                    return res.status(403).json({ error: 'لست عضواً في مساحة العمل' });
                }
                
                if (!roles.includes(member.role)) {
                    return res.status(403).json({ error: 'صلاحيات غير كافية' });
                }
                
                req.workspace = ws;
                req.memberRole = member.role;
                return next();
            }

            const ws = await Workspace.findById(wsId);
            if (!ws) {
                return res.status(404).json({ error: 'مساحة العمل غير موجودة' });
            }

            const member = ws.members.find(m => m.userId.toString() === req.user.id);
            if (!member) {
                return res.status(403).json({ error: 'لست عضواً في مساحة العمل' });
            }

            if (!roles.includes(member.role)) {
                return res.status(403).json({ error: 'صلاحيات غير كافية' });
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
            return res.status(404).json({ error: 'المهمة غير موجودة' });
        }
        
        // المستخدم هو مالك المهمة
        if (task.userId.toString() === req.user.id) {
            req.task = task;
            return next();
        }
        
        // أو المستخدم Admin/Owner في workspace
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
        
        return res.status(403).json({ error: 'لا تملك صلاحية على هذه المهمة' });
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
            return res.status(404).json({ error: 'المشروع غير موجود' });
        }
        
        // المستخدم هو مالك المشروع
        if (project.userId.toString() === req.user.id) {
            req.project = project;
            return next();
        }
        
        // أو المستخدم Admin/Owner في workspace
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
        
        return res.status(403).json({ error: 'لا تملك صلاحية على هذا المشروع' });
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
        return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        req.user = user;
        next();
    });
}

module.exports = { authenticate, requireRole, requireTaskOwnership, requireProjectOwnership, adminAuth };
