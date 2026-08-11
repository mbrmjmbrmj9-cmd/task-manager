const express = require('express');
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');
const { paginate, paginatedResponse } = require('../middleware/paginate');

const router = express.Router();

// ✅ جلب إشعارات المستخدم (مع Pagination)
router.get('/', authenticate, paginate, async (req, res) => {
    try {
        const filter = { userId: req.user.id };
        if (req.query.unread === 'true') filter.isRead = false;
        
        await paginatedResponse(Notification, filter, req, res, { createdAt: -1 });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الإشعارات' });
    }
});

// ✅ تعليم إشعار كمقروء
router.patch('/:id/read', authenticate, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { isRead: true },
            { new: true }
        );
        
        if (!notification) return res.status(404).json({ error: 'إشعار غير موجود' });
        res.json(notification);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// ✅ تعليم الكل كمقروء
router.patch('/read-all', authenticate, async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user.id, isRead: false },
            { isRead: true }
        );
        res.json({ message: 'تم تعليم الكل كمقروء' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

module.exports = router;