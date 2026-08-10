const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    name: { type: String, required: true },
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

module.exports = mongoose.model('Template', templateSchema);