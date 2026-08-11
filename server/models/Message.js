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
// ✅ Indexes
messageSchema.index({ channel: 1, createdAt: -1 });
messageSchema.index({ taskId: 1, createdAt: -1 });
messageSchema.index({ userId: 1 });
module.exports = mongoose.model('Message', messageSchema);