const express = require('express');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Organization = require('../models/Organization');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// جميع المسارات محمية بـ adminAuth
router.use(adminAuth);

// كل الاشتراكات
router.get('/', async (req, res) => {
    const subs = await Subscription.find().populate('organizationId', 'name');
    res.json(subs);
});

// اشتراك جديد
router.post('/', async (req, res) => {
    const { organizationId, plan, amount, startDate, endDate } = req.body;
    const sub = await Subscription.create({ organizationId, plan, amount, startDate, endDate, status: 'active' });
    await Organization.findByIdAndUpdate(organizationId, { plan, status: 'active' });
    await Payment.create({ organizationId, subscriptionId: sub._id, amount, invoiceNumber: 'INV-' + Date.now() });
    res.status(201).json(sub);
});

// إلغاء اشتراك
router.patch('/:id/cancel', async (req, res) => {
    const sub = await Subscription.findByIdAndUpdate(req.params.id, { status: 'canceled' }, { new: true });
    res.json(sub);
});

module.exports = router;