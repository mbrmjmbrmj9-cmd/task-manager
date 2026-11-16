(() => {
    'use strict';

    if (!localStorage.getItem('token')) return;

    const byId = id => document.getElementById(id);
    const workspaceId = new URLSearchParams(location.search).get('id') || localStorage.getItem('workspaceId');
    const status = byId('workspaceStatus');
    const reload = byId('reloadWorkspace');
    const panels = byId('workspacePanels');
    const nameInput = byId('wsName');
    const saveButton = byId('saveWorkspace');
    const transferButton = byId('transferOwnership');
    const ownerSelect = byId('newOwner');
    let workspace;

    function report(message, error = false) {
        status.textContent = message;
        status.hidden = !message;
        status.classList.toggle('error', error);
    }

    if (!/^[a-f0-9]{24}$/i.test(workspaceId || '')) {
        report('اختر مساحة العمل من صفحة فرق العمل.');
        return;
    }

    const resource = '/workspaces/' + workspaceId;

    function updateWorkspaceDetails() {
        byId('workspaceName').textContent = workspace.name;
        byId('workspaceName').hidden = false;
        nameInput.value = workspace.name;
        nameInput.readOnly = workspace.role !== 'owner';
        saveButton.hidden = workspace.role !== 'owner';
        byId('ownershipPanel').hidden = workspace.role !== 'owner';
        byId('archivePanel').hidden = workspace.role !== 'owner';
        byId('inviteSettings').hidden = !workspace.inviteCode;
        byId('inviteCode').textContent = workspace.inviteCode || '';
    }

    async function loadMembers() {
        transferButton.disabled = true;
        ownerSelect.replaceChildren(new Option('اختر عضوًا', ''));
        const membersStatus = byId('membersStatus');
        membersStatus.textContent = 'جارٍ تحميل الأعضاء…';
        try {
            const members = await Nivora.api(resource + '/members');
            for (const { role, userId: user } of members) {
                if (role !== 'owner' && user?._id && user.isActive !== false) {
                    ownerSelect.add(new Option(user.fullName || user.username, user._id));
                }
            }
            transferButton.disabled = ownerSelect.options.length < 2;
            membersStatus.textContent = transferButton.disabled ? 'لا يوجد عضو نشط يمكن نقل الملكية إليه.' : '';
        } catch (error) {
            membersStatus.textContent = 'تعذر تحميل الأعضاء. أعد تحميل الصفحة للمحاولة مجددًا.';
        }
    }

    async function loadWorkspace() {
        reload.hidden = true;
        panels.hidden = true;
        report('جارٍ تحميل مساحة العمل…');
        try {
            workspace = await Nivora.api(resource + '/settings');
            updateWorkspaceDetails();
            const { plan, currentMembers, maxMembers, currentProjects, maxProjects } = workspace.usage;
            byId('planName').textContent = plan;
            byId('memberUsage').textContent = currentMembers + ' / ' + maxMembers;
            byId('projectUsage').textContent = currentProjects + ' / ' + maxProjects;
            panels.hidden = false;
            report('');
            if (workspace.role === 'owner') void loadMembers();
        } catch (error) {
            report(error.status ? error.message : 'تعذر الاتصال لتحميل مساحة العمل.', true);
            reload.hidden = false;
        }
    }

    // Serialize updates within the page to avoid submitting against stale workspace data.
    let pending = false;
    async function update(button, action) {
        if (pending) return;
        pending = true;
        button.disabled = true;
        report('');
        try {
            await action();
        } catch (error) {
            report(error.status ? error.message : 'تعذر الاتصال. حاول مرة أخرى.', true);
        } finally {
            button.disabled = false;
            pending = false;
        }
    }

    byId('workspaceForm').addEventListener('submit', event => {
        event.preventDefault();
        if (workspace?.role !== 'owner') return;
        const name = nameInput.value.trim();
        void update(saveButton, async () => {
            const result = await Nivora.api(resource + '/settings', { method: 'PATCH', data: { name } });
            workspace.name = result.workspace.name;
            updateWorkspaceDetails();
            report('تم حفظ اسم الفريق.');
        });
    });

    const rotateButton = byId('rotateInvite');
    rotateButton.addEventListener('click', () => {
        if (!confirm('هل تريد إصدار رمز دعوة جديد؟ سيتوقف الرمز الحالي عن العمل.')) return;
        void update(rotateButton, async () => {
            const result = await Nivora.api(resource + '/invite/rotate', { method: 'POST' });
            workspace.inviteCode = result.inviteCode;
            if (workspaceId === localStorage.getItem('workspaceId')) {
                Nivora.setWorkspace({ _id: workspaceId, inviteCode: result.inviteCode });
            }
            updateWorkspaceDetails();
            report('تم إصدار رمز دعوة جديد.');
        });
    });

    byId('transferForm').addEventListener('submit', event => {
        event.preventDefault();
        if (workspace?.role !== 'owner' || !ownerSelect.value
            || !confirm('هل تريد نقل الملكية للعضو المحدد؟ ستصبح مديرًا في مساحة العمل.')) return;
        const newOwnerId = ownerSelect.value;
        void update(transferButton, async () => {
            const result = await Nivora.api(resource + '/transfer-ownership', { method: 'POST', data: { newOwnerId } });
            workspace.role = result.workspace.role;
            updateWorkspaceDetails();
            report('تم نقل ملكية مساحة العمل.');
        });
    });

    const archiveButton = byId('archiveWorkspace');
    archiveButton.addEventListener('click', () => {
        if (workspace?.role !== 'owner' || !confirm('هل تريد أرشفة مساحة العمل؟ يمكن استعادتها من صفحة فرق العمل.')) return;
        void update(archiveButton, async () => {
            await Nivora.api(resource, { method: 'DELETE' });
            if (workspaceId === localStorage.getItem('workspaceId')) Nivora.setWorkspace(null);
            location.assign('teams.html');
        });
    });

    reload.addEventListener('click', loadWorkspace);
    void loadWorkspace();
})();
