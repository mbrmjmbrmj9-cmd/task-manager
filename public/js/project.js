(() => {
    'use strict';

    const { api, apiPage, page, download, uploadData, externalUrl, taskDateKey } = Nivora;
    const byId = id => document.getElementById(id);
    const query = new URLSearchParams(location.search);
    const projectId = query.get('id');
    const state = { project: null, next: null, folder: null, taskRequest: null, fileRequest: null, created: new Map() };
    const formatNumber = new Intl.NumberFormat('ar-SA');
    const projectStatuses = { active: 'مشروع نشط', completed: 'مشروع مكتمل', archived: 'مشروع مؤرشف' };
    const taskStatuses = { new: 'جديدة', ready: 'جاهزة', 'in-progress': 'قيد التنفيذ', review: 'تحت المراجعة',
        done: 'مكتملة', blocked: 'متعثرة', archived: 'مؤرشفة' };
    const pageSize = 25;

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function message(id, text = '', error = false) {
        const node = byId(id);
        node.textContent = text;
        node.hidden = !text;
        node.classList.toggle('error', error);
    }

    function showEmpty(target, text) {
        target.replaceChildren(element('li', text, 'empty-line'));
    }

    function renderProject(project) {
        byId('projectsCrumb').href = page('projects.html');
        byId('projectTitle').textContent = project.name;
        byId('projectCrumb').textContent = project.name;
        byId('projectState').textContent = projectStatuses[project.status] || 'مشروع';
        byId('projectDescription').textContent = project.description || '';
        byId('projectDescription').hidden = !project.description;
        byId('projectMark').style.setProperty('--project-color', /^#[\da-f]{6}$/i.test(project.color) ? project.color : '#1847a6');
        for (const [id, value] of Object.entries({
            metricTotal: project.taskCount, metricProgress: project.inProgressCount,
            metricDone: project.doneCount, metricOverdue: project.overdueCount
        })) byId(id).textContent = formatNumber.format(value || 0);

        byId('projectSettings').href = page('project-settings.html', { id: projectId });
        for (const [id, path] of [['boardLink', 'kanban.html'], ['ganttLink', 'gantt.html'], ['calendarLink', 'calendar.html']]) {
            byId(id).href = page(path, { projectId });
        }
        byId('ganttLink').hidden = project.settings?.enableGantt === false;
        byId('calendarLink').hidden = project.settings?.enableCalendar === false;
        byId('filesTab').hidden = project.settings?.enableFiles === false;
        byId('chatLink').href = page('chat.html', { projectId, workspaceId: project.workspaceId });
        byId('chatLink').hidden = !project.workspaceId || project.settings?.enableChat === false;
        byId('newTask').hidden = project.status === 'archived';
        document.title = 'Nivora | ' + project.name;
        byId('projectView').hidden = false;
    }

    function taskRow(task) {
        const row = element('li', '', 'workspace-row');
        row.dataset.task = task._id;
        const title = element('a', task.title || 'مهمة بلا عنوان');
        title.href = page('task.html', { id: task._id });
        const assignee = element('div', task.assignee || 'دون إسناد');
        if (task.dueDate) assignee.append(element('small', 'الاستحقاق ' + taskDateKey(task.dueDate)));
        const status = element('span', taskStatuses[task.status] || '—', 'state-pill');
        status.dataset.state = task.status;
        row.append(title, assignee, status);
        return row;
    }

    async function loadTasks(append = false) {
        state.taskRequest?.abort();
        const controller = new AbortController();
        state.taskRequest = controller;
        const list = byId('taskList');
        const more = byId('moreTasks');
        const status = byId('taskFilter').value;
        const after = append ? state.next : null;
        if (!append) showEmpty(list, 'جارٍ تحميل المهام…');
        more.disabled = true;
        try {
            const { items: tasks, next } = await apiPage('/tasks', { params: { projectId, status, view: 'list',
                limit: pageSize, after }, signal: controller.signal });
            if (controller.signal.aborted) return;
            state.next = next;
            const listed = new Set(append ? [...list.querySelectorAll('[data-task]')].map(row => row.dataset.task) : []);
            const items = new Map();
            if (!append) {
                for (const task of state.created.values()) if (!status || task.status === status) items.set(task._id, task);
            }
            for (const task of tasks) if (!listed.has(task._id)) items.set(task._id, task);
            const rows = [...items.values()].map(taskRow);
            if (rows.length) {
                if (!append) list.replaceChildren();
                list.append(...rows);
            } else if (!append) showEmpty(list, 'لا توجد مهام في هذا العرض.');
            more.hidden = !next;
        } catch (error) {
            if (error.name === 'AbortError') return;
            if (!append) showEmpty(list, 'تعذّر تحميل المهام. اختر الحالة مرة أخرى لإعادة المحاولة.');
            else message('pageStatus', error.message, true);
        } finally {
            if (state.taskRequest === controller) more.disabled = false;
        }
    }

    async function loadMembers() {
        const select = byId('taskForm').elements.assigneeId;
        select.replaceChildren(new Option('دون إسناد', ''));
        if (!state.project.workspaceId) return;
        const members = await api('/workspaces/' + state.project.workspaceId + '/members');
        for (const member of members) {
            if (!member.userId || member.userId.isActive === false) continue;
            select.add(new Option(member.userId.fullName || member.userId.username, member.userId._id));
        }
    }

    function folderRow(folder) {
        const row = element('li', '', 'workspace-row file-row');
        const button = element('button', folder.name, 'workspace-button quiet');
        button.type = 'button';
        button.addEventListener('click', () => loadFiles(folder));
        row.append(button, element('small', 'مجلد'));
        return row;
    }

    function fileRow(file) {
        const row = element('li', '', 'workspace-row file-row');
        const label = element('span', file.originalName || file.name || 'ملف', 'file-name');
        row.append(label);
        if (file.url?.startsWith('/api/files/')) {
            const button = element('button', 'تنزيل', 'workspace-button quiet');
            button.type = 'button';
            button.addEventListener('click', async () => {
                button.disabled = true;
                try { await download(file.url, label.textContent); }
                catch (error) { message('pageStatus', error.message, true); }
                finally { button.disabled = false; }
            });
            row.append(button);
        } else {
            const link = externalUrl(file.url);
            if (link) {
                const anchor = element('a', 'فتح الرابط', 'workspace-button quiet');
                anchor.href = link;
                anchor.rel = 'noopener noreferrer';
                anchor.target = '_blank';
                row.append(anchor);
            }
        }
        return row;
    }

    async function loadFiles(folder = state.folder) {
        state.fileRequest?.abort();
        const controller = new AbortController();
        state.fileRequest = controller;
        state.folder = folder;
        const list = byId('fileList');
        byId('folderPath').textContent = folder?.name || 'المجلد الرئيسي';
        byId('rootFolder').hidden = !folder;
        showEmpty(list, 'جارٍ تحميل الملفات…');
        try {
            const [folders, files] = await Promise.all([
                api('/folders/project/' + projectId, { params: { root: 'true', parentFolderId: folder?._id }, signal: controller.signal }),
                api('/files/project/' + projectId, { params: { root: 'true', folderId: folder?._id }, signal: controller.signal })
            ]);
            if (controller.signal.aborted) return;
            const rows = [...folders.map(folderRow), ...files.map(fileRow)];
            if (rows.length) list.replaceChildren(...rows);
            else showEmpty(list, 'هذا المجلد فارغ.');
        } catch (error) {
            if (error.name !== 'AbortError') showEmpty(list, error.message);
        }
    }

    function showTab() {
        if (!state.project) return;
        const showFiles = location.hash === '#files' && !byId('filesTab').hidden;
        byId('files').hidden = !showFiles;
        byId('tasks').hidden = showFiles;
        byId(showFiles ? 'filesTab' : 'overviewTab').setAttribute('aria-current', 'page');
        byId(showFiles ? 'overviewTab' : 'filesTab').removeAttribute('aria-current');
        if (showFiles) loadFiles();
        else loadTasks();
    }

    function bindForm(id, handler) {
        const form = byId(id);
        const button = form.querySelector('[type="submit"]');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (button.disabled) return;
            button.disabled = true;
            try {
                await handler(Object.fromEntries(new FormData(form)));
                form.reset();
                form.closest('dialog').close();
            } catch (error) {
                message(id + 'Error', error.message, true);
            } finally {
                button.disabled = false;
            }
        });
    }

    byId('newTask').addEventListener('click', () => {
        message('taskFormError');
        byId('taskDialog').showModal();
        loadMembers().catch(error => message('taskFormError', error.message, true));
    });
    byId('newFolder').addEventListener('click', () => {
        message('folderFormError');
        byId('folderDialog').showModal();
    });
    for (const button of document.querySelectorAll('[data-close]')) {
        button.addEventListener('click', () => byId(button.dataset.close).close());
    }
    byId('moreTasks').addEventListener('click', () => loadTasks(true));
    byId('taskFilter').addEventListener('change', () => loadTasks());
    byId('rootFolder').addEventListener('click', () => loadFiles(null));
    window.addEventListener('hashchange', showTab);

    bindForm('taskForm', async input => {
        const task = await api('/tasks', { method: 'POST', data: { ...input, projectId } });
        message('pageStatus', 'أُنشئت المهمة.');
        state.created.set(task._id, task);
        const status = byId('taskFilter').value;
        if (location.hash !== '#tasks') location.hash = 'tasks';
        else if (!status || status === task.status) {
            const list = byId('taskList');
            list.querySelector('.empty-line')?.remove();
            list.prepend(taskRow(task));
        }
        const project = state.project;
        project.taskCount = (project.taskCount || 0) + 1;
        if (task.status === 'in-progress') project.inProgressCount = (project.inProgressCount || 0) + 1;
        if (task.status === 'done') project.doneCount = (project.doneCount || 0) + 1;
        if (task.dueDate && taskDateKey(task.dueDate) < Nivora.dateKey(new Date()) && task.status !== 'done') {
            project.overdueCount = (project.overdueCount || 0) + 1;
        }
        renderProject(project);
    });

    bindForm('folderForm', async input => {
        await api('/folders', { method: 'POST', data: { name: input.name, projectId, parentFolderId: state.folder?._id } });
        message('pageStatus', 'أُنشئ المجلد.');
        await loadFiles();
    });

    const fileInput = byId('projectFile');
    fileInput.addEventListener('change', async () => {
        const [file] = fileInput.files;
        if (!file) return;
        fileInput.disabled = true;
        const folder = state.folder;
        message('pageStatus', 'جارٍ رفع الملف…');
        try {
            await api('/files/project/' + projectId + '/upload', { method: 'POST', params: { folderId: folder?._id }, data: uploadData(file) });
            message('pageStatus', 'رُفع الملف.');
            if (folder === state.folder) await loadFiles();
        } catch (error) {
            message('pageStatus', error.message, true);
        } finally {
            fileInput.value = '';
            fileInput.disabled = false;
        }
    });

    async function start() {
        if (localStorage.getItem('dark') === 'true') document.documentElement.dataset.theme = 'dark';
        if (!localStorage.getItem('token')) {
            location.replace(page('login.html', { returnTo: location.pathname + location.search + location.hash }));
            return;
        }
        try {
            if (!/^[a-f\d]{24}$/i.test(projectId || '')) throw new Error('رابط المشروع غير صالح.');
            state.project = await api('/projects/' + projectId);
            renderProject(state.project);
            byId('projectLoading').hidden = true;
            showTab();
        } catch (error) {
            const box = byId('projectLoading');
            const link = element('a', error.status === 401 ? 'تسجيل الدخول' : 'العودة إلى المشاريع');
            link.href = error.status === 401 ? page('login.html') : page('projects.html');
            box.replaceChildren(document.createTextNode(error.message + ' '), link);
        }
    }
    start();
})();
