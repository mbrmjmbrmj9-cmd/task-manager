const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, default: '' },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    resetToken: String,
    resetTokenExpiry: Date,
    securityLog: [{
        action: String,
        ip: String,
        device: String,
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    avatar: { type: String, default: '' },
});
// ✅ Indexes
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
module.exports = mongoose.model('User', userSchema);