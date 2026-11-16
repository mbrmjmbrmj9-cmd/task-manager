const express = require('express');
const path = require('node:path');
const { Types } = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const Notification = require('../models/Notification');
const taskOverview = require('../config/task-overview');
const { authenticate, taskAccess, getProject, getProjectContext, requireWorkspace, validateId, sameId, accessError } = require('../middleware/auth');
const { legacyDir, attachmentMultipart, uploadName, removeFile, persistUpload, removeStoredUpload, streamStoredUpload } = require('../config/storage');

const router = express.Router();
router.use(authenticate);

const statuses = Task.schema.path('status').enumValues;
const priorities = Task.schema.path('priority').enumValues;
const statusProgress = { new: 0, ready: 0, 'in-progress': 40, review: 75, done: 100 };
const dependencyTypes = ['finish-to-start', 'start-to-start', 'finish-to-finish'];

function stringValue(value, label, max, required = false) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
        throw accessError(400, label + ' غير صالح');
    }
    return value.trim();
}

function dateValue(value) {
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) throw accessError(400, 'التاريخ غير صالح');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || (value.length === 10 && date.toISOString().slice(0, 10) !== value)) {
        throw accessError(400, 'التاريخ غير صالح');
    }
    return date;
}

function taskFields(input) {
    const fields = {};
    if (input.title !== undefined) fields.title = stringValue(input.title, 'عنوان المهمة', 200, true);
    if (input.description !== undefined) fields.description = stringValue(input.description, 'وصف المهمة', 10000);
    if (input.status !== undefined) {
        if (!statuses.includes(input.status)) throw accessError(400, 'حالة المهمة غير صالحة');
        fields.status = input.status;
    }
    if (input.priority !== undefined) {
        if (!priorities.includes(input.priority)) throw accessError(400, 'أولوية المهمة غير صالحة');
        fields.priority = input.priority;
    }
    for (const field of ['startDate', 'dueDate']) {
        if (input[field] !== undefined) fields[field] = dateValue(input[field]);
    }
    if (input.followers !== undefined) {
        if (!Array.isArray(input.followers) || input.followers.length > 50) throw accessError(400, 'قائمة المتابعين غير صالحة');
        fields.followers = [...new Set(input.followers.map(name => stringValue(name, 'اسم المتابع', 254, true)))];
    }
    return fields;
}

function validateDates(fields, existing = {}) {
    const start = fields.startDate === undefined ? existing.startDate : fields.startDate;
    const due = fields.dueDate === undefined ? existing.dueDate : fields.dueDate;
    if (start && due && start > due) throw accessError(400, 'تاريخ البدء يجب أن يسبق الاستحقاق');
}

async function assignment(input, workspace, previous) {
    if (input.assigneeId === undefined) {
        if (input.assignee === undefined || input.assignee === previous?.assignee) return {};
        const assignee = stringValue(input.assignee, 'اسم المسؤول', 254);
        return { assignee, assigneeId: null };
    }
    if (input.assigneeId === null || input.assigneeId === '') return { assigneeId: null, assignee: '' };
    const id = validateId(input.assigneeId);
    if (!workspace?.members.some(member => sameId(member.userId, id))) {
        throw accessError(400, 'اختر مسؤولًا من أعضاء مساحة العمل');
    }
    const member = await User.findById(id).select('username fullName isActive').lean();
    if (!member || member.isActive === false) throw accessError(400, 'حساب المسؤول غير متاح');
    return { assigneeId: member._id, assignee: member.fullName || member.username };
}

function tasksInProject(project, userId) {
    if (!project.workspaceId) return { projectId: project._id, workspaceId: null, userId: new Types.ObjectId(userId) };
    return { projectId: project._id, $or: [{ workspaceId: project.workspaceId }, { workspaceId: null }] };
}

