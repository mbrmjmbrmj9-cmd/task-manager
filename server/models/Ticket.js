const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, default: 'المدير' },
    text: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    contact: {
        type: new mongoose.Schema({ name: String, phone: String, email: String }, { _id: false }),
        default: undefined
    },
    priority: { type: String, default: 'medium', enum: ['low', 'medium', 'high', 'urgent'] },
    status: { type: String, default: 'open', enum: ['open', 'in_progress', 'resolved', 'closed'] },
    replies: [replySchema]
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);
