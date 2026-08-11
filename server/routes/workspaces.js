const express = require('express');
const Workspace = require('../models/Workspace');
const Plan = require('../models/Plan');
const User = require('../models/User');
const crypto = require('crypto');
const { authenticate, requireRole, AUTH_ERRORS } = require('../middleware/auth');

const router = express.Router();

// إنشاء Workspace
router.post('/', authenticate, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
        const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        const workspace = await Workspace.create({
            name,
            ownerId: req.user.id,
            members: [{ userId: req.user.id, role: 'owner' }],
            inviteCode
        });
        res.status(201).json(workspace);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إنشاء مساحة العمل' });
    }
});

// الانضمام بـ Invite Code
router.post('/join', authenticate, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'الرمز مطلوب' });
        const workspace = await Workspace.findOne({ inviteCode: code.toUpperCase() });
        if (!workspace) return res.status(404).json({ error: 'رمز غير صحيح' });

        const already = workspace.members.find(m => m.userId.toString() === req.user.id);
        if (already) return res.status(400).json({ error: 'أنت عضو بالفعل' });

        if (workspace.members.length >= workspace.maxMembers) {
            return res.status(400).json({ error: 'تم الوصول للحد الأقصى للأعضاء' });
        }

        workspace.members.push({ userId: req.user.id, role: 'member' });
        await workspace.save();
        res.json(workspace);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الانضمام' });
    }
});

// جلب Workspaces المستخدم
router.get('/', authenticate, async (req, res) => {
    try {
        const workspaces = await Workspace.find({ 'members.userId': req.user.id });
        res.json(workspaces);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب مساحات العمل' });
    }
});

