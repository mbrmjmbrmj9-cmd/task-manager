const express = require('express');
const Workflow = require('../models/Workflow');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// جلب كل workflows
router.get('/', authenticate, async (req, res) => {
    const workflows = await Workflow.find({ userId: req.user.id });
    res.json(workflows);
});

// إنشاء workflow
router.post('/', authenticate, async (req, res) => {
    const { name, steps } = req.body;
    if (!name || !steps || steps.length === 0) return res.status(400).json({ error: 'الاسم والخطوات مطلوبة' });
    const wf = await Workflow.create({ name, steps, userId: req.user.id });
    res.status(201).json(wf);
});

// تحديث workflow
router.patch('/:id', authenticate, async (req, res) => {
    const wf = await Workflow.findOne({ _id: req.params.id, userId: req.user.id });
    if (!wf) return res.status(404).json({ error: 'غير موجود' });
    if (req.body.name) wf.name = req.body.name;
    if (req.body.steps) wf.steps = req.body.steps;
    await wf.save();
    res.json(wf);
});

// حذف workflow
router.delete('/:id', authenticate, async (req, res) => {
    await Workflow.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'تم الحذف' });
});

module.exports = router;