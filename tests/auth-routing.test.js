const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = readFileSync(path.join(root, 'public', 'js', 'config.js'), 'utf8');
const settings = require('../vercel.json');
const publicSettings = require('../public/vercel.json');
const backend = 'https://nivora-t9ov.onrender.com';

function configFor(address, native = false) {
    const window = { Capacitor: { isNativePlatform: () => native } };
    vm.runInNewContext(source, { window, location: new URL(address), URL, URLSearchParams, Headers, FormData });
    return window.Nivora;
}

test('a Vercel preview uses the API rewrite for passwords and starts Google on the callback host', () => {
    const origin = 'https://nivora-preview.vercel.app';
    const config = configFor(origin + '/login');
    expect(config.url('/auth/login')).toBe(origin + '/api/auth/login');
    expect(config.googleLoginUrl).toBe(backend + '/api/auth/google');
    expect(settings.rewrites).toContainEqual({ source: '/api/:path*', destination: backend + '/api/:path*' });
    expect(settings.rewrites).toContainEqual({ source: '/login', destination: '/login.html' });
    expect(settings.redirects).toContainEqual({
        source: '/api/auth/google/callback', destination: backend + '/api/auth/google/callback', permanent: false
    });
});

test('production, local development and Capacitor resolve to their expected authentication host', () => {
    expect(configFor('https://task-manager-theta-beryl-91.vercel.app/login.html').apiOrigin).toBe(backend);
    expect(configFor('http://127.0.0.1:3000/login.html').googleLoginUrl).toBe('http://127.0.0.1:3000/api/auth/google');
    expect(configFor('https://localhost/login.html', true).googleLoginUrl).toBe(backend + '/api/auth/google');
});

test('Vercel serves the same authentication routes when its project root is public', () => {
    expect(publicSettings.outputDirectory).toBe('.');
    expect(publicSettings.redirects).toEqual(settings.redirects);
    expect(publicSettings.rewrites).toEqual(settings.rewrites);
});
