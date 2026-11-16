(() => {
    'use strict';

    const deployedFrontend = 'task-manager-theta-beryl-91.vercel.app';
    const deployedBackend = 'https://nivora-t9ov.onrender.com';
    const native = window.Capacitor?.isNativePlatform?.() || location.protocol === 'capacitor:';
    const onVercel = location.hostname.endsWith('.vercel.app');
    const apiOrigin = native || location.hostname === deployedFrontend ? deployedBackend : location.origin;
    const apiBase = apiOrigin + '/api';
    const googleLoginUrl = (native || onVercel ? deployedBackend : apiOrigin) + '/api/auth/google';
    const personal = new URLSearchParams(location.search).get('scope') === 'personal';

    function workspaceId() {
        return personal ? null : localStorage.getItem('workspaceId');
    }

    function setWorkspace(workspace) {
        if (workspace?._id) localStorage.setItem('workspaceId', workspace._id);
        else localStorage.removeItem('workspaceId');
        if (workspace?.inviteCode) localStorage.setItem('inviteCode', workspace.inviteCode);
        else localStorage.removeItem('inviteCode');
    }

    function url(path, params, workspace = false) {
        const target = new URL(apiBase + path);
        if (workspace && workspaceId()) target.searchParams.set('workspaceId', workspaceId());
        for (const [key, value] of Object.entries(params || {})) {
            if (value != null && value !== '') target.searchParams.set(key, value);
        }
        return target.href;
    }

    function page(path, params = {}) {
        const target = new URL(path, location.href);
        if (personal) target.searchParams.set('scope', 'personal');
        for (const [key, value] of Object.entries(params)) {
            if (value != null && value !== '') target.searchParams.set(key, value);
        }
        return target.href;
    }

    function user() {
        try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; }
    }

    async function api(path, { method = 'GET', data, params, workspace, admin = false, auth = true, signal } = {}) {
        const key = admin ? 'adminToken' : 'token';
        const token = auth && localStorage.getItem(key);
        const headers = new Headers(token ? { Authorization: 'Bearer ' + token } : undefined);
        const multipart = data instanceof FormData;
        if (data !== undefined && !multipart) headers.set('Content-Type', 'application/json');
        const response = await fetch(url(path, params, workspace), {
            method, headers, signal, body: multipart || data === undefined ? data : JSON.stringify(data)
        });
        return read(response);
    }

    async function read(response) {
        if (response.status === 204) return null;
        const content = await response.json().catch(() => null);
        if (!response.ok) {
            const fallback = response.status === 404 ? 'مسار الخدمة غير متاح على هذا العنوان' : 'تعذر تنفيذ الطلب';
            const message = typeof content?.error === 'string' ? content.error : fallback;
            throw Object.assign(new Error(message), { status: response.status });
        }
        if (content === null) throw new Error('تعذر قراءة استجابة الخادم');
        return content;
    }

    function externalUrl(value) {
        try {
            const target = new URL(value);
            return ['https:', 'http:'].includes(target.protocol) && !target.username && !target.password ? target.href : '';
        } catch {
            return '';
        }
    }

    async function download(path, name) {
        if (!path.startsWith('/api/')) throw new Error('رابط التنزيل غير صالح');
        const response = await fetch(apiOrigin + path, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
        if (!response.ok) await read(response);
        const blob = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = blob;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blob), 30000);
    }

    function dateKey(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return '';
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    }

    function taskDateKey(value) {
        if (!value) return '';
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value)) return value.slice(0, 10);
        return dateKey(value);
    }

    function uploadData(file) {
        const data = new FormData();
        data.append('file', file);
        return data;
    }

    window.Nivora = { apiBase, apiOrigin, googleLoginUrl, api, url, page, personal, user, setWorkspace, workspaceId, read, externalUrl,
        download, uploadData, dateKey, taskDateKey };
})();
