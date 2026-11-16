(() => {
    'use strict';

    const title = { free: 'مجانية', standard: 'قياسية', pro: 'احترافية', enterprise: 'مؤسسات' };
    const numbers = new Intl.NumberFormat('ar-SA');
    const list = document.getElementById('planList');
    const summary = document.getElementById('planSummary');

    function element(tag, text) {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        return node;
    }

    function renderPlan(plan, current) {
        const card = element('article');
        card.className = 'workspace-panel plan-card-live';
        card.append(element('h2', title[plan.name] || plan.name));
        const features = element('ul');
        features.append(element('li', numbers.format(plan.maxMembers) + ' أعضاء'),
            element('li', numbers.format(plan.maxProjects) + ' مشاريع'));
        card.append(features);
        if (current?.plan === plan.name) {
            card.append(element('p', 'خطتك الحالية'));
        } else {
            const link = element('a', plan.name === 'free' && !current ? 'ابدأ مجانًا' : 'تواصل للاستفسار');
            link.className = 'workspace-button ' + (plan.name === 'free' ? 'quiet' : 'primary');
            link.href = plan.name === 'free' && !current ? 'login.html' : 'contact.html';
            card.append(link);
        }
        list.append(card);
    }

    async function start() {
        if (localStorage.getItem('dark') === 'true') document.documentElement.dataset.theme = 'dark';
        const workspace = localStorage.getItem('token') && Nivora.workspaceId();
        try {
            const [plans, usage] = await Promise.all([
                Nivora.api('/plans', { auth: false }),
                workspace && Nivora.api('/workspaces/' + workspace + '/usage').catch(() => null)
            ]);
            const available = plans.length ? plans : [{ name: 'free', maxMembers: 3, maxProjects: 5 }];
            for (const plan of available) renderPlan(plan, usage);
            summary.textContent = usage ? 'الخطة الحالية: ' + (title[usage.plan] || usage.plan) : '';
            summary.hidden = !usage;
        } catch {
            summary.textContent = 'تعذّر تحميل الخطط. أعد تحميل الصفحة أو تواصل معنا.';
            summary.classList.add('error');
        }
    }

    start();
})();
