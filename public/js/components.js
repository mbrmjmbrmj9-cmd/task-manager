/**
 * مكتبة مكونات Nivora UI
 * توفر دوال لتوليد مكونات شائعة بشكل موحد
 */

// ✅ إنشاء Toast
function showToast(message, type = 'success', duration = 3000) {
    // إزالة أي toast قديم
    const existingContainer = document.querySelector('.toast-container');
    if (existingContainer) existingContainer.remove();
    
    const container = document.createElement('div');
    container.className = 'toast-container';
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    document.body.appendChild(container);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => container.remove(), 300);
    }, duration);
}

// ✅ إنشاء Spinner تحميل
function showSpinner(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';
}

// ✅ إنشاء حالة فارغة
function showEmptyState(containerId, message = 'لا توجد بيانات', icon = '📭') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div style="text-align:center;padding:3rem 1rem;color:var(--text-light);">
            <div style="font-size:3rem;margin-bottom:1rem;">${icon}</div>
            <p>${message}</p>
        </div>
    `;
}

// ✅ إنشاء رسالة خطأ
function showError(containerId, message = 'حدث خطأ') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div style="text-align:center;padding:2rem;color:#DC2626;">
            <p>❌ ${message}</p>
        </div>
    `;
}

// ✅ تأكيد الحذف
function confirmDelete(message = 'هل أنت متأكد من الحذف؟') {
    return confirm(message);
}

// ✅ تنسيق التاريخ
function formatDate(date, format = 'ar-SA') {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(format);
}

// ✅ تنسيق الوقت النسبي
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
    return formatDate(date);
}

// ✅ Badge الحالة
function statusBadge(status) {
    const badges = {
        'new': '<span class="badge badge-new">جديدة</span>',
        'in-progress': '<span class="badge badge-progress">قيد التنفيذ</span>',
        'review': '<span class="badge badge-review">مراجعة</span>',
        'done': '<span class="badge badge-done">مكتملة</span>',
        'archived': '<span class="badge" style="background:#F1F5F9;color:#64748B;">مؤرشفة</span>',
        'blocked': '<span class="badge" style="background:#FEE2E2;color:#DC2626;">متعثرة</span>'
    };
    return badges[status] || `<span class="badge badge-new">${status}</span>`;
}

// ✅ Badge الأولوية
function priorityBadge(priority) {
    const badges = {
        'critical': '🔴 حرجة',
        'high': '🟠 عالية',
        'medium': '🟡 متوسطة',
        'low': '🟢 منخفضة'
    };
    return badges[priority] || priority;
}

// ✅ إنشاء Modal عام
function createModal(id, title, content, onSave, saveText = 'حفظ') {
    // إزالة modal قديم بنفس id
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(id); };
    
    overlay.innerHTML = `
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="modal-close" onclick="closeModal('${id}')">✕</button>
            </div>
            <div class="modal-body">${content}</div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="closeModal('${id}')">إلغاء</button>
                <button class="btn btn-primary" id="${id}-save-btn">${saveText}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.classList.add('show');
    
    if (onSave) {
        document.getElementById(`${id}-save-btn`).addEventListener('click', onSave);
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}