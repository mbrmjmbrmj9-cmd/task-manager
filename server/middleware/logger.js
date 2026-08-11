const fs = require('fs');
const path = require('path');

// إنشاء مجلد logs إذا لم يكن موجودًا
const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * نظام تسجيل الأخطاء والأحداث
 */
const logger = {
    /**
     * تسجيل خطأ
     */
    error(message, error = null) {
        const log = {
            level: 'ERROR',
            message,
            error: error ? error.stack || error.message || error : null,
            timestamp: new Date().toISOString()
        };
        
        console.error(`[ERROR] ${log.timestamp} - ${message}`, error || '');
        this.writeToFile('error', log);
    },
    
    /**
     * تسجيل تحذير
     */
    warn(message, data = null) {
        const log = {
            level: 'WARN',
            message,
            data,
            timestamp: new Date().toISOString()
        };
        
        console.warn(`[WARN] ${log.timestamp} - ${message}`);
        this.writeToFile('warn', log);
    },
    
    /**
     * تسجيل معلومات
     */
    info(message, data = null) {
        const log = {
            level: 'INFO',
            message,
            data,
            timestamp: new Date().toISOString()
        };
        
        console.log(`[INFO] ${log.timestamp} - ${message}`);
        this.writeToFile('info', log);
    },
    
    /**
     * تسجيل طلب API
     */
    request(req, res, duration) {
        const log = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            timestamp: new Date().toISOString()
        };
        
        this.writeToFile('requests', log);
    },
    
    /**
     * كتابة السجل إلى ملف
     */
    writeToFile(type, log) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const filePath = path.join(logsDir, `${type}-${date}.log`);
            fs.appendFileSync(filePath, JSON.stringify(log) + '\n');
        } catch (err) {
            console.error('خطأ في كتابة السجل:', err);
        }
    }
};

/**
 * Middleware لتسجيل طلبات API
 */
function requestLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        
        // تسجيل الطلبات البطيئة فقط (> 1000ms) أو الأخطاء
        if (duration > 1000 || res.statusCode >= 400) {
            logger.request(req, res, duration);
        }
    });
    
    next();
}

/**
 * معالج أخطاء مركزي
 */
function errorHandler(err, req, res, next) {
    logger.error('خطأ في الخادم', err);
    
    // تحديد نوع الخطأ
    if (err.name === 'ValidationError') {
        return res.status(400).json({ 
            error: 'بيانات غير صالحة', 
            details: Object.values(err.errors).map(e => e.message)
        });
    }
    
    if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    if (err.name === 'MulterError') {
        return res.status(400).json({ error: 'خطأ في رفع الملف: ' + err.message });
    }
    
    // خطأ عام
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'خطأ في الخادم' : err.message
    });
}

module.exports = { logger, requestLogger, errorHandler };