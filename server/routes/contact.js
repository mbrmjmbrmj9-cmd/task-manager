const Ticket = require('../models/Ticket');
const { mailAvailable, sendMail } = require('../config/mail');
const { accessError } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const limits = { name: 120, phone: 40, email: 254, message: 5000 };
const subject = 'رسالة جديدة من نموذج التواصل';

module.exports = async function submitContact(req, res) {
    const data = {};
    for (const [field, limit] of Object.entries(limits)) {
        const value = req.body?.[field] ?? '';
        if (typeof value !== 'string' || value.length > limit || (field !== 'phone' && !value.trim())) {
            throw accessError(400, 'تحقق من الاسم والبريد الإلكتروني والرسالة');
        }
        data[field] = value.trim();
    }
    const { name, phone, email, message } = data;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw accessError(400, 'البريد الإلكتروني غير صالح');

    await Ticket.create({ subject, message, contact: { name, phone, email } });
    res.status(201).json({ message: 'تم استلام رسالتك' });

    if (mailAvailable() && process.env.CONTACT_EMAIL) {
        try {
            await sendMail({ to: process.env.CONTACT_EMAIL, replyTo: email, subject,
                text: [name, phone, email, '', message].join('\n') });
        } catch {
            logger.warn('Contact notification email could not be delivered.');
        }
    }
};
