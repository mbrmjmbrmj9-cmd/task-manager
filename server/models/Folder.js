const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    color: { 
        type: String, 
        default: '#2563EB' 
    },
    icon: { 
        type: String, 
        default: '📁' 
    },
    description: { 
        type: String, 
        default: '' 
    },
    // المجلد الأب (للتنظيم الهرمي)
    parentFolderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Folder', 
        default: null 
    },
    // المشروع الذي ينتمي إليه المجلد
    projectId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Project', 
        required: true 
    },
    // مساحة العمل
    workspaceId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Workspace', 
        default: null 
    },
    // منشئ المجلد
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    // هل المجلد مفضل/مهم
    isFavorite: { 
        type: Boolean, 
        default: false 
    },
    // هل المجلد مؤرشفة
    isArchived: { 
        type: Boolean, 
        default: false 
    },
    // عدد العناصر داخل المجلد
    itemCount: { 
        type: Number, 
        default: 0 
    }
}, { 
    timestamps: true 
});

// ✅ Indexes
folderSchema.index({ projectId: 1 });
folderSchema.index({ parentFolderId: 1 });
folderSchema.index({ userId: 1 });
folderSchema.index({ workspaceId: 1 });
folderSchema.index({ projectId: 1, parentFolderId: 1 });

module.exports = mongoose.model('Folder', folderSchema);