require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error('❌ MONGODB_URI غير موجود في .env');
    process.exit(1);
}

async function discoverCollections() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ متصل بقاعدة البيانات\n');

        const collections = await mongoose.connection.db.listCollections().toArray();
        
        console.log('═══════════════════════════════');
        console.log(`📊 إجمالي Collections: ${collections.length}\n`);
        
        const names = collections.map(c => c.name).sort();
        
        names.forEach(name => {
            console.log(`📁 ${name}`);
        });
        
        console.log('\n═══════════════════════════════');
        console.log('✅ اكتمل الاكتشاف');
        
        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ خطأ:', err.message);
        process.exit(1);
    }
}

discoverCollections();