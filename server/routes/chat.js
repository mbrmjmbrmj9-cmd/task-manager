const express = require('express');
const Message = require('../models/Message');
const { authenticate, requireWorkspace, getProject, getTask, sameId, validateId, accessError } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

async function chatScope(input, userId) {
    const { workspace } = await requireWorkspace(input.workspaceId, userId);
    let projectId = '';
    let taskId = '';
    if (input.projectId) {
        const project = await getProject(input.projectId, userId);
        if (!sameId(project.workspaceId, workspace._id)) throw accessError(404, 'المشروع غير موجود');
        if (project.settings?.enableChat === false) throw accessError(403, 'المحادثة معطّلة لهذا المشروع');
        projectId = String(project._id);
    }
    if (input.taskId) {
        const { task, workspace: taskWorkspace } = await getTask(input.taskId, userId);
        if (!sameId(taskWorkspace?._id, workspace._id) || (projectId && !sameId(task.projectId, projectId))) {
            throw accessError(404, 'المهمة غير موجودة');
        }
        if (!projectId && task.projectId) {
            const project = await getProject(task.projectId, userId);
            if (project.settings?.enableChat === false) throw accessError(403, 'المحادثة معطّلة لهذا المشروع');
        }
        taskId = String(task._id);
        projectId = task.projectId ? String(task.projectId) : '';
    }
    return { workspaceId: workspace._id, projectId, taskId, channel: 'عام' };
}

function chatRoom(scope) {
    return ['chat', scope.workspaceId, scope.projectId, scope.taskId].join(':');
}

function notify(req, scope) {
    req.app.get('realtime')?.to(chatRoom(scope)).emit('chat-updated');
}

function messageText(input) {
    const text = input?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) {
        throw accessError(400, 'اكتب رسالة من 1 إلى 4000 حرف');
    }
    return text.trim();
}

router.get('/', async (req, res) => {
    const scope = await chatScope(req.query, req.user.id);
    const filter = { ...scope };
    if (req.query.before !== undefined) filter._id = { $lt: validateId(req.query.before) };
    const rows = await Message.find(filter).sort({ _id: -1 }).limit(51).lean();
    const data = rows.slice(0, 50);
    res.json({ data, next: rows.length > 50 ? String(data.at(-1)._id) : null });
});

router.post('/', async (req, res) => {
    const scope = await chatScope(req.body || {}, req.user.id);
    const message = await Message.create({ ...scope, text: messageText(req.body), userId: req.user.id, username: req.user.username });
    notify(req, scope);
    res.status(201).json(message);
});

async function ownedMessage(req) {
    const message = await Message.findById(validateId(req.params.id));
    if (!message || !message.workspaceId) throw accessError(404, 'الرسالة غير موجودة');
    const scope = await chatScope(message, req.user.id);
    if (!sameId(message.userId, req.user.id)) throw accessError(403, 'يمكنك تعديل رسائلك فقط');
    return { message, scope };
}

router.patch('/:id', async (req, res) => {
    const { message, scope } = await ownedMessage(req);
    message.text = messageText(req.body);
    message.editedAt = new Date();
    await message.save();
    notify(req, scope);
    res.json(message);
});

router.delete('/:id', async (req, res) => {
    const { message, scope } = await ownedMessage(req);
    await message.deleteOne();
    notify(req, scope);
    res.status(204).end();
});

module.exports = { router, chatScope, chatRoom };
