const File = require('../models/File');
const Folder = require('../models/Folder');
const { getProject, requireWorkspace, validateId, sameId, accessError } = require('./auth');

function requireProjectFiles(project) {
    if (project.settings?.enableFiles === false) throw accessError(403, 'الملفات معطّلة لهذا المشروع');
    return project;
}

async function scopedProject(id, userId) {
    return requireProjectFiles(await getProject(id, userId));
}

async function projectResource(Model, id, userId, write = false) {
    const resource = await Model.findById(validateId(id));
    if (!resource) throw accessError(404, 'العنصر غير موجود');
    const project = await scopedProject(resource.projectId, userId);
    if (resource.workspaceId && !sameId(resource.workspaceId, project.workspaceId)) {
        throw accessError(404, 'العنصر غير موجود');
    }
    if (write && !sameId(resource.userId, userId) && project.workspaceId) {
        const { role } = await requireWorkspace(project.workspaceId, userId);
        if (!['owner', 'admin'].includes(role)) throw accessError(403, 'صلاحيات غير كافية');
    }
    if (!project.workspaceId && !sameId(resource.userId, userId)) {
        throw accessError(404, 'العنصر غير موجود');
    }
    return { resource, project };
}

function resourceFilter(project, userId) {
    return project.workspaceId
        ? { projectId: project._id, workspaceId: { $in: [project.workspaceId, null] } }
        : { projectId: project._id, workspaceId: null, userId };
}

async function validateFolder(id, project, userId) {
    if (!id) return null;
    const folder = await Folder.findOne({ ...resourceFilter(project, userId), _id: validateId(id), isArchived: { $ne: true } });
    if (!folder) throw accessError(404, 'المجلد غير موجود في هذا المشروع');
    return folder;
}

function userText(value, message, max, required = false) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw accessError(400, message);
    return value.trim();
}

async function countFolderItems(id, project, userId) {
    if (!id) return;
    const filter = resourceFilter(project, userId);
    const [files, subfolders] = await Promise.all([
        File.countDocuments({ ...filter, folderId: id }),
        Folder.countDocuments({ ...filter, parentFolderId: id, isArchived: { $ne: true } })
    ]);
    await Folder.updateOne({ ...filter, _id: id }, { $set: { itemCount: files + subfolders } });
}

module.exports = { scopedProject, projectResource, resourceFilter, validateFolder, userText, countFolderItems };
