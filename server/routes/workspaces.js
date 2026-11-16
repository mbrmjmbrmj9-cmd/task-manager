const express = require('express');
const rateLimit = require('express-rate-limit');
const { randomBytes } = require('node:crypto');
const Workspace = require('../models/Workspace');
const Organization = require('../models/Organization');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Plan = require('../models/Plan');
const User = require('../models/User');
const { authenticate, requireRole, requireTenantAccess, sameId, validateId, accessError } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const joins = rateLimit({ windowMs: 10 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
    message: { error: 'حاول الانضمام مرة أخرى لاحقًا' } });

function workspaceName(input) {
    if (typeof input !== 'string' || !input.trim() || input.length > 120) throw accessError(400, 'اسم الفريق مطلوب وبحد أقصى 120 حرفًا');
    return input.trim();
}

function visibleWorkspace(workspace, userId) {
    const data = workspace.toObject();
    const role = data.members.find(member => sameId(member.userId, userId))?.role;
    if (role !== 'owner' && role !== 'admin') delete data.inviteCode;
    return { ...data, role };
}

router.post('/', async (req, res) => {
    const workspace = await Workspace.create({
        name: workspaceName(req.body?.name), ownerId: req.user.id,
        members: [{ userId: req.user.id, role: 'owner' }],
        inviteCode: randomBytes(8).toString('hex').toUpperCase()
    });
    res.status(201).json(visibleWorkspace(workspace, req.user.id));
});

