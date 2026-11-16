const express = require('express');
const Folder = require('../models/Folder');
const File = require('../models/File');
const { authenticate, sameId, accessError } = require('../middleware/auth');
const { scopedProject, resourceFilter, projectResource, validateFolder, userText, countFolderItems } = require('../middleware/project-resources');

const router = express.Router();
router.use(authenticate);

router.get('/project/:projectId', async (req, res) => {
    const project = await scopedProject(req.params.projectId, req.user.id);
    const filter = { ...resourceFilter(project, req.user.id), isArchived: { $ne: true } };
    if (req.query.parentFolderId || req.query.root === 'true') {
        filter.parentFolderId = (await validateFolder(req.query.parentFolderId, project, req.user.id))?._id || null;
    }
    res.json(await Folder.find(filter).sort({ isFavorite: -1, name: 1 }).lean());
});

router.get('/:id', async (req, res) => {
    const { resource: folder, project } = await projectResource(Folder, req.params.id, req.user.id);
    const filter = resourceFilter(project, req.user.id);
    const [files, subFolders] = await Promise.all([
        File.find({ ...filter, folderId: folder._id }).sort({ isFavorite: -1, createdAt: -1 }).lean(),
        Folder.find({ ...filter, parentFolderId: folder._id, isArchived: { $ne: true } }).sort({ name: 1 }).lean()
    ]);
    res.json({ folder, files, subFolders });
});

router.post('/', async (req, res) => {
    const input = req.body || {};
    const project = await scopedProject(input.projectId, req.user.id);
    const parent = await validateFolder(input.parentFolderId, project, req.user.id);
    const folder = await Folder.create({
        name: userText(input.name, 'اسم المجلد غير صالح', 120, true),
        description: input.description === undefined ? '' : userText(input.description, 'الوصف غير صالح', 2000),
        parentFolderId: parent?._id || null, projectId: project._id, workspaceId: project.workspaceId, userId: req.user.id
    });
    await countFolderItems(folder.parentFolderId, project, req.user.id);
    res.status(201).json(folder);
});

router.patch('/:id', async (req, res) => {
    const { resource: folder, project } = await projectResource(Folder, req.params.id, req.user.id, true);
    const input = req.body || {};
    const previousParent = folder.parentFolderId;
    if (input.name !== undefined) folder.name = userText(input.name, 'اسم المجلد غير صالح', 120, true);
    if (input.description !== undefined) folder.description = userText(input.description, 'الوصف غير صالح', 2000);
    if (input.parentFolderId !== undefined) {
        const parent = await validateFolder(input.parentFolderId, project, req.user.id);
        let current = parent;
        const seen = new Set([String(folder._id)]);
        while (current) {
            const id = String(current._id);
            if (seen.has(id)) throw accessError(400, 'لا يمكن نقل المجلد داخل نفسه أو أحد مجلداته الفرعية');
            seen.add(id);
            current = await validateFolder(current.parentFolderId, project, req.user.id);
        }
        folder.parentFolderId = parent?._id || null;
    }
    for (const field of ['isFavorite', 'isArchived']) {
        if (input[field] === undefined) continue;
        if (typeof input[field] !== 'boolean') throw accessError(400, 'إعداد المجلد غير صالح');
        folder[field] = input[field];
    }
    await folder.save();
    await countFolderItems(folder.parentFolderId, project, req.user.id);
    if (!sameId(previousParent, folder.parentFolderId)) await countFolderItems(previousParent, project, req.user.id);
    res.json(folder);
});

router.delete('/:id', async (req, res) => {
    const { resource: folder, project } = await projectResource(Folder, req.params.id, req.user.id, true);
    const filter = resourceFilter(project, req.user.id);
    const [hasFiles, hasFolders] = await Promise.all([
        File.exists({ ...filter, folderId: folder._id }),
        Folder.exists({ ...filter, parentFolderId: folder._id })
    ]);
    if (hasFiles || hasFolders) throw accessError(409, 'انقل المحتويات قبل حذف هذا المجلد');
    await folder.deleteOne();
    await countFolderItems(folder.parentFolderId, project, req.user.id);
    res.json({ message: 'تم حذف المجلد' });
});

router.patch('/:id/item-count', async (req, res) => {
    const { resource: folder, project } = await projectResource(Folder, req.params.id, req.user.id, true);
    await countFolderItems(folder._id, project, req.user.id);
    res.json(await Folder.findById(folder._id));
});

module.exports = router;