// مغادرة Workspace
router.post('/:id/leave', authenticate, async (req, res) => {
    try {
        const ws = await Workspace.findById(req.params.id);
        if (!ws) return res.status(404).json({ error: AUTH_ERRORS.WORKSPACE_NOT_FOUND });

        const member = ws.members.find(m => m.userId.toString() === req.user.id);
        if (!member) return res.status(400).json({ error: AUTH_ERRORS.NOT_MEMBER });

        if (member.role === 'owner') {
            return res.status(400).json({ error: 'المالك لا يستطيع المغادرة. انقل الملكية أولاً أو احذف مساحة العمل' });
        }

        ws.members = ws.members.filter(m => m.userId.toString() !== req.user.id);
        await ws.save();
        res.json({ message: 'تمت المغادرة بنجاح' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في المغادرة' });
    }
});

// ========== صلاحيات الأعضاء ==========

// جلب أعضاء workspace
router.get('/:id/members', authenticate, async (req, res) => {
    try {
        const ws = await Workspace.findById(req.params.id);
        if (!ws) return res.status(404).json({ error: AUTH_ERRORS.WORKSPACE_NOT_FOUND });

        const membersWithUsers = [];
        
        for (const m of ws.members) {
            const user = await User.findById(m.userId);
            membersWithUsers.push({
                _id: m._id,
                userId: user ? { _id: user._id, username: user.username, email: user.email, fullName: user.fullName, avatar: user.avatar } : null,
                role: m.role,
                joinedAt: m.joinedAt
            });
        }

        res.json(membersWithUsers);
    } catch (err) {
        console.error('خطأ في جلب الأعضاء:', err);
        res.status(500).json({ error: 'خطأ في جلب الأعضاء' });
    }
});

// تغيير دور عضو (فقط Owner)
router.patch('/:id/members/:userId', authenticate, requireRole('owner'), async (req, res) => {
    try {
        const ws = req.workspace; // من requireRole middleware
        const target = ws.members.find(m => m.userId.toString() === req.params.userId);
        if (!target) return res.status(404).json({ error: 'عضو غير موجود' });

        // منع تغيير دور المالك
        if (target.role === 'owner') {
            return res.status(400).json({ error: 'لا يمكن تغيير دور المالك. استخدم نقل الملكية.' });
        }

        if (req.body.role) target.role = req.body.role;
        await ws.save();
        res.json(ws);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تغيير الدور' });
    }
});

// إزالة عضو (Owner و Admin)
router.delete('/:id/members/:userId', authenticate, requireRole('owner', 'admin'), async (req, res) => {
    try {
        const ws = req.workspace; // من requireRole middleware
        const target = ws.members.find(m => m.userId.toString() === req.params.userId);
        if (!target) return res.status(404).json({ error: 'عضو غير موجود' });

        // منع إزالة المالك
        if (target.role === 'owner') {
            return res.status(400).json({ error: 'لا يمكن إزالة المالك. استخدم نقل الملكية أولاً.' });
        }

        ws.members = ws.members.filter(m => m.userId.toString() !== req.params.userId);
        await ws.save();
        res.json({ message: 'تم إزالة العضو بنجاح', workspace: ws });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إزالة العضو' });
    }
});

// ========== نقل الملكية ==========

// نقل ملكية Workspace (فقط Owner)
router.post('/:id/transfer-ownership', authenticate, requireRole('owner'), async (req, res) => {
    try {
        const ws = req.workspace; // من requireRole middleware
        const { newOwnerId } = req.body;
        
        if (!newOwnerId) return res.status(400).json({ error: 'معرف المالك الجديد مطلوب' });
        
        const newOwner = ws.members.find(m => m.userId.toString() === newOwnerId);
        if (!newOwner) return res.status(400).json({ error: 'المستخدم ليس عضواً في مساحة العمل' });
        
        if (newOwner.userId.toString() === req.user.id) {
            return res.status(400).json({ error: 'أنت المالك بالفعل' });
        }
        
        // تغيير المالك الحالي إلى admin
        const currentOwner = ws.members.find(m => m.userId.toString() === req.user.id);
        if (currentOwner) currentOwner.role = 'admin';
        
        // تعيين المالك الجديد
        newOwner.role = 'owner';
        ws.ownerId = newOwnerId;
        
        await ws.save();
        res.json({ message: 'تم نقل الملكية بنجاح', workspace: ws });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في نقل الملكية' });
    }
});

// ========== حدود الاستخدام ==========

// جلب حدود استخدام Workspace
router.get('/:id/usage', authenticate, async (req, res) => {
    try {
        const ws = await Workspace.findById(req.params.id);
        if (!ws) return res.status(404).json({ error: AUTH_ERRORS.WORKSPACE_NOT_FOUND });
        
        const Project = require('../models/Project');
        const projectCount = await Project.countDocuments({ workspaceId: ws._id });
        
        res.json({
            workspaceId: ws._id,
            plan: ws.plan,
            maxMembers: ws.maxMembers,
            currentMembers: ws.members.length,
            maxProjects: ws.maxProjects,
            currentProjects: projectCount,
            membersRemaining: ws.maxMembers - ws.members.length,
            projectsRemaining: ws.maxProjects - projectCount
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب حدود الاستخدام' });
    }
});

// ========== خطة الاشتراك ==========

// تحديث خطة workspace (فقط Owner)
router.patch('/:id/plan', authenticate, requireRole('owner'), async (req, res) => {
    try {
        const ws = req.workspace; // من requireRole middleware
        const { planId } = req.body;
        
        const plan = await Plan.findById(planId);
        if (!plan) return res.status(404).json({ error: 'خطة غير موجودة' });

        ws.plan = plan.name;
        ws.maxMembers = plan.maxMembers;
        ws.maxProjects = plan.maxProjects;
        await ws.save();
        res.json({ message: 'تم تحديث الخطة بنجاح', workspace: ws });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث الخطة' });
    }
});

// ========== إعدادات Workspace ==========

// تحديث إعدادات Workspace (فقط Owner)
router.patch('/:id/settings', authenticate, requireRole('owner'), async (req, res) => {
    try {
        const ws = req.workspace; // من requireRole middleware
        const allowed = ['name'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) ws[field] = req.body[field];
        });
        await ws.save();
        res.json({ message: 'تم تحديث الإعدادات', workspace: ws });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث الإعدادات' });
    }
});

module.exports = router;