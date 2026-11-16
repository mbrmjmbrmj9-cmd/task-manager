const { signingKey, appOrigin } = require('./config/env');
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const http = require('node:http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const attachGoogle = require('./config/google');
const configureRealtime = require('./config/realtime');
const { mailAvailable, sendMail } = require('./config/mail');
const { avatarDir, durable, streamStoredUpload } = require('./config/storage');
const { requestLogger, errorHandler } = require('./middleware/logger');
const { accessError } = require('./middleware/auth');

const publicDir = path.join(__dirname, '..', 'public');
const port = Number(process.env.PORT || 3000);

function allowedOrigins() {
    const origins = new Set([appOrigin(), ...(process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean)]);
    if (process.env.NODE_ENV !== 'production') {
        for (const host of ['localhost', '127.0.0.1']) {
            for (const localPort of [port, 5500]) origins.add('http://' + host + ':' + localPort);
        }
    }
    return origin => !origin || origins.has(origin);
}

function limiter(windowMs, limit) {
    return rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false,
        message: { error: 'طلبات كثيرة. حاول مرة أخرى لاحقًا.' } });
}

function createApp(isAllowed = allowedOrigins()) {
    const app = express();
    const proxyHops = Number(process.env.TRUST_PROXY_HOPS || (process.env.RENDER_EXTERNAL_URL ? 1 : 0));
    if (!Number.isInteger(proxyHops) || proxyHops < 0) throw new Error('TRUST_PROXY_HOPS must be a nonnegative integer.');
    app.set('trust proxy', proxyHops);
    app.disable('x-powered-by');

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
                upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
            }
        },
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    }));
    app.use(cors({ origin: (origin, done) => done(null, isAllowed(origin)), exposedHeaders: ['X-Has-More'] }));
    app.use(express.json({ limit: '1mb' }));
    app.use('/api', requestLogger, limiter(15 * 60 * 1000, 800), (_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });

    app.get('/api/health', (_req, res) => {
        const database = mongoose.connection.readyState === 1;
        res.status(database ? 200 : 503).json({ server: 'ok', database: database ? 'ready' : 'unavailable' });
    });

    app.use('/api/auth/register', limiter(60 * 60 * 1000, 10));
    app.use('/api/auth/forgot-password', limiter(15 * 60 * 1000, 5));
    app.use('/api/auth/reset-password', limiter(15 * 60 * 1000, 15));
    app.use('/api/auth/google/exchange', limiter(60 * 1000, 20));
    app.use('/api/admin/login', limiter(15 * 60 * 1000, 10));
    app.use('/api/upload', limiter(60 * 60 * 1000, 50));
    app.post('/api/tasks/:id/attachments/upload', limiter(60 * 60 * 1000, 100));
    app.post('/api/files/project/:id/upload', limiter(60 * 60 * 1000, 100));

    attachGoogle(app);
    for (const route of ['auth', 'tasks', 'projects', 'workflows', 'workspaces', 'plans', 'templates', 'admin',
        'subscriptions', 'folders', 'files', 'upload', 'notifications', 'backup']) {
        app.use('/api/' + route, require('./routes/' + route));
    }
    app.use('/api/chat', require('./routes/chat').router);

    app.post('/api/contact', limiter(15 * 60 * 1000, 5), async (req, res) => {
        if (!mailAvailable() || !process.env.CONTACT_EMAIL) {
            throw accessError(503, 'خدمة التواصل غير متاحة حاليًا');
        }
        const { name, phone, email, message } = req.body || {};
        if ([name, phone, email, message].some(value => typeof value !== 'string' || !value.trim())
            || name.length > 120 || phone.length > 40 || email.length > 254 || message.length > 5000
            || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw accessError(400, 'تحقق من بيانات التواصل');
        }
        await sendMail({ to: process.env.CONTACT_EMAIL, replyTo: email, subject: 'رسالة جديدة من نموذج نيفورا',
            text: [name, phone, email, '', message].join('\n') });
        res.json({ message: 'تم الإرسال بنجاح' });
    });

    app.use('/api', (_req, res) => res.status(404).json({ error: 'المسار غير موجود' }));
    if (durable) {
        app.get('/uploads/avatars/:name', (req, res, next) => {
            const extension = req.params.name.match(/^[a-f\d-]{36}\.(png|jpg|gif|webp)$/)?.[1];
            if (!extension) return res.sendStatus(404);
            res.set('Cache-Control', 'public, max-age=604800, immutable');
            return streamStoredUpload(req.params.name, res, next, { type: 'image/' + (extension === 'jpg' ? 'jpeg' : extension) });
        });
    } else {
        app.use('/uploads/avatars', express.static(avatarDir, { immutable: true, maxAge: '7d', index: false }));
    }
    app.use(express.static(publicDir));
    app.use((_req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));
    app.use(errorHandler);
    return app;
}

function createServer() {
    const isAllowed = allowedOrigins();
    const app = createApp(isAllowed);
    const server = http.createServer(app);
    app.set('realtime', configureRealtime(server, isAllowed));
    return server;
}

async function start() {
    signingKey();
    await connectDB();
    const server = createServer();
    const host = process.env.BIND_HOST || (process.env.NODE_ENV === 'production' || process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
    server.listen(port, host, () => console.log('Nivora listening on ' + host + ':' + port));
}

if (require.main === module) {
    start().catch(error => {
        console.error('Nivora could not start:', error.name === 'Error' ? error.message : error.name);
        process.exitCode = 1;
    });
}

module.exports = { createApp, createServer };
