const mongoose = require('mongoose');

const featureFlagSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    description: { type: String, default: '' },
    organizations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FeatureFlag', featureFlagSchema);