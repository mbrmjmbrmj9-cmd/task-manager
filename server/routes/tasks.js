const express = require('express');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticate, requireTaskOwnership, AUTH_ERRORS } = require('../middleware/auth');
const { requiredFields, maxLength, sanitize, allowedValues, requireValidObjectId } = require('../middleware/validate');

const router = express.Router();

// ✅ استخراج mentions من النص وإرسال إشعارات
async function processMentions(text, taskId, projectId, fromUserId, fromUsername) {
    const mentionRegex = /@(\w+)/g;
    const mentions = [...text.matchAll(mentionRegex)].map(m => m[1]);
    
    for (const username of mentions) {
        try {
            const user = await User.findOne({ username });
            if (user && user._id.toString() !== fromUserId) {
                await Notification.create({
                    userId: user._id,
                    fromUser: fromUsername,
                    type: 'mention',
                    message: `${fromUsername} أشار إليك في تعليق`,
                    link: `/task.html?id=${taskId}`,
                    taskId,
                    projectId
                });
            }
        } catch (err) {
            console.error('خطأ في إرسال إشعار mention:', err);
        }
    }
}

// ✅ جلب جميع المهام (مع فلترة)
router.get('/', authenticate, async (req, res) => {
    try {
        const filter = { userId: req.user.id };
        
        if (req.query.projectId) filter.projectId = req.query.projectId;
        if (req.query.workspaceId) filter.workspaceId = req.query.workspaceId;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.priority) filter.priority = req.query.priority;
        if (req.query.assignee) filter.assignee = req.query.assignee;
        if (req.query.overdue === 'true') {
            filter.dueDate = { $lt: new Date() };
            filter.status = { $ne: 'done' };
        }
        if (req.query.search) {
            filter.$or = [
                { title: { $regex: req.query.search, $options: 'i' } },
                { description: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        
        const tasks = await Task.find(filter).sort({ createdAt: -1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المهام' });
    }
});

// ✅ جلب مهمة واحدة
router.get('/:id', authenticate, requireValidObjectId('id'), async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المهمة' });
    }
});

// ✅ إنشاء مهمة (مع Validation)
router.post('/', authenticate, requiredFields('title'), sanitize('title'), maxLength('title', 200), async (req, res) => {
    try {
        const { title, description, priority, project, projectId, workspaceId, dueDate, status, assignee, startDate } = req.body;
        if (!title) return res.status(400).json({ error: 'العنوان مطلوب' });

        const task = await Task.create({
            title,
            description: description || '',
            priority: priority || 'medium',
            project: project || '',
            projectId: projectId || null,
            workspaceId: workspaceId || null,
            status: status || 'new',
            dueDate: dueDate || null,
            startDate: startDate || null,
            assignee: assignee || '',
            userId: req.user.id,
            progress: 0,
            activity: [{ action: 'إنشاء المهمة', username: req.user.username, details: 'تم إنشاء المهمة' }]
        });
        res.status(201).json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إنشاء المهمة' });
    }
});

// ✅ تحديث مهمة (المالك فقط)
router.patch('/:id', authenticate, requireTaskOwnership, async (req, res) => {
    try {
        const task = req.task;
        const allowed = ['title', 'description', 'status', 'priority', 'project', 'projectId', 'dueDate', 'startDate', 'progress', 'assignee', 'workspaceId'];
        
        allowed.forEach(field => {
            if (req.body[field] !== undefined) task[field] = req.body[field];
        });

        if (req.body.status && req.body.status !== task.status) {
            task.activity.push({ action: 'تغيير الحالة', username: req.user.username, details: `من ${task.status} إلى ${req.body.status}` });
        }

        // ✅ حساب التقدم تلقائياً
        task.progress = calculateProgress(task);

        await task.save();
        res.json({ message: 'تم تحديث المهمة بنجاح', task });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث المهمة' });
    }
});

// ✅ حذف مهمة (المالك فقط)
router.delete('/:id', authenticate, requireTaskOwnership, async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم حذف المهمة بنجاح' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المهمة' });
    }
});

// ========== Comments ==========
router.post('/:id/comments', authenticate, requiredFields('text'), sanitize('text'), maxLength('text', 2000), async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        
        task.comments.push({ text: req.body.text, userId: req.user.id, username: req.user.username });
        task.activity.push({ action: 'تعليق', username: req.user.username, details: req.body.text.substring(0, 50) });
        await task.save();
        
        await processMentions(req.body.text, task._id, task.projectId, req.user.id, req.user.username);
        
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إضافة التعليق' });
    }
});

// ========== Checklist ==========
router.post('/:id/checklist', authenticate, requireTaskOwnership, requiredFields('text'), async (req, res) => {
    try {
        const task = req.task;
        task.checklist.push({ text: req.body.text });
        task.activity.push({ action: 'إضافة بند', username: req.user.username, details: req.body.text });
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إضافة البند' });
    }
});

router.patch('/:id/checklist/:itemId', authenticate, requireTaskOwnership, async (req, res) => {
    try {
        const task = req.task;
        const item = task.checklist.id(req.params.itemId);
        if (!item) return res.status(404).json({ error: 'بند غير موجود' });
        if (req.body.done !== undefined) item.done = req.body.done;
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث البند' });
    }
});

router.delete('/:id/checklist/:itemId', authenticate, requireTaskOwnership, async (req, res) => {
    try {
        const task = req.task;
        task.checklist.pull(req.params.itemId);
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف البند' });
    }
});

// ========== Attachments ==========
router.post('/:id/attachments', authenticate, requireTaskOwnership, requiredFields('name', 'url'), async (req, res) => {
    try {
        const task = req.task;
        const { name, url, type, size } = req.body;
        task.attachments.push({ name, url, type: type || 'file', size: size || 0 });
        task.activity.push({ action: 'رفع ملف', username: req.user.username, details: name });
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في رفع الملف' });
    }
});

