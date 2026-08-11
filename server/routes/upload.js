const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// محاولة استيراد Cloudinary (اختياري)
let uploadToCloudinary, deleteFromCloudinary;
let cloudinaryAvailable = false;

try {
    const cloudinaryModule = require('../config/cloudinary');
    uploadToCloudinary = cloudinaryModule.uploadToCloudinary;
    deleteFromCloudinary = cloudinaryModule.deleteFromCloudinary;
    cloudinaryAvailable = true;
    console.log('✅ Cloudinary متاح');
} catch (err) {
    console.log('⚠️ Cloudinary غير متاح، سيتم استخدام التخزين المحلي');
}

// إعداد multer للتخزين المؤقت
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv',
        'application/zip', 'application/x-rar-compressed',
        'audio/mpeg', 'audio/wav',
        'video/mp4'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم'), false);
    }
};

const upload = multer({ 
    storage, 
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ✅ رفع ملف (يدعم Cloudinary أو محلي)
router.post('/', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'لم يتم رفع ملف' });
        }
        
        const filePath = req.file.path;
        let fileData;
        
        // ✅ محاولة رفع إلى Cloudinary أولاً
        if (cloudinaryAvailable) {
            try {
                const cloudinaryResult = await uploadToCloudinary(filePath, {
                    folder: `nivora/${req.user.id}`
                });
                
                fileData = {
                    name: req.file.filename,
                    originalName: req.file.originalname,
                    url: cloudinaryResult.url,
                    publicId: cloudinaryResult.publicId,
                    size: cloudinaryResult.size || req.file.size,
                    mimeType: req.file.mimetype,
                    extension: path.extname(req.file.originalname),
                    type: getFileType(req.file.mimetype),
                    storage: 'cloudinary'
                };
                
                // حذف الملف المحلي المؤقت
                fs.unlinkSync(filePath);
            } catch (cloudinaryErr) {
                console.error('فشل رفع إلى Cloudinary، استخدام محلي:', cloudinaryErr);
                fileData = getLocalFileData(req);
            }
        } else {
            fileData = getLocalFileData(req);
        }
        
        res.json(fileData);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في رفع الملف: ' + err.message });
    }
});

// ✅ رفع ملفات متعددة
router.post('/multiple', authenticate, upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'لم يتم رفع ملفات' });
        }
        
        const files = [];
        
        for (const file of req.files) {
            const filePath = file.path;
            
            if (cloudinaryAvailable) {
                try {
                    const cloudinaryResult = await uploadToCloudinary(filePath, {
                        folder: `nivora/${req.user.id}`
                    });
                    
                    files.push({
                        name: file.filename,
                        originalName: file.originalname,
                        url: cloudinaryResult.url,
                        publicId: cloudinaryResult.publicId,
                        size: cloudinaryResult.size || file.size,
                        mimeType: file.mimetype,
                        extension: path.extname(file.originalname),
                        type: getFileType(file.mimetype),
                        storage: 'cloudinary'
                    });
                    
                    fs.unlinkSync(filePath);
                } catch (err) {
                    files.push(getLocalFileDataFromFile(file));
                }
            } else {
                files.push(getLocalFileDataFromFile(file));
            }
        }
        
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في رفع الملفات: ' + err.message });
    }
});

// ✅ حذف ملف من Cloudinary
router.delete('/:publicId', authenticate, async (req, res) => {
    try {
        if (!cloudinaryAvailable) {
            return res.status(400).json({ error: 'Cloudinary غير متاح' });
        }
        
        await deleteFromCloudinary(req.params.publicId);
        res.json({ message: 'تم حذف الملف' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حذف الملف' });
    }
});

// دوال مساعدة
function getFileType(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.includes('pdf')) return 'pdf';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'document';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return 'spreadsheet';
    return 'file';
}

function getLocalFileData(req) {
    const baseUrl = process.env.BASE_URL || 'https://nivora-t9ov.onrender.com';
    return {
        name: req.file.filename,
        originalName: req.file.originalname,
        url: `${baseUrl}/uploads/${req.file.filename}`,
        size: req.file.size,
        mimeType: req.file.mimetype,
        extension: path.extname(req.file.originalname),
        type: getFileType(req.file.mimetype),
        storage: 'local'
    };
}

function getLocalFileDataFromFile(file) {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    return {
        name: file.filename,
        originalName: file.originalname,
        url: `${baseUrl}/uploads/${file.filename}`,
        size: file.size,
        mimeType: file.mimetype,
        extension: path.extname(file.originalname),
        type: getFileType(file.mimetype),
        storage: 'local'
    };
}

module.exports = router;