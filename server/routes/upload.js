const express = require('express');
const path = require('node:path');
const { rename } = require('node:fs/promises');
const { authenticate, accessError } = require('../middleware/auth');
const { avatarDir, avatarMultipart, avatarType, removeFile, durable, persistUpload } = require('../config/storage');
const { apiOrigin } = require('../config/env');

const router = express.Router();

router.post('/', authenticate, avatarMultipart, async (req, res) => {
    if (!req.file) throw accessError(400, 'اختر صورة');
    let saved = false;
    try {
        const type = await avatarType(req.file.path);
        if (!type) throw accessError(400, 'اختر صورة PNG أو JPEG أو GIF أو WebP');
        const name = req.file.filename + '.' + type;
        const url = new URL('/uploads/avatars/' + name, apiOrigin()).href;
        if (durable) await persistUpload(req.file, name);
        else await rename(req.file.path, path.join(avatarDir, name));
        saved = true;
        res.json({ name, originalName: req.file.originalname, url, type: 'image', size: req.file.size, storage: 'avatar' });
    } finally {
        if (!saved) await removeFile(req.file.path);
    }
});

module.exports = router;
