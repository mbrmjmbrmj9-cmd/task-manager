const mongoose = require('mongoose');
const Plan = require('../models/Plan');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://almbrmjbrmjh60_db_user:wMg3WypI25E3XpWb@taskmanager.renf2sl.mongodb.net/nivora?retryWrites=true&w=majority';

const plans = [
    { 
        name: 'free', 
        maxMembers: 3, 
        maxProjects: 5, 
        maxFolders: 5, 
        price: 0, 
        features: ['مهام غير محدودة', 'Kanban Board', 'تقويم', 'Chat أساسي'] 
    },
    { 
        name: 'standard', 
        maxMembers: 10, 
        maxProjects: 100, 
        maxFolders: 100, 
        price: 9.99, 
        features: ['كل مميزات Free', 'Workflows مخصصة', 'تبعية المهام', 'دعم بريدي', 'Gantt Chart'] 
    },
    { 
        name: 'pro', 
        maxMembers: 30, 
        maxProjects: 1000, 
        maxFolders: 1000, 
        price: 29.99, 
        features: ['كل مميزات Standard', 'Time Tracking', 'API Access', 'تقارير متقدمة', 'Cloud Storage'] 
    },
    { 
        name: 'enterprise', 
        maxMembers: 999, 
        maxProjects: 9999, 
        maxFolders: 9999, 
        price: 99.99, 
        features: ['كل مميزات Pro', 'دعم 24/7', 'AI Assistant', 'Custom Fields', 'SSO', 'Audit Logs'] 
    }
];

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ متصل بقاعدة البيانات: nivora');
        
        await Plan.deleteMany({});
        await Plan.insertMany(plans);
        console.log('✅ تم إضافة الخطط بنجاح');
        console.log(`✅ عدد الخطط: ${plans.length}`);
        
        process.exit(0);
    } catch (err) {
        console.error('❌ خطأ في بذرة البيانات:', err);
        process.exit(1);
    }
}

seed();