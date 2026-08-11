/**
 * Middleware للـ Pagination
 * يستخرج page و limit من query parameters
 * ويضيفهم إلى req.pagination
 */
function paginate(req, res, next) {
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 20;
    
    // الحدود المسموحة
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100;
    
    const skip = (page - 1) * limit;
    
    req.pagination = {
        page,
        limit,
        skip
    };
    
    next();
}

/**
 * دالة مساعدة لإرجاع استجابة موحدة مع Pagination metadata
 */
async function paginatedResponse(model, filter, req, res, sort = { createdAt: -1 }, populate = null) {
    try {
        const { page, limit, skip } = req.pagination;
        
        let query = model.find(filter).sort(sort).skip(skip).limit(limit);
        
        if (populate) {
            query = query.populate(populate);
        }
        
        const [data, total] = await Promise.all([
            query.exec(),
            model.countDocuments(filter)
        ]);
        
        const totalPages = Math.ceil(total / limit);
        
        res.json({
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب البيانات' });
    }
}

module.exports = { paginate, paginatedResponse };