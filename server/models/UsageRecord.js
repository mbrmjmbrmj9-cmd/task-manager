const mongoose = require('mongoose');

const usageRecordSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    metric: { type: String, required: true },
    value: { type: Number, default: 0 },
    recordedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UsageRecord', usageRecordSchema);