async function taskFilter(query, userId) {
    if (query.projectId !== undefined) {
        const project = await getProject(query.projectId, userId);
        if (query.workspaceId !== undefined && !sameId(query.workspaceId, project.workspaceId)) {
            throw accessError(404, 'المشروع غير موجود في مساحة العمل الحالية');
        }
        return tasksInProject(project, userId);
    }
    if (query.workspaceId !== undefined) {
        const { workspace } = await requireWorkspace(query.workspaceId, userId);
        const projectIds = await Project.distinct('_id', { workspaceId: workspace._id });
        return { $or: [
            { workspaceId: workspace._id, projectId: null },
            { workspaceId: { $in: [workspace._id, null] }, projectId: { $in: projectIds } }
        ] };
    }
    const projectIds = await Project.distinct('_id', { userId, workspaceId: null });
    return { userId: new Types.ObjectId(userId), workspaceId: null, projectId: { $in: [null, ...projectIds] } };
}

const listFields = 'title status priority project projectId assignee assigneeId dueDate createdAt';

function addCursor(filter, cursor) {
    if (typeof cursor !== 'string') throw accessError(400, 'مؤشر النتائج غير صالح');
    const match = /^(none|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)~([0-9a-f]{24})$/.exec(cursor);
    if (!match) throw accessError(400, 'مؤشر النتائج غير صالح');
    const date = match[1] === 'none' ? null : dateValue(match[1]);
    const tail = { createdAt: date, _id: { $lt: match[2] } };
    (filter.$and ||= []).push(date ? { $or: [{ createdAt: { $lt: date } }, { createdAt: null }, tail] } : tail);
}

async function listTasks(query, userId, res, archived = false) {
    const filter = await taskFilter(query, userId);
    if (query.status !== undefined && !statuses.includes(query.status)) throw accessError(400, 'حالة المهمة غير صالحة');
    if (query.priority !== undefined && !priorities.includes(query.priority)) throw accessError(400, 'أولوية المهمة غير صالحة');
    if (archived || query.status) filter.status = archived ? 'archived' : query.status;
    else if (query.view === 'list' || query.view === 'options') filter.status = { $ne: 'archived' };
    if (query.priority) filter.priority = query.priority;
    if (query.assigneeId !== undefined) filter.assigneeId = validateId(query.assigneeId);
    if (query.assignee !== undefined) filter.assignee = stringValue(query.assignee, 'المسؤول', 254);
    if (query.overdue === 'true') {
        filter.dueDate = { $lt: new Date() };
        filter.$and = [{ status: { $nin: ['done', 'archived'] } }];
    }
    if (query.search !== undefined) {
        const search = stringValue(query.search, 'البحث', 120);
        const literal = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = { $regex: literal, $options: 'i' };
        if (query.view === 'list') filter.title = regex;
        else (filter.$and ||= []).push({ $or: [{ title: regex }, { description: regex }] });
    }
    if (query.view === 'list' && query.after !== undefined) addCursor(filter, query.after);
    const tasks = Task.find(filter).sort({ createdAt: -1, _id: -1 });
    if (query.view === 'options') tasks.select('title');
    if (query.view === 'list') tasks.select(listFields);
    if (query.limit !== undefined) {
        const limit = typeof query.limit === 'string' ? Number(query.limit) : NaN;
        const page = query.page === undefined ? 1 : typeof query.page === 'string' ? Number(query.page) : NaN;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(page) || page < 1 || page > 1000) {
            throw accessError(400, 'صفحة النتائج غير صالحة');
        }
        const result = await tasks.skip(query.view === 'list' ? 0 : (page - 1) * limit).limit(limit + 1).lean();
        const hasMore = result.length > limit;
        const last = result[limit - 1];
        if (query.view === 'list' && hasMore) {
            const timestamp = last.createdAt ? new Date(last.createdAt).toISOString() : 'none';
            res.set('X-Next-Cursor', timestamp + '~' + last._id);
        }
        res.set('X-Has-More', String(hasMore)).json(result.slice(0, limit));
        return;
    }
    res.json(await tasks.lean());
}

router.get('/', (req, res) => listTasks(req.query, req.user.id, res));
router.get('/archived/list', (req, res) => listTasks(req.query, req.user.id, res, true));
router.get('/overview', async (req, res) => {
    const today = req.query.today ?? new Date().toISOString().slice(0, 10);
    if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw accessError(400, 'التاريخ غير صالح');
    const start = dateValue(today);
    const filter = await taskFilter(req.query, req.user.id);
    res.json(await taskOverview(filter, req.user.id, start));
});

