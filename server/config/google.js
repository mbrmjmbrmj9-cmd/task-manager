const crypto = require('node:crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuthExchange = require('../models/OAuthExchange');
const User = require('../models/User');
const { appOrigin, apiOrigin } = require('./env');
const { issueSession } = require('./session');

const stateCookie = 'nivora_google_state';
const callbackPath = '/api/auth/google/callback';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function attachGoogle(app) {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL || new URL(callbackPath, apiOrigin()).href;
    const enabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
    if (!enabled) {
        app.get('/api/auth/google', (_req, res) => res.status(503).json({ error: 'تسجيل الدخول عبر Google غير مهيأ' }));
        return;
    }
    const cookie = { path: callbackPath, httpOnly: true, sameSite: 'lax', secure: new URL(callbackURL).protocol === 'https:' };
    passport.use(new GoogleStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL
    }, async (_access, _refresh, profile, done) => {
        try {
            const email = profile.emails?.[0];
            if (!email?.verified || !email.value) return done(null, false);
            const username = 'google_' + profile.id;
            const user = await User.findOneAndUpdate({ username }, {
                $setOnInsert: { username, email: email.value, fullName: profile.displayName || '', password: 'google-oauth' }
            }, { upsert: true, new: true });
            return done(null, user.isActive === false ? false : user);
        } catch (error) {
            done(error);
        }
    }));

    app.use(passport.initialize());
    app.get('/api/auth/google', (req, res, next) => {
        const state = crypto.randomBytes(32).toString('hex');
        res.cookie(stateCookie, state, { ...cookie, maxAge: 600000 });
        passport.authenticate('google', { scope: ['profile', 'email'], session: false, state })(req, res, next);
    });
    app.get(callbackPath, (req, res, next) => {
        const state = (req.get('cookie') || '').split(';').map(value => value.trim())
            .find(value => value.startsWith(stateCookie + '='))?.slice(stateCookie.length + 1);
        res.clearCookie(stateCookie, cookie);
        if (!state || typeof req.query.state !== 'string' || state !== req.query.state) {
            return res.status(400).json({ error: 'طلب تسجيل الدخول غير صالح' });
        }
        passport.authenticate('google', { session: false })(req, res, next);
    }, async (req, res) => {
        const code = crypto.randomBytes(32).toString('hex');
        await OAuthExchange.create({ _id: digest(code), userId: req.user._id, sessionVersion: req.user.sessionVersion || 0, expiresAt: new Date(Date.now() + 60000) });
        const url = new URL('/login.html', appOrigin());
        url.hash = new URLSearchParams({ google: code }).toString();
        res.set('Referrer-Policy', 'no-referrer').redirect(url.href);
    });
    app.post('/api/auth/google/exchange', async (req, res) => {
        const { code } = req.body || {};
        if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code)) return res.status(400).json({ error: 'رمز الدخول غير صالح' });
        const grant = await OAuthExchange.findOneAndDelete({ _id: digest(code), expiresAt: { $gt: new Date() } });
        if (!grant) return res.status(401).json({ error: 'انتهت صلاحية رمز الدخول' });
        const user = await User.findById(grant.userId);
        if (!user || user.isActive === false || (user.sessionVersion || 0) !== grant.sessionVersion) {
            return res.status(401).json({ error: 'الحساب غير متاح' });
        }
        res.set('Cache-Control', 'no-store').json({ token: issueSession(user),
            user: { id: user._id, username: user.username, fullName: user.fullName, email: user.email, avatar: user.avatar } });
    });
}

module.exports = attachGoogle;
