const express = require('express');
const Workflow = require('../models/Workflow');
const { authenticate, validateId, accessError } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function workflowFields(input, required = false) {
    const fields = {};
    if (required || input.name !== undefined) {
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) {
            throw accessError(400, 'اسم مسار العمل غير صالح');
        }
        fields.name = input.name.trim();
    }
    if (required || input.steps !== undefined) {
        if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 30) {
            throw accessError(400, 'أضف من خطوة واحدة إلى 30 خطوة');
        }
        fields.steps = input.steps.map(value => {
            const step = typeof value === 'string' ? { name: value } : value;
            if (typeof step?.name !== 'string' || !step.name.trim() || step.name.length > 80) {
                throw accessError(400, 'اسم الخطوة غير صالح');
            }
            const color = typeof step.color === 'string' && /^#[a-f\d]{6}$/i.test(step.color) ? step.color : '#2563EB';
            const icon = typeof step.icon === 'string' && !/[<>"'&]/.test(step.icon) ? step.icon.slice(0, 24) : '';
            return { name: step.name.trim(), color, icon };
        });
    }
    return fields;
}

router.get('/', async (req, res) => res.json(await Workflow.find({ userId: req.user.id }).sort({ updatedAt: -1 })));

router.post('/', async (req, res) => {
    const workflow = await Workflow.create({ ...workflowFields(req.body || {}, true), userId: req.user.id });
    res.status(201).json(workflow);
});

router.patch('/:id', async (req, res) => {
    const workflow = await Workflow.findOneAndUpdate({ _id: validateId(req.params.id), userId: req.user.id },
        { $set: workflowFields(req.body || {}) }, { new: true });
    if (!workflow) throw accessError(404, 'مسار العمل غير موجود');
    res.json(workflow);
});

router.delete('/:id', async (req, res) => {
    const workflow = await Workflow.findOneAndDelete({ _id: validateId(req.params.id), userId: req.user.id });
    if (!workflow) throw accessError(404, 'مسار العمل غير موجود');
    res.json({ message: 'تم حذف مسار العمل' });
});

module.exports = router;
