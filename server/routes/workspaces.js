const express = require('express');
const Workspace = require('../models/Workspace');
const Plan = require('../models/Plan');
const User = require('../models/User');
const crypto = require('crypto');
const { authenticate, requireRole, requireTenantAccess, AUTH_ERRORS } = require('../middleware/auth');

const router = express.Router();

// إنشاء Workspace
router.post('/', authenticate, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
        const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        const workspace = await Workspace.create({ name, ownerId: req.user.id, members: [{ userId: req.user.id, role: 'owner' }], inviteCode });
        res.status(201).json(workspace);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إنشاء مساحة العمل' });
    }
});

// الانضمام
router.post('/join', authenticate, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'الرمز مطلوب' });
        const workspace = await Workspace.findOne({ inviteCode: code.toUpperCase() });
        if (!workspace) return res.status(404).json({ error: 'رمز غير صحيح' });
        const already = workspace.members.find(m => m.userId.toString() === req.user.id);
        if (already) return res.status(400).json({ error: 'أنت عضو بالفعل' });
        if (workspace.members.length >= workspace.maxMembers) return res.status(400).json({ error: 'تم الوصول للحد الأقصى للأعضاء' });
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

// مغادرة
router.post('/:id/leave', authenticate, requireTenantAccess, async (req, res) => {
    try {
        const ws = req.workspace;
        const member = ws.members.find(m => m.userId.toString() === req.user.id);
        if (member.role === 'owner') return res.status(400).json({ error: 'المالك لا يستطيع المغادرة' });
        ws.members = ws.members.filter(m => m.userId.toString() !== req.user.id);
        await ws.save();
        res.json({ message: 'تمت المغادرة بنجاح' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في المغادرة' });
    }
});

// جلب أعضاء
router.get('/:id/members', authenticate, requireTenantAccess, async (req, res) => {
    try {
        const ws = req.workspace;
        const membersWithUsers = [];
        for (const m of ws.members) {
            const user = await User.findById(m.userId);
            membersWithUsers.push({ _id: m._id, userId: user ? { _id: user._id, username: user.username, email: user.email, fullName: user.fullName, avatar: user.avatar } : null, role: m.role, joinedAt: m.joinedAt });
        }
        res.json(membersWithUsers);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الأعضاء' });
    }
});

// تغيير دور
router.patch('/:id/members/:userId', authenticate, requireRole('owner'), async (req, res) => {
    try {
        const ws = req.workspace;
        const target = ws.members.find(m => m.userId.toString() === req.params.userId);
        if (!target) return res.status(404).json({ error: 'عضو غير موجود' });
        if (target.role === 'owner') return res.status(400).json({ error: 'لا يمكن تغيير دور المالك' });
        if (req.body.role) target.role = req.body.role;
        await ws.save();
        res.json(ws);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تغيير الدور' });
    }
});

// إزالة عضو
router.delete('/:id/members/:userId', authenticate, requireRole('owner', 'admin'), async (req, res) => {
    try {
        const ws = req.workspace;
        const target = ws.members.find(m => m.userId.toString() === req.params.userId);
        if (!target) return res.status(404).json({ error: 'عضو غير موجود' });
        if (target.role === 'owner') return res.status(400).json({ error: 'لا يمكن إزالة المالك' });
        ws.members = ws.members.filter(m => m.userId.toString() !== req.params.userId);
        await ws.save();
        res.json({ message: 'تم إزالة العضو بنجاح', workspace: ws });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إزالة العضو' });
    }
});

// نقل ملكية
router.post('/:id/transfer-ownership', authenticate, requireRole('owner'), async (req, res) => {
    try {
        const ws = req.workspace;
        const { newOwnerId } = req.body;
        if (!newOwnerId) return res.status(400).json({ error: 'معرف المالك الجديد مطلوب' });
        const newOwner = ws.members.find(m => m.userId.toString() === newOwnerId);
        if (!newOwner) return res.status(400).json({ error: 'المستخدم ليس عضواً' });
        const currentOwner = ws.members.find(m => m.userId.toString() === req.user.id);
        if (currentOwner) currentOwner.role = 'admin';
        newOwner.role = 'owner';
        ws.ownerId = newOwnerId;
        await ws.save();
        res.json({ message: 'تم نقل الملكية بنجاح', workspace: ws });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في نقل الملكية' });
    }
});

// حدود الاستخدام
router.get('/:id/usage', authenticate, requireTenantAccess, async (req, res) => {
    try {
        const ws = req.workspace;
        const Project = require('../models/Project');
        const projectCount = await Project.countDocuments({ workspaceId: ws._id });
        res.json({ workspaceId: ws._id, plan: ws.plan, maxMembers: ws.maxMembers, currentMembers: ws.members.length, maxProjects: ws.maxProjects, currentProjects: projectCount, membersRemaining: ws.maxMembers - ws.members.length, projectsRemaining: ws.maxProjects - projectCount });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب حدود الاستخدام' });
    }
});

// تحديث خطة
router.patch('/:id/plan', authenticate, requireRole('owner'), async (req, res) => {
    try {
        const ws = req.workspace;
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

// إعدادات
router.patch('/:id/settings', authenticate, requireRole('owner'), async (req, res) => {
    try {
        const ws = req.workspace;
        const allowed = ['name'];
        allowed.forEach(field => { if (req.body[field] !== undefined) ws[field] = req.body[field]; });
        await ws.save();
        res.json({ message: 'تم تحديث الإعدادات', workspace: ws });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث الإعدادات' });
    }
});

// سجل نشاط
router.get('/:id/activity', authenticate, requireTenantAccess, async (req, res) => {
    try {
        const ws = req.workspace;
        const Task = require('../models/Task');
        const Project = require('../models/Project');
        const activities = [];
        const projects = await Project.find({ workspaceId: ws._id }).sort({ updatedAt: -1 }).limit(10);
        projects.forEach(p => activities.push({ type: 'project', action: 'إنشاء مشروع', username: 'مستخدم', details: p.name, taskId: p._id, createdAt: p.createdAt }));
        const tasks = await Task.find({ workspaceId: ws._id }).sort({ updatedAt: -1 }).limit(30);
        tasks.forEach(t => { if (t.activity && t.activity.length > 0) { t.activity.forEach(a => activities.push({ type: 'task', action: a.action, username: a.username, details: a.details, taskId: t._id, taskTitle: t.title, createdAt: a.createdAt || t.updatedAt })); } });
        ws.members.forEach(m => activities.push({ type: 'member', action: 'انضمام عضو', username: m.userId?.toString() || 'مستخدم', details: 'انضم إلى الفريق', createdAt: m.joinedAt }));
        activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(activities.slice(0, 50));
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب سجل النشاط' });
    }
});

module.exports = router;