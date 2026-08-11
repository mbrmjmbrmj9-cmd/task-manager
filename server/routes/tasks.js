const express = require('express');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticate, requireTaskOwnership } = require('../middleware/auth');
const { requiredFields, maxLength, sanitize, allowedValues, requireValidObjectId } = require('../middleware/validate');
const { paginate, paginatedResponse } = require('../middleware/paginate');
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

// ✅ جلب كل المهام (مع Pagination)
router.get('/', authenticate, paginate, async (req, res) => {
    try {
        const filter = { userId: req.user.id };
        
        if (req.query.projectId) filter.projectId = req.query.projectId;
        if (req.query.workspaceId) filter.workspaceId = req.query.workspaceId;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.priority) filter.priority = req.query.priority;
        if (req.query.overdue === 'true') {
            filter.dueDate = { $lt: new Date() };
            filter.status = { $ne: 'done' };
        }
        if (req.query.search) {
            filter.title = { $regex: req.query.search, $options: 'i' };
        }
        
        await paginatedResponse(Task, filter, req, res);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المهام' });
    }
});

// جلب مهمة واحدة
router.get('/:id', authenticate, requireValidObjectId('id'), async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المهمة' });
    }
});

// ✅ إنشاء مهمة (مع projectId و workspaceId + Validation)
router.post('/', 
    authenticate, 
    requiredFields('title'),
    sanitize('title'), 
    sanitize('description'), 
    maxLength('title', 200),
    maxLength('description', 5000),
    allowedValues('priority', ['critical', 'high', 'medium', 'low']),
    allowedValues('status', ['new', 'ready', 'in-progress', 'review', 'done', 'blocked']),
    async (req, res) => {
    try {
        const { title, description, priority, project, projectId, workspaceId, dueDate, status } = req.body;
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

// ✅ تحديث مهمة (المالك فقط + Validation)
router.patch('/:id', 
    authenticate, 
    requireTaskOwnership,
    requireValidObjectId('id'),
    maxLength('title', 200),
    maxLength('description', 5000),
    allowedValues('priority', ['critical', 'high', 'medium', 'low']),
    allowedValues('status', ['new', 'ready', 'in-progress', 'review', 'done', 'archived', 'blocked']),
    async (req, res) => {
    try {
        const task = req.task;

        const allowed = ['title', 'description', 'status', 'priority', 'project', 'projectId', 'dueDate', 'progress', 'estimatedHours', 'actualHours', 'tags', 'followers', 'isRecurring', 'recurringType', 'recurringInterval', 'nextOccurrence', 'workspaceId'];
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

// ✅ حذف مهمة (المالك فقط + Validation)
router.delete('/:id', authenticate, requireTaskOwnership, requireValidObjectId('id'), async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم حذف المهمة' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المهمة' });
    }
});

// ========== Checklist ==========
router.post('/:id/checklist', 
    authenticate, 
    requireTaskOwnership, 
    requireValidObjectId('id'),
    requiredFields('text'),
    sanitize('text'),
    maxLength('text', 500),
    async (req, res) => {
    try {
        const task = req.task;
        task.checklist.push({ text: req.body.text });
        task.activity.push({ action: 'إضافة بند', username: req.user.username, details: req.body.text });
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

router.patch('/:id/checklist/:itemId', authenticate, requireTaskOwnership, requireValidObjectId('id'), async (req, res) => {
    try {
        const task = req.task;
        const item = task.checklist.id(req.params.itemId);
        if (!item) return res.status(404).json({ error: 'بند غير موجود' });
        if (req.body.done !== undefined) item.done = req.body.done;
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

router.delete('/:id/checklist/:itemId', authenticate, requireTaskOwnership, requireValidObjectId('id'), async (req, res) => {
    try {
        const task = req.task;
        task.checklist.pull(req.params.itemId);
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// ========== Comments (مع Mentions) ==========
router.post('/:id/comments', 
    authenticate,
    requireValidObjectId('id'),
    requiredFields('text'),
    sanitize('text'),
    maxLength('text', 2000),
    async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        
        task.comments.push({ 
            text: req.body.text, 
            userId: req.user.id, 
            username: req.user.username 
        });
        
        task.activity.push({ 
            action: 'تعليق', 
            username: req.user.username, 
            details: req.body.text.substring(0, 50) 
        });
        
        await task.save();
        
        // ✅ معالجة الـ mentions
        await processMentions(
            req.body.text, 
            task._id, 
            task.projectId, 
            req.user.id, 
            req.user.username
        );
        
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// ========== Attachments ==========
router.post('/:id/attachments', 
    authenticate, 
    requireTaskOwnership,
    requireValidObjectId('id'),
    requiredFields('name', 'url'),
    maxLength('name', 255),
    async (req, res) => {
    try {
        const task = req.task;
        const { name, url, type, size } = req.body;
        task.attachments.push({ name, url, type: type || 'file', size: size || 0 });
        task.activity.push({ action: 'رفع ملف', username: req.user.username, details: name });
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

router.delete('/:id/attachments/:attId', authenticate, requireTaskOwnership, requireValidObjectId('id'), async (req, res) => {
    try {
        const task = req.task;
        task.attachments.pull(req.params.attId);
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// ========== Dependencies ==========
router.post('/:id/dependencies', 
    authenticate, 
    requireTaskOwnership,
    requireValidObjectId('id'),
    requiredFields('taskId'),
    allowedValues('type', ['finish-to-start', 'start-to-start', 'finish-to-finish']),
    async (req, res) => {
    try {
        const task = req.task;
        const { taskId, type } = req.body;
        task.dependencies.push({ taskId, type: type || 'finish-to-start' });
        task.activity.push({ action: 'إضافة تبعية', username: req.user.username, details: `ربط بمهمة ${taskId}` });
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

router.delete('/:id/dependencies/:depId', authenticate, requireTaskOwnership, requireValidObjectId('id'), async (req, res) => {
    try {
        const task = req.task;
        task.dependencies.pull(req.params.depId);
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// أرشفة مهمة
router.patch('/:id/archive', authenticate, requireTaskOwnership, requireValidObjectId('id'), async (req, res) => {
    const task = req.task;
    task.status = 'archived';
    task.activity.push({ action: 'أرشفة', username: req.user.username, details: 'تمت الأرشفة' });
    await task.save();
    res.json(task);
});

// استعادة من الأرشيف
router.patch('/:id/restore', authenticate, requireTaskOwnership, requireValidObjectId('id'), async (req, res) => {
    const task = req.task;
    task.status = 'new';
    task.activity.push({ action: 'استعادة', username: req.user.username, details: 'تمت الاستعادة من الأرشيف' });
    await task.save();
    res.json(task);
});

// حذف نهائي
router.delete('/:id/permanent', authenticate, requireTaskOwnership, requireValidObjectId('id'), async (req, res) => {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف النهائي' });
});

// المهام المؤرشفة (مع Pagination)
router.get('/archived/list', authenticate, paginate, async (req, res) => {
    await paginatedResponse(Task, { userId: req.user.id, status: 'archived' }, req, res);
});

// ✅ إحصائيات المشروع
router.get('/stats/:projectId', authenticate, requireValidObjectId('projectId'), async (req, res) => {
    try {
        const projectId = req.params.projectId;
        const filter = { userId: req.user.id, projectId };
        
        const total = await Task.countDocuments(filter);
        const done = await Task.countDocuments({ ...filter, status: 'done' });
        const inProgress = await Task.countDocuments({ ...filter, status: 'in-progress' });
        const review = await Task.countDocuments({ ...filter, status: 'review' });
        const blocked = await Task.countDocuments({ ...filter, status: 'blocked' });
        const overdue = await Task.countDocuments({ ...filter, dueDate: { $lt: new Date() }, status: { $ne: 'done' } });
        
        res.json({
            total,
            done,
            inProgress,
            review,
            blocked,
            overdue,
            completionRate: total > 0 ? Math.round((done / total) * 100) : 0
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
});

// ========== Subtasks ==========

// ✅ جلب المهام الفرعية لمهمة
router.get('/:id/subtasks', authenticate, requireValidObjectId('id'), async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'مهمة غير موجودة' });
        
        const subtasks = await Task.find({ parentTask: req.params.id, userId: req.user.id })
            .sort({ createdAt: -1 });
            
        res.json(subtasks);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المهام الفرعية' });
    }
});

// ✅ إنشاء مهمة فرعية
router.post('/:id/subtasks', 
    authenticate,
    requireValidObjectId('id'),
    requiredFields('title'),
    sanitize('title'),
    maxLength('title', 200),
    allowedValues('priority', ['critical', 'high', 'medium', 'low']),
    async (req, res) => {
    try {
        const parentTask = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!parentTask) return res.status(404).json({ error: 'المهمة الأصلية غير موجودة' });
        
        const { title, description, priority, assignee, dueDate } = req.body;
        
        const subtask = await Task.create({
            title,
            description: description || '',
            priority: priority || parentTask.priority,
            status: 'new',
            assignee: assignee || '',
            dueDate: dueDate || null,
            project: parentTask.project,
            projectId: parentTask.projectId,
            workspaceId: parentTask.workspaceId,
            parentTask: parentTask._id,
            userId: req.user.id,
            activity: [{ action: 'إنشاء مهمة فرعية', username: req.user.username, details: `ضمن: ${parentTask.title}` }]
        });
        
        // تحديث تقدم المهمة الأصلية
        await updateParentProgress(parentTask._id);
        
        res.status(201).json(subtask);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إنشاء المهمة الفرعية' });
    }
});

// ✅ تحديث تقدم المهمة الأصلية بناءً على المهام الفرعية
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
        
        // تحديث النشاط
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

// ✅ حذف مهمة فرعية
router.delete('/:id/subtasks/:subtaskId', 
    authenticate, 
    requireValidObjectId('id'),
    requireValidObjectId('subtaskId'),
    async (req, res) => {
    try {
        const subtask = await Task.findOne({ 
            _id: req.params.subtaskId, 
            parentTask: req.params.id,
            userId: req.user.id 
        });
        
        if (!subtask) return res.status(404).json({ error: 'مهمة فرعية غير موجودة' });
        
        await Task.findByIdAndDelete(req.params.subtaskId);
        await updateParentProgress(req.params.id);
        
        res.json({ message: 'تم حذف المهمة الفرعية' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المهمة الفرعية' });
    }
});

module.exports = router;