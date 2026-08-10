const express = require('express');
const jwt = require('jsonwebtoken');
const Workspace = require('../models/Workspace');
const Plan = require('../models/Plan');
const crypto = require('crypto');

const router = express.Router();
const JWT_SECRET = 'nivora_secret_2025';

function auth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'جلسة غير صالحة' });
        req.user = user;
        next();
    });
}

// إنشاء Workspace
router.post('/', auth, async (req, res) => {
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
router.post('/join', auth, async (req, res) => {
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
router.get('/', auth, async (req, res) => {
    try {
        const workspaces = await Workspace.find({ 'members.userId': req.user.id });
        res.json(workspaces);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب مساحات العمل' });
    }
});

// ========== صلاحيات الأعضاء ==========

// جلب أعضاء workspace
router.get('/:id/members', auth, async (req, res) => {
    try {
        const ws = await Workspace.findById(req.params.id);
        if (!ws) return res.status(404).json({ error: 'غير موجود' });

        const User = require('../models/User');
        const membersWithUsers = [];
        
        for (const m of ws.members) {
            const user = await User.findById(m.userId);
            membersWithUsers.push({
                _id: m._id,
                userId: user ? { _id: user._id, username: user.username, email: user.email } : null,
                role: m.role,
                joinedAt: m.joinedAt
            });
        }

        res.json(membersWithUsers);
    } catch (err) {
        console.error('خطأ في جلب الأعضاء:', err);
        res.status(500).json({ error: 'خطأ' });
    }
});

// تغيير دور عضو (فقط Owner)
router.patch('/:id/members/:userId', auth, async (req, res) => {
    try {
        const ws = await Workspace.findById(req.params.id);
        if (!ws) return res.status(404).json({ error: 'غير موجود' });

        const member = ws.members.find(m => m.userId.toString() === req.user.id);
        if (!member || member.role !== 'owner') return res.status(403).json({ error: 'فقط المالك يستطيع تغيير الأدوار' });

        const target = ws.members.find(m => m.userId.toString() === req.params.userId);
        if (!target) return res.status(404).json({ error: 'عضو غير موجود' });

        if (req.body.role) target.role = req.body.role;
        await ws.save();
        res.json(ws);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// إزالة عضو (Owner و Admin)
router.delete('/:id/members/:userId', auth, async (req, res) => {
    try {
        const ws = await Workspace.findById(req.params.id);
        if (!ws) return res.status(404).json({ error: 'غير موجود' });

        const member = ws.members.find(m => m.userId.toString() === req.user.id);
        if (!member || !['owner', 'admin'].includes(member.role)) return res.status(403).json({ error: 'صلاحيات غير كافية' });

        ws.members = ws.members.filter(m => m.userId.toString() !== req.params.userId);
        await ws.save();
        res.json(ws);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// ========== خطة الاشتراك ==========

// تحديث خطة workspace (فقط Owner)
router.patch('/:id/plan', auth, async (req, res) => {
    try {
        const ws = await Workspace.findById(req.params.id);
        const member = ws.members.find(m => m.userId.toString() === req.user.id);
        if (!member || member.role !== 'owner') return res.status(403).json({ error: 'فقط المالك يستطيع تغيير الخطة' });

        const { planId } = req.body;
        const plan = await Plan.findById(planId);
        if (!plan) return res.status(404).json({ error: 'خطة غير موجودة' });

        ws.plan = plan.name;
        ws.maxMembers = plan.maxMembers;
        ws.maxProjects = plan.maxProjects;
        await ws.save();
        res.json(ws);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

module.exports = router;