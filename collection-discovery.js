const { databaseUri } = require('./server/config/env');
const mongoose = require('mongoose');

async function discoverCollections() {
    try {
        await mongoose.connect(databaseUri());
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
        console.error('❌ خطأ:', err.name);
        process.exit(1);
    }
}

discoverCollections();