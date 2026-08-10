const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, default: 'active', enum: ['active', 'completed', 'archived'] },
    color: { type: String, default: '#2563EB' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);