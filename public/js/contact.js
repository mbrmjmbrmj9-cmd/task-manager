(() => {
    'use strict';

    const form = document.getElementById('contactForm');
    const status = document.getElementById('contactStatus');
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;

        const data = Object.fromEntries([...new FormData(form)].map(([field, value]) => [field, value.trim()]));
        status.hidden = false;
        status.classList.remove('error');
        button.disabled = true;
        status.textContent = 'جارٍ إرسال الرسالة…';
        try {
            await Nivora.api('/contact', { method: 'POST', auth: false, data });
            form.reset();
            status.textContent = 'تم استلام رسالتك.';
        } catch (error) {
            status.classList.add('error');
            status.textContent = error.status ? error.message : 'تعذر الاتصال. حاول مرة أخرى.';
        } finally {
            button.disabled = false;
        }
    });
})();
