const path = require('node:path');
const dotenv = require('dotenv');

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const root = path.join(__dirname, '..', '..');
    dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });
}

function signingKey() {
    const key = process.env.JWT_SECRET;
    if (!key || Buffer.byteLength(key) < 32) {
        throw new Error('JWT_SECRET must contain at least 32 bytes.');
    }
    return key;
}

function databaseUri() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI must be configured.');
    return uri;
}

function appOrigin() {
    const defaultOrigin = process.env.RENDER_EXTERNAL_URL === 'https://nivora-t9ov.onrender.com'
        ? 'https://task-manager-theta-beryl-91.vercel.app'
        : 'http://localhost:' + (process.env.PORT || 3000);
    const origin = new URL(process.env.APP_ORIGIN || defaultOrigin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
        throw new Error('APP_ORIGIN must be an HTTP(S) origin.');
    }
    return origin.origin;
}

function apiOrigin() {
    return new URL(process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + (process.env.PORT || 3000)).origin;
}

module.exports = { signingKey, databaseUri, appOrigin, apiOrigin };
