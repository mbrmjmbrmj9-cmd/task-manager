const express = require('express');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Template = require('../models/Template');
const Workflow = require('../models/Workflow');
const { authenticate, accessError } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const projectFields = ['name', 'description', 'status', 'color'];
const taskFields = ['title', 'description', 'status', 'priority', 'startDate', 'dueDate', 'progress', 'checklist', 'tags'];
const templateFields = ['name', 'description', 'category', 'icon', 'color', 'tasks'];
const workflowFields = ['name', 'steps'];

function pick(record, keys) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw accessError(400, 'سجل غير صالح في النسخة');
    return Object.fromEntries(keys.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
}

router.get('/export', async (req, res) => {
    const userId = req.user.id;
    const projects = await Project.find({ userId, workspaceId: null }).select(projectFields.join(' ')).lean();
    const [tasks, templates, workflows] = await Promise.all([
        Task.find({ userId, workspaceId: null, projectId: { $in: [null, ...projects.map(project => project._id)] } })
            .select([...taskFields, 'projectId', 'parentTask'].join(' ')).lean(),
        Template.find({ userId }).select(templateFields.join(' ')).lean(),
        Workflow.find({ userId }).select(workflowFields.join(' ')).lean()
    ]);
    res.attachment('nivora-personal-backup.json').json({ version: 2, exportedAt: new Date(), data: { projects, tasks, templates, workflows } });
});

function importRows(data, field) {
    if (data[field] === undefined) return [];
    if (!Array.isArray(data[field]) || data[field].length > 500) throw accessError(400, 'عدد سجلات النسخة غير صالح');
    return data[field];
}

function makeIdMap(rows) {
    const ids = new Map();
    for (const row of rows) {
        if (typeof row?._id !== 'string' || !/^[a-f\d]{24}$/i.test(row._id) || ids.has(row._id)) {
            throw accessError(400, 'معرّف مكرر أو غير صالح في النسخة');
        }
        ids.set(row._id, new mongoose.Types.ObjectId());
    }
    return ids;
}

function lookupId(ids, key) {
    if (key == null) return null;
    const id = ids.get(key);
    if (!id) throw accessError(400, 'توجد علاقة خارج النسخة الشخصية');
    return id;
}

router.post('/import', async (req, res) => {
    const backup = req.body || {};
    const { data } = backup;
    if (!data || typeof data !== 'object' || Array.isArray(data) || backup.version !== 2) {
        throw accessError(400, 'اختر نسخة شخصية صادرة من نيفورا بالإصدار 2');
    }
    const owner = { userId: req.user.id };
    const projects = importRows(data, 'projects');
    const tasks = importRows(data, 'tasks');
    const projectIds = makeIdMap(projects);
    const taskIds = makeIdMap(tasks);
    const documents = [
        [Project, projects.map(row => ({ ...pick(row, projectFields), ...owner, _id: projectIds.get(row._id) }))],
        [Task, tasks.map(row => ({ ...pick(row, taskFields), ...owner, _id: taskIds.get(row._id),
            projectId: lookupId(projectIds, row.projectId), parentTask: lookupId(taskIds, row.parentTask) }))],
        [Template, importRows(data, 'templates').map(row => ({ ...pick(row, templateFields), ...owner }))],
        [Workflow, importRows(data, 'workflows').map(row => ({ ...pick(row, workflowFields), ...owner }))]
    ];
    for (const [Model, rows] of documents) {
        for (const row of rows) await new Model(row).validate();
    }
    if (req.query.preview === 'true') return res.json({ importedCount: 0, readyCount: documents.reduce((total, [, rows]) => total + rows.length, 0) });
    await mongoose.connection.transaction(async session => {
        for (const [Model, rows] of documents) {
            if (rows.length) await Model.insertMany(rows, { session });
        }
    });
    res.status(201).json({ message: 'تم استيراد النسخة الشخصية', importedCount: documents.reduce((total, [, rows]) => total + rows.length, 0) });
});

module.exports = router;
