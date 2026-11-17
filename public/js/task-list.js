(() => {
    'use strict';

    if (!localStorage.getItem('token')) return;

    const byId = id => document.getElementById(id);
    const tbody = byId('taskBody');
    const status = byId('taskListStatus');
    const more = byId('moreTasks');
    const account = Nivora.user();
    const mine = new URLSearchParams(location.search).get('mine') === '1';
    const assigneeId = mine ? account.id || account._id : null;
    let tasks = [];
    let next;
    let request;
    let choices;
    let taskFilters = filters();

    function filters() {
        return { search: byId('searchInput').value.trim(), status: byId('statusFilter').value,
            priority: byId('priorityFilter').value, assigneeId };
    }

    function renderTasks() {
        const today = Nivora.dateKey(new Date());
        if (!tasks.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">لا توجد مهام في هذا العرض.</td></tr>';
            return;
        }
        tbody.innerHTML = tasks.map(task => {
            const due = Nivora.taskDateKey(task.dueDate);
            const overdue = due && due < today && task.status !== 'done';
            return `<tr>
                <td><a href="${Nivora.page('task.html', { id: task._id })}">${escapeHtml(task.title)}</a>${overdue ? '<span class="overdue-badge">متأخرة</span>' : ''}</td>
                <td>${statusBadge(task.status)}</td>
                <td>${priorityBadge(task.priority)}</td>
                <td>${escapeHtml(task.project || '-')}</td>
                <td>${escapeHtml(task.assignee || '-')}</td>
                <td>${task.dueDate ? formatDate(task.dueDate) : '-'}</td>
                <td><button type="button" class="btn-delete" data-archive="${escapeHtml(task._id)}" aria-label="أرشفة المهمة">🗑️</button></td>
            </tr>`;
        }).join('');
    }

    async function loadTasks(append = false) {
        request?.controller.abort();
        const current = { controller: new AbortController(), changes: [] };
        request = current;
        const selected = filters();
        if (mine && !assigneeId) { status.textContent = 'تعذر تحديد حسابك. سجّل الدخول مجددًا.'; return; }
        if (!append) {
            next = null;
            if (!tasks.length) showSkeleton('taskBody', 'table', 5);
        }
        more.disabled = true;
        status.textContent = 'جارٍ تحميل المهام…';
        try {
            const { items, next: cursor } = await Nivora.apiPage('/tasks', { workspace: true, signal: current.controller.signal,
                params: { ...selected, view: 'list', limit: 30, after: append ? next : null } });
            if (current.controller.signal.aborted) return;
            const rows = new Map((append ? [...tasks, ...items] : items).map(task => [task._id, task]));
            tasks = [...rows.values()];
            for (const update of current.changes) tasks = update(tasks, selected);
            taskFilters = selected;
            next = cursor;
            renderTasks();
            more.hidden = !next;
            status.textContent = '';
        } catch (error) {
            if (current.controller.signal.aborted) return;
            if (!tasks.length) tbody.replaceChildren();
            status.textContent = (error.status ? error.message : 'تعذر الاتصال لتحميل المهام.') + ' ';
            const retry = document.createElement('button');
            retry.className = 'btn btn-outline';
            retry.type = 'button';
            retry.textContent = 'إعادة المحاولة';
            retry.addEventListener('click', () => loadTasks(append));
            status.append(retry);
        } finally {
            if (request === current) {
                request = null;
                more.disabled = false;
                more.hidden = !next;
            }
        }
    }

    function updateRows(update) {
        request?.changes.push(update);
        tasks = update(tasks, taskFilters);
        renderTasks();
    }

    function includesTask(task, selected) {
        return (!selected.status || task.status === selected.status)
            && (!selected.priority || task.priority === selected.priority)
            && (!selected.assigneeId || task.assigneeId === selected.assigneeId)
            && (!selected.search || task.title.toLowerCase().includes(selected.search.toLowerCase()));
    }

    async function loadChoices() {
        if (choices) return choices;
        const projectSelect = byId('taskProject');
        const memberSelect = byId('taskAssignee');
        const workspace = Nivora.workspaceId();
        const projects = Nivora.api('/projects', { workspace: true, params: { view: 'options' } }).then(items => {
            projectSelect.replaceChildren(new Option('بدون مشروع', ''));
            for (const project of items) if (project.status !== 'archived') projectSelect.add(new Option(project.name, project._id));
        });
        const members = workspace ? Nivora.api('/workspaces/' + workspace + '/members').then(items => {
            memberSelect.replaceChildren(new Option('دون إسناد', ''));
            for (const { userId: member } of items) {
                if (member && member.isActive !== false) memberSelect.add(new Option(member.fullName || member.username, member._id));
            }
        }) : Promise.resolve();
        choices = Promise.all([projects, members]).catch(() => {
            choices = null;
            showToast('تعذر تحميل بعض خيارات المهمة.', 'error');
        });
        return choices;
    }

    window.openCreateModal = () => {
        byId('createModal').classList.add('show');
        byId('taskTitle').focus();
        void loadChoices();
    };
    window.closeCreateModal = () => {
        byId('createModal').classList.remove('show');
        byId('taskTitle').value = '';
        byId('taskDesc').value = '';
    };
    window.createTask = async () => {
        const title = byId('taskTitle').value.trim();
        const button = byId('createBtn');
        if (button.disabled) return;
        if (!title) { showToast('العنوان مطلوب', 'warning'); return; }
        setButtonLoading(button, true, 'جارٍ الإنشاء…');
        try {
            const task = await Nivora.api('/tasks', { method: 'POST', data: { title, description: byId('taskDesc').value.trim(),
                priority: byId('taskPriority').value, status: byId('taskStatus').value, assigneeId: byId('taskAssignee').value || null,
                workspaceId: Nivora.workspaceId(), dueDate: byId('taskDueDate').value || null, projectId: byId('taskProject').value || null } });
            window.closeCreateModal();
            updateRows((rows, selected) => includesTask(task, selected) ? [task, ...rows.filter(row => row._id !== task._id)] : rows);
            showToast('تم إنشاء المهمة', 'success');
        } catch (error) { showToast(error.message, 'error'); }
        finally { setButtonLoading(button, false); }
    };

    tbody.addEventListener('click', event => {
        const id = event.target.closest('[data-archive]')?.dataset.archive;
        if (!id) return;
        confirmDialog({ title: 'أرشفة المهمة', message: 'يمكن استعادة المهمة من الأرشيف.', confirmText: 'أرشفة',
            onConfirm: async () => {
                await Nivora.api('/tasks/' + id + '/archive', { method: 'PATCH' });
                updateRows(rows => rows.filter(task => task._id !== id));
                showToast('تمت أرشفة المهمة');
            } });
    });
    const refresh = debounce(() => loadTasks(), 230);
    byId('searchInput').addEventListener('input', refresh);
    byId('statusFilter').addEventListener('change', () => loadTasks());
    byId('priorityFilter').addEventListener('change', () => loadTasks());
    more.addEventListener('click', () => { if (next) void loadTasks(true); });
    void loadTasks();
})();
