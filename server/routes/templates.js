const express = require('express');
const jwt = require('jsonwebtoken');
const Template = require('../models/Template');
const Task = require('../models/Task');

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

// جلب القوالب
router.get('/', auth, async (req, res) => {
    const templates = await Template.find({ userId: req.user.id });
    res.json(templates);
});

// حفظ قالب
router.post('/', auth, async (req, res) => {
    const { name, tasks } = req.body;
    if (!name || !tasks || tasks.length === 0) return res.status(400).json({ error: 'الاسم والمهام مطلوبة' });
    const template = await Template.create({ name, tasks, userId: req.user.id });
    res.status(201).json(template);
});

// تطبيق قالب (إنشاء المهام)
router.post('/:id/apply', auth, async (req, res) => {
    const template = await Template.findOne({ _id: req.params.id, userId: req.user.id });
    if (!template) return res.status(404).json({ error: 'قالب غير موجود' });
    
    const createdTasks = [];
    for (const t of template.tasks) {
        const task = await Task.create({
            title: t.title,
            description: t.description || '',
            priority: t.priority || 'medium',
            status: t.status || 'new',
            checklist: t.checklist || [],
            userId: req.user.id
        });
        createdTasks.push(task);
    }
    res.json(createdTasks);
});

// حذف قالب
router.delete('/:id', auth, async (req, res) => {
    await Template.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'تم الحذف' });
});

module.exports = router;