const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, default: 'active', enum: ['active', 'completed', 'archived'] },
    color: { type: String, default: '#2563EB' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },
    // ✅ إعدادات المشروع (Project Settings)
    settings: {
        enableChat: { type: Boolean, default: true },
        enableFiles: { type: Boolean, default: true },
        enableGantt: { type: Boolean, default: true },
        enableCalendar: { type: Boolean, default: true },
        enableWorkflows: { type: Boolean, default: true },
        enableBudget: { type: Boolean, default: false },
        defaultView: { type: String, default: 'kanban', enum: ['list', 'kanban', 'gantt', 'calendar', 'table'] },
        isPublic: { type: Boolean, default: false }
    }
}, { timestamps: true });

// ✅ إضافة indexes
projectSchema.index({ userId: 1 });
projectSchema.index({ workspaceId: 1 });
projectSchema.index({ userId: 1, workspaceId: 1 });

module.exports = mongoose.model('Project', projectSchema);