const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    color: { type: String, default: '#2563EB' },
    status: { type: String, default: 'active' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);