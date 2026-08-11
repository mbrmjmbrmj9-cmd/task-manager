const express = require('express');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Workspace = require('../models/Workspace');
const { authenticate, requireProjectOwnership } = require('../middleware/auth');
const { paginate, paginatedResponse } = require('../middleware/paginate');

const router = express.Router();

// ✅ كل المشاريع (مع Pagination)
router.get('/', authenticate, paginate, async (req, res) => {
    try {
        const filter = { userId: req.user.id };
        if (req.query.workspaceId) filter.workspaceId = req.query.workspaceId;
        
        const { page, limit, skip } = req.pagination;
        const sort = { createdAt: -1 };
        
        const [projects, total] = await Promise.all([
            Project.find(filter).sort(sort).skip(skip).limit(limit),
            Project.countDocuments(filter)
        ]);
        
        // نجيب عدد المهام لكل مشروع
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
        
        const totalPages = Math.ceil(total / limit);
        
        res.json({
            data: result,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المشاريع' });
    }
});
// ✅ جلب مشروع واحد مع إحصائياته
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

// ✅ إنشاء مشروع (مع إعدادات افتراضية)
router.post('/', authenticate, async (req, res) => {
    try {
        const { name, description, color, workspaceId, settings } = req.body;
        if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

        // التحقق من حدود workspace
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
            settings: settings || {
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

// ✅ تحديث مشروع (المالك فقط)
router.patch('/:id', authenticate, requireProjectOwnership, async (req, res) => {
    try {
        const project = req.project;
        
        const allowed = ['name', 'description', 'color', 'status', 'settings'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                if (field === 'settings') {
                    // دمج الإعدادات بدل الاستبدال الكامل
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

// ✅ حذف مشروع (المالك فقط)
router.delete('/:id', authenticate, requireProjectOwnership, async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        // حذف جميع المهام المرتبطة بالمشروع
        await Task.deleteMany({ projectId: req.params.id });
        res.json({ message: 'تم حذف المشروع وجميع مهامه' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المشروع' });
    }
});

// ✅ تحديث إعدادات المشروع
router.patch('/:id/settings', authenticate, requireProjectOwnership, async (req, res) => {
    try {
        const project = req.project;
        project.settings = { ...project.settings.toObject(), ...req.body };
        await project.save();
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث الإعدادات' });
    }
});

// ✅ جلب إعدادات المشروع
router.get('/:id/settings', authenticate, async (req, res) => {
    try {
        const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
        if (!project) return res.status(404).json({ error: 'مشروع غير موجود' });
        
        res.json({
            projectId: project._id,
            projectName: project.name,
            settings: project.settings
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الإعدادات' });
    }
});

// ✅ تحديث إعدادات المشروع (الموجود مسبقًا، نتركه كما هو)
router.patch('/:id/settings', authenticate, requireProjectOwnership, async (req, res) => {
    try {
        const project = req.project;
        
        // دمج الإعدادات الجديدة مع القديمة
        const currentSettings = project.settings ? project.settings.toObject() : {};
        project.settings = { ...currentSettings, ...req.body };
        
        await project.save();
        
        res.json({
            message: 'تم تحديث الإعدادات بنجاح',
            settings: project.settings
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث الإعدادات' });
    }
});

module.exports = router;