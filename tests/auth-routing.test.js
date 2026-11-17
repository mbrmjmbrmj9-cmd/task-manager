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
    const production = configFor('https://task-manager-theta-beryl-91.vercel.app/login.html');
    expect(production.apiOrigin).toBe('https://task-manager-theta-beryl-91.vercel.app');
    expect(production.realtimeOrigin).toBe(backend);
    expect(configFor('http://127.0.0.1:3000/login.html').googleLoginUrl).toBe('http://127.0.0.1:3000/api/auth/google');
    expect(configFor('https://localhost/login.html', true).googleLoginUrl).toBe(backend + '/api/auth/google');
});

test('Vercel serves the same authentication routes when its project root is public', () => {
    expect(publicSettings.outputDirectory).toBe('.');
    expect(publicSettings.redirects).toEqual(settings.redirects);
    expect(publicSettings.rewrites).toEqual(settings.rewrites);
});

function sessionBrowser() {
    const stored = new Map([['token', 'old-session']]);
    const temporary = new Map();
    const storage = map => ({
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => map.set(key, value),
        removeItem: key => map.delete(key)
    });
    const location = new URL('https://task-manager-theta-beryl-91.vercel.app/tasks.html?scope=personal');
    location.replace = jest.fn();
    const window = { fetch: jest.fn().mockResolvedValue(new Response('{}', { status: 401 })) };
    vm.runInNewContext(source, { window, location, URL, URLSearchParams, Headers, FormData,
        localStorage: storage(stored), sessionStorage: storage(temporary) });
    return { window, stored, temporary, location };
}

test('a rejected protected request takes an expired session back to login and preserves the page', async () => {
    const browser = sessionBrowser();
    const response = await browser.window.fetch(browser.location.origin + '/api/tasks', {
        headers: { Authorization: 'Bearer old-session' }
    });
    expect(response.status).toBe(401);
    expect(browser.stored.has('token')).toBe(false);
    expect(browser.temporary.get('nivora-return')).toBe('/tasks.html?scope=personal');
    expect(browser.location.replace).toHaveBeenCalledWith('/login.html');
});

test('an anonymous or outdated request cannot clear a newer session', async () => {
    const browser = sessionBrowser();
    browser.stored.set('token', 'new-session');
    await browser.window.fetch(browser.location.origin + '/api/auth/login');
    await browser.window.fetch(browser.location.origin + '/api/tasks', {
        headers: { Authorization: 'Bearer old-session' }
    });
    expect(browser.stored.get('token')).toBe('new-session');
    expect(browser.location.replace).not.toHaveBeenCalled();
});
