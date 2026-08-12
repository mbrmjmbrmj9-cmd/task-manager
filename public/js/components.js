/**
 * مكتبة مكونات Nivora UI
 * Design System Components
 */

// ========== Toast Notifications ==========
function showToast(message, type = 'success', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ========== Button Loading ==========
function setButtonLoading(btn, isLoading, loadingText = 'جاري...') {
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = loadingText;
        btn.classList.add('btn-loading');
        btn.disabled = true;
    } else {
        btn.textContent = btn.dataset.originalText || btn.textContent;
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

// ========== Spinner ==========
function showSpinner(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';
}

// ========== Skeleton Loading ==========
function showSkeleton(containerId, type = 'list', count = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const skeletons = {
        list: Array(count).fill('<div class="skeleton skeleton-text" style="width:100%;"></div>').join(''),
        card: Array(count).fill('<div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text" style="width:80%;"></div><div class="skeleton skeleton-text" style="width:60%;"></div></div>').join(''),
        table: Array(count).fill('<tr><td><div class="skeleton skeleton-text" style="width:70%;"></div></td><td><div class="skeleton skeleton-text" style="width:50px;"></div></td><td><div class="skeleton skeleton-text" style="width:80px;"></div></td><td><div class="skeleton skeleton-button" style="width:100px;"></div></td></tr>').join('')
    };

    container.innerHTML = skeletons[type] || skeletons.list;
}

// ========== Empty States ==========
function showEmptyState(containerId, { icon = '📭', title = 'لا توجد بيانات', message = '', actionText = '', actionUrl = '' } = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">${icon}</div>
            <h4>${title}</h4>
            ${message ? `<p>${message}</p>` : ''}
            ${actionText && actionUrl ? `<a href="${actionUrl}" class="btn btn-primary">${actionText}</a>` : ''}
        </div>
    `;
}

// ========== Error States ==========
function showError(containerId, message = 'تعذر تحميل البيانات', retryFn = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="error-state">
            <div class="error-icon">⚠️</div>
            <p>${message}</p>
            ${retryFn ? `<button class="btn btn-outline" onclick="(${retryFn})()">🔄 إعادة المحاولة</button>` : ''}
        </div>
    `;
}

// ========== Confirmation Dialog ==========
function confirmDialog({ title = 'تأكيد العملية', message = 'هل أنت متأكد؟', confirmText = 'حذف', cancelText = 'إلغاء', danger = true, onConfirm }) {
    const existing = document.getElementById('confirm-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confirm-dialog';
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
        <div class="modal" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h3>⚠️ ${title}</h3>
                <button class="modal-close" onclick="document.getElementById('confirm-dialog').remove()">✕</button>
            </div>
            <div class="modal-body">
                <p style="color:var(--text-light);font-size:0.9rem;">${message}</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="document.getElementById('confirm-dialog').remove()">${cancelText}</button>
                <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-dialog-btn">${confirmText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.classList.add('show');

    document.getElementById('confirm-dialog-btn').addEventListener('click', async () => {
        overlay.remove();
        if (onConfirm) await onConfirm();
    });
}

// ========== Modal عام ==========
function createModal({ id, title, content, saveText = 'حفظ', cancelText = 'إلغاء', onSave, size = 'md' }) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(id); };

    overlay.innerHTML = `
        <div class="modal" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close" onclick="closeModal('${id}')">✕</button>
            </div>
            <div class="modal-body">${content}</div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="closeModal('${id}')">${cancelText}</button>
                <button class="btn btn-primary" id="${id}-save-btn">${saveText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.classList.add('show');

    if (onSave) {
        document.getElementById(`${id}-save-btn`).addEventListener('click', onSave);
    }

    return overlay;
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.classList.remove('show');
        setTimeout(() => m.remove(), 300);
    });
}

// ========== Badges ==========
function statusBadge(status) {
    const badges = {
        'new': '<span class="badge badge-primary">جديدة</span>',
        'ready': '<span class="badge badge-info">جاهزة</span>',
        'in-progress': '<span class="badge badge-warning">قيد التنفيذ</span>',
        'review': '<span class="badge badge-info">مراجعة</span>',
        'done': '<span class="badge badge-success">مكتملة</span>',
        'archived': '<span class="badge badge-neutral">مؤرشفة</span>',
        'blocked': '<span class="badge badge-danger">متعثرة</span>'
    };
    return badges[status] || `<span class="badge badge-neutral">${status}</span>`;
}

function priorityBadge(priority) {
    const badges = {
        'critical': '<span class="badge badge-danger">حرجة</span>',
        'high': '<span class="badge badge-warning">عالية</span>',
        'medium': '<span class="badge badge-info">متوسطة</span>',
        'low': '<span class="badge badge-success">منخفضة</span>'
    };
    return badges[priority] || `<span class="badge badge-neutral">${priority}</span>`;
}

// ========== تنسيق ==========
function formatDate(date, format = 'ar-SA') {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(format);
}

function formatDateTime(date) {
    if (!date) return '-';
    return new Date(date).toLocaleString('ar-SA');
}

function timeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسبوع`;
    return formatDate(date);
}

function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0);
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ========== Utilities ==========
function debounce(func, wait = 300) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return Promise.resolve();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getInitials(name) {
    if (!name) return '?';
    return name.trim().charAt(0).toUpperCase();
}

function getStatusClass(status) {
    const classes = {
        'new': 'status-new',
        'in-progress': 'status-progress',
        'review': 'status-review',
        'done': 'status-done',
        'blocked': 'status-blocked'
    };
    return classes[status] || '';
}

function getPriorityClass(priority) {
    const classes = {
        'critical': 'priority-critical',
        'high': 'priority-high',
        'medium': 'priority-medium',
        'low': 'priority-low'
    };
    return classes[priority] || '';
}

// ========== تصدير للاستخدام العام ==========
window.showToast = showToast;
window.setButtonLoading = setButtonLoading;
window.showSpinner = showSpinner;
window.showSkeleton = showSkeleton;
window.showEmptyState = showEmptyState;
window.showError = showError;
window.confirmDialog = confirmDialog;
window.createModal = createModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.statusBadge = statusBadge;
window.priorityBadge = priorityBadge;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.timeAgo = timeAgo;
window.formatCurrency = formatCurrency;
window.formatFileSize = formatFileSize;
window.debounce = debounce;
window.copyToClipboard = copyToClipboard;
window.escapeHtml = escapeHtml;
window.getInitials = getInitials;
window.getStatusClass = getStatusClass;
window.getPriorityClass = getPriorityClass;