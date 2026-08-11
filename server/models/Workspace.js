const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
        joinedAt: { type: Date, default: Date.now }
    }],
    inviteCode: { type: String, unique: true },
    plan: { type: String, default: 'free', enum: ['free', 'standard', 'pro', 'enterprise'] },
    maxMembers: { type: Number, default: 3 },
    maxProjects: { type: Number, default: 5 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
// ✅ Indexes
workspaceSchema.index({ 'members.userId': 1 });
workspaceSchema.index({ inviteCode: 1 });
workspaceSchema.index({ ownerId: 1 });
module.exports = mongoose.model('Workspace', workspaceSchema);