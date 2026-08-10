const translations = {
    ar: {
        dashboard: 'لوحة القيادة',
        tasks: 'المهام',
        projects: 'المشاريع',
        kanban: 'Kanban',
        gantt: 'Gantt',
        calendar: 'التقويم',
        reports: 'التقارير',
        workflows: 'Workflows',
        templates: 'القوالب',
        archive: 'الأرشيف',
        team: 'الفريق',
        logout: 'خروج',
        addTask: 'مهمة جديدة',
        save: 'حفظ',
        cancel: 'إلغاء',
        delete: 'حذف',
        edit: 'تعديل',
        search: 'بحث',
        noTasks: 'لا توجد مهام',
        totalTasks: 'إجمالي المهام',
        completed: 'مكتملة',
        pending: 'قيد الانتظار',
        overdue: 'متأخرة',
        nivaora: 'Nivora',
        darkMode: 'الوضع الليلي'
    },
    en: {
        dashboard: 'Dashboard',
        tasks: 'Tasks',
        projects: 'Projects',
        kanban: 'Kanban',
        gantt: 'Gantt',
        calendar: 'Calendar',
        reports: 'Reports',
        workflows: 'Workflows',
        templates: 'Templates',
        archive: 'Archive',
        team: 'Team',
        logout: 'Logout',
        addTask: 'Add Task',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        search: 'Search',
        noTasks: 'No tasks',
        totalTasks: 'Total Tasks',
        completed: 'Completed',
        pending: 'Pending',
        overdue: 'Overdue',
        nivaora: 'Nivora',
        darkMode: 'Dark Mode'
    }
};

let currentLang = localStorage.getItem('lang') || 'ar';

function t(key) {
    return translations[currentLang]?.[key] || key;
}

function toggleLang() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('lang', currentLang);
    document.body.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    location.reload();
}

document.body.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
