const mongoose = require('mongoose');
const { databaseUri } = require('./env');

module.exports = function connectDB() {
    return mongoose.connect(databaseUri(), { serverSelectionTimeoutMS: 10000 });
};
