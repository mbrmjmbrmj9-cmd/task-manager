const mongoose = require('mongoose');
const Plan = require('../models/Plan');

const plans = [
    { name: 'free', maxMembers: 3, maxProjects: 5, maxFolders: 5, price: 0, features: ['مهام غير محدودة', 'Kanban Board', 'تقويم'] },
    { name: 'standard', maxMembers: 10, maxProjects: 100, maxFolders: 100, price: 9.99, features: ['كل مميزات Free', 'Workflows مخصصة', 'تبعية المهام', 'دعم بريدي'] },
    { name: 'pro', maxMembers: 30, maxProjects: 1000, maxFolders: 1000, price: 29.99, features: ['كل مميزات Standard', 'Time Tracking', 'Gantt Chart', 'API Access'] },
    { name: 'enterprise', maxMembers: 999, maxProjects: 9999, maxFolders: 9999, price: 99.99, features: ['كل مميزات Pro', 'دعم 24/7', 'AI Assistant', 'Custom Fields'] }
];

async function seed() {
    await Plan.deleteMany({});
    await Plan.insertMany(plans);
    console.log('✅ تم إضافة الخطط');
    process.exit();
}

mongoose.connect('mongodb+srv://almbrmjbrmjh60_db_user:wMg3WypI25E3XpWb@taskmanager.renf2sl.mongodb.net/mahami?retryWrites=true&w=majority')
    .then(() => seed());