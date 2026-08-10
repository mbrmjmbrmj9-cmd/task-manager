const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    text: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String },
    projectId: { type: String, default: '' },
    taskId: { type: String, default: '' },
    channel: { type: String, default: 'عام' },
    replyTo: { type: String, default: '' },
    fileUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);