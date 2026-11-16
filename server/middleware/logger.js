const logger = {
    error(message, error) { console.error(JSON.stringify({ level: 'error', message, code: error?.code, type: error?.name })); },
    warn(message) { console.warn(JSON.stringify({ level: 'warn', message })); },
    info(message) { console.info(JSON.stringify({ level: 'info', message })); }
};

function requestLogger(req, res, next) {
    const start = performance.now();
    res.on('finish', () => {
        const durationMs = Math.round(performance.now() - start);
        if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode >= 500 || durationMs > 1000) {
            console.info(JSON.stringify({ method: req.method, route: req.route?.path || req.baseUrl, status: res.statusCode, durationMs }));
        }
    });
    next();
}

function errorHandler(error, _req, res, next) {
    if (res.headersSent) return next(error);
    if (error.name === 'VersionError' || error.code === 11000) {
        return res.status(409).json({ error: 'تغيّرت البيانات. حدّث الصفحة وحاول مرة أخرى' });
    }
    if (['ValidationError', 'CastError', 'MulterError'].includes(error.name)) {
        return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
            error: error.code === 'LIMIT_FILE_SIZE' ? 'حجم الملف يتجاوز الحد المسموح' : 'البيانات غير صالحة'
        });
    }
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'بيانات الطلب غير صالحة' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'حجم الطلب يتجاوز الحد المسموح' });
    if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
        return res.status(error.status).json({ error: error.expose === false || error.code ? 'الطلب غير متاح' : error.message });
    }
    if (error.status === 503) return res.status(503).json({ error: error.message });
    logger.error('API request failed', error);
    res.status(500).json({ error: 'تعذر تنفيذ الطلب' });
}

module.exports = { logger, requestLogger, errorHandler };
