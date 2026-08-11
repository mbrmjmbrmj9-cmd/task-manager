const express = require('express');
const File = require('../models/File');
const Folder = require('../models/Folder');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ✅ جلب كل الملفات في مشروع
router.get('/project/:projectId', authenticate, async (req, res) => {
    try {
        const filter = { projectId: req.params.projectId };
        
        // فلترة بالمجلد
        if (req.query.folderId) {
            filter.folderId = req.query.folderId;
        } else if (req.query.root === 'true') {
            filter.folderId = null; // الملفات في الجذر فقط
        }
        
        // فلترة بالنوع
        if (req.query.type) {
            filter.type = req.query.type;
        }
        
        // بحث
        if (req.query.search) {
            filter.name = { $regex: req.query.search, $options: 'i' };
        }
        
        const files = await File.find(filter)
            .sort({ isFavorite: -1, createdAt: -1 })
            .populate('userId', 'username fullName');
            
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الملفات' });
    }
});

// ✅ جلب ملف واحد
router.get('/:id', authenticate, async (req, res) => {
    try {
        const file = await File.findById(req.params.id)
            .populate('userId', 'username fullName')
            .populate('folderId', 'name color');
            
        if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
        
        // زيادة عداد التحميل
        file.downloadCount += 1;
        await file.save();
        
        res.json(file);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب الملف' });
    }
});

// ✅ رفع ملف (إنشاء سجل جديد)
router.post('/', authenticate, async (req, res) => {
    try {
        const { 
            name, originalName, url, type, mimeType, size, extension,
            folderId, projectId, workspaceId, description, tags 
        } = req.body;
        
        if (!name || !url) return res.status(400).json({ error: 'اسم الملف والرابط مطلوبان' });
        if (!projectId) return res.status(400).json({ error: 'معرف المشروع مطلوب' });
        
        // إذا كان الملف داخل مجلد، نتأكد من وجوده ونحدث العداد
        if (folderId) {
            const folder = await Folder.findById(folderId);
            if (!folder) return res.status(404).json({ error: 'المجلد غير موجود' });
        }
        
        const file = await File.create({
            name,
            originalName: originalName || name,
            url,
            type: type || 'file',
            mimeType: mimeType || 'application/octet-stream',
            size: size || 0,
            extension: extension || '',
            folderId: folderId || null,
            projectId,
            workspaceId: workspaceId || null,
            userId: req.user.id,
            username: req.user.username,
            description: description || '',
            tags: tags || []
        });
        
        // تحديث عدد العناصر في المجلد
        if (folderId) {
            const fileCount = await File.countDocuments({ folderId });
            const subFolderCount = await Folder.countDocuments({ parentFolderId: folderId });
            await Folder.findByIdAndUpdate(folderId, { itemCount: fileCount + subFolderCount });
        }
        
        res.status(201).json(file);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في رفع الملف' });
    }
});

// ✅ تحديث ملف
router.patch('/:id', authenticate, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
        
        // التحقق من الملكية
        if (file.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا الملف' });
        }
        
        const allowed = ['name', 'description', 'tags', 'isFavorite', 'folderId', 'version'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                file[field] = req.body[field];
            }
        });
        
        await file.save();
        res.json(file);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحديث الملف' });
    }
});

// ✅ حذف ملف
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
        
        // التحقق من الملكية
        if (file.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'لا تملك صلاحية حذف هذا الملف' });
        }
        
        const folderId = file.folderId;
        await File.findByIdAndDelete(req.params.id);
        
        // تحديث عدد العناصر في المجلد
        if (folderId) {
            const fileCount = await File.countDocuments({ folderId });
            const subFolderCount = await Folder.countDocuments({ parentFolderId: folderId });
            await Folder.findByIdAndUpdate(folderId, { itemCount: fileCount + subFolderCount });
        }
        
        res.json({ message: 'تم حذف الملف' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف الملف' });
    }
});

// ✅ نقل ملف إلى مجلد آخر
router.patch('/:id/move', authenticate, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
        
        const oldFolderId = file.folderId;
        const newFolderId = req.body.folderId || null;
        
        file.folderId = newFolderId;
        await file.save();
        
        // تحديث العداد في المجلد القديم
        if (oldFolderId) {
            const fileCount = await File.countDocuments({ folderId: oldFolderId });
            const subFolderCount = await Folder.countDocuments({ parentFolderId: oldFolderId });
            await Folder.findByIdAndUpdate(oldFolderId, { itemCount: fileCount + subFolderCount });
        }
        
        // تحديث العداد في المجلد الجديد
        if (newFolderId) {
            const fileCount = await File.countDocuments({ folderId: newFolderId });
            const subFolderCount = await Folder.countDocuments({ parentFolderId: newFolderId });
            await Folder.findByIdAndUpdate(newFolderId, { itemCount: fileCount + subFolderCount });
        }
        
        res.json(file);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في نقل الملف' });
    }
});

module.exports = router;