const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://almbrmjbrmjh60_db_user:wMg3WypI25E3XpWb@taskmanager.renf2sl.mongodb.net/nivora?retryWrites=true&w=majority';

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ متصل بقاعدة البيانات');
    } catch (err) {
        console.error('❌ خطأ في الاتصال:', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;