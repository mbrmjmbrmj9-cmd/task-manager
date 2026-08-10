const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: { type: String, default: 'completed', enum: ['pending', 'completed', 'failed'] },
    method: { type: String, default: 'manual' },
    invoiceNumber: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);