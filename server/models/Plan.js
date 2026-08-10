const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    name: { type: String, required: true, enum: ['free', 'standard', 'pro', 'enterprise'] },
    maxMembers: { type: Number, required: true },
    maxProjects: { type: Number, required: true },
    maxFolders: { type: Number, default: 5 },
    price: { type: Number, default: 0 },
    features: [String],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);