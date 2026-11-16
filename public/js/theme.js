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
            themeControl.lastElementChild.textContent = enabled ? 'الوضع الفاتح' : 'الوضع الداكن';
        }
        if (darkButton) {
            darkButton.setAttribute('aria-label', enabled ? 'الوضع الفاتح' : 'الوضع الداكن');
            darkButton.setAttribute('aria-pressed', String(enabled));
            darkButton.textContent = enabled ? '☀' : '☾';
        }
        const color = document.querySelector('meta[name="theme-color"]');
        if (color) color.content = enabled ? '#111a2a' : '#f4f7fb';
    }

    function toggleTheme() {
        const enabled = root.dataset.theme !== 'dark';
        try { localStorage.setItem('dark', String(enabled)); } catch { /* The current view still updates. */ }
        syncTheme(enabled);
    }

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

    const userNavigation = [
        [['dashboard.html', 'لوحة القيادة', '▦'], ['projects.html', 'المشاريع', '▤'], ['tasks.html', 'المهام', '✓'],
            ['kanban.html', 'لوحة العمل', '▥'], ['gantt.html', 'المخطط الزمني', '≡'], ['calendar.html', 'التقويم', '▦']],
        [['chat.html', 'المحادثة', '◌'], ['team.html', 'الفريق', '♙'], ['teams.html', 'فرق العمل', '◫']],
        [['reports.html', 'التقارير', '▥'], ['workflows.html', 'سير العمل', '↳'], ['templates.html', 'القوالب', '▧'],
            ['archive.html', 'الأرشيف', '▣'], ['profile.html', 'الملف الشخصي', '●']]
    ];
    const adminNavigation = [
        [['dashboard.html', 'لوحة القيادة', '▦'], ['organizations.html', 'المؤسسات', '▥'], ['users.html', 'المستخدمون', '♙'],
            ['subscriptions.html', 'الاشتراكات', '▤']],
        [['usage.html', 'الاستخدام', '≈'], ['features.html', 'إدارة الميزات', '⚐'], ['tickets.html', 'الدعم', '◌'],
            ['health.html', 'صحة النظام', '✓'], ['notifications.html', 'الإشعارات', '◉']]
    ];
    const groups = admin ? adminNavigation : userNavigation;
    const routeParents = { 'task.html': 'tasks.html', 'project.html': 'projects.html',
        'project-settings.html': 'projects.html', 'workspace-settings.html': 'team.html' };
    const active = admin ? page : routeParents[page] || page;
    const personal = !admin && new URLSearchParams(location.search).get('scope') === 'personal';
    const media = matchMedia('(max-width: 768px)');

    function element(type, className, label) {
        const node = document.createElement(type);
        if (className) node.className = className;
        if (label) node.textContent = label;
        return node;
    }

    function navigationItem([path, label, glyph], shortLabel = label) {
        const link = element('a', 'shell-link');
        const scoped = personal && ['projects.html', 'tasks.html', 'kanban.html', 'gantt.html', 'calendar.html',
            'reports.html', 'archive.html', 'templates.html'].includes(path);
        link.href = scoped ? path + '?scope=personal' : path;
        if (path === active) link.setAttribute('aria-current', 'page');
        const icon = element('span', 'shell-glyph', glyph);
        icon.setAttribute('aria-hidden', 'true');
        link.append(icon, element('span', '', shortLabel));
        return link;
    }

    function control(label, glyph, handler) {
        const button = element('button', 'shell-control');
        button.type = 'button';
        const icon = element('span', 'shell-glyph', glyph);
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon, element('span', '', label));
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
    brand.append(logo, element('span', '', admin ? 'إدارة نيفورا' : 'نيفورا'));
    const navigation = element('nav', 'shell-navigation');
    navigation.setAttribute('aria-label', 'التنقل الرئيسي');
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
    const shortcuts = admin ? [[groups[0][0], 'الرئيسية'], [groups[0][1], 'المؤسسات'], [groups[1][2], 'الدعم']]
        : [[groups[0][0], 'الرئيسية'], [groups[0][1], 'المشاريع'], [groups[0][2], 'المهام'], [groups[1][1], 'الفريق']];
    mobile.append(...shortcuts.map(([item, label]) => navigationItem(item, label)));
    const backdrop = element('div', 'shell-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener('click', () => setOpen(false, true));
    const menu = control('المزيد', '☰', () => setOpen(!body.classList.contains('shell-open'), true));
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