router.get('/stats/:projectId', async (req, res) => {
    const project = await getProject(req.params.projectId, req.user.id);
    const filter = tasksInProject(project, req.user.id);
    const [total, done, inProgress, overdue] = await Promise.all([
        Task.countDocuments({ ...filter, status: { $ne: 'archived' } }),
        Task.countDocuments({ ...filter, status: 'done' }),
        Task.countDocuments({ ...filter, status: 'in-progress' }),
        Task.countDocuments({ ...filter, dueDate: { $lt: new Date() }, status: { $nin: ['done', 'archived'] } })
    ]);
    res.json({ total, done, inProgress, overdue, completionRate: total ? Math.round(done * 100 / total) : 0 });
});

router.get('/:id', taskAccess(), (req, res) => {
    res.json({ ...req.task.toObject(), workspaceId: req.workspace?._id || null });
});

router.post('/', async (req, res) => {
    const input = req.body || {};
    const fields = taskFields(input);
    if (!fields.title) throw accessError(400, 'عنوان المهمة مطلوب');
    validateDates(fields);
    const context = input.projectId ? await getProjectContext(input.projectId, req.user.id) : null;
    const project = context?.project;
    if (project?.status === 'archived') throw accessError(409, 'استعد المشروع قبل إضافة المهام');
    if (project && input.workspaceId && !sameId(project.workspaceId, input.workspaceId)) {
        throw accessError(400, 'المشروع لا ينتمي إلى مساحة العمل المحددة');
    }
    const workspace = context ? context.workspace
        : input.workspaceId ? (await requireWorkspace(input.workspaceId, req.user.id)).workspace : null;
    const task = await Task.create({
        ...fields,
        ...await assignment(input, workspace),
        projectId: project?._id || null,
        project: project?.name || (input.project === undefined ? '' : stringValue(input.project, 'اسم المشروع', 120)),
        workspaceId: workspace?._id || null,
        userId: req.user.id,
        progress: statusProgress[fields.status] || 0,
        completedAt: fields.status === 'done' ? new Date() : null,
        archivedAt: fields.status === 'archived' ? new Date() : null,
        archivedBy: fields.status === 'archived' ? req.user.id : null,
        activity: [event(req, 'إنشاء المهمة')]
    });
    await notifyAssignment(task, req);
    res.status(201).json(task);
});

function event(req, action, details = '') {
    return { action, userId: req.user.id, username: req.user.username, details };
}

async function notifyAssignment(task, req, previousAssignee) {
    if (!task.assigneeId || sameId(task.assigneeId, previousAssignee) || sameId(task.assigneeId, req.user.id)) return;
    await Notification.create({
        userId: task.assigneeId, fromUser: req.user.username, type: 'task_assigned',
        message: 'أُسندت إليك مهمة', link: '/task.html?id=' + task._id, taskId: task._id, projectId: task.projectId
    }).catch(() => console.warn('Task assignment notification could not be saved.'));
}

function changeStatus(task, status, req) {
    if (task.status === status) return;
    task.activity.push(event(req, 'تغيير الحالة', task.status + ' ← ' + status));
    task.status = status;
    task.completedAt = status === 'done' ? new Date() : null;
    task.archivedAt = status === 'archived' ? new Date() : null;
    task.archivedBy = status === 'archived' ? req.user.id : null;
    if (statusProgress[status] !== undefined) task.progress = statusProgress[status];
}

