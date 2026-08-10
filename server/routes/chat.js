const express = require('express');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
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

router.get('/', auth, async (req, res) => {
    const filter = {};
    if (req.query.taskId) filter.taskId = req.query.taskId;
    else if (req.query.channel) filter.channel = req.query.channel;
    else filter.channel = 'عام';
    
    const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json(messages.reverse());
});

router.post('/', auth, async (req, res) => {
    const { text, taskId, channel, replyTo, fileUrl, fileName } = req.body;
    if (!text && !fileUrl) return res.status(400).json({ error: 'النص مطلوب' });
    const msg = await Message.create({
        text: text || '',
        userId: req.user.id,
        username: req.user.username,
        taskId: taskId || '',
        channel: channel || 'عام',
        replyTo: replyTo || '',
        fileUrl: fileUrl || '',
        fileName: fileName || ''
    });
    res.status(201).json(msg);
});
module.exports = router;