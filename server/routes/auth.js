const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = 'nivora_secret_2025';

// Email transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'abwjrahalkhaldy3@gmail.com',
        pass: 'bvwhnpoforgildeo'
    },
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
});

// Rate Limiter
const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: { error: 'تم تجاوز عدد المحاولات. حاول بعد 1 دقيقة.' },
    standardHeaders: true,
    legacyHeaders: false
});

// تسجيل
router.post('/register', async (req, res) => {
    try {
        const { username, password, fullName } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }
        const exists = await User.findOne({ username });
        if (exists) {
            return res.status(400).json({ error: 'اسم المستخدم موجود' });
        }
        const hashed = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashed, fullName: fullName || '' });
        res.status(201).json({ message: 'تم التسجيل بنجاح' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// دخول
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }
        const valid = await bcrypt.compare(password, user.password);
        
        user.securityLog.push({
            action: valid ? 'login_success' : 'login_failed',
            ip: req.ip,
            device: req.headers['user-agent']?.substring(0, 100) || ''
        });
        await user.save();
        
        if (!valid) {
            return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }
        
        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
            token, 
            user: { 
                id: user._id, 
                username: user.username, 
                fullName: user.fullName || '', 
                email: user.email || '' 
            } 
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// سجل الأمان
router.get('/security-log', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json(user.securityLog?.slice(-20) || []);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// تغيير كلمة المرور (داخل التطبيق)
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
        }
        
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' });
        }
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) {
            return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }
        
        user.password = await bcrypt.hash(newPassword, 10);
        user.securityLog.push({
            action: 'password_changed',
            ip: req.ip,
            device: req.headers['user-agent']?.substring(0, 100) || ''
        });
        await user.save();
        
        res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// نسيت كلمة المرور
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        console.log('طلب استعادة من:', email);
        
        const user = await User.findOne({ username: email });
        console.log('المستخدم:', user ? 'موجود' : 'غير موجود');
        
        if (!user) {
            return res.json({ message: 'إذا كان البريد مسجلاً، سيصلك رابط الاستعادة' });
        }
        
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetToken = resetToken;
        user.resetTokenExpiry = Date.now() + 15 * 60 * 1000;
        await user.save();
        
        console.log('جاري إرسال البريد...');
        await transporter.sendMail({
            from: '"Nivora" <bdalrqybalkhaldy183@gmail.com>',
            to: email,
            subject: 'استعادة كلمة المرور - Nivora',
            html: `<div><h2>استعادة كلمة المرور</h2><a href="http://localhost:3000/reset-password.html?token=${resetToken}">إعادة تعيين كلمة المرور</a></div>`
        });
        console.log('تم الإرسال');
        
        res.json({ message: 'إذا كان البريد مسجلاً، سيصلك رابط الاستعادة' });
    } catch (err) {
        console.error('خطأ في forgot-password:', err);
        res.status(500).json({ error: 'خطأ: ' + err.message });
    }
});

// إعادة تعيين
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        const user = await User.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: Date.now() }
        });
        
        if (!user) return res.status(400).json({ error: 'الرابط منتهي أو غير صالح' });
        
        user.password = await bcrypt.hash(password, 10);
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        user.securityLog.push({ action: 'password_reset', ip: req.ip, device: req.headers['user-agent']?.substring(0, 100) || '' });
        await user.save();
        
        res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// تحديث الصورة الرمزية
router.patch('/avatar', authenticate, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.user.id, 
            { avatar: req.body.avatar }, 
            { new: true }
        );
        res.json({ avatar: user.avatar });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث الصورة' });
    }
});

// جلب الملف الشخصي
router.get('/profile', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -resetToken -resetTokenExpiry -securityLog');
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الملف الشخصي' });
    }
});

// تحديث الملف الشخصي
router.patch('/profile', authenticate, async (req, res) => {
    try {
        const allowedUpdates = ['fullName', 'email'];
        const updates = {};
        
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
            updates,
            { new: true }
        ).select('-password -resetToken -resetTokenExpiry -securityLog');
        
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث الملف الشخصي' });
    }
});

module.exports = router;