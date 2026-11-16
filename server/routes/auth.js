const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { issueSession } = require('../config/session');
const { appOrigin } = require('../config/env');
const { mailAvailable, sendMail } = require('../config/mail');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
    message: { error: 'تم تجاوز عدد المحاولات. حاول بعد دقيقة.' } });
const invalidLogin = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
const resetMessage = 'إذا كان البريد مسجلاً، سيصلك رابط الاستعادة';
const unusedPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

function passwordValid(password) {
    return typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password) <= 72;
}

function tokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function profile(user) {
    return { _id: user._id, id: user._id, username: user.username, fullName: user.fullName || '', email: user.email || '', avatar: user.avatar || '' };
}

function securityEvent(req, action) {
    return { action, ip: req.ip, device: (req.get('user-agent') || '').slice(0, 100), timestamp: new Date() };
}

function pushSecurityEvent(req, action) {
    return { securityLog: { $each: [securityEvent(req, action)], $slice: -30 } };
}

router.post('/register', async (req, res) => {
    const { username, password, fullName = '' } = req.body || {};
    if (typeof username !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username.trim())
        || username.length > 254 || typeof fullName !== 'string' || fullName.length > 120 || !passwordValid(password)) {
        return res.status(400).json({ error: 'أدخل بريدًا صالحًا وكلمة مرور من 8 أحرف على الأقل وبحد أقصى 72 بايت' });
    }
    const email = username.trim().toLowerCase();
    try {
        await User.create({ username: email, email, fullName: fullName.trim(), password: await bcrypt.hash(password, 10) });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ error: 'هذا البريد مسجل بالفعل' });
        throw error;
    }
    res.status(201).json({ message: 'تم التسجيل بنجاح' });
});

router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || username.length > 254 || typeof password !== 'string'
        || Buffer.byteLength(password) > 72) {
        return res.status(400).json({ error: invalidLogin });
    }
    const identifier = username.trim();
    const user = await User.findOne({ username: { $in: [identifier, identifier.toLowerCase()] } });
    const match = await bcrypt.compare(password, user?.password?.startsWith('$2') ? user.password : unusedPasswordHash);
    const active = Boolean(user && user.isActive !== false && user.password?.startsWith('$2') && match);
    if (user) {
        await User.updateOne({ _id: user._id }, { $push: pushSecurityEvent(req, active ? 'login_success' : 'login_failed') });
    }
    if (!active) return res.status(400).json({ error: invalidLogin });
    res.json({ token: issueSession(user), user: profile(user) });
});

router.get('/security-log', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id).select({ securityLog: { $slice: -20 } }).lean();
    res.json(user?.securityLog || []);
});

router.post('/change-password', authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || Buffer.byteLength(currentPassword) > 72 || !passwordValid(newPassword)) {
        return res.status(400).json({ error: 'أدخل كلمة المرور الحالية وكلمة مرور جديدة صالحة' });
    }
    const user = await User.findById(req.user.id).select('password');
    if (!user?.password?.startsWith('$2') || !await bcrypt.compare(currentPassword, user.password)) {
        return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    const update = await User.updateOne({ _id: user._id, password: user.password, isActive: { $ne: false } }, {
        $set: { password: await bcrypt.hash(newPassword, 10) },
        $unset: { resetToken: '', resetTokenExpiry: '' },
        $inc: { sessionVersion: 1 },
        $push: pushSecurityEvent(req, 'password_changed')
    });
    if (!update.modifiedCount) return res.status(409).json({ error: 'تغيّرت بيانات الحساب، سجّل الدخول مجددًا' });
    res.json({ message: 'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة' });
});

router.post('/forgot-password', async (req, res) => {
    if (!mailAvailable()) return res.status(503).json({ error: 'خدمة الاستعادة غير متاحة حاليًا' });
    const { email } = req.body || {};
    if (typeof email !== 'string' || email.length > 254) return res.status(400).json({ error: 'البريد غير صالح' });
    const identifier = email.trim();
    const user = await User.findOne({ username: { $in: [identifier, identifier.toLowerCase()] }, isActive: { $ne: false } });
    if (user?.password?.startsWith('$2')) {
        const token = crypto.randomBytes(32).toString('hex');
        const hash = tokenHash(token);
        await User.updateOne({ _id: user._id }, { $set: { resetToken: hash, resetTokenExpiry: new Date(Date.now() + 15 * 60 * 1000) } });
        const url = new URL('/reset-password.html', appOrigin());
        url.searchParams.set('token', token);
        try {
            await sendMail({ to: user.username, subject: 'استعادة كلمة المرور — نيفورا', text: 'رابط استعادة كلمة المرور صالح لمدة 15 دقيقة:\n' + url.href });
        } catch {
            await User.updateOne({ _id: user._id, resetToken: hash }, { $unset: { resetToken: '', resetTokenExpiry: '' } });
            console.warn('Password reset email could not be sent.');
        }
    }
    res.json({ message: resetMessage });
});

router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !passwordValid(password)) {
        return res.status(400).json({ error: 'الرابط أو كلمة المرور غير صالحة' });
    }
    const update = await User.updateOne({
        resetToken: tokenHash(token), resetTokenExpiry: { $gt: new Date() }, isActive: { $ne: false }
    }, {
        $set: { password: await bcrypt.hash(password, 10) },
        $unset: { resetToken: '', resetTokenExpiry: '' },
        $inc: { sessionVersion: 1 },
        $push: pushSecurityEvent(req, 'password_reset')
    });
    if (!update.modifiedCount) return res.status(400).json({ error: 'الرابط منتهي أو غير صالح' });
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
});

router.patch('/avatar', authenticate, async (req, res) => {
    const { avatar } = req.body || {};
    if (typeof avatar !== 'string' || avatar.length > 2048
        || (avatar && !/^https?:\/\/[^\s"'<>]+$/i.test(avatar))) {
        return res.status(400).json({ error: 'رابط الصورة غير صالح' });
    }
    await User.updateOne({ _id: req.user.id }, { $set: { avatar } });
    res.json({ avatar });
});

router.get('/profile', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id).select('username fullName email avatar').lean();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json(profile(user));
});

router.patch('/profile', authenticate, async (req, res) => {
    const { fullName, email } = req.body || {};
    const updates = {};
    if (fullName !== undefined) {
        if (typeof fullName !== 'string' || fullName.length > 120) return res.status(400).json({ error: 'الاسم غير صالح' });
        updates.fullName = fullName.trim();
    }
    if (email !== undefined) {
        if (typeof email !== 'string' || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            return res.status(400).json({ error: 'البريد غير صالح' });
        }
        updates.email = email.trim();
    }
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true })
        .select('username fullName email avatar').lean();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json(profile(user));
});

module.exports = router;
