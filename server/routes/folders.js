const express = require('express');
const Folder = require('../models/Folder');
const File = require('../models/File');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ✅ جلب كل المجلدات في مشروع
router.get('/project/:projectId', authenticate, async (req, res) => {
    try {
        const filter = { 
            projectId: req.params.projectId,
            isArchived: false
        };
        
        // فلترة بالمجلد الأب
        if (req.query.parentFolderId) {
            filter.parentFolderId = req.query.parentFolderId;
        } else if (req.query.root === 'true') {
            filter.parentFolderId = null; // المجلدات الجذرية فقط
        }
        
        const folders = await Folder.find(filter)
            .sort({ isFavorite: -1, name: 1 })
            .populate('userId', 'username fullName');
            
        res.json(folders);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المجلدات' });
    }
});

// ✅ جلب مجلد واحد مع محتوياته
router.get('/:id', authenticate, async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.id)
            .populate('userId', 'username fullName');
            
        if (!folder) return res.status(404).json({ error: 'المجلد غير موجود' });
        
        // جلب الملفات داخل المجلد
        const files = await File.find({ folderId: folder._id })
            .sort({ isFavorite: -1, createdAt: -1 });
            
        // جلب المجلدات الفرعية
        const subFolders = await Folder.find({ parentFolderId: folder._id, isArchived: false })
            .sort({ name: 1 });
            
        res.json({ folder, files, subFolders });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المجلد' });
    }
});

// ✅ إنشاء مجلد
router.post('/', authenticate, async (req, res) => {
    try {
        const { name, color, icon, description, parentFolderId, projectId, workspaceId } = req.body;
        
        if (!name) return res.status(400).json({ error: 'اسم المجلد مطلوب' });
        if (!projectId) return res.status(400).json({ error: 'معرف المشروع مطلوب' });
        
        // إذا كان مجلد فرعي، نتأكد من وجود المجلد الأب
        if (parentFolderId) {
            const parentFolder = await Folder.findById(parentFolderId);
            if (!parentFolder) return res.status(404).json({ error: 'المجلد الأب غير موجود' });
        }
        
        const folder = await Folder.create({
            name,
            color: color || '#2563EB',
            icon: icon || '📁',
            description: description || '',
            parentFolderId: parentFolderId || null,
            projectId,
            workspaceId: workspaceId || null,
            userId: req.user.id
        });
        
        res.status(201).json(folder);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إنشاء المجلد' });
    }
});

// ✅ تحديث مجلد
router.patch('/:id', authenticate, async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.id);
        if (!folder) return res.status(404).json({ error: 'المجلد غير موجود' });
        
        // التحقق من الملكية
        if (folder.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا المجلد' });
        }
        
        const allowed = ['name', 'color', 'icon', 'description', 'isFavorite', 'isArchived', 'parentFolderId'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                folder[field] = req.body[field];
            }
        });
        
        await folder.save();
        res.json(folder);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث المجلد' });
    }
});

// ✅ حذف مجلد (ومحتوياته)
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.id);
        if (!folder) return res.status(404).json({ error: 'المجلد غير موجود' });
        
        // التحقق من الملكية
        if (folder.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'لا تملك صلاحية حذف هذا المجلد' });
        }
        
        // حذف الملفات داخل المجلد
        await File.deleteMany({ folderId: folder._id });
        
        // حذف المجلدات الفرعية بشكل تكراري
        const deleteSubFolders = async (parentId) => {
            const subFolders = await Folder.find({ parentFolderId: parentId });
            for (const sub of subFolders) {
                await File.deleteMany({ folderId: sub._id });
                await deleteSubFolders(sub._id);
                await Folder.findByIdAndDelete(sub._id);
            }
        };
        await deleteSubFolders(folder._id);
        
        await Folder.findByIdAndDelete(folder._id);
        res.json({ message: 'تم حذف المجلد ومحتوياته' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف المجلد' });
    }
});

// ✅ تحديث عدد العناصر في المجلد
router.patch('/:id/item-count', authenticate, async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.id);
        if (!folder) return res.status(404).json({ error: 'المجلد غير موجود' });
        
        const fileCount = await File.countDocuments({ folderId: folder._id });
        const subFolderCount = await Folder.countDocuments({ parentFolderId: folder._id });
        folder.itemCount = fileCount + subFolderCount;
        await folder.save();
        
        res.json(folder);
    } catch (err) {
        res.status(500).json({ error: 'خطأ' });
    }
});

module.exports = router;