router.post('/join', joins, async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    if (typeof code !== 'string' || !/^(?:[A-F0-9]{8}|[A-F0-9]{16})$/.test(code)) throw accessError(400, 'رمز الدعوة غير صالح');
    const target = await Workspace.findOne({ inviteCode: code, isActive: { $ne: false } });
    if (!target) throw accessError(404, 'رمز الدعوة غير صحيح أو انتهت صلاحيته');
    if (target.organizationId && await Organization.exists({ _id: target.organizationId, status: 'suspended' })) {
        throw accessError(403, 'هذه المؤسسة معلّقة');
    }
    if (target.members.some(member => sameId(member.userId, req.user.id))) {
        return res.json(visibleWorkspace(target, req.user.id));
    }
    const workspace = await Workspace.findOneAndUpdate({
        _id: target._id, inviteCode: code, isActive: { $ne: false }, 'members.userId': { $ne: req.user.id },
        $expr: { $lt: [{ $size: '$members' }, { $ifNull: ['$maxMembers', 3] }] }
    }, { $push: { members: { userId: req.user.id, role: 'member' } }, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (!workspace) {
        const current = await Workspace.findOne({ _id: target._id, isActive: { $ne: false }, 'members.userId': req.user.id });
        if (current) return res.json(visibleWorkspace(current, req.user.id));
        throw accessError(409, 'الرمز تغيّر أو وصل الفريق إلى الحد الأقصى للأعضاء');
    }
    res.json(visibleWorkspace(workspace, req.user.id));
});

router.get('/', async (req, res) => {
    const filter = { 'members.userId': req.user.id, isActive: { $ne: false } };
    if (req.query.archived === 'true') Object.assign(filter, { ownerId: req.user.id, isActive: false });
    const workspaces = await Workspace.find(filter).sort({ name: 1 });
    const suspended = new Set((await Organization.distinct('_id', {
        _id: { $in: workspaces.map(workspace => workspace.organizationId).filter(Boolean) }, status: 'suspended'
    })).map(String));
    const visible = workspaces.filter(workspace => !suspended.has(String(workspace.organizationId)));
    const result = visible.map(workspace => visibleWorkspace(workspace, req.user.id));
    if (req.query.include === 'usage' && visible.length) {
        const rows = await Project.aggregate([
            { $match: { workspaceId: { $in: visible.map(workspace => workspace._id) }, status: { $ne: 'archived' } } },
            { $group: { _id: '$workspaceId', count: { $sum: 1 } } }
        ]);
        const counts = new Map(rows.map(row => [String(row._id), row.count]));
        for (const item of result) item.usage = { currentProjects: counts.get(String(item._id)) || 0, maxProjects: item.maxProjects };
    }
    res.json(result);
});

router.post('/:id/leave', requireTenantAccess, async (req, res) => {
    if (req.memberRole === 'owner') throw accessError(409, 'انقل ملكية الفريق قبل المغادرة');
    req.workspace.members = req.workspace.members.filter(member => !sameId(member.userId, req.user.id));
    await req.workspace.save();
    res.json({ message: 'تمت المغادرة' });
});

router.get('/:id/members', requireTenantAccess, async (req, res) => {
    const users = await User.find({ _id: { $in: req.workspace.members.map(member => member.userId) } })
        .select('username fullName avatar isActive').lean();
    const byId = new Map(users.map(user => [String(user._id), user]));
    res.json(req.workspace.members.map(member => ({
        _id: member._id, role: member.role, joinedAt: member.joinedAt, userId: byId.get(String(member.userId)) || null
    })));
});

router.patch('/:id/members/:userId', requireRole('owner'), async (req, res) => {
    const role = req.body?.role;
    if (!['member', 'admin'].includes(role)) throw accessError(400, 'الدور غير صالح');
    const target = req.workspace.members.find(member => sameId(member.userId, req.params.userId));
    if (!target) throw accessError(404, 'عضو غير موجود');
    if (target.role === 'owner') throw accessError(409, 'انقل الملكية لتغيير دور المالك');
    target.role = role;
    await req.workspace.save();
    res.json(visibleWorkspace(req.workspace, req.user.id));
});

router.delete('/:id/members/:userId', requireRole('owner', 'admin'), async (req, res) => {
    const target = req.workspace.members.find(member => sameId(member.userId, req.params.userId));
    if (!target) throw accessError(404, 'عضو غير موجود');
    if (target.role === 'owner' || (target.role === 'admin' && req.memberRole !== 'owner')) {
        throw accessError(403, 'لا تملك صلاحية إزالة هذا العضو');
    }
    req.workspace.members.pull(target._id);
    await req.workspace.save();
    res.json({ message: 'تمت إزالة العضو' });
});

router.post('/:id/transfer-ownership', requireRole('owner'), async (req, res) => {
    const workspace = req.workspace;
    const id = validateId(req.body?.newOwnerId);
    const nextOwner = workspace.members.find(member => sameId(member.userId, id));
    const owner = workspace.members.find(member => sameId(member.userId, req.user.id));
    if (!nextOwner || nextOwner.role === 'owner' || !await User.exists({ _id: id, isActive: { $ne: false } })) {
        throw accessError(400, 'اختر عضوًا نشطًا لنقل الملكية');
    }
    owner.role = 'admin';
    nextOwner.role = 'owner';
    workspace.ownerId = id;
    await workspace.save();
    res.json({ message: 'تم نقل الملكية', workspace: visibleWorkspace(workspace, req.user.id) });
});

router.post('/:id/invite/rotate', requireRole('owner', 'admin'), async (req, res) => {
    req.workspace.inviteCode = randomBytes(8).toString('hex').toUpperCase();
    await req.workspace.save();
    res.json({ inviteCode: req.workspace.inviteCode });
});

router.get('/:id/usage', requireTenantAccess, async (req, res) => {
    const { _id, plan, maxMembers, maxProjects, members } = req.workspace;
    const currentProjects = await Project.countDocuments({ workspaceId: _id, status: { $ne: 'archived' } });
    res.json({
        workspaceId: _id, plan, maxMembers, maxProjects, currentMembers: members.length, currentProjects,
        membersRemaining: Math.max(0, maxMembers - members.length), projectsRemaining: Math.max(0, maxProjects - currentProjects)
    });
});

router.patch('/:id/plan', requireRole('owner'), async (req, res) => {
    let name = req.body?.plan;
    if (req.body?.planId) name = (await Plan.findById(validateId(req.body.planId)))?.name;
    if (name !== 'free') throw accessError(400, 'يتطلب تفعيل الخطة المدفوعة التواصل مع نيفورا');
    if (req.workspace.plan !== 'free') throw accessError(409, 'تواصل مع الدعم لتغيير اشتراكك الحالي');
    res.json({ message: 'الخطة المجانية مفعلة', workspace: visibleWorkspace(req.workspace, req.user.id) });
});

router.patch('/:id/settings', requireRole('owner'), async (req, res) => {
    req.workspace.name = workspaceName(req.body?.name);
    await req.workspace.save();
    res.json({ message: 'تم تحديث الإعدادات', workspace: visibleWorkspace(req.workspace, req.user.id) });
});

router.delete('/:id', requireRole('owner'), async (req, res) => {
    req.workspace.isActive = false;
    req.workspace.inviteCode = randomBytes(8).toString('hex').toUpperCase();
    await req.workspace.save();
    res.json({ message: 'تمت أرشفة مساحة العمل' });
});

router.patch('/:id/restore', async (req, res) => {
    const workspace = await Workspace.findOne({ _id: validateId(req.params.id), ownerId: req.user.id, isActive: false });
    if (!workspace) throw accessError(404, 'مساحة العمل المؤرشفة غير موجودة');
    workspace.isActive = true;
    await workspace.save();
    res.json(visibleWorkspace(workspace, req.user.id));
});

router.get('/:id/activity', requireTenantAccess, async (req, res) => {
    const workspaceId = req.workspace._id;
    const [projects, tasks] = await Promise.all([
        Project.find({ workspaceId }).sort({ updatedAt: -1 }).limit(10).lean(),
        Task.find({ workspaceId }).sort({ updatedAt: -1 }).limit(30).lean()
    ]);
    const activity = tasks.flatMap(task => (task.activity || []).slice(-5).map(entry => ({
        ...entry, taskTitle: task.title, taskId: task._id
    })));
    for (const project of projects) {
        activity.push({ action: 'تحديث مشروع', details: project.name, projectId: project._id, createdAt: project.updatedAt });
    }
    res.json(activity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30));
});

module.exports = router;
