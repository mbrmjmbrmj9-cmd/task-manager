const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    plan: { type: String, default: 'free', enum: ['free', 'pro', 'business', 'enterprise'] },
    status: { type: String, default: 'active', enum: ['active', 'past_due', 'canceled', 'expired'] },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    trialEndsAt: { type: Date },
    amount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Subscription', subscriptionSchema);