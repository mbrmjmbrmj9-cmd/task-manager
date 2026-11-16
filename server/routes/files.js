const express = require('express');
const { Types } = require('mongoose');
const File = require('../models/File');
const { authenticate, sameId, accessError } = require('../middleware/auth');
const { scopedProject, projectResource, resourceFilter, validateFolder, userText, countFolderItems } = require('../middleware/project-resources');
const { attachmentMultipart, uploadName, removeFile, persistUpload, removeStoredUpload, streamStoredUpload } = require('../config/storage');

const router = express.Router();
router.use(authenticate);

async function folderValue(id, project, userId) {
    return (await validateFolder(id, project, userId))?._id || null;
}

router.get('/project/:projectId', async (req, res) => {
    const project = await scopedProject(req.params.projectId, req.user.id);
    const filter = resourceFilter(project, req.user.id);
    if (req.query.folderId || req.query.root === 'true') {
        filter.folderId = await folderValue(req.query.folderId, project, req.user.id);
    }
    if (req.query.type) filter.type = userText(req.query.type, 'نوع الملف غير صالح', 30);
    if (req.query.search) {
        const text = userText(req.query.search, 'البحث غير صالح', 120);
        filter.name = { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    const result = await File.find(filter).sort({ isFavorite: -1, createdAt: -1 }).lean();
    res.json(result);
});

router.post('/project/:projectId/upload', async (req, _res, next) => {
    req.project = await scopedProject(req.params.projectId, req.user.id);
    req.folderId = await folderValue(req.query.folderId, req.project, req.user.id);
    next();
}, attachmentMultipart, async (req, res) => {
    if (!req.file) throw accessError(400, 'اختر ملفًا');
    let file;
    try {
        const id = new Types.ObjectId();
        const { project } = req;
        const name = uploadName(req.file.originalname, 'ملف');
        await persistUpload(req.file, req.file.filename);
        file = await File.create({
            _id: id, name, originalName: name, url: '/api/files/' + id + '/download', storageKey: req.file.filename,
            size: req.file.size, folderId: req.folderId, projectId: project._id, workspaceId: project.workspaceId,
            userId: req.user.id, username: req.user.username
        });
    } catch (error) {
        await removeStoredUpload(req.file.filename);
        await removeFile(req.file.path);
        throw error;
    }
    await countFolderItems(file.folderId, req.project, req.user.id);
    res.status(201).json(file);
});

router.get('/:id', async (req, res) => {
    const { resource } = await projectResource(File, req.params.id, req.user.id);
    res.json(resource);
});

router.get('/:id/download', async (req, res, next) => {
    const { resource: file } = await projectResource(File, req.params.id, req.user.id);
    if (!file.storageKey || !/^[a-f0-9-]{36}$/.test(file.storageKey)) throw accessError(404, 'الملف غير متاح للتنزيل');
    await File.updateOne({ _id: file._id }, { $inc: { downloadCount: 1 } });
    res.set('Cache-Control', 'private, no-store');
    return streamStoredUpload(file.storageKey, res, next, { name: file.originalName });
});

router.post('/', async (req, res) => {
    const input = req.body || {};
    const project = await scopedProject(input.projectId, req.user.id);
    const name = userText(input.name, 'اسم الملف غير صالح', 255, true);
    const url = userText(input.url, 'رابط الملف غير صالح', 2048, true);
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(url) || /^\/uploads\//.test(new URL(url).pathname)) {
        throw accessError(400, 'رابط الملف غير صالح');
    }
    const file = await File.create({
        name, originalName: name, url, folderId: await folderValue(input.folderId, project, req.user.id),
        projectId: project._id, workspaceId: project.workspaceId, userId: req.user.id, username: req.user.username
    });
    await countFolderItems(file.folderId, project, req.user.id);
    res.status(201).json(file);
});

async function updateFile(req, res) {
    const { resource: file, project } = await projectResource(File, req.params.id, req.user.id, true);
    const input = req.body || {};
    const oldFolder = file.folderId;
    if (input.folderId !== undefined) file.folderId = await folderValue(input.folderId, project, req.user.id);
    if (input.name !== undefined) file.name = userText(input.name, 'اسم الملف غير صالح', 255, true);
    if (input.description !== undefined) file.description = userText(input.description, 'الوصف غير صالح', 2000);
    if (input.isFavorite !== undefined) {
        if (typeof input.isFavorite !== 'boolean') throw accessError(400, 'خيار المفضلة غير صالح');
        file.isFavorite = input.isFavorite;
    }
    await file.save();
    if (!sameId(oldFolder, file.folderId)) {
        await Promise.all([countFolderItems(oldFolder, project, req.user.id), countFolderItems(file.folderId, project, req.user.id)]);
    }
    res.json(file);
}

router.patch('/:id', updateFile);
router.patch('/:id/move', updateFile);

router.delete('/:id', async (req, res) => {
    const { resource: file, project } = await projectResource(File, req.params.id, req.user.id, true);
    await file.deleteOne();
    await removeStoredUpload(file.storageKey);
    await countFolderItems(file.folderId, project, req.user.id);
    res.json({ message: 'تم حذف الملف' });
});

module.exports = router;
