const mongoose = require('mongoose');

const workflowSchema = new mongoose.Schema({
    name: { type: String, required: true },
    steps: [mongoose.Schema.Types.Mixed],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
// ✅ Indexes
workflowSchema.index({ userId: 1 });
module.exports = mongoose.model('Workflow', workflowSchema);
