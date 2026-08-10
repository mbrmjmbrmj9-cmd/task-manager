const express = require('express');
const jwt = require('jsonwebtoken');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Organization = require('../models/Organization');

const router = express.Router();
const JWT_SECRET = 'nivora_secret_2025';

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

// كل الاشتراكات
router.get('/', adminAuth, async (req, res) => {
    const subs = await Subscription.find().populate('organizationId', 'name');
    res.json(subs);
});

// اشتراك جديد
router.post('/', adminAuth, async (req, res) => {
    const { organizationId, plan, amount, startDate, endDate } = req.body;
    const sub = await Subscription.create({ organizationId, plan, amount, startDate, endDate, status: 'active' });
    await Organization.findByIdAndUpdate(organizationId, { plan, status: 'active' });
    await Payment.create({ organizationId, subscriptionId: sub._id, amount, invoiceNumber: 'INV-' + Date.now() });
    res.status(201).json(sub);
});

// إلغاء اشتراك
router.patch('/:id/cancel', adminAuth, async (req, res) => {
    const sub = await Subscription.findByIdAndUpdate(req.params.id, { status: 'canceled' }, { new: true });
    res.json(sub);
});

module.exports = router;