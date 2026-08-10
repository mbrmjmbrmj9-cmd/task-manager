const express = require('express');
const jwt = require('jsonwebtoken');
const Task = require('../models/Task');
const User = require('../models/User');

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

// جلب كل المهام
router.get('/', auth, async (req, res) => {
    try {
        const tasks = await Task.find({ userId: req.user.id });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المهام' });
    }
});

// جلب مهمة واحدة
router.get('/:id', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المهمة' });
    }
});

// إنشاء مهمة
router.post('/', auth, async (req, res) => {
    try {
        const { title, description, priority, project, dueDate } = req.body;
        if (!title) return res.status(400).json({ error: 'العنوان مطلوب' });

        const task = await Task.create({
    title,
    description: description || '',
    priority: priority || 'medium',
    project: project || '',
    dueDate: dueDate || null,
    isRecurring: req.body.isRecurring || false,
    recurringType: req.body.recurringType || null,
    recurringInterval: req.body.recurringInterval || 1,
    userId: req.user.id,
    activity: [{ action: 'إنشاء المهمة', username: req.user.username, details: 'تم إنشاء المهمة' }]
});
        res.status(201).json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إنشاء المهمة' });
    }
});

// تحديث مهمة
router.patch('/:id', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });

        const allowed = ['title', 'description', 'status', 'priority', 'project', 'dueDate', 'progress', 'estimatedHours', 'actualHours', 'tags', 'followers', 'isRecurring', 'recurringType', 'recurringInterval', 'nextOccurrence'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) task[field] = req.body[field];
        });

        if (req.body.status && req.body.status !== task.status) {
            task.activity.push({ action: 'تغيير الحالة', username: req.user.username, details: `من ${task.status} إلى ${req.body.status}` });
        }

        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث المهمة' });
    }
});

// حذف مهمة
router.delete('/:id', auth, async (req, res) => {
    try {
        await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        res.json({ message: 'تم حذف المهمة' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المهمة' });
    }
});

// ========== Checklist ==========
router.post('/:id/checklist', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        task.checklist.push({ text: req.body.text });
        task.activity.push({ action: 'إضافة بند', username: req.user.username, details: req.body.text });
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

router.patch('/:id/checklist/:itemId', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        const item = task.checklist.id(req.params.itemId);
        if (!item) return res.status(404).json({ error: 'بند غير موجود' });
        if (req.body.done !== undefined) item.done = req.body.done;
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

router.delete('/:id/checklist/:itemId', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        task.checklist.pull(req.params.itemId);
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// ========== Comments ==========
router.post('/:id/comments', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        task.comments.push({ text: req.body.text, userId: req.user.id, username: req.user.username });
        task.activity.push({ action: 'تعليق', username: req.user.username, details: req.body.text.substring(0, 50) });
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});
// ========== Attachments ==========
router.post('/:id/attachments', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        const { name, url, type, size } = req.body;
        if (!name || !url) return res.status(400).json({ error: 'الاسم والرابط مطلوبان' });
        task.attachments.push({ name, url, type: type || 'file', size: size || 0 });
        task.activity.push({ action: 'رفع ملف', username: req.user.username, details: name });
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

router.delete('/:id/attachments/:attId', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        task.attachments.pull(req.params.attId);
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});
// ========== Dependencies ==========
router.post('/:id/dependencies', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        const { taskId, type } = req.body;
        if (!taskId) return res.status(400).json({ error: 'معرف المهمة مطلوب' });
        task.dependencies.push({ taskId, type: type || 'finish-to-start' });
        task.activity.push({ action: 'إضافة تبعية', username: req.user.username, details: `ربط بمهمة ${taskId}` });
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

router.delete('/:id/dependencies/:depId', auth, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        task.dependencies.pull(req.params.depId);
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});


// أرشفة مهمة
router.patch('/:id/archive', auth, async (req, res) => {
    const task = await Task.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { status: 'archived' },
        { new: true }
    );
    res.json(task);
});

// استعادة من الأرشيف
router.patch('/:id/restore', auth, async (req, res) => {
    const task = await Task.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { status: 'new' },
        { new: true }
    );
    res.json(task);
});

// حذف نهائي (Trash)
router.delete('/:id/permanent', auth, async (req, res) => {
    await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'تم الحذف النهائي' });
});

// المهام المؤرشفة
router.get('/archived/list', auth, async (req, res) => {
    const tasks = await Task.find({ userId: req.user.id, status: 'archived' });
    res.json(tasks);
});
module.exports = router;