async function validateDependencies(input, task, userId) {
    if (!Array.isArray(input) || input.length > 50) throw accessError(400, 'قائمة التبعيات غير صالحة');
    const ids = new Set();
    const deps = input.map(entry => {
        const taskId = String(validateId(entry?.taskId));
        const type = entry.type ?? 'finish-to-start';
        if (!dependencyTypes.includes(type) || sameId(taskId, task._id) || ids.has(taskId)) {
            throw accessError(400, 'تبعية مكررة أو غير صالحة');
        }
        ids.add(taskId);
        return { taskId, type };
    });
    if (!ids.size) return deps;

    const filter = task.projectId
        ? await taskFilter({ projectId: String(task.projectId) }, userId)
        : { userId, projectId: null, workspaceId: task.workspaceId || null };
    const related = await Task.find(filter).select('dependencies').lean();
    const graph = new Map(related.map(item => [String(item._id), item.dependencies || []]));
    const visit = [...ids];
    const visited = new Set();
    while (visit.length) {
        const id = visit.pop();
        if (sameId(id, task._id)) throw accessError(400, 'هذه التبعية تُنشئ حلقة بين المهام');
        if (visited.has(id)) continue;
        visited.add(id);
        if (!graph.has(id)) throw accessError(400, 'المهمة المرتبطة غير متاحة في المشروع');
        for (const dependency of graph.get(id)) visit.push(String(dependency.taskId));
    }
    return deps;
}

router.patch('/:id', taskAccess('edit'), async (req, res) => {
    const input = req.body || {};
    const task = req.task;
    const previousAssignee = task.assigneeId;
    const { status, ...fields } = taskFields(input);
    if (status && status !== task.status && (status === 'archived' || task.status === 'archived')) {
        throw accessError(400, 'استخدم إجراء الأرشفة أو الاستعادة لتغيير هذه الحالة');
    }
    validateDates(fields, task);
    if (input.workspaceId !== undefined && !(sameId(input.workspaceId, req.workspace?._id)
        || (!input.workspaceId && !req.workspace))) {
        throw accessError(400, 'لا يمكن نقل المهمة بين مساحات العمل بهذا الإجراء');
    }
    if (input.projectId !== undefined && !sameId(input.projectId, task.projectId)) {
        const project = input.projectId ? await getProject(input.projectId, req.user.id) : null;
        if (project?.status === 'archived') throw accessError(409, 'استعد المشروع قبل نقل المهمة إليه');
        if ((project?.workspaceId || req.workspace) && !sameId(project?.workspaceId, req.workspace?._id)) {
            throw accessError(400, 'اختر مشروعًا من مساحة العمل الحالية');
        }
        if (task.dependencies.length || task.parentTask || await Task.exists({ parentTask: task._id })) {
            throw accessError(409, 'لا يمكن نقل مهمة مرتبطة بمهام أخرى');
        }
        fields.projectId = project?._id || null;
        fields.project = project?.name || '';
    }
    if (input.progress !== undefined) {
        if (typeof input.progress !== 'number' || !Number.isFinite(input.progress) || input.progress < 0 || input.progress > 100) {
            throw accessError(400, 'نسبة التقدم غير صالحة');
        }
        fields.progress = input.progress;
    }
    if (input.dependencies !== undefined) {
        if (fields.projectId !== undefined) throw accessError(400, 'حدّث التبعيات بعد نقل المهمة');
        fields.dependencies = await validateDependencies(input.dependencies, task, req.user.id);
    }
    task.set({ ...fields, ...await assignment(input, req.workspace, task) });
    if (status) changeStatus(task, status, req);
    await task.save();
    if (status && task.parentTask) await updateParentProgress(task.parentTask);
    await notifyAssignment(task, req, previousAssignee);
    res.json({ message: 'تم تحديث المهمة بنجاح', task });
});

async function deleteTask(req, res) {
    if (await Task.exists({ parentTask: req.task._id })) throw accessError(409, 'انقل المهام الفرعية أو احذفها أولًا');
    const storageKeys = req.task.attachments.map(file => file.storageKey);
    await req.task.deleteOne();
    for (const key of storageKeys) await removeStoredUpload(key);
    if (req.task.parentTask) await updateParentProgress(req.task.parentTask);
    res.json({ message: 'تم حذف المهمة' });
}

router.delete('/:id', taskAccess('manage'), deleteTask);
router.delete('/:id/permanent', taskAccess('manage'), (req, res) => {
    if (req.task.status !== 'archived') throw accessError(409, 'أرشف المهمة قبل حذفها نهائيًا');
    return deleteTask(req, res);
});

