const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDbConnection } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');

// Set up file storage for logos
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, './uploads/'); },
  filename: function (req, file, cb) { cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// Email Transporter (Mock / Ethereal or configurable via env)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    auth: {
        user: process.env.SMTP_USER || 'bernadine.fay@ethereal.email',
        pass: process.env.SMTP_PASS || 'TgxT63T7H3YvJ2N2C1' // Auto-generated test credentials
    }
});

// Register Business (Now handles passwords and file uploads)
router.post('/register', upload.single('logo'), async (req, res) => {
    try {
        const { id, type, ownerFirst, ownerLast, ownerEmail, ownerPhone, bizName, bizDesc, bizCity, bizState, bizWebsite, bizGST, categories, color, password } = req.body;
        
        if (!ownerEmail || !bizName || !ownerFirst || !password) {
            return res.status(400).json({ error: 'Missing required registration fields. Password is required.' });
        }

        const db = await getDbConnection();
        const existing = await db.get('SELECT id FROM users WHERE email = ?', [ownerEmail]);
        if (existing) return res.status(400).json({ error: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const logoUrl = req.file ? `/uploads/${req.file.filename}` : '';
        
        await db.run(
            'INSERT INTO users (id, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)',
            [id, ownerEmail, hashedPassword, 'business', 0]
        );

        let parsedCategories = [];
        try { parsedCategories = JSON.parse(categories); } catch(e) { parsedCategories = categories || []; }

        await db.run(
            `INSERT INTO business_profiles 
            (id, user_id, type, owner_first, owner_last, owner_phone, company_name, description, city, state, website, gst, categories, color, logo_url, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
            [id, id, type || 'individual', ownerFirst, ownerLast, ownerPhone, bizName, bizDesc || '', bizCity || '', bizState || '', bizWebsite || '', bizGST || '', JSON.stringify(parsedCategories), color || '#0d4040', logoUrl, 'pending']
        );

        transporter.sendMail({
            from: '"VentureHub Support" <support@venturehub.local>',
            to: ownerEmail,
            subject: 'Welcome to VentureHub - Registration Received',
            text: `Hi ${ownerFirst},\n\nWe have received your registration for ${bizName}. It is currently under review by our admin team.\n\nYou can log in and check your status anytime.`
        }).catch(err => console.error("Email failed, but registration succeeded: ", err));

        res.status(201).json({ message: 'Business registered successfully. Wait for admin verification.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Register Client (Customer)
router.post('/client-register', async (req, res) => {
    try {
        const { id, firstName, lastName, email, password } = req.body;
        if (!email || !password || !firstName) return res.status(400).json({ error: 'Missing required fields' });

        const db = await getDbConnection();
        const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) return res.status(400).json({ error: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);
        
        await db.run(
            'INSERT INTO users (id, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)',
            [id, email, hashedPassword, 'client', 1] // Clients are instantly verified
        );

        await db.run(
            'INSERT INTO client_profiles (id, user_id, first_name, last_name) VALUES (?, ?, ?, ?)',
            [id, id, firstName, lastName]
        );

        const token = jwt.sign({ id, role: 'client', is_verified: 1 }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ token, role: 'client', is_verified: 1, message: 'Client account created successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = await getDbConnection();

        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user.id, role: user.role, is_verified: user.is_verified }, process.env.JWT_SECRET, { expiresIn: '24h' });

        let bizId = null;
        let clientProfile = null;
        
        if (user.role === 'business') {
           const profile = await db.get('SELECT id as bizId FROM business_profiles WHERE user_id = ?', [user.id]);
           bizId = profile ? profile.bizId : null;
        } else if (user.role === 'client') {
           clientProfile = await db.get('SELECT * FROM client_profiles WHERE user_id = ?', [user.id]);
        }

        res.json({ token, role: user.role, is_verified: user.is_verified, bizId, clientProfile });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current profile
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const db = await getDbConnection();
        const user = await db.get('SELECT id, email, role, is_verified, created_at FROM users WHERE id = ?', [req.user.id]);
        
        if (user.role === 'business') {
            const profile = await db.get('SELECT * FROM business_profiles WHERE user_id = ?', [user.id]);
            if(profile && profile.categories) {
                try { profile.categories = JSON.parse(profile.categories); }
                catch(e) { profile.categories = []; }
            }
            return res.json({ ...user, profile });
        } else if (user.role === 'client') {
            const profile = await db.get('SELECT * FROM client_profiles WHERE user_id = ?', [user.id]);
            return res.json({ ...user, profile });
        }
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all businesses public info
router.get('/businesses', async (req, res) => {
    try {
        const db = await getDbConnection();
        const businesses = await db.all('SELECT * FROM business_profiles WHERE status = ?', ['approved']); // Only Public approved
        
        const formatted = businesses.map(b => {
            let cats = [];
            try { cats = JSON.parse(b.categories || '[]'); } catch(e) { cats = []; }
            return {
                id: b.id, ref: b.id, type: b.type,
                ownerFirst: b.owner_first, ownerLast: b.owner_last,
                ownerEmail: 'hidden@example.com', ownerPhone: b.owner_phone,
                bizName: b.company_name, bizDesc: b.description,
                bizCity: b.city, bizState: b.state, website: b.website,
                categories: cats,
                status: b.status, color: b.color, logoUrl: b.logo_url,
                isFeatured: b.is_featured === 1
            };
        });
        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
