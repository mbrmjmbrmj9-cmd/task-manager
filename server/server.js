const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
//const passport = require('passport');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const connectDB = require('./config/database');
const authRoutes = require('./routes/auth');
//require('./config/google');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'nivora_secret_2025';

// اتصال قاعدة البيانات
connectDB();

// أمان HTTP Headers - CSP معطل للـ inline scripts
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
app.use(cors({ origin: '*', credentials: true }));

// Rate Limiting
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'طلبات كثيرة. حاول لاحقاً.' }
}));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Passport
//app.use(passport.initialize());

// Google OAuth
//app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
//app.get('/api/auth/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
    //const token = jwt.sign({ id: req.user._id, username: req.user.username }, JWT_SECRET, { expiresIn: '7d' });
    //res.redirect(`/login.html?token=${token}&username=${req.user.username}`);
//});

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

// Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع ملف' });
    res.json({ name: req.file.originalname, url: `http://localhost:3000/uploads/${req.file.filename}`, size: req.file.size, type: req.file.mimetype });
});

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Socket.io
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

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

server.listen(PORT, () => console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`));