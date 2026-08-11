/**
 * دوال التحقق من صحة المدخلات
 */

// ✅ تحقق من وجود الحقول المطلوبة
function requiredFields(...fields) {
    return (req, res, next) => {
        const missing = [];
        
        for (const field of fields) {
            if (!req.body[field] || (typeof req.body[field] === 'string' && !req.body[field].trim())) {
                missing.push(field);
            }
        }
        
        if (missing.length > 0) {
            return res.status(400).json({ 
                error: `الحقول التالية مطلوبة: ${missing.join(', ')}` 
            });
        }
        
        next();
    };
}

// ✅ تحقق من البريد الإلكتروني
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function requireValidEmail(req, res, next) {
    const email = req.body.email || req.body.username;
    if (email && !validateEmail(email)) {
        return res.status(400).json({ error: 'بريد إلكتروني غير صالح' });
    }
    next();
}

// ✅ تحقق من طول النص
function maxLength(field, max) {
    return (req, res, next) => {
        if (req.body[field] && req.body[field].length > max) {
            return res.status(400).json({ 
                error: `${field} يجب أن لا يتجاوز ${max} حرفاً` 
            });
        }
        next();
    };
}

// ✅ تحقق من القيم المسموحة
function allowedValues(field, values) {
    return (req, res, next) => {
        if (req.body[field] && !values.includes(req.body[field])) {
            return res.status(400).json({ 
                error: `قيمة ${field} غير صالحة. القيم المسموحة: ${values.join(', ')}` 
            });
        }
        next();
    };
}

// ✅ Sanitize النصوص (إزالة HTML tags)
function sanitize(field) {
    return (req, res, next) => {
        if (req.body[field] && typeof req.body[field] === 'string') {
            req.body[field] = req.body[field]
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;');
        }
        next();
    };
}

// ✅ تحقق من MongoDB ObjectId
function isValidObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
}

function requireValidObjectId(field) {
    return (req, res, next) => {
        const id = req.params[field] || req.body[field];
        if (id && !isValidObjectId(id)) {
            return res.status(400).json({ error: `${field} غير صالح` });
        }
        next();
    };
}

module.exports = {
    requiredFields,
    requireValidEmail,
    maxLength,
    allowedValues,
    sanitize,
    requireValidObjectId,
    isValidObjectId
};