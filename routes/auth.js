const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDbConnection } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { createUploader } = require('../config/cloudinary');
const nodemailer = require('nodemailer');

const upload = createUploader('logos');

// Email Transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    auth: {
        user: process.env.SMTP_USER || 'bernadine.fay@ethereal.email',
        pass: process.env.SMTP_PASS || 'TgxT63T7H3YvJ2N2C1'
    }
});

// Register Business
router.post('/register', upload.single('logo'), async (req, res) => {
    try {
        const { id, type, ownerFirst, ownerLast, ownerEmail, ownerPhone, bizName, bizDesc, bizCity, bizState, bizWebsite, bizGST, categories, color, password } = req.body;

        if (!ownerEmail || !bizName || !ownerFirst || !password) {
            return res.status(400).json({ error: 'Missing required registration fields.' });
        }

        const db = getDbConnection();
        const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [ownerEmail] });
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const logoUrl = req.file ? req.file.path : '';

        await db.execute({
            sql: 'INSERT INTO users (id, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)',
            args: [id, ownerEmail, hashedPassword, 'business', 0]
        });

        let parsedCategories = [];
        try { parsedCategories = JSON.parse(categories); } catch(e) { parsedCategories = categories || []; }

        await db.execute({
            sql: `INSERT INTO business_profiles (id, user_id, type, owner_first, owner_last, owner_phone, company_name, description, city, state, website, gst, categories, color, logo_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [id, id, type || 'individual', ownerFirst, ownerLast, ownerPhone, bizName, bizDesc || '', bizCity || '', bizState || '', bizWebsite || '', bizGST || '', JSON.stringify(parsedCategories), color || '#0d4040', logoUrl, 'pending']
        });

        transporter.sendMail({
            from: '"VentureHub Support" <support@venturehub.local>',
            to: ownerEmail,
            subject: 'Welcome to VentureHub - Registration Received',
            text: `Hi ${ownerFirst},\n\nWe received your registration for ${bizName}. It is under review by our admin team.`
        }).catch(err => console.error("Email failed:", err));

        res.status(201).json({ message: 'Business registered successfully. Wait for admin verification.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Register Client
router.post('/client-register', async (req, res) => {
    try {
        const { id, firstName, lastName, email, password } = req.body;
        if (!email || !password || !firstName) return res.status(400).json({ error: 'Missing required fields' });

        const db = getDbConnection();
        const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.execute({
            sql: 'INSERT INTO users (id, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)',
            args: [id, email, hashedPassword, 'client', 1]
        });

        await db.execute({
            sql: 'INSERT INTO client_profiles (id, user_id, first_name, last_name) VALUES (?, ?, ?, ?)',
            args: [id, id, firstName, lastName]
        });

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
        const db = getDbConnection();

        const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user.id, role: user.role, is_verified: user.is_verified }, process.env.JWT_SECRET, { expiresIn: '24h' });

        let bizId = null;
        let clientProfile = null;

        if (user.role === 'business') {
            const profileResult = await db.execute({ sql: 'SELECT id as bizId FROM business_profiles WHERE user_id = ?', args: [user.id] });
            bizId = profileResult.rows[0] ? profileResult.rows[0].bizId : null;
        } else if (user.role === 'client') {
            const cpResult = await db.execute({ sql: 'SELECT * FROM client_profiles WHERE user_id = ?', args: [user.id] });
            clientProfile = cpResult.rows[0] || null;
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
        const db = getDbConnection();
        const result = await db.execute({ sql: 'SELECT id, email, role, is_verified, created_at FROM users WHERE id = ?', args: [req.user.id] });
        const user = result.rows[0];

        if (user.role === 'business') {
            const profileResult = await db.execute({ sql: 'SELECT * FROM business_profiles WHERE user_id = ?', args: [user.id] });
            const profile = profileResult.rows[0];
            if (profile && profile.categories) {
                try { profile.categories = JSON.parse(profile.categories); } catch(e) { profile.categories = []; }
            }
            return res.json({ ...user, profile });
        } else if (user.role === 'client') {
            const profileResult = await db.execute({ sql: 'SELECT * FROM client_profiles WHERE user_id = ?', args: [user.id] });
            return res.json({ ...user, profile: profileResult.rows[0] });
        }
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all approved businesses (public)
router.get('/businesses', async (req, res) => {
    try {
        const db = getDbConnection();
        const result = await db.execute({ sql: 'SELECT * FROM business_profiles WHERE status = ?', args: ['approved'] });

        const formatted = result.rows.map(b => {
            let cats = [];
            try { cats = JSON.parse(b.categories || '[]'); } catch(e) { cats = []; }
            return {
                id: b.id, ref: b.id, type: b.type,
                ownerFirst: b.owner_first, ownerLast: b.owner_last,
                ownerEmail: 'hidden@example.com', ownerPhone: b.owner_phone,
                bizName: b.company_name, bizDesc: b.description,
                bizCity: b.city, bizState: b.state, website: b.website,
                categories: cats, status: b.status, color: b.color,
                logoUrl: b.logo_url, isFeatured: b.is_featured === 1
            };
        });
        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
