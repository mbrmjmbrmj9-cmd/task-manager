(() => {
    'use strict';

    const trigger = document.getElementById('notifBtn');
    const panel = document.getElementById('notifDropdown');
    if (!trigger || !panel || !localStorage.getItem('token')) return;

    const list = document.getElementById('notifList');
    const badge = document.getElementById('notifBadge');
    const markAll = panel.querySelector('[data-mark-all]');
    const account = Nivora.user();
    const key = 'nivora:notification-count:' + (account.id || account._id || '');
    const cacheMs = 30_000;
    let count = 0;
    let items = [];
    let listed = false;
    let listRequest;
    let countRequest;
    let countVersion = 0;
    let readVersion = 0;
    let readingAll = false;

    function setCount(value, persist = true) {
        count = Math.max(0, Number(value) || 0);
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.style.display = count ? 'flex' : 'none';
        trigger.setAttribute('aria-label', count ? 'الإشعارات، غير المقروءة ' + count : 'الإشعارات');
        markAll.disabled = readingAll || count === 0;
        if (persist) {
            countVersion++;
            try { sessionStorage.setItem(key, JSON.stringify({ count, checkedAt: Date.now() })); } catch {}
        }
    }

    function cachedCount() {
        try { return JSON.parse(sessionStorage.getItem(key)) || {}; } catch { return {}; }
    }

    function refreshCount() {
        if (countRequest) return countRequest;
        if (Date.now() - cachedCount().checkedAt < cacheMs) return;
        const version = countVersion;
        countRequest = Nivora.api('/notifications/unread-count')
            .then(data => { if (version === countVersion) setCount(data.count); })
            .catch(() => {}).finally(() => { countRequest = null; });
        return countRequest;
    }

    function safeLink(value) {
        if (typeof value !== 'string' || !value.startsWith('/')) return null;
        const target = new URL(value, location.origin);
        return target.origin === location.origin && /^\/(?:task|project|chat|team)\.html$/.test(target.pathname) ? target.href : null;
    }

    function render() {
        if (!items.length) {
            list.textContent = 'لا توجد إشعارات.';
            return;
        }
        const rows = items.map(item => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'notification-preview-item';
            row.dataset.unread = String(!item.isRead);
            const title = document.createElement('strong');
            title.textContent = item.message;
            const time = document.createElement('small');
            time.textContent = timeAgo(item.createdAt);
            row.append(title, time);
            row.addEventListener('click', async () => {
                row.disabled = true;
                try {
                    if (!item.isRead) {
                        await Nivora.api('/notifications/' + item._id + '/read', { method: 'PATCH' });
                        readVersion++;
                        item.isRead = true;
                        row.dataset.unread = 'false';
                        setCount(count - 1);
                    }
                    const url = safeLink(item.link);
                    if (url) location.assign(url);
                } catch (error) { showToast(error.message, 'error'); }
                finally { row.disabled = false; }
            });
            return row;
        });
        list.replaceChildren(...rows);
    }

    function loadLatest() {
        if (listRequest) return;
        if (!listed) list.textContent = 'جارٍ تحميل الإشعارات…';
        const version = readVersion;
        listRequest = Nivora.api('/notifications', { params: { view: 'preview' } }).then(result => {
            if (version !== readVersion) return;
            items = result;
            listed = true;
            render();
        }).catch(() => {
            if (!listed) list.textContent = 'تعذر تحميل الإشعارات. أغلق القائمة وافتحها للمحاولة مجددًا.';
        }).finally(() => {
            listRequest = null;
            if (version !== readVersion && panel.style.display === 'block') loadLatest();
        });
    }

    function toggle(open) {
        panel.style.display = open ? 'block' : 'none';
        trigger.setAttribute('aria-expanded', String(open));
        if (open) {
            loadLatest();
            refreshCount();
        }
    }

    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-expanded', 'false');
    list.setAttribute('aria-live', 'polite');
    trigger.addEventListener('click', () => toggle(panel.style.display !== 'block'));
    markAll.addEventListener('click', async () => {
        readingAll = true;
        markAll.disabled = true;
        try {
            await Nivora.api('/notifications/read-all', { method: 'PATCH' });
            readVersion++;
            setCount(0);
            for (const item of items) item.isRead = true;
            if (listed) render();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            readingAll = false;
            markAll.disabled = count === 0;
        }
    });
    document.addEventListener('click', event => {
        if (panel.style.display === 'block' && !panel.contains(event.target) && !trigger.contains(event.target)) toggle(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && panel.style.display === 'block') {
            toggle(false);
            trigger.focus();
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshCount();
    });
    setCount(cachedCount().count, false);
    refreshCount();
})();
