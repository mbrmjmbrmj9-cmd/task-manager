const cloudinary = require('cloudinary').v2;

// إعداد Cloudinary (يُفضل استخدام متغيرات البيئة في الإنتاج)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'your-cloud-name',
    api_key: process.env.CLOUDINARY_API_KEY || 'your-api-key',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'your-api-secret'
});

/**
 * رفع ملف إلى Cloudinary
 * @param {string} filePath - مسار الملف المؤقت
 * @param {object} options - خيارات إضافية
 */
async function uploadToCloudinary(filePath, options = {}) {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: options.folder || 'nivora',
            resource_type: 'auto',
            ...options
        });
        
        return {
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            size: result.bytes,
            type: result.resource_type
        };
    } catch (err) {
        console.error('خطأ في رفع الملف إلى Cloudinary:', err);
        throw err;
    }
}

/**
 * حذف ملف من Cloudinary
 * @param {string} publicId - معرف الملف
 */
async function deleteFromCloudinary(publicId) {
    try {
        await cloudinary.uploader.destroy(publicId);
        return true;
    } catch (err) {
        console.error('خطأ في حذف الملف من Cloudinary:', err);
        return false;
    }
}

module.exports = { uploadToCloudinary, deleteFromCloudinary };