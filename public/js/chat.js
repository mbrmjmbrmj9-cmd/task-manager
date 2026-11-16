(() => {
    'use strict';

    const { api, user, page, workspaceId, apiOrigin } = Nivora;
    const byId = id => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const scope = { workspaceId: params.get('workspaceId') || workspaceId(), projectId: params.get('projectId') || undefined };
    const form = byId('chatForm');
    const submit = byId('submitMessage');
    const messages = byId('messages');
    const profileId = user().id || user()._id;
    const time = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'short', timeStyle: 'short' });
    const byMessage = new Map();
    let olderCursor;
    let loading;
    let refreshAgain = false;
    let editingId = null;

    function showStatus(text = '', error = false) {
        const status = byId('chatStatus');
        status.textContent = text;
        status.hidden = !text;
        status.classList.toggle('error', error);
    }

    function node(tag, text, className) {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (className) el.className = className;
        return el;
    }

    function edit(message) {
        editingId = message._id;
        form.elements.text.value = message.text;
        form.elements.text.focus();
        submit.textContent = 'حفظ التعديل';
        byId('cancelEdit').hidden = false;
    }

    function resetComposer() {
        editingId = null;
        form.reset();
        submit.textContent = 'إرسال';
        byId('cancelEdit').hidden = true;
    }

    function render() {
        const entries = [...byMessage.values()].sort((a, b) => a._id.localeCompare(b._id));
        const previousScroll = messages.scrollTop;
        const nearEnd = messages.scrollHeight - messages.clientHeight - previousScroll < 80;
        if (!entries.length) {
            messages.replaceChildren(node('li', 'ابدأ المحادثة برسالة إلى الفريق.', 'chat-empty'));
            return;
        }
        const rows = entries.map(message => {
            const row = node('li', '', 'chat-message');
            const heading = node('div', '', 'chat-message-heading');
            const date = new Date(message.createdAt);
            const dateText = Number.isFinite(date.getTime()) ? time.format(date) : '';
            heading.append(node('strong', message.username || 'عضو'), node('span', dateText + (message.editedAt ? ' · عُدّلت' : '')));
            row.append(heading, node('p', message.text));
            if (message.userId === profileId) {
                const button = node('button', 'تعديل', 'workspace-button quiet');
                button.type = 'button';
                button.addEventListener('click', () => edit(message));
                row.append(button);
            }
            return row;
        });
        messages.replaceChildren(...rows);
        messages.scrollTop = nearEnd ? messages.scrollHeight : previousScroll;
    }

    async function refresh(older = false, quiet = false) {
        if (!scope.workspaceId) return;
        if (loading) {
            if (!older) refreshAgain = true;
            return loading;
        }
        const button = byId(older ? 'olderMessages' : 'refreshChat');
        button.disabled = true;
        loading = (async () => {
            try {
                const result = await api('/chat', { params: { ...scope, before: older ? olderCursor : undefined } });
                if (older || byMessage.size <= 50) {
                    if (!older) byMessage.clear();
                    olderCursor = result.next;
                } else {
                    const latestFirst = result.data.at(-1)?._id;
                    for (const id of byMessage.keys()) if (!latestFirst || id >= latestFirst) byMessage.delete(id);
                }
                for (const message of result.data) byMessage.set(message._id, message);
                byId('olderMessages').hidden = !olderCursor;
                form.hidden = false;
                if (!quiet) showStatus();
                render();
            } catch (error) {
                if ([401, 403, 404].includes(error.status)) {
                    byMessage.clear();
                    messages.replaceChildren();
                    form.hidden = true;
                    byId('olderMessages').hidden = true;
                }
                showStatus(error.message, true);
            } finally {
                button.disabled = false;
                loading = null;
                if (refreshAgain) {
                    refreshAgain = false;
                    refresh(false, true);
                }
            }
        })();
        return loading;
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const text = form.elements.text.value.trim();
        if (!text || submit.disabled) return;
        submit.disabled = true;
        const id = editingId;
        try {
            await api(id ? '/chat/' + id : '/chat', { method: id ? 'PATCH' : 'POST', data: { ...scope, text } });
            resetComposer();
            await refresh();
        } catch (error) {
            showStatus(error.message, true);
        } finally {
            submit.disabled = false;
        }
    });

    byId('cancelEdit').addEventListener('click', resetComposer);
    byId('refreshChat').addEventListener('click', () => refresh());
    byId('olderMessages').addEventListener('click', () => refresh(true));

    async function start() {
        if (localStorage.getItem('dark') === 'true') document.documentElement.dataset.theme = 'dark';
        const token = localStorage.getItem('token');
        if (!token) {
            location.replace(page('login.html', { returnTo: location.pathname + location.search }));
            return;
        }
        if (!scope.workspaceId) {
            showStatus('اختر مساحة عمل من صفحة فرق العمل لفتح محادثتها.', true);
            return;
        }
        try {
            if (scope.projectId) {
                const project = await api('/projects/' + scope.projectId);
                byId('roomName').textContent = project.name;
                byId('backToProject').href = page('project.html', { id: project._id });
                byId('backToProject').textContent = project.name;
            } else {
                const workspaces = await api('/workspaces');
                byId('roomName').textContent = workspaces.find(workspace => workspace._id === scope.workspaceId)?.name || '';
            }
            await refresh();
        } catch (error) {
            showStatus(error.message, true);
        }
        const client = document.createElement('script');
        client.src = apiOrigin + '/socket.io/socket.io.js';
        client.addEventListener('load', () => {
            if (!window.io) return;
            const socket = window.io(apiOrigin, { auth: { token } });
            socket.on('connect', () => socket.timeout(5000).emit('chat-subscribe', scope, () => {}));
            socket.on('chat-updated', () => refresh(false, true));
        });
        document.head.append(client);
        setInterval(() => { if (!document.hidden) refresh(false, true); }, 30000);
    }

    start();
})();