router.delete('/:id/attachments/:attId', authenticate, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        
        task.attachments.pull(req.params.attId);
        task.activity.push({ action: 'حذف مرفق', username: req.user.username, details: 'تم حذف مرفق' });
        
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المرفق' });
    }
});

// ========== Subtasks ==========
router.get('/:id/subtasks', authenticate, async (req, res) => {
    try {
        const subtasks = await Task.find({ parentTask: req.params.id, userId: req.user.id }).sort({ createdAt: -1 });
        res.json(subtasks);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المهام الفرعية' });
    }
});

router.post('/:id/subtasks', authenticate, requiredFields('title'), async (req, res) => {
    try {
        const parentTask = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!parentTask) return res.status(404).json({ error: 'المهمة الأصلية غير موجودة' });
        
        const subtask = await Task.create({
            title: req.body.title,
            priority: req.body.priority || parentTask.priority,
            assignee: req.body.assignee || '',
            dueDate: req.body.dueDate || null,
            project: parentTask.project,
            projectId: parentTask.projectId,
            workspaceId: parentTask.workspaceId,
            parentTask: parentTask._id,
            userId: req.user.id,
            activity: [{ action: 'إنشاء مهمة فرعية', username: req.user.username, details: `ضمن: ${parentTask.title}` }]
        });
        
        await updateParentProgress(parentTask._id);
        
        res.status(201).json(subtask);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إنشاء المهمة الفرعية' });
    }
});

router.delete('/:id/subtasks/:subtaskId', authenticate, async (req, res) => {
    try {
        const subtask = await Task.findOne({ _id: req.params.subtaskId, parentTask: req.params.id, userId: req.user.id });
        if (!subtask) return res.status(404).json({ error: 'مهمة فرعية غير موجودة' });
        
        await Task.findByIdAndDelete(req.params.subtaskId);
        await updateParentProgress(req.params.id);
        
        res.json({ message: 'تم حذف المهمة الفرعية' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المهمة الفرعية' });
    }
});

// ========== أرشفة واستعادة ==========
router.patch('/:id/archive', authenticate, requireTaskOwnership, async (req, res) => {
    try {
        req.task.status = 'archived';
        req.task.archivedAt = new Date();
        req.task.archivedBy = req.user.id;
        req.task.activity.push({ action: 'أرشفة', username: req.user.username, details: 'تمت أرشفة المهمة' });
        await req.task.save();
        res.json({ message: 'تمت أرشفة المهمة بنجاح', task: req.task });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الأرشفة' });
    }
});

router.patch('/:id/restore', authenticate, requireTaskOwnership, async (req, res) => {
    try {
        req.task.status = 'new';
        req.task.archivedAt = null;
        req.task.archivedBy = null;
        req.task.activity.push({ action: 'استعادة', username: req.user.username, details: 'تمت استعادة المهمة من الأرشيف' });
        await req.task.save();
        res.json({ message: 'تمت استعادة المهمة بنجاح', task: req.task });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الاستعادة' });
    }
});

// ✅ حذف نهائي
router.delete('/:id/permanent', authenticate, requireTaskOwnership, async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم الحذف النهائي للمهمة' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الحذف النهائي' });
    }
});

// ✅ المؤرشفة
router.get('/archived/list', authenticate, async (req, res) => {
    try {
        const tasks = await Task.find({ userId: req.user.id, status: 'archived' });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الأرشيف' });
    }
});

// ✅ إحصائيات المشروع
router.get('/stats/:projectId', authenticate, async (req, res) => {
    try {
        const filter = { userId: req.user.id, projectId: req.params.projectId };
        const total = await Task.countDocuments(filter);
        const done = await Task.countDocuments({ ...filter, status: 'done' });
        const inProgress = await Task.countDocuments({ ...filter, status: 'in-progress' });
        const overdue = await Task.countDocuments({ ...filter, dueDate: { $lt: new Date() }, status: { $ne: 'done' } });
        
        res.json({ total, done, inProgress, overdue, completionRate: total > 0 ? Math.round((done / total) * 100) : 0 });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
});

// ========== دوال مساعدة ==========

/**
 * ✅ حساب نسبة تقدم المهمة تلقائياً
 */
function calculateProgress(task) {
    if (task.status === 'done') return 100;
    if (task.status === 'blocked') return task.progress || 0;
    
    const statusProgress = { 'new': 0, 'in-progress': 40, 'review': 75, 'archived': 0 };
    return statusProgress[task.status] || 0;
}

/**
 * ✅ تحديث تقدم المهمة الأصلية بناءً على المهام الفرعية
 */
async function updateParentProgress(parentTaskId) {
    try {
        const subtasks = await Task.find({ parentTask: parentTaskId });
        if (subtasks.length === 0) {
            await Task.findByIdAndUpdate(parentTaskId, { progress: 0 });
            return;
        }
        
        const doneCount = subtasks.filter(s => s.status === 'done').length;
        const progress = Math.round((doneCount / subtasks.length) * 100);
        
        await Task.findByIdAndUpdate(parentTaskId, { progress });
        
        const parent = await Task.findById(parentTaskId);
        if (parent) {
            parent.activity.push({ 
                action: 'تحديث التقدم', 
                username: 'النظام', 
                details: `تقدم المهام الفرعية: ${progress}% (${doneCount}/${subtasks.length})` 
            });
            await parent.save();
        }
    } catch (err) {
        console.error('خطأ في تحديث تقدم المهمة الأصلية:', err);
    }
}

module.exports = router;