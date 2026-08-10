const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    plan: { type: String, default: 'free' },
    status: { type: String, default: 'active', enum: ['active', 'suspended', 'expired'] },
    trialEndsAt: { type: Date },
    subscriptionEndsAt: { type: Date },
    maxUsers: { type: Number, default: 3 },
    maxProjects: { type: Number, default: 5 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Organization', organizationSchema);