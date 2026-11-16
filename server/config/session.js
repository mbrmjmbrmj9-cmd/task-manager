const jwt = require('jsonwebtoken');
const { signingKey } = require('./env');
const User = require('../models/User');
const { isValidObjectId } = require('../middleware/validate');

const issuer = 'nivora';

function issueSession(user, audience = 'nivora-app') {
    return jwt.sign(
        { version: user.sessionVersion || 0 },
        signingKey(),
        { algorithm: 'HS256', issuer, audience, subject: String(user._id), expiresIn: audience === 'nivora-admin' ? '8h' : '1d' }
    );
}

async function readSession(token, audience = 'nivora-app') {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const key = signingKey();
    let claims;
    try {
        claims = jwt.verify(token, key, { algorithms: ['HS256'], issuer, audience });
    } catch {
        return null;
    }
    if (!isValidObjectId(claims.sub) || !Number.isSafeInteger(claims.version)) return null;

    const user = await User.findById(claims.sub).select('username role isActive sessionVersion').lean();
    if (!user || user.isActive === false || (user.sessionVersion || 0) !== claims.version) return null;
    if (audience === 'nivora-admin' && user.role !== 'super_admin') return null;

    return { id: String(user._id), username: user.username, role: user.role };
}

module.exports = { issueSession, readSession };
