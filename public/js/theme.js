(() => {
    'use strict';

    const body = document.body;
    const root = document.documentElement;
    const darkButton = document.getElementById('darkBtn');
    const admin = body.dataset.area === 'admin';
    const page = location.pathname.split('/').pop() || 'index.html';
    let themeControl;

    function syncTheme(enabled) {
        root.dataset.theme = enabled ? 'dark' : 'light';
        body.classList.toggle('dark', enabled);
        if (themeControl) {
            themeControl.setAttribute('aria-pressed', String(enabled));
            themeControl.firstElementChild.textContent = enabled ? '☀️' : '🌙';
            themeControl.lastElementChild.textContent = enabled ? 'الوضع الفاتح' : 'الوضع الداكن';
        }
        if (darkButton) {
            darkButton.setAttribute('aria-label', enabled ? 'الوضع الفاتح' : 'الوضع الداكن');
            darkButton.setAttribute('aria-pressed', String(enabled));
            darkButton.textContent = enabled ? '☀️' : '🌙';
        }
        const color = document.querySelector('meta[name="theme-color"]');
        if (color) color.content = enabled ? '#111a2a' : '#f4f7fb';
        window.dispatchEvent(new Event('nivora:themechange'));
    }

    function setDark(enabled) {
        try { localStorage.setItem('dark', String(enabled)); } catch { /* The current view still updates. */ }
        syncTheme(enabled);
    }

    function toggleTheme() {
        setDark(root.dataset.theme !== 'dark');
    }

    window.NivoraTheme = { setDark };
    try { syncTheme(localStorage.getItem('dark') === 'true'); } catch { syncTheme(false); }
    if (darkButton) {
        darkButton.removeAttribute('onclick');
        darkButton.addEventListener('click', toggleTheme);
    }
    window.addEventListener('storage', event => {
        if (event.key === 'dark') syncTheme(event.newValue === 'true');
    });

    const main = document.querySelector('main, .main');
    if (main) {
        main.id ||= 'content';
        main.setAttribute('tabindex', '-1');
        if (main.tagName !== 'MAIN') main.setAttribute('role', 'main');
        if (!document.querySelector('.skip-link')) {
            const skip = document.createElement('a');
            skip.className = 'skip-link';
            skip.href = '#' + main.id;
            skip.textContent = 'انتقل إلى المحتوى';
            body.prepend(skip);
        }
    }

    if (body.dataset.ui !== 'app') return;

    const panelIcon = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>';
    const settings = ['settings.html', 'الإعدادات', '<circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M19 5l-3 3m-8 8-3 3"/><circle cx="12" cy="12" r="8"/>'];
    const userNavigation = [
        [['dashboard.html', 'لوحة القيادة', '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'],
            ['tasks.html', 'المهام', '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6"/>'],
            ['projects.html', 'المشاريع', panelIcon], ['kanban.html', 'Kanban', '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>'],
            ['gantt.html', 'Gantt', panelIcon], ['calendar.html', 'التقويم', '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>']],
        [['reports.html', 'التقارير', '<path d="M18 20V10M12 20V4M6 20v-6"/>'],
            ['workflows.html', 'Workflows', '<path d="M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z"/>'],
            ['templates.html', 'القوالب', panelIcon], ['archive.html', 'الأرشيف', '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>']],
        [['chat.html', 'المحادثة', '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'],
            ['team.html', 'الفريق', '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>'],
            ['teams.html', 'فرق العمل', panelIcon]]
    ];
    const adminNavigation = [
        [['dashboard.html', 'لوحة القيادة', '📊'], ['organizations.html', 'المؤسسات', '🏢'],
            ['subscriptions.html', 'الاشتراكات', '💳'], ['users.html', 'المستخدمون', '👥']],
        [['features.html', 'Feature Flags', '🚩'], ['usage.html', 'الاستخدام', '📊'], ['tickets.html', 'التذاكر', '🎫'],
            ['health.html', 'صحة النظام', '🖥'], ['notifications.html', 'الإشعارات', '🔔']]
    ];
    const groups = admin ? adminNavigation : userNavigation;
    const routeParents = { 'task.html': 'tasks.html', 'project.html': 'projects.html',
        'project-settings.html': 'projects.html', 'workspace-settings.html': 'settings.html', 'profile.html': 'settings.html' };
    const active = admin ? page : routeParents[page] || page;
    const personal = !admin && new URLSearchParams(location.search).get('scope') === 'personal';
    const media = matchMedia('(max-width: 768px)');

    function element(type, className, label) {
        const node = document.createElement(type);
        if (className) node.className = className;
        if (label) node.textContent = label;
        return node;
    }

    function iconFor(glyph) {
        const icon = element('span', 'shell-glyph');
        icon.setAttribute('aria-hidden', 'true');
        // SVG paths are the original, trusted navigation artwork defined above.
        if (glyph.startsWith('<')) {
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + glyph + '</svg>';
        } else icon.textContent = glyph;
        return icon;
    }

    function navigationItem([path, label, glyph], shortLabel = label) {
        const link = element('a', 'shell-link');
        const scoped = personal && ['settings.html', 'projects.html', 'tasks.html', 'kanban.html', 'gantt.html', 'calendar.html',
            'reports.html', 'archive.html', 'templates.html'].includes(path);
        link.href = scoped ? path + '?scope=personal' : path;
        if (path === active) link.setAttribute('aria-current', 'page');
        link.append(iconFor(glyph), element('span', '', shortLabel));
        return link;
    }

    function control(label, glyph, handler) {
        const button = element('button', 'shell-control');
        button.type = 'button';
        button.append(iconFor(glyph), element('span', '', label));
        button.addEventListener('click', handler);
        return button;
    }

    const rail = document.getElementById('sidebar') || element('aside', '');
    rail.id = 'sidebar';
    rail.className = 'shell-rail';
    rail.setAttribute('aria-label', admin ? 'قائمة الإدارة' : 'قائمة مساحة العمل');
    rail.tabIndex = -1;
    const brand = element('a', 'shell-brand');
    brand.href = 'dashboard.html';
    const logo = element('img');
    logo.src = (admin ? '../' : '') + 'img/logo.svg';
    logo.alt = '';
    brand.append(logo, element('span', '', admin ? 'Nivora Admin' : 'Nivora'));
    const navigation = element('nav', 'shell-navigation');
    navigation.setAttribute('aria-label', 'التنقل الرئيسي');
    if (!admin) navigation.append(navigationItem(settings), element('hr', 'shell-divider'));
    for (const [index, group] of groups.entries()) {
        if (index > 0) navigation.append(element('hr', 'shell-divider'));
        navigation.append(...group.map(item => navigationItem(item)));
    }
    const footer = element('div', 'shell-footer');
    themeControl = control('الوضع الداكن', '☾', toggleTheme);
    footer.append(themeControl, control('تسجيل الخروج', '↗', () => {
        const keys = admin ? ['adminToken'] : ['token', 'user', 'workspaceId', 'inviteCode'];
        for (const key of keys) localStorage.removeItem(key);
        location.assign('login.html');
    }));
    rail.replaceChildren(brand, navigation, footer);
    if (!rail.isConnected) body.prepend(rail);

    const mobile = element('nav', 'shell-mobile');
    mobile.setAttribute('aria-label', 'روابط سريعة');
    const shortcuts = admin ? [['dashboard.html', 'الرئيسية'], ['organizations.html', 'المؤسسات'], ['tickets.html', 'التذاكر']]
        : [['dashboard.html', 'الرئيسية'], ['tasks.html', 'مهام'], ['kanban.html', 'Kanban'], ['team.html', 'فريق']];
    const itemsByPath = new Map(groups.flat().map(item => [item[0], item]));
    mobile.append(...shortcuts.map(([path, label]) => navigationItem(itemsByPath.get(path), label)));
    const backdrop = element('div', 'shell-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener('click', () => setOpen(false, true));
    const menu = control('المزيد', '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>',
        () => setOpen(!body.classList.contains('shell-open'), true));
    menu.setAttribute('aria-controls', rail.id);
    mobile.append(menu);

    function setOpen(open, moveFocus = false) {
        const visible = media.matches && open;
        body.classList.toggle('shell-open', visible);
        menu.setAttribute('aria-expanded', String(visible));
        rail.inert = media.matches && !visible;
        for (const node of body.children) {
            if (node === rail || node === backdrop || node === mobile || node.tagName === 'SCRIPT') continue;
            node.inert = visible;
        }
        if (visible) rail.querySelector('[aria-current="page"], .shell-link')?.focus();
        else if (moveFocus && media.matches) menu.focus();
    }

    body.append(backdrop, mobile);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && body.classList.contains('shell-open')) setOpen(false, true);
    });
    media.addEventListener('change', () => setOpen(false));
    setOpen(false);
    syncTheme(body.classList.contains('dark'));

    for (const table of main?.querySelectorAll('table') || []) {
        if (table.closest('.table-wrapper, .table-container, .shell-table')) continue;
        const wrapper = element('div', 'shell-table');
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'جدول قابل للتمرير');
        table.before(wrapper);
        wrapper.append(table);
    }
})();
