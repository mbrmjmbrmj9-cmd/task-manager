const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');
const { paginate, paginatedResponse } = require('../middleware/paginate');

const router = express.Router();

// ✅ استخراج mentions من النص وإرسال إشعارات
async function processMentions(text, taskId, fromUserId, fromUsername) {
    const mentionRegex = /@(\w+)/g;
    const mentions = [...text.matchAll(mentionRegex)].map(m => m[1]);
    
    for (const username of mentions) {
        try {
            const user = await User.findOne({ username });
            if (user && user._id.toString() !== fromUserId) {
                await Notification.create({
                    userId: user._id,
                    fromUser: fromUsername,
                    type: 'mention',
                    message: `${fromUsername} أشار إليك في المحادثة`,
                    link: taskId ? `/task.html?id=${taskId}` : '/chat.html',
                    taskId: taskId || null
                });
            }
        } catch (err) {
            console.error('خطأ في إرسال إشعار mention:', err);
        }
    }
}

// جلب الرسائل (مع Pagination)
router.get('/', authenticate, paginate, async (req, res) => {
    const filter = {};
    if (req.query.taskId) filter.taskId = req.query.taskId;
    else if (req.query.channel) filter.channel = req.query.channel;
    else filter.channel = 'عام';
    
    await paginatedResponse(Message, filter, req, res, { createdAt: -1 });
});

// إرسال رسالة
router.post('/', authenticate, async (req, res) => {
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
    
    // ✅ معالجة الـ mentions
    if (text) {
        await processMentions(text, taskId, req.user.id, req.user.username);
    }
    
    res.status(201).json(msg);
});

module.exports = router;