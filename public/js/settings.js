(() => {
    'use strict';

    if (!localStorage.getItem('token')) return;

    const choices = document.querySelectorAll('input[name="appearance"]');
    function syncAppearance() {
        const theme = document.documentElement.dataset.theme;
        for (const choice of choices) choice.checked = choice.value === theme;
    }
    window.addEventListener('nivora:themechange', syncAppearance);
    for (const choice of choices) {
        choice.addEventListener('change', () => NivoraTheme.setDark(choice.value === 'dark'));
    }
    syncAppearance();

    const activeWorkspace = localStorage.getItem('workspaceId');
    if (/^[a-f0-9]{24}$/i.test(activeWorkspace || '') && !Nivora.personal) {
        document.getElementById('workspaceSettings').href = 'workspace-settings.html';
        document.getElementById('workspaceHint').textContent = 'إعدادات مساحة العمل الحالية والصلاحيات وحدود الاستخدام';
    }
    document.getElementById('projectSettings').href = Nivora.page('projects.html');

    const backupButton = document.getElementById('exportBackup');
    const status = document.getElementById('backupStatus');
    backupButton.addEventListener('click', async () => {
        backupButton.disabled = true;
        status.hidden = false;
        status.classList.remove('error');
        status.textContent = 'جارٍ تجهيز النسخة…';
        try {
            await Nivora.download('/api/backup/export', 'nivora-personal-backup.json');
            status.textContent = 'تم تجهيز النسخة الشخصية للتنزيل.';
        } catch (error) {
            status.classList.add('error');
            status.textContent = error.message;
        } finally {
            backupButton.disabled = false;
        }
    });
})();
