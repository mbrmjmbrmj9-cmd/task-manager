const express = require('express');
const Template = require('../models/Template');
const Task = require('../models/Task');
const { authenticate, getProject, requireWorkspace, validateId, sameId, accessError } = require('../middleware/auth');
const { userText } = require('../middleware/project-resources');

const router = express.Router();
router.use(authenticate);

function templateFields(input, required = false) {
    const fields = {};
    if (required || input.name !== undefined) fields.name = userText(input.name, 'اسم القالب غير صالح', 120, true);
    if (input.description !== undefined) fields.description = userText(input.description, 'وصف القالب غير صالح', 2000);
    if (input.category !== undefined) fields.category = userText(input.category, 'تصنيف القالب غير صالح', 40);
    if (input.icon !== undefined) fields.icon = userText(input.icon, 'رمز القالب غير صالح', 24);
    if (input.color !== undefined) {
        if (typeof input.color !== 'string' || !/^#[a-f\d]{6}$/i.test(input.color)) throw accessError(400, 'لون القالب غير صالح');
        fields.color = input.color;
    }
    if (required || input.tasks !== undefined) {
        if (!Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 100) {
            throw accessError(400, 'اختر من مهمة واحدة إلى 100 مهمة للقالب');
        }
        fields.tasks = input.tasks.map(task => ({
            title: userText(task?.title, 'عنوان إحدى المهام غير صالح', 200, true),
            description: userText(task.description || '', 'وصف إحدى المهام غير صالح', 10000),
            priority: Task.schema.path('priority').enumValues.includes(task.priority) ? task.priority : 'medium',
            status: 'new',
            checklist: Array.isArray(task.checklist) ? task.checklist.slice(0, 50).map(item => ({
                text: userText(item?.text, 'بند قائمة التحقق غير صالح', 500, true), done: false
            })) : []
        }));
    }
    return fields;
}

router.get('/', async (req, res) => res.json(await Template.find({ userId: req.user.id }).sort({ createdAt: -1 })));

router.post('/', async (req, res) => {
    const template = await Template.create({ ...templateFields(req.body || {}, true), userId: req.user.id });
    res.status(201).json(template);
});

router.patch('/:id', async (req, res) => {
    const template = await Template.findOneAndUpdate({ _id: validateId(req.params.id), userId: req.user.id },
        { $set: templateFields(req.body || {}) }, { new: true });
    if (!template) throw accessError(404, 'القالب غير موجود');
    res.json(template);
});

router.post('/:id/apply', async (req, res) => {
    const template = await Template.findOne({ _id: validateId(req.params.id), userId: req.user.id });
    if (!template) throw accessError(404, 'القالب غير موجود');
    const input = req.body || {};
    const project = input.projectId ? await getProject(input.projectId, req.user.id) : null;
    if (project?.status === 'archived') throw accessError(409, 'استعد المشروع قبل تطبيق القالب');
    if (project && input.workspaceId && !sameId(project.workspaceId, input.workspaceId)) throw accessError(400, 'المشروع لا ينتمي إلى مساحة العمل');
    const workspace = !project && input.workspaceId ? (await requireWorkspace(input.workspaceId, req.user.id)).workspace : null;
    let startDate = null;
    if (input.startDate) {
        if (typeof input.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw accessError(400, 'تاريخ البدء غير صالح');
        startDate = new Date(input.startDate);
        if (!Number.isFinite(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== input.startDate) throw accessError(400, 'تاريخ البدء غير صالح');
    }
    let tasks = templateFields({ name: template.name, tasks: template.tasks }, true).tasks;
    if (input.taskIndexes !== undefined) {
        if (!Array.isArray(input.taskIndexes) || !input.taskIndexes.length || input.taskIndexes.some(index => !Number.isInteger(index) || index < 0 || index >= tasks.length)) {
            throw accessError(400, 'اختر مهمة واحدة على الأقل من القالب');
        }
        tasks = [...new Set(input.taskIndexes)].map(index => tasks[index]);
    }
    const created = await Task.insertMany(tasks.map(task => ({
        ...task, startDate, projectId: project?._id || null, project: project?.name || '',
        workspaceId: project?.workspaceId || workspace?._id || null, userId: req.user.id
    })));
    res.status(201).json(created);
});

router.delete('/:id', async (req, res) => {
    const template = await Template.findOneAndDelete({ _id: validateId(req.params.id), userId: req.user.id });
    if (!template) throw accessError(404, 'القالب غير موجود');
    res.json({ message: 'تم حذف القالب' });
});

module.exports = router;
