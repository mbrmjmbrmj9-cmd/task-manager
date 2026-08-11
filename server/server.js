const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/database');
const authRoutes = require('./routes/auth');
const { requestLogger, errorHandler } = require('./middleware/logger');
require('./config/google.js');

const app = express();
// ✅ تحميل متغيرات البيئة (للإنتاج)
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nivora_secret_2025';

// اتصال قاعدة البيانات
connectDB();

// ✅ أمان HTTP Headers مع CSP مخصص
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.socket.io", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
            connectSrc: ["'self'", "https://nivora-t9ov.onrender.com", "wss://nivora-t9ov.onrender.com", "ws://localhost:3000"],
            mediaSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            workerSrc: ["'self'", "blob:"],
            formAction: ["'self'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// CORS
app.use(cors({ 
    origin: ['https://task-manager-theta-beryl-91.vercel.app', 'http://localhost:3000', 'http://localhost:5500'],
    credentials: true 
}));

// ✅ Rate Limiting للمسارات الحساسة

// Rate Limiter للتسجيل
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ساعة
    max: 5,
    message: { error: 'تم تجاوز عدد محاولات التسجيل. حاول بعد ساعة.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate Limiter لاستعادة كلمة المرور
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 3,
    message: { error: 'تم تجاوز عدد محاولات الاستعادة. حاول لاحقاً.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate Limiter لرفع الملفات
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ساعة
    max: 50,
    message: { error: 'تم تجاوز عدد مرات الرفع. حاول بعد ساعة.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate Limiter لإنشاء المهام
const createTaskLimiter = rateLimit({
    windowMs: 60 * 1000, // دقيقة
    max: 30,
    message: { error: 'تم تجاوز عدد مرات إنشاء المهام. حاول بعد دقيقة.' },
    standardHeaders: true,
    legacyHeaders: false
});

// تطبيق الـ Limiters على المسارات المحددة
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/upload', uploadLimiter);
app.use('/api/tasks', createTaskLimiter);
// ✅ Rate Limiting عام على كل الـ API
app.set('trust proxy', 1);

// ✅ Rate Limiter أساسي لجميع المسارات
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 1000,
    message: { error: 'طلبات كثيرة. حاول لاحقاً.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', generalLimiter);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Passport
app.use(passport.initialize());

// Google OAuth
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/api/auth/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
    const token = jwt.sign({ id: req.user._id, username: req.user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`/login.html?token=${token}&username=${req.user.username}`);
});
// ✅ Request Logger
app.use(requestLogger);
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api/files', require('./routes/files'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/notifications', require('./routes/notifications'));
// ✅ Backup Routes
app.use('/api/backup', require('./routes/backup'));

// الملفات الثابتة
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ✅ معالجة الأخطاء العامة
app.use((err, req, res, next) => {
    console.error('خطأ في الخادم:', err);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'خطأ في الخادم' : err.message
    });
});

// Socket.io
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { 
        origin: ['https://task-manager-theta-beryl-91.vercel.app', 'http://localhost:3000', 'http://localhost:5500'],
        methods: ['GET', 'POST']
    } 
});

io.on('connection', (socket) => {
    console.log('✅ مستخدم متصل:', socket.id);
    socket.on('join', (username) => { socket.username = username; io.emit('user-joined', username); });
    socket.on('chat-message', (msg) => io.emit('chat-message', msg));
    socket.on('typing', (username) => socket.broadcast.emit('typing', username));
    socket.on('stop-typing', () => socket.broadcast.emit('stop-typing'));
    socket.on('edit-message', (msg) => io.emit('edit-message', msg));
    socket.on('delete-message', (msgId) => io.emit('delete-message', msgId));
    socket.on('react-message', (data) => io.emit('react-message', data));
    socket.on('pin-message', (msg) => io.emit('pin-message', msg));
    socket.on('disconnect', () => { if (socket.username) io.emit('user-left', socket.username); });
});
// ✅ معالج أخطاء مركزي
app.use(errorHandler);
server.listen(PORT, () => console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`));