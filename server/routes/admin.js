const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const FeatureFlag = require('../models/FeatureFlag');
const UsageRecord = require('../models/UsageRecord');
const Ticket = require('../models/Ticket');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// ✅ Secrets من متغيرات البيئة
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ✅ دالة Logging منظمة
function logAdmin(action, details, req) {
    try {
        AuditLog.create({
            userId: req.user?.id || null,
            username: req.user?.username || 'unknown',
            action,
            details,
            ip: req.ip,
            createdAt: new Date()
        });
    } catch (err) {
        console.error('[Admin] فشل تسجيل العملية:', err);
    }
}

// ✅ دالة معالجة الأخطاء
function handleError(res, err, message = 'خطأ في الخادم') {
    console.error(`[Admin] ${message}:`, err);
    res.status(500).json({ error: message });
}

// ========== Admin Login ==========
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });
        }

        const user = await User.findOne({ username: email });

        if (!user || user.role !== 'super_admin') {
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }

        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, role: 'super_admin' },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        logAdmin('admin_login', 'تسجيل دخول المدير', req);

        res.json({ token });
    } catch (err) {
        handleError(res, err, 'خطأ في تسجيل الدخول');
    }
});

// ========== كل المسارات التالية محمية ==========
router.use(adminAuth);

// ========== إحصائيات ==========
router.get('/stats', async (req, res) => {
    try {
        const [totalOrgs, totalUsers, totalTasks, totalProjects, activeOrgs, trialOrgs] = await Promise.all([
            Organization.countDocuments(),
            User.countDocuments(),
            Task.countDocuments(),
            Project.countDocuments(),
            Organization.countDocuments({ status: 'active' }),
            Organization.countDocuments({ status: 'trial' })
        ]);

        res.json({ totalOrgs, totalUsers, totalTasks, totalProjects, activeOrgs, trialOrgs });
    } catch (err) {
        handleError(res, err, 'خطأ في جلب الإحصائيات');
    }
});

// ========== المؤسسات ==========
router.get('/organizations', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [orgs, total] = await Promise.all([
            Organization.find()
                .populate('ownerId', 'username email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Organization.countDocuments()
        ]);

        res.json({
            data: orgs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (err) {
        handleError(res, err, 'خطأ في جلب المؤسسات');
    }
});

// ========== المستخدمون ==========
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            User.find().select('-password -resetToken -resetTokenExpiry').sort({ createdAt: -1 }).skip(skip).limit(limit),
            User.countDocuments()
        ]);

        res.json({
            data: users,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (err) {
        handleError(res, err, 'خطأ في جلب المستخدمين');
    }
});

// ========== تغيير خطة مؤسسة ==========
router.patch('/organizations/:id/plan', async (req, res) => {
    try {
        const { plan } = req.body;
        if (!plan) return res.status(400).json({ error: 'الخطة مطلوبة' });

        const org = await Organization.findByIdAndUpdate(req.params.id, { plan }, { new: true });

        if (!org) return res.status(404).json({ error: 'المؤسسة غير موجودة' });

        logAdmin('change_plan', `تغيير خطة مؤسسة ${org.name} إلى ${plan}`, req);

        res.json(org);
    } catch (err) {
        handleError(res, err, 'خطأ في تغيير الخطة');
    }
});

// ========== تعليق/تفعيل مؤسسة ==========
router.patch('/organizations/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'الحالة مطلوبة' });

        const org = await Organization.findByIdAndUpdate(req.params.id, { status }, { new: true });

        if (!org) return res.status(404).json({ error: 'المؤسسة غير موجودة' });

        logAdmin('change_status', `تغيير حالة مؤسسة ${org.name} إلى ${status}`, req);

        res.json(org);
    } catch (err) {
        handleError(res, err, 'خطأ في تغيير الحالة');
    }
});

// ========== إحصائيات متقدمة ==========
router.get('/advanced-stats', async (req, res) => {
    try {
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);

        const [
            totalOrgs, activeOrgs, totalUsers, totalTasks, totalProjects,
            activeSubs, newSubsThisMonth, completedPayments, monthlyPayments
        ] = await Promise.all([
            Organization.countDocuments(),
            Organization.countDocuments({ status: 'active' }),
            User.countDocuments(),
            Task.countDocuments(),
            Project.countDocuments(),
            Subscription.countDocuments({ status: 'active' }),
            Subscription.countDocuments({ createdAt: { $gte: thisMonth } }),
            Payment.find({ status: 'completed' }).select('amount'),
            Payment.find({ status: 'completed', createdAt: { $gte: thisMonth } }).select('amount')
        ]);

        const totalRevenue = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const revenueThisMonth = monthlyPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

        res.json({
            totalOrgs, activeOrgs, totalUsers, totalTasks, totalProjects,
            activeSubs, totalRevenue, newSubsThisMonth, revenueThisMonth
        });
    } catch (err) {
        handleError(res, err, 'خطأ في جلب الإحصائيات المتقدمة');
    }
});

