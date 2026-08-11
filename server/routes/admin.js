const express = require('express');
const jwt = require('jsonwebtoken');
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
const bcrypt = require('bcryptjs');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'nivora_secret_2025';

// Admin Login (لا تحتاج مصادقة)
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log('محاولة دخول:', email);
    
    const user = await User.findOne({ username: email });
    console.log('المستخدم موجود:', !!user, user?.role);
    
    if (!user) return res.status(401).json({ error: 'غير موجود' });
    if (user.role !== 'super_admin') return res.status(401).json({ error: 'غير مصرح' });
    
    const valid = await bcrypt.compare(password, user.password);
    console.log('كلمة المرور صحيحة:', valid);
    
    if (!valid) return res.status(401).json({ error: 'كلمة مرور غير صحيحة' });
    
    const token = jwt.sign({ id: user._id, username: user.username, role: 'super_admin' }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
});

// جميع المسارات التالية محمية بـ adminAuth
router.use(adminAuth);

// إحصائيات
router.get('/stats', async (req, res) => {
    const totalOrgs = await Organization.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalTasks = await Task.countDocuments();
    const totalProjects = await Project.countDocuments();
    const activeOrgs = await Organization.countDocuments({ status: 'active' });
    const trialOrgs = await Organization.countDocuments({ status: 'trial' });

    res.json({ totalOrgs, totalUsers, totalTasks, totalProjects, activeOrgs, trialOrgs });
});

// كل المؤسسات
router.get('/organizations', async (req, res) => {
    const orgs = await Organization.find().populate('ownerId', 'username email');
    res.json(orgs);
});

// كل المستخدمين
router.get('/users', async (req, res) => {
    const users = await User.find().select('-password');
    res.json(users);
});

// تغيير خطة مؤسسة
router.patch('/organizations/:id/plan', async (req, res) => {
    const org = await Organization.findByIdAndUpdate(req.params.id, { plan: req.body.plan }, { new: true });
    res.json(org);
});

// تعليق/تفعيل مؤسسة
router.patch('/organizations/:id/status', async (req, res) => {
    const org = await Organization.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(org);
});

// إحصائيات متقدمة
router.get('/advanced-stats', async (req, res) => {
    const totalOrgs = await Organization.countDocuments();
    const activeOrgs = await Organization.countDocuments({ status: 'active' });
    const totalUsers = await User.countDocuments();
    const totalTasks = await Task.countDocuments();
    const totalProjects = await Project.countDocuments();
    
    const activeSubs = await Subscription.countDocuments({ status: 'active' });
    const totalRevenue = await Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const revenue = totalRevenue[0]?.total || 0;
    
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
    const newSubsThisMonth = await Subscription.countDocuments({ createdAt: { $gte: thisMonth } });
    const revenueThisMonth = await Payment.aggregate([{ $match: { status: 'completed', createdAt: { $gte: thisMonth } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);

    res.json({
        totalOrgs, activeOrgs, totalUsers, totalTasks, totalProjects,
        activeSubs, totalRevenue: revenue,
        newSubsThisMonth,
        revenueThisMonth: revenueThisMonth[0]?.total || 0
    });
});

// سجلات التدقيق
router.get('/audit-logs', async (req, res) => {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
    res.json(logs);
});

// تنبيهات المدير
router.get('/alerts', async (req, res) => {
    const alerts = [];
    
    const expiringSoon = await Subscription.countDocuments({
        status: 'active',
        endDate: { $lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), $gte: new Date() }
    });
    if (expiringSoon > 0) alerts.push({ type: 'warning', text: `${expiringSoon} اشتراك على وشك الانتهاء` });
    
    const pastDue = await Subscription.countDocuments({ status: 'past_due' });
    if (pastDue > 0) alerts.push({ type: 'danger', text: `${pastDue} اشتراك متأخر` });
    
    const today = new Date(); today.setHours(0,0,0,0);
    const newUsers = await User.countDocuments({ createdAt: { $gte: today } });
    if (newUsers > 0) alerts.push({ type: 'info', text: `${newUsers} مستخدم جديد اليوم` });
    
    res.json(alerts);
});

// Feature Flags
router.get('/feature-flags', async (req, res) => {
    const flags = await FeatureFlag.find();
    res.json(flags);
});

router.post('/feature-flags', async (req, res) => {
    const { name, enabled, description } = req.body;
    const flag = await FeatureFlag.findOneAndUpdate(
        { name }, { enabled, description }, { upsert: true, new: true }
    );
    res.json(flag);
});

// Usage
router.get('/usage/:orgId', async (req, res) => {
    const records = await UsageRecord.find({ organizationId: req.params.orgId }).sort({ recordedAt: -1 }).limit(50);
    res.json(records);
});

// Tickets
router.get('/tickets', async (req, res) => {
    const tickets = await Ticket.find().populate('organizationId', 'name').populate('userId', 'username').sort({ createdAt: -1 });
    res.json(tickets);
});

router.patch('/tickets/:id', async (req, res) => {
    const ticket = await Ticket.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(ticket);
});

module.exports = router;