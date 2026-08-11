const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    fromUser: { 
        type: String, 
        required: true 
    },
    type: { 
        type: String, 
        enum: ['mention', 'task_assigned', 'comment', 'task_completed', 'deadline', 'invite'],
        default: 'mention'
    },
    message: { 
        type: String, 
        required: true 
    },
    link: { 
        type: String, 
        default: '' 
    },
    taskId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Task', 
        default: null 
    },
    projectId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Project', 
        default: null 
    },
    isRead: { 
        type: Boolean, 
        default: false 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// ✅ Indexes
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);