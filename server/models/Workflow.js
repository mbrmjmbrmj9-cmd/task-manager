const mongoose = require('mongoose');

const workflowSchema = new mongoose.Schema({
    name: { type: String, required: true },
    steps: [{ type: String }],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Workflow', workflowSchema);