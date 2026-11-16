const path = require('node:path');
const { createReadStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { mkdir, unlink, open } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const multer = require('multer');
const mongoose = require('mongoose');

const root = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(__dirname, '..', '..', '.nivora-uploads'));
const avatarDir = path.join(root, 'avatars');
const attachmentDir = path.join(root, 'tasks');
const legacyDir = path.join(__dirname, '..', '..', 'uploads');
const durable = process.env.UPLOAD_STORAGE === 'mongo'
    || (!process.env.PRIVATE_UPLOAD_DIR && Boolean(process.env.RENDER_EXTERNAL_URL));
let bucket;

function fileBucket() {
    return bucket ||= new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'nivoraUploads' });
}

function storageMultipart(directory, limit) {
    return multer({
        storage: multer.diskStorage({
            destination(_req, _file, cb) {
                mkdir(directory, { recursive: true }).then(() => cb(null, directory), cb);
            },
            filename(_req, _file, cb) { cb(null, randomUUID()); }
        }),
        limits: { fileSize: limit, files: 1, fields: 0, parts: 2 }
    }).single('file');
}

const attachmentMultipart = storageMultipart(attachmentDir, 25 * 1024 * 1024);
const avatarMultipart = storageMultipart(avatarDir, 5 * 1024 * 1024);

async function removeFile(filePath) {
    try {
        await unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') console.warn('Unable to remove an upload.');
    }
}

async function persistUpload(file, key) {
    if (!durable) return;
    try {
        await pipeline(createReadStream(file.path), fileBucket().openUploadStreamWithId(key, key));
    } catch (error) {
        await removeStoredUpload(key);
        throw error;
    } finally {
        await removeFile(file.path);
    }
}

async function removeStoredUpload(key) {
    if (typeof key !== 'string' || !/^[a-f\d-]{36}(?:\.(png|jpg|gif|webp))?$/.test(key)) return;
    if (!durable) {
        const directory = key.includes('.') ? avatarDir : attachmentDir;
        return removeFile(path.join(directory, key));
    }
    try {
        await fileBucket().delete(key);
    } catch (error) {
        if (!error.message?.startsWith('File not found')) console.warn('Unable to remove a stored upload.');
    }
}

async function streamStoredUpload(key, res, next, options = {}) {
    if (!durable) {
        if (!options.name) return next();
        return res.download(path.join(attachmentDir, key), options.name, { headers: { 'Content-Type': 'application/octet-stream' } }, error => {
            if (error) next(error);
        });
    }
    const found = await fileBucket().find({ _id: key }, { limit: 1 }).next();
    if (!found) {
        return res.status(404).json({ error: 'الملف غير متاح للتنزيل' });
    }
    if (options.name) res.attachment(options.name);
    res.type(options.type || 'application/octet-stream');
    res.set('Content-Length', String(found.length));
    await pipeline(fileBucket().openDownloadStream(key), res);
}

async function avatarType(filePath) {
    const handle = await open(filePath, 'r');
    const bytes = Buffer.alloc(12);
    try {
        await handle.read(bytes, 0, bytes.length, 0);
    } finally {
        await handle.close();
    }
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
    if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'jpg';
    if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'gif';
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return null;
}

function uploadName(originalName, fallback) {
    let name = originalName;
    if (/^[\x00-\xff]+$/.test(name)) {
        try { name = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1')); } catch { /* Preserve the original name. */ }
    }
    return path.basename(name.replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255) || fallback;
}

module.exports = {
    avatarDir, legacyDir, attachmentMultipart, avatarMultipart, avatarType, uploadName, removeFile,
    durable, persistUpload, removeStoredUpload, streamStoredUpload
};
