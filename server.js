const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// ========== Configuration ==========
const app = express();
const PORT = 3000;
const JWT_SECRET = 'taskapp_super_secret_key_2025';

// ========== MongoDB Atlas Connection ==========
const MONGO_URI = 'mongodb+srv://admin:Admin12345@cluster0.gnndcfh.mongodb.net/taskmanager?retryWrites=true&w=majority';
// ⚠️ Replace with your actual MongoDB Atlas connection string!

// ========== Middleware ==========
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== Database Connection ==========
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بقاعدة البيانات MongoDB Atlas'))
    .catch(err => console.error('❌ خطأ في الاتصال:', err));

// ========== Mongoose Schemas ==========
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    text: { type: String, required: true },
    category: { type: String, default: 'default' },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);

// ========== Authentication Middleware ==========
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'جلسة غير صالحة' });
        }
        req.user = user;
        next();
    });
}

// ========== Auth Routes ==========

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();

        res.status(201).json({ message: 'تم إنشاء الحساب بنجاح' });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const token = jwt.sign(
            { id: user._id.toString(), username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { id: user._id.toString(), username: user.username }
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ========== Task Routes (Protected) ==========

// Get all tasks for user
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const tasks = await Task.find({ userId: req.user.id });
        res.json(tasks);
    } catch (err) {
        console.error('Fetch Tasks Error:', err);
        res.status(500).json({ error: 'خطأ في جلب المهام' });
    }
});

// Create task
app.post('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const { text, category } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'نص المهمة مطلوب' });
        }

        const task = new Task({
            userId: req.user.id,
            text,
            category: category || 'default'
        });
        await task.save();

        res.status(201).json(task);
    } catch (err) {
        console.error('Create Task Error:', err);
        res.status(500).json({ error: 'خطأ في إضافة المهمة' });
    }
});

// Update task
app.patch('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const task = await Task.findOne({
            _id: req.params.id,
            userId: req.user.id
        });
        
        if (!task) {
            return res.status(404).json({ error: 'مهمة غير موجودة' });
        }

        if (req.body.completed !== undefined) task.completed = req.body.completed;
        if (req.body.text !== undefined) task.text = req.body.text;
        if (req.body.category !== undefined) task.category = req.body.category;
        
        await task.save();
        res.json(task);
    } catch (err) {
        console.error('Update Task Error:', err);
        res.status(500).json({ error: 'خطأ في تحديث المهمة' });
    }
});

// Delete task
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const task = await Task.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id
        });
        
        if (!task) {
            return res.status(404).json({ error: 'مهمة غير موجودة' });
        }
        
        res.json({ message: 'تم حذف المهمة' });
    } catch (err) {
        console.error('Delete Task Error:', err);
        res.status(500).json({ error: 'خطأ في حذف المهمة' });
    }
});

// ========== Admin Routes ==========
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin@2025';

// Admin Login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'بيانات المدير غير صحيحة' });
        }
        
        const token = jwt.sign(
            { id: 'admin', username: 'admin', role: 'admin' },
            JWT_SECRET,
            { expiresIn: '1d' }
        );
        
        res.json({ token });
    } catch (err) {
        console.error('Admin Login Error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Admin Stats
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        const totalUsers = await User.countDocuments();
        const totalTasks = await Task.countDocuments();
        const completedTasks = await Task.countDocuments({ completed: true });
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const usersToday = await User.countDocuments({ createdAt: { $gte: today } });

        const users = await User.find().select('username createdAt').lean();
        const usersWithTaskCount = await Promise.all(
            users.map(async u => ({
                username: u.username,
                taskCount: await Task.countDocuments({ userId: u._id.toString() }),
                createdAt: u.createdAt
            }))
        );

        const recentTasks = await Task.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        res.json({
            totalUsers,
            totalTasks,
            completedTasks,
            usersToday,
            users: usersWithTaskCount,
            recentTasks
        });
    } catch (err) {
        console.error('Admin Stats Error:', err);
        res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
});

// ========== Start Server ==========
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});