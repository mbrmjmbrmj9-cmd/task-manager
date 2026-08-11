const express = require('express');
const mongoose = require('mongoose');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

/**
 * ✅ تصدير بيانات المستخدم (Backup)
 * يقوم بتصدير جميع بيانات المستخدم كـ JSON
 */
router.get('/export', authenticate, async (req, res) => {
    try {
        const models = {
            tasks: require('../models/Task'),
            projects: require('../models/Project'),
            workflows: require('../models/Workflow'),
            templates: require('../models/Template'),
            folders: require('../models/Folder'),
            files: require('../models/File')
        };
        
        const backup = {
            exportedAt: new Date().toISOString(),
            userId: req.user.id,
            data: {}
        };
        
        // تصدير بيانات كل نموذج
        for (const [name, model] of Object.entries(models)) {
            try {
                backup.data[name] = await model.find({ userId: req.user.id }).lean();
            } catch (err) {
                backup.data[name] = [];
            }
        }
        
        logger.info('تم تصدير نسخة احتياطية', { userId: req.user.id });
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=nivora-backup-${Date.now()}.json`);
        res.json(backup);
    } catch (err) {
        logger.error('خطأ في تصدير النسخة الاحتياطية', err);
        res.status(500).json({ error: 'خطأ في تصدير النسخة الاحتياطية' });
    }
});

/**
 * ✅ استيراد بيانات (Restore)
 * يستورد البيانات من ملف JSON
 */
router.post('/import', authenticate, async (req, res) => {
    try {
        const { data } = req.body;
        
        if (!data || !data.tasks) {
            return res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح' });
        }
        
        const models = {
            tasks: require('../models/Task'),
            projects: require('../models/Project'),
            workflows: require('../models/Workflow'),
            templates: require('../models/Template'),
            folders: require('../models/Folder'),
            files: require('../models/File')
        };
        
        let importedCount = 0;
        
        // استيراد كل نموذج
        for (const [name, items] of Object.entries(data)) {
            if (models[name] && Array.isArray(items)) {
                for (const item of items) {
                    try {
                        // إزالة _id القديم وتحديث userId
                        const { _id, __v, ...itemData } = item;
                        itemData.userId = req.user.id;
                        
                        await models[name].create(itemData);
                        importedCount++;
                    } catch (err) {
                        console.error(`خطأ في استيراد ${name}:`, err.message);
                    }
                }
            }
        }
        
        logger.info('تم استيراد نسخة احتياطية', { userId: req.user.id, count: importedCount });
        
        res.json({ 
            message: 'تم استيراد النسخة الاحتياطية بنجاح',
            importedCount
        });
    } catch (err) {
        logger.error('خطأ في استيراد النسخة الاحتياطية', err);
        res.status(500).json({ error: 'خطأ في استيراد النسخة الاحتياطية' });
    }
});

module.exports = router;