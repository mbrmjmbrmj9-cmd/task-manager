const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema({
    text: { type: String, required: true },
    done: { type: Boolean, default: false }
});

const commentSchema = new mongoose.Schema({
    text: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const attachmentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now }
});

const activitySchema = new mongoose.Schema({
    action: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    details: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: {
        type: String, default: 'new',
        enum: ['new', 'ready', 'in-progress', 'review', 'done', 'archived', 'blocked']
    },
    priority: {
        type: String, default: 'medium',
        enum: ['critical', 'high', 'medium', 'low']
    },
    category: { type: String, default: 'default' },
    // ✅ تم إضافة projectId للربط الحقيقي
    project: { type: String, default: '' },         // اسم المشروع (للتوافق مع البيانات القديمة)
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null }, // معرف المشروع
    assignee: { type: String, default: '' },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    estimatedHours: { type: Number, default: null },
    actualHours: { type: Number, default: null },
    tags: [String],
    checklist: [checklistItemSchema],
    comments: [commentSchema],
    attachments: [attachmentSchema],
    activity: [activitySchema],
    followers: [String],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },
    dependencies: [{
        taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
        type: { type: String, enum: ['finish-to-start', 'start-to-start', 'finish-to-finish'], default: 'finish-to-start' }
    }],
    parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    isMilestone: { type: Boolean, default: false },
    isRecurring: { type: Boolean, default: false },
    recurringType: { type: String, enum: ['daily', 'weekly', 'monthly', null], default: null },
    recurringInterval: { type: Number, default: 1 },
    nextOccurrence: { type: Date, default: null },
}, { timestamps: true });

// ✅ إضافة indexes لتحسين الأداء
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, projectId: 1 });
taskSchema.index({ userId: 1, workspaceId: 1 });
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ dueDate: 1 });

module.exports = mongoose.model('Task', taskSchema);