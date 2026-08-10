const express = require('express');
const jwt = require('jsonwebtoken');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Workspace = require('../models/Workspace');
const router = express.Router();
const JWT_SECRET = 'nivora_secret_2025';

function auth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'جلسة غير صالحة' });
        req.user = user;
        next();
    });
}

// كل المشاريع
router.get('/', auth, async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.user.id });
        // نجيب عدد المهام لكل مشروع
        const result = await Promise.all(projects.map(async (p) => {
            const taskCount = await Task.countDocuments({ userId: req.user.id, project: p.name });
            const doneCount = await Task.countDocuments({ userId: req.user.id, project: p.name, status: 'done' });
            return { ...p.toObject(), taskCount, doneCount };
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المشاريع' });
    }
});

// إنشاء مشروع
router.post('/', auth, async (req, res) => {
    try {
        const ws = await Workspace.findOne({ 'members.userId': req.user.id });
        if (ws) {
            const count = await Project.countDocuments({ workspaceId: ws._id });
            if (count >= ws.maxProjects) {
                return res.status(400).json({ error: 'وصلت للحد الأقصى للمشاريع في خطتك' });
            }
        }
        
        const { name, description, color } = req.body;
        if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
        
        const project = await Project.create({
            name, description: description || '', color: color || '#2563EB',
            userId: req.user.id,
            workspaceId: ws ? ws._id : null
        });
        res.status(201).json(project);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إنشاء المشروع' });
    }
});

// حذف مشروع
router.delete('/:id', auth, async (req, res) => {
    try {
        await Project.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        res.json({ message: 'تم حذف المشروع' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المشروع' });
    }
});

module.exports = router;