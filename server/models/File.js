const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    originalName: { 
        type: String, 
        required: true 
    },
    url: { 
        type: String, 
        required: true 
    },
    type: { 
        type: String, 
        default: 'file'  // file, image, document, spreadsheet, pdf, etc.
    },
    mimeType: { 
        type: String, 
        default: 'application/octet-stream' 
    },
    size: { 
        type: Number, 
        default: 0  // بالبايت
    },
    extension: { 
        type: String, 
        default: '' 
    },
    // المجلد الذي يحتوي الملف
    folderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Folder', 
        default: null 
    },
    // المشروع
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
    // رافع الملف
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    username: {
        type: String,
        default: ''
    },
    // وصف الملف
    description: { 
        type: String, 
        default: '' 
    },
    // علامات/وسوم
    tags: [String],
    // عدد مرات التحميل
    downloadCount: { 
        type: Number, 
        default: 0 
    },
    // هل الملف مفضل
    isFavorite: { 
        type: Boolean, 
        default: false 
    },
    // إصدار الملف
    version: { 
        type: Number, 
        default: 1 
    }
}, { 
    timestamps: true 
});

// ✅ Indexes
fileSchema.index({ folderId: 1 });
fileSchema.index({ projectId: 1 });
fileSchema.index({ userId: 1 });
fileSchema.index({ workspaceId: 1 });
fileSchema.index({ projectId: 1, folderId: 1 });
fileSchema.index({ type: 1 });

module.exports = mongoose.model('File', fileSchema);