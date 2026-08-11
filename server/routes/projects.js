const express = require('express');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Workspace = require('../models/Workspace');
const { authenticate, requireProjectOwnership } = require('../middleware/auth');

const router = express.Router();

// ✅ جلب جميع المشاريع
router.get('/', authenticate, async (req, res) => {
    try {
        const filter = { userId: req.user.id };
        if (req.query.workspaceId) filter.workspaceId = req.query.workspaceId;
        
        const projects = await Project.find(filter).sort({ createdAt: -1 });
        
        // إضافة إحصائيات لكل مشروع
        const result = await Promise.all(projects.map(async (p) => {
            const taskFilter = { userId: req.user.id, projectId: p._id };
            const taskCount = await Task.countDocuments(taskFilter);
            const doneCount = await Task.countDocuments({ ...taskFilter, status: 'done' });
            const inProgressCount = await Task.countDocuments({ ...taskFilter, status: 'in-progress' });
            const overdueCount = await Task.countDocuments({ 
                ...taskFilter, 
                dueDate: { $lt: new Date() }, 
                status: { $ne: 'done' } 
            });
            
            return { 
                ...p.toObject(), 
                taskCount, 
                doneCount,
                inProgressCount,
                overdueCount,
                completionRate: taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0
            };
        }));
        
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المشاريع' });
    }
});

// ✅ جلب مشروع واحد
router.get('/:id', authenticate, async (req, res) => {
    try {
        const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
        if (!project) return res.status(404).json({ error: 'مشروع غير موجود' });
        
        const taskFilter = { userId: req.user.id, projectId: project._id };
        const taskCount = await Task.countDocuments(taskFilter);
        const doneCount = await Task.countDocuments({ ...taskFilter, status: 'done' });
        
        res.json({
            ...project.toObject(),
            taskCount,
            doneCount,
            completionRate: taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المشروع' });
    }
});

// ✅ إنشاء مشروع
router.post('/', authenticate, async (req, res) => {
    try {
        const { name, description, color, workspaceId } = req.body;
        if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

        if (workspaceId) {
            const ws = await Workspace.findById(workspaceId);
            if (ws) {
                const count = await Project.countDocuments({ workspaceId });
                if (count >= ws.maxProjects) {
                    return res.status(400).json({ error: 'وصلت للحد الأقصى للمشاريع في خطتك' });
                }
            }
        }

        const project = await Project.create({
            name,
            description: description || '',
            color: color || '#2563EB',
            userId: req.user.id,
            workspaceId: workspaceId || null,
            settings: {
                enableChat: true,
                enableFiles: true,
                enableGantt: true,
                enableCalendar: true,
                enableWorkflows: true,
                enableBudget: false,
                defaultView: 'kanban',
                isPublic: false
            }
        });
        res.status(201).json(project);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إنشاء المشروع' });
    }
});

// ✅ تحديث مشروع
router.patch('/:id', authenticate, requireProjectOwnership, async (req, res) => {
    try {
        const project = req.project;
        const allowed = ['name', 'description', 'color', 'status', 'settings'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                if (field === 'settings') {
                    project.settings = { ...project.settings.toObject(), ...req.body.settings };
                } else {
                    project[field] = req.body[field];
                }
            }
        });
        await project.save();
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث المشروع' });
    }
});

// ✅ حذف مشروع
router.delete('/:id', authenticate, requireProjectOwnership, async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        await Task.deleteMany({ projectId: req.params.id });
        res.json({ message: 'تم حذف المشروع وجميع مهامه' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المشروع' });
    }
});

// ✅ جلب إعدادات المشروع
router.get('/:id/settings', authenticate, async (req, res) => {
    try {
        const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
        if (!project) return res.status(404).json({ error: 'مشروع غير موجود' });
        res.json({ projectId: project._id, projectName: project.name, settings: project.settings });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الإعدادات' });
    }
});

// ✅ تحديث إعدادات المشروع
router.patch('/:id/settings', authenticate, requireProjectOwnership, async (req, res) => {
    try {
        const project = req.project;
        project.settings = { ...project.settings.toObject(), ...req.body };
        await project.save();
        res.json({ message: 'تم تحديث الإعدادات بنجاح', settings: project.settings });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث الإعدادات' });
    }
});

module.exports = router;