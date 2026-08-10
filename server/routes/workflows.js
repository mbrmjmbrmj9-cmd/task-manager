const express = require('express');
const jwt = require('jsonwebtoken');
const Workflow = require('../models/Workflow');

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

// جلب كل workflows
router.get('/', auth, async (req, res) => {
    const workflows = await Workflow.find({ userId: req.user.id });
    res.json(workflows);
});

// إنشاء workflow
router.post('/', auth, async (req, res) => {
    const { name, steps } = req.body;
    if (!name || !steps || steps.length === 0) return res.status(400).json({ error: 'الاسم والخطوات مطلوبة' });
    const wf = await Workflow.create({ name, steps, userId: req.user.id });
    res.status(201).json(wf);
});

// تحديث workflow
router.patch('/:id', auth, async (req, res) => {
    const wf = await Workflow.findOne({ _id: req.params.id, userId: req.user.id });
    if (!wf) return res.status(404).json({ error: 'غير موجود' });
    if (req.body.name) wf.name = req.body.name;
    if (req.body.steps) wf.steps = req.body.steps;
    await wf.save();
    res.json(wf);
});

// حذف workflow
router.delete('/:id', auth, async (req, res) => {
    await Workflow.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'تم الحذف' });
});

module.exports = router;