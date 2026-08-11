/**
 * اختبارات API الأساسية لنظام Nivora
 * للتشغيل: npm test
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// ========== إعداد التطبيق للاختبار ==========

// استيراد Routes
const authRoutes = require('../server/routes/auth');
const tasksRoutes = require('../server/routes/tasks');
const projectsRoutes = require('../server/routes/projects');
const workspacesRoutes = require('../server/routes/workspaces');

// إنشاء تطبيق Express للاختبار
const app = express();
app.use(express.json());

// تسجيل Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/workspaces', workspacesRoutes);

// معالج أخطاء بسيط للاختبارات
app.use((err, req, res, next) => {
    console.error('خطأ في الاختبار:', err);
    res.status(err.status || 500).json({ error: err.message || 'خطأ في الخادم' });
});

// ========== إعداد قاعدة البيانات للاختبار ==========
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://almbrmjbrmjh60_db_user:wMg3WypI25E3XpWb@taskmanager.renf2sl.mongodb.net/nivora_test?retryWrites=true&w=majority';

let testToken = '';
let testUserId = '';

beforeAll(async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ متصل بقاعدة بيانات الاختبار');
        
        // إنشاء مستخدم اختبار أو تسجيل الدخول
        const User = require('../server/models/User');
        const bcrypt = require('bcryptjs');
        
        let user = await User.findOne({ username: 'test@test.com' });
        if (!user) {
            const hashedPassword = await bcrypt.hash('password123', 10);
            user = await User.create({
                username: 'test@test.com',
                password: hashedPassword,
                fullName: 'مستخدم اختبار',
                email: 'test@test.com'
            });
        }
        
        testUserId = user._id.toString();
        
        // إنشاء JWT للاختبارات
        testToken = jwt.sign(
            { id: user._id, username: user.username },
            'nivora_secret_2025',
            { expiresIn: '7d' }
        );
    } catch (err) {
        console.error('خطأ في إعداد الاختبارات:', err);
    }
});

afterAll(async () => {
    try {
        // تنظيف بيانات الاختبار
        const Task = require('../server/models/Task');
        await Task.deleteMany({ userId: testUserId });
        
        await mongoose.connection.close();
        console.log('✅ تم إغلاق اتصال قاعدة البيانات');
    } catch (err) {
        console.error('خطأ في تنظيف الاختبارات:', err);
    }
});

// ========== الاختبارات ==========

describe('Nivora API Tests', () => {
    
    // ========== Auth Routes ==========
    describe('Auth Routes', () => {
        
        test('GET /api/auth/profile - يجب جلب الملف الشخصي', async () => {
            const response = await request(app)
                .get('/api/auth/profile')
                .set('Authorization', `Bearer ${testToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.username).toBe('test@test.com');
        });
        
        test('POST /api/auth/login - يجب رفض كلمة مرور خاطئة', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'test@test.com',
                    password: 'wrongpassword'
                });
            
            expect(response.status).toBe(400);
            expect(response.body.error).toBeDefined();
        });
        
        test('POST /api/auth/login - يجب تسجيل الدخول بنجاح', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'test@test.com',
                    password: 'password123'
                });
            
            expect(response.status).toBe(200);
            expect(response.body.token).toBeDefined();
        });
        
        test('POST /api/auth/register - يجب رفض مستخدم موجود', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'test@test.com',
                    password: 'password123',
                    fullName: 'مستخدم اختبار'
                });
            
            expect(response.status).toBe(400);
        });
    });
    
    // ========== Tasks Routes ==========
    describe('Tasks Routes', () => {
        let createdTaskId = '';
        
        test('GET /api/tasks - يجب جلب المهام (فارغة أو بها بيانات)', async () => {
            const response = await request(app)
                .get('/api/tasks')
                .set('Authorization', `Bearer ${testToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.data || response.body).toBeDefined();
        });
        
        test('POST /api/tasks - يجب إنشاء مهمة جديدة', async () => {
            const response = await request(app)
                .post('/api/tasks')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    title: 'مهمة اختبارية',
                    description: 'وصف المهمة الاختبارية',
                    priority: 'medium',
                    status: 'new'
                });
            
            expect(response.status).toBe(201);
            expect(response.body.title).toBe('مهمة اختبارية');
            expect(response.body._id).toBeDefined();
            
            createdTaskId = response.body._id;
        });
        
        test('POST /api/tasks - يجب رفض مهمة بدون عنوان', async () => {
            const response = await request(app)
                .post('/api/tasks')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    priority: 'high'
                });
            
            expect(response.status).toBe(400);
            expect(response.body.error).toBeDefined();
        });
        
        test('GET /api/tasks/:id - يجب جلب مهمة محددة', async () => {
            if (!createdTaskId) return;
            
            const response = await request(app)
                .get(`/api/tasks/${createdTaskId}`)
                .set('Authorization', `Bearer ${testToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body._id).toBe(createdTaskId);
        });
        
        test('PATCH /api/tasks/:id - يجب تحديث مهمة', async () => {
            if (!createdTaskId) return;
            
            const response = await request(app)
                .patch(`/api/tasks/${createdTaskId}`)
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    status: 'in-progress',
                    priority: 'high'
                });
            
            expect(response.status).toBe(200);
            expect(response.body.status).toBe('in-progress');
        });
        
        test('DELETE /api/tasks/:id - يجب حذف مهمة', async () => {
            if (!createdTaskId) return;
            
            const response = await request(app)
                .delete(`/api/tasks/${createdTaskId}`)
                .set('Authorization', `Bearer ${testToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.message).toBeDefined();
        });
        
        test('GET /api/tasks/:id - يجب إرجاع 404 لمهمة محذوفة', async () => {
            if (!createdTaskId) return;
            
            const response = await request(app)
                .get(`/api/tasks/${createdTaskId}`)
                .set('Authorization', `Bearer ${testToken}`);
            
            expect(response.status).toBe(404);
        });
    });
    
    // ========== Projects Routes ==========
    describe('Projects Routes', () => {
        let createdProjectId = '';
        
        test('GET /api/projects - يجب جلب المشاريع', async () => {
            const response = await request(app)
                .get('/api/projects')
                .set('Authorization', `Bearer ${testToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.data || response.body).toBeDefined();
        });
        
        test('POST /api/projects - يجب إنشاء مشروع جديد', async () => {
            const response = await request(app)
                .post('/api/projects')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    name: 'مشروع اختباري',
                    description: 'وصف المشروع',
                    color: '#2563EB'
                });
            
            expect(response.status).toBe(201);
            expect(response.body.name).toBe('مشروع اختباري');
            
            createdProjectId = response.body._id;
        });
        
        test('DELETE /api/projects/:id - يجب حذف مشروع', async () => {
            if (!createdProjectId) return;
            
            const response = await request(app)
                .delete(`/api/projects/${createdProjectId}`)
                .set('Authorization', `Bearer ${testToken}`);
            
            expect(response.status).toBe(200);
        });
    });
    
    // ========== Workspaces Routes ==========
    describe('Workspaces Routes', () => {
        
        test('GET /api/workspaces - يجب جلب مساحات العمل', async () => {
            const response = await request(app)
                .get('/api/workspaces')
                .set('Authorization', `Bearer ${testToken}`);
            
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });
    });
    
    // ========== صلاحيات ==========
    describe('Authorization Tests', () => {
        
        test('GET /api/tasks - يجب رفض طلب بدون Token', async () => {
            const response = await request(app)
                .get('/api/tasks');
            
            expect(response.status).toBe(401);
            expect(response.body.error).toBeDefined();
        });
        
        test('GET /api/tasks - يجب رفض Token غير صالح', async () => {
            const response = await request(app)
                .get('/api/tasks')
                .set('Authorization', 'Bearer invalid_token_here');
            
            expect(response.status).toBe(403);
        });
        
        test('PATCH /api/tasks/:id - يجب رفض تحديث مهمة غير موجودة', async () => {
            const fakeId = '507f1f77bcf86cd799439011'; // ObjectId وهمي
            const response = await request(app)
                .patch(`/api/tasks/${fakeId}`)
                .set('Authorization', `Bearer ${testToken}`)
                .send({ status: 'done' });
            
            expect(response.status).toBe(404);
        });
    });
});