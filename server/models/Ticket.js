const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    priority: { type: String, default: 'medium', enum: ['low', 'medium', 'high', 'urgent'] },
    status: { type: String, default: 'open', enum: ['open', 'in_progress', 'resolved', 'closed'] },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ticket', ticketSchema);