const express = require('express');
const Template = require('../models/Template');
const Task = require('../models/Task');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// جلب القوالب
router.get('/', authenticate, async (req, res) => {
    const templates = await Template.find({ userId: req.user.id });
    res.json(templates);
});

// حفظ قالب
router.post('/', authenticate, async (req, res) => {
    const { name, tasks } = req.body;
    if (!name || !tasks || tasks.length === 0) return res.status(400).json({ error: 'الاسم والمهام مطلوبة' });
    const template = await Template.create({ name, tasks, userId: req.user.id });
    res.status(201).json(template);
});

// تطبيق قالب (إنشاء المهام)
router.post('/:id/apply', authenticate, async (req, res) => {
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
router.delete('/:id', authenticate, async (req, res) => {
    await Template.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'تم الحذف' });
});

module.exports = router;