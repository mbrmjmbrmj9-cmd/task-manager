const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');

const router = express.Router();
const JWT_SECRET = 'nivora_secret_2025';
const ADMIN_USERNAME = 'aldyrhghryb708@gmail.com';
const ADMIN_PASSWORD = '123&%*abd';
function adminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'مطلوب' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err || user.role !== 'super_admin') return res.status(403).json({ error: 'غير مصرح' });
        req.user = user;
        next();
    });
}

// Admin Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log('محاولة دخول:', email);
    
    const user = await User.findOne({ username: email });
    console.log('المستخدم موجود:', !!user, user?.role);
    
    if (!user) return res.status(401).json({ error: 'غير موجود' });
    if (user.role !== 'super_admin') return res.status(401).json({ error: 'غير مصرح' });
    
    const valid = await require('bcryptjs').compare(password, user.password);
    console.log('كلمة المرور صحيحة:', valid);
    
    if (!valid) return res.status(401).json({ error: 'كلمة مرور غير صحيحة' });
    
    const token = jwt.sign({ id: user._id, username: user.username, role: 'super_admin' }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
});

// إحصائيات
router.get('/stats', adminAuth, async (req, res) => {
    const totalOrgs = await Organization.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalTasks = await Task.countDocuments();
    const totalProjects = await Project.countDocuments();
    const activeOrgs = await Organization.countDocuments({ status: 'active' });
    const trialOrgs = await Organization.countDocuments({ status: 'trial' });

    res.json({ totalOrgs, totalUsers, totalTasks, totalProjects, activeOrgs, trialOrgs });
});

// كل المؤسسات
router.get('/organizations', adminAuth, async (req, res) => {
    const orgs = await Organization.find().populate('ownerId', 'username email');
    res.json(orgs);
});

// كل المستخدمين
router.get('/users', adminAuth, async (req, res) => {
    const users = await User.find().select('-password');
    res.json(users);
});

// تغيير خطة مؤسسة
router.patch('/organizations/:id/plan', adminAuth, async (req, res) => {
    const org = await Organization.findByIdAndUpdate(req.params.id, { plan: req.body.plan }, { new: true });
    res.json(org);
});

// تعليق/تفعيل مؤسسة
router.patch('/organizations/:id/status', adminAuth, async (req, res) => {
    const org = await Organization.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(org);
});

// إحصائيات متقدمة
router.get('/advanced-stats', adminAuth, async (req, res) => {
    const totalOrgs = await Organization.countDocuments();
    const activeOrgs = await Organization.countDocuments({ status: 'active' });
    const totalUsers = await User.countDocuments();
    const totalTasks = await Task.countDocuments();
    const totalProjects = await Project.countDocuments();
    
    // الاشتراكات
    const activeSubs = await Subscription.countDocuments({ status: 'active' });
    const totalRevenue = await Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const revenue = totalRevenue[0]?.total || 0;
    
    // اشتراكات هذا الشهر
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

const AuditLog = require('../models/AuditLog');

router.get('/audit-logs', adminAuth, async (req, res) => {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
    res.json(logs);
});

// تنبيهات المدير
router.get('/alerts', adminAuth, async (req, res) => {
    const alerts = [];
    
    // اشتراكات على وشك الانتهاء
    const expiringSoon = await Subscription.countDocuments({
        status: 'active',
        endDate: { $lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), $gte: new Date() }
    });
    if (expiringSoon > 0) alerts.push({ type: 'warning', text: `${expiringSoon} اشتراك على وشك الانتهاء` });
    
    // اشتراكات متأخرة
    const pastDue = await Subscription.countDocuments({ status: 'past_due' });
    if (pastDue > 0) alerts.push({ type: 'danger', text: `${pastDue} اشتراك متأخر` });
    
    // مستخدمين جدد اليوم
    const today = new Date(); today.setHours(0,0,0,0);
    const newUsers = await User.countDocuments({ createdAt: { $gte: today } });
    if (newUsers > 0) alerts.push({ type: 'info', text: `${newUsers} مستخدم جديد اليوم` });
    
    res.json(alerts);
});

const FeatureFlag = require('../models/FeatureFlag');
const UsageRecord = require('../models/UsageRecord');

// Feature Flags
router.get('/feature-flags', adminAuth, async (req, res) => {
    const flags = await FeatureFlag.find();
    res.json(flags);
});

router.post('/feature-flags', adminAuth, async (req, res) => {
    const { name, enabled, description } = req.body;
    const flag = await FeatureFlag.findOneAndUpdate(
        { name }, { enabled, description }, { upsert: true, new: true }
    );
    res.json(flag);
});

// Usage
router.get('/usage/:orgId', adminAuth, async (req, res) => {
    const records = await UsageRecord.find({ organizationId: req.params.orgId }).sort({ recordedAt: -1 }).limit(50);
    res.json(records);
});

const Ticket = require('../models/Ticket');

router.get('/tickets', adminAuth, async (req, res) => {
    const tickets = await Ticket.find().populate('organizationId', 'name').populate('userId', 'username').sort({ createdAt: -1 });
    res.json(tickets);
});

router.patch('/tickets/:id', adminAuth, async (req, res) => {
    const ticket = await Ticket.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(ticket);
});

module.exports = router;