(() => {
    'use strict';

    if (!localStorage.getItem('token')) return;

    const projects = document.getElementById('projectFilter');
    const statistics = document.getElementById('kpiGrid');
    const upcoming = document.getElementById('upcomingTasks');
    const activity = document.getElementById('recentActivity');
    let request;

    function renderStatistics({ total, done, inProgress, overdue, rate }) {
        const cards = [
            ['📋', 'blue', 'إجمالي المهام', total],
            ['✅', 'green', 'المكتملة', done],
            ['🔄', 'orange', 'قيد التنفيذ', inProgress],
            ['⏰', 'red', 'المتأخرة', overdue],
            ['📈', 'purple', 'نسبة الإنجاز', rate + '%']
        ];
        statistics.innerHTML = cards.map(([icon, color, label, value]) => `
            <div class="card kpi-card">
                <div class="kpi-icon ${color}" aria-hidden="true">${icon}</div>
                <div class="kpi-info"><div class="kpi-label">${label}</div><div class="kpi-value">${escapeHtml(value)}</div></div>
            </div>`).join('');
    }

    const colors = { new: '#3B82F6', 'in-progress': '#D97706', review: '#8B5CF6', blocked: '#EF4444' };
    const reasons = ['متأخرة', 'تستحق اليوم', 'متعثرة', 'خلال ٣ أيام', 'أولوية مرتفعة'];

    function renderUpcoming(tasks) {
        upcoming.innerHTML = tasks.length ? tasks.map(task => `
            <a class="task-item-mini" href="${Nivora.page('task.html', { id: task._id })}">
                <span class="dot" style="background:${Object.hasOwn(colors, task.status) ? colors[task.status] : '#94A3B8'};"></span>
                <span class="title">${escapeHtml(task.title)}</span>
                <span class="meta">${reasons[task.rank] || (task.dueDate ? formatDate(task.dueDate) : 'بلا موعد')}</span>
            </a>`).join('') : '<p class="empty-state">لا توجد مهام مفتوحة مسندة إليك في هذا العرض.</p>';
    }

    function renderActivity(entries) {
        activity.innerHTML = entries.length ? entries.map(entry => `
            <div class="activity-item">
                <span class="act-user">${escapeHtml(entry.username || 'مستخدم')}</span>
                <span>${escapeHtml(entry.action)}</span>
                <a href="${Nivora.page('task.html', { id: entry.taskId })}">${escapeHtml(entry.taskTitle || '')}</a>
                <span class="act-time">${timeAgo(entry.createdAt)}</span>
            </div>`).join('') : '<p class="empty-state">لا يوجد نشاط حديث.</p>';
    }

    async function loadDashboard() {
        request?.abort();
        const controller = new AbortController();
        request = controller;
        statistics.setAttribute('aria-busy', 'true');
        if (!statistics.childElementCount) showSkeleton('kpiGrid', 'card', 5);
        try {
            const result = await Nivora.api('/tasks/overview', { workspace: true, signal: controller.signal,
                params: { projectId: projects.value, today: Nivora.dateKey(new Date()) } });
            if (controller.signal.aborted) return;
            renderStatistics(result.stats);
            renderUpcoming(result.upcoming);
            renderActivity(result.activity);
        } catch (error) {
            if (controller.signal.aborted) return;
            statistics.textContent = 'تعذر تحميل لوحة القيادة. ';
            upcoming.replaceChildren();
            activity.replaceChildren();
            const retry = document.createElement('button');
            retry.className = 'btn btn-outline';
            retry.type = 'button';
            retry.textContent = 'إعادة المحاولة';
            retry.addEventListener('click', loadDashboard);
            statistics.append(retry);
        } finally {
            if (request === controller) statistics.removeAttribute('aria-busy');
        }
    }

    projects.addEventListener('change', loadDashboard);
    void loadDashboard();
    void Nivora.api('/projects', { params: { view: 'options' }, workspace: true }).then(items => {
        for (const project of items) projects.add(new Option(project.name, project._id));
    }).catch(() => showToast('تعذر تحميل خيارات المشاريع', 'error'));
})();