router.post('/:id/comments', taskAccess(), async (req, res) => {
    const text = stringValue(req.body?.text, 'التعليق', 2000, true);
    req.task.comments.push({ text, userId: req.user.id, username: req.user.username });
    req.task.activity.push(event(req, 'تعليق', text.slice(0, 50)));
    await req.task.save();

    if (req.workspace) {
        const names = [...new Set([...text.matchAll(/@([\p{L}\p{N}_.+@-]+)/gu)].map(match => match[1]))].slice(0, 10);
        if (names.length) {
            const members = await User.find({
                _id: { $in: req.workspace.members.map(member => member.userId), $ne: req.user.id },
                username: { $in: names },
                isActive: { $ne: false }
            }).select('_id').lean();
            if (members.length) {
                await Notification.insertMany(members.map(member => ({
                    userId: member._id, fromUser: req.user.username, type: 'mention',
                    message: req.user.username + ' أشار إليك في تعليق',
                    link: '/task.html?id=' + req.task._id, taskId: req.task._id, projectId: req.task.projectId
                }))).catch(() => console.warn('Task mention notifications could not be saved.'));
            }
        }
    }
    res.json(req.task);
});

router.post('/:id/checklist', taskAccess('edit'), async (req, res) => {
    req.task.checklist.push({ text: stringValue(req.body?.text, 'البند', 500, true) });
    await req.task.save();
    res.json(req.task);
});

router.patch('/:id/checklist/:itemId', taskAccess('edit'), async (req, res) => {
    const item = req.task.checklist.id(validateId(req.params.itemId));
    if (!item) throw accessError(404, 'البند غير موجود');
    if (typeof req.body?.done !== 'boolean') throw accessError(400, 'حالة البند غير صالحة');
    item.done = req.body.done;
    await req.task.save();
    res.json(req.task);
});

router.delete('/:id/checklist/:itemId', taskAccess('edit'), async (req, res) => {
    req.task.checklist.pull(validateId(req.params.itemId));
    await req.task.save();
    res.json(req.task);
});

router.post('/:id/attachments/upload', taskAccess('edit'), attachmentMultipart, async (req, res) => {
    if (!req.file) throw accessError(400, 'اختر ملفًا');
    try {
        if (req.task.attachments.length >= 100) throw accessError(409, 'بلغت المهمة الحد الأقصى للمرفقات');
        const id = new Types.ObjectId();
        const name = uploadName(req.file.originalname, 'مرفق');
        await persistUpload(req.file, req.file.filename);
        req.task.attachments.push({
            _id: id, name, storageKey: req.file.filename, type: 'file', size: req.file.size,
            url: '/api/tasks/' + req.task._id + '/attachments/' + id + '/download'
        });
        req.task.activity.push(event(req, 'رفع ملف', name));
        await req.task.save();
    } catch (error) {
        await removeStoredUpload(req.file.filename);
        await removeFile(req.file.path);
        throw error;
    }
    res.status(201).json(req.task);
});

router.post('/:id/attachments', taskAccess('edit'), async (req, res) => {
    const { name, url, type, size } = req.body || {};
    const label = stringValue(name, 'اسم المرفق', 255, true);
    const link = stringValue(url, 'رابط المرفق', 2048, true);
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(link) || /^\/uploads\//.test(new URL(link).pathname)) {
        throw accessError(400, 'رابط المرفق غير صالح');
    }
    req.task.attachments.push({ name: label, url: link, type: type || 'file', size: Number(size) || 0 });
    req.task.activity.push(event(req, 'إضافة مرفق', label));
    await req.task.save();
    res.json(req.task);
});

router.get('/:id/attachments/:attId/download', taskAccess(), async (req, res, next) => {
    const attachment = req.task.attachments.id(validateId(req.params.attId));
    if (!attachment) throw accessError(404, 'المرفق غير موجود');
    const key = attachment.storageKey;
    res.set('Cache-Control', 'private, no-store');
    if (typeof key === 'string' && /^[a-f0-9-]{36}$/.test(key)) {
        return streamStoredUpload(key, res, next, { name: attachment.name });
    }
    let url;
    try { url = new URL(attachment.url, 'http://localhost'); } catch { /* invalid legacy link */ }
    const legacy = url?.pathname.match(/^\/uploads\/([a-zA-Z0-9._-]+)$/);
    if (!legacy || legacy[1] === '.' || legacy[1] === '..') throw accessError(404, 'الملف غير متاح للتنزيل');
    const filename = path.join(legacyDir, legacy[1]);
    res.download(filename, attachment.name, { headers: { 'Content-Type': 'application/octet-stream' } }, error => {
        if (error) next(error);
    });
});

