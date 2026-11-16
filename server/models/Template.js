const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'general' },
    icon: { type: String, default: '📋' },
    color: { type: String, default: '#2563EB' },
    tasks: [{
        title: String,
        description: String,
        priority: { type: String, default: 'medium' },
        status: { type: String, default: 'new' },
        checklist: [{ text: String, done: Boolean }]
    }],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});
// ✅ Indexes
templateSchema.index({ userId: 1 });
module.exports = mongoose.model('Template', templateSchema);
