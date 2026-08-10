const jwt = require('jsonwebtoken');
const Workspace = require('../models/Workspace');

const JWT_SECRET = 'nivora_secret_2025';

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'جلسة غير صالحة' });
        req.user = user;
        next();
    });
}

function requireRole(...roles) {
    return async (req, res, next) => {
        const wsId = req.params.id || req.body.workspaceId;
        if (!wsId) return res.status(400).json({ error: 'معرف workspace مطلوب' });
        
        const ws = await Workspace.findById(wsId);
        if (!ws) return res.status(404).json({ error: 'workspace غير موجود' });
        
        const member = ws.members.find(m => m.userId.toString() === req.user.id);
        if (!member) return res.status(403).json({ error: 'لست عضواً' });
        if (!roles.includes(member.role)) return res.status(403).json({ error: 'صلاحيات غير كافية' });
        
        next();
    };
}

module.exports = { authenticate, requireRole };