router.delete('/:id/attachments/:attId', taskAccess('edit'), async (req, res) => {
    const id = validateId(req.params.attId);
    const attachment = req.task.attachments.id(id);
    if (!attachment) throw accessError(404, 'المرفق غير موجود');
    const key = attachment.storageKey;
    req.task.attachments.pull(id);
    req.task.activity.push(event(req, 'حذف مرفق'));
    await req.task.save();
    await removeStoredUpload(key);
    res.json(req.task);
});

router.delete('/:id/dependencies/:dependencyId', taskAccess('edit'), async (req, res) => {
    req.task.dependencies.pull(validateId(req.params.dependencyId));
    await req.task.save();
    res.json(req.task);
});

router.post('/:id/dependencies', taskAccess('edit'), async (req, res) => {
    const task = req.task;
    const deps = [...task.dependencies, { taskId: req.body?.taskId, type: req.body?.type }];
    await validateDependencies(deps, task, req.user.id);
    task.dependencies.push(deps.at(-1));
    await task.save();
    res.status(201).json(task);
});

router.get('/:id/subtasks', taskAccess(), async (req, res) => {
    const filter = await taskFilter(req.task.projectId ? { projectId: String(req.task.projectId) }
        : req.workspace ? { workspaceId: String(req.workspace._id) } : {}, req.user.id);
    res.json(await Task.find({ ...filter, parentTask: req.task._id }).sort({ createdAt: -1 }).lean());
});

router.post('/:id/subtasks', taskAccess('edit'), async (req, res) => {
    const parent = req.task;
    const input = req.body || {};
    const fields = taskFields(input);
    if (!fields.title) throw accessError(400, 'عنوان المهمة مطلوب');
    validateDates(fields);
    const task = await Task.create({
        priority: parent.priority,
        ...fields,
        ...await assignment(input, req.workspace),
        project: parent.project,
        projectId: parent.projectId,
        workspaceId: req.workspace?._id || null,
        parentTask: parent._id,
        userId: req.user.id,
        activity: [event(req, 'إنشاء مهمة فرعية', parent.title)]
    });
    await updateParentProgress(parent._id);
    await notifyAssignment(task, req);
    res.status(201).json(task);
});

router.delete('/:id/subtasks/:subtaskId', taskAccess('manage'), async (req, res) => {
    const subtask = await Task.findOne({ _id: validateId(req.params.subtaskId), parentTask: req.task._id });
    if (!subtask || (subtask.workspaceId && !sameId(subtask.workspaceId, req.workspace?._id))
        || !sameId(subtask.projectId || req.task._id, req.task.projectId || req.task._id)) {
        throw accessError(404, 'المهمة الفرعية غير موجودة');
    }
    if (await Task.exists({ parentTask: subtask._id })) throw accessError(409, 'احذف المهام الفرعية التابعة أولًا');
    await subtask.deleteOne();
    await updateParentProgress(req.task._id);
    res.json({ message: 'تم حذف المهمة الفرعية' });
});

function archiveStatus(status, message) {
    return async (req, res) => {
        changeStatus(req.task, status, req);
        await req.task.save();
        if (req.task.parentTask) await updateParentProgress(req.task.parentTask);
        res.json({ message, task: req.task });
    };
}

router.patch('/:id/archive', taskAccess('manage'), archiveStatus('archived', 'تمت أرشفة المهمة'));
router.patch('/:id/restore', taskAccess('manage'), archiveStatus('new', 'تمت استعادة المهمة'));

async function updateParentProgress(parentTask) {
    const [total, done] = await Promise.all([
        Task.countDocuments({ parentTask, status: { $ne: 'archived' } }),
        Task.countDocuments({ parentTask, status: 'done' })
    ]);
    await Task.updateOne({ _id: parentTask }, { $set: { progress: total ? Math.round(done * 100 / total) : 0 } });
}

module.exports = router;