// ========== Audit Logs مع Pagination + فلترة ==========
router.get('/audit-logs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const filter = {};

        if (req.query.username) {
            filter.username = { $regex: req.query.username, $options: 'i' };
        }

        if (req.query.action) {
            filter.action = req.query.action;
        }

        if (req.query.from || req.query.to) {
            filter.createdAt = {};
            if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
            if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
        }

        const [logs, total] = await Promise.all([
            AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            AuditLog.countDocuments(filter)
        ]);

        const actions = await AuditLog.distinct('action');

        res.json({
            data: logs,
            actions,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (err) {
        handleError(res, err, 'خطأ في جلب السجلات');
    }
});

// ========== تنبيهات ==========
router.get('/alerts', async (req, res) => {
    try {
        const alerts = [];

        const expiringSoon = await Subscription.countDocuments({
            status: 'active',
            endDate: { $lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), $gte: new Date() }
        });

        if (expiringSoon > 0) {
            alerts.push({ type: 'warning', text: `${expiringSoon} اشتراك على وشك الانتهاء` });
        }

        const pastDue = await Subscription.countDocuments({ status: 'past_due' });
        if (pastDue > 0) {
            alerts.push({ type: 'danger', text: `${pastDue} اشتراك متأخر` });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const newUsers = await User.countDocuments({ createdAt: { $gte: today } });
        if (newUsers > 0) {
            alerts.push({ type: 'info', text: `${newUsers} مستخدم جديد اليوم` });
        }

        const openTickets = await Ticket.countDocuments({ status: 'open' });
        if (openTickets > 0) {
            alerts.push({ type: 'warning', text: `${openTickets} تذكرة مفتوحة` });
        }

        res.json(alerts);
    } catch (err) {
        handleError(res, err, 'خطأ في جلب التنبيهات');
    }
});

// ========== Feature Flags ==========
router.get('/feature-flags', async (req, res) => {
    try {
        const flags = await FeatureFlag.find().sort({ name: 1 });
        res.json(flags);
    } catch (err) {
        handleError(res, err, 'خطأ في جلب الميزات');
    }
});

router.post('/feature-flags', async (req, res) => {
    try {
        const { name, enabled, description } = req.body;
        if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

        const flag = await FeatureFlag.findOneAndUpdate(
            { name },
            { enabled: !!enabled, description },
            { upsert: true, new: true }
        );

        logAdmin('feature_flag', `تحديث ميزة ${name}`, req);

        res.json(flag);
    } catch (err) {
        handleError(res, err, 'خطأ في تحديث الميزة');
    }
});

// ========== Usage ==========
router.get('/usage/:orgId', async (req, res) => {
    try {
        const records = await UsageRecord.find({ organizationId: req.params.orgId })
            .sort({ recordedAt: -1 })
            .limit(50);
        res.json(records);
    } catch (err) {
        handleError(res, err, 'خطأ في جلب الاستخدام');
    }
});

// ========== Tickets ==========
router.get('/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find()
            .populate('organizationId', 'name')
            .populate('userId', 'username email')
            .sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        handleError(res, err, 'خطأ في جلب التذاكر');
    }
});

router.patch('/tickets/:id', async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'الحالة مطلوبة' });

        const ticket = await Ticket.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });

        logAdmin('update_ticket', `تغيير حالة تذكرة إلى ${status}`, req);

        res.json(ticket);
    } catch (err) {
        handleError(res, err, 'خطأ في تحديث التذكرة');
    }
});

// ========== الرد على تذكرة ==========
router.post('/tickets/:id/reply', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'الرد مطلوب' });

        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });

        ticket.replies.push({
            userId: req.user.id,
            username: 'المدير',
            text: text.trim(),
            isAdmin: true
        });
        ticket.updatedAt = new Date();

        await ticket.save();
        logAdmin('reply_ticket', `رد على تذكرة: ${ticket.subject}`, req);

        res.json(ticket);
    } catch (err) {
        handleError(res, err, 'خطأ في الرد على التذكرة');
    }
});

// ========== جلب تذكرة واحدة مع الردود ==========
router.get('/tickets/:id', async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id)
            .populate('organizationId', 'name')
            .populate('userId', 'username email')
            .populate('replies.userId', 'username avatar');

        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });

        res.json(ticket);
    } catch (err) {
        handleError(res, err, 'خطأ في جلب التذكرة');
    }
});
// ========== تعطيل/تفعيل مستخدم ==========
router.patch('/users/:id/toggle-active', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

        user.isActive = !user.isActive;
        await user.save();

        logAdmin('toggle_user', `${user.isActive ? 'تفعيل' : 'تعطيل'} مستخدم ${user.username}`, req);

        res.json({ message: user.isActive ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم', user });
    } catch (err) {
        handleError(res, err, 'خطأ في تغيير حالة المستخدم');
    }
});

// ========== حذف مستخدم ==========
router.delete('/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

        logAdmin('delete_user', `حذف مستخدم ${user.username}`, req);

        res.json({ message: 'تم حذف المستخدم' });
    } catch (err) {
        handleError(res, err, 'خطأ في حذف المستخدم');
    }
});

// ========== تغيير دور مستخدم ==========
router.patch('/users/:id/role', async (req, res) => {
    try {
        const { role } = req.body;
        if (!role) return res.status(400).json({ error: 'الدور مطلوب' });

        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

        logAdmin('change_role', `تغيير دور ${user.username} إلى ${role}`, req);

        res.json(user);
    } catch (err) {
        handleError(res, err, 'خطأ في تغيير الدور');
    }
});
module.exports = router;