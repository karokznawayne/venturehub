const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Get all businesses (Admin view)
router.get('/businesses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDbConnection();
        const result = await db.execute('SELECT * FROM business_profiles');

        const formatted = await Promise.all(result.rows.map(async b => {
            let cats = [];
            try { cats = JSON.parse(b.categories || '[]'); } catch(e) { cats = []; }
            const userResult = await db.execute({ sql: 'SELECT email FROM users WHERE id = ?', args: [b.id] });
            return {
                id: b.id, ref: b.id, type: b.type,
                ownerFirst: b.owner_first, ownerLast: b.owner_last,
                ownerEmail: userResult.rows[0]?.email || 'unknown',
                ownerPhone: b.owner_phone,
                bizName: b.company_name, bizDesc: b.description,
                bizCity: b.city, bizState: b.state, website: b.website, gst: b.gst,
                categories: cats, status: b.status, color: b.color, logoUrl: b.logo_url,
                isFeatured: b.is_featured === 1, submittedAt: b.created_at
            };
        }));

        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update business verification & featured status
router.put('/businesses/:id/verify', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { isVerified, isFeatured } = req.body;
        const db = getDbConnection();

        if (isVerified !== undefined) {
            const newStatus = isVerified ? 'approved' : 'rejected';
            await db.execute({ sql: 'UPDATE users SET is_verified = ? WHERE id = ?', args: [isVerified ? 1 : 0, req.params.id] });
            await db.execute({ sql: 'UPDATE business_profiles SET status = ? WHERE id = ?', args: [newStatus, req.params.id] });
        }

        if (isFeatured !== undefined) {
            await db.execute({ sql: 'UPDATE users SET is_featured = ? WHERE id = ?', args: [isFeatured ? 1 : 0, req.params.id] });
            await db.execute({ sql: 'UPDATE business_profiles SET is_featured = ? WHERE id = ?', args: [isFeatured ? 1 : 0, req.params.id] });
        }

        res.json({ message: 'Business updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin Stats
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDbConnection();
        const [tb, ab, ts, tc, tl] = await Promise.all([
            db.execute('SELECT COUNT(*) as count FROM business_profiles'),
            db.execute('SELECT COUNT(*) as count FROM business_profiles WHERE status = "approved"'),
            db.execute('SELECT COUNT(*) as count FROM services'),
            db.execute('SELECT COUNT(*) as count FROM users WHERE role = "client"'),
            db.execute('SELECT SUM(likes) as count FROM services'),
        ]);

        res.json({
            totalBusinesses: tb.rows[0].count,
            approvedBusinesses: ab.rows[0].count,
            totalServices: ts.rows[0].count,
            totalClients: tc.rows[0].count,
            totalLikes: tl.rows[0].count || 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Category Management
router.get('/categories', async (req, res) => {
    try {
        const db = getDbConnection();
        const result = await db.execute('SELECT * FROM global_categories ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/categories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, icon, type } = req.body;
        const db = getDbConnection();
        const id = 'cat_' + Date.now();
        await db.execute({ sql: 'INSERT INTO global_categories (id, name, icon, type) VALUES (?, ?, ?, ?)', args: [id, name, icon, type || 'both'] });
        res.json({ id, message: 'Category added' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add category' });
    }
});

router.delete('/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDbConnection();
        await db.execute({ sql: 'DELETE FROM global_categories WHERE id = ?', args: [req.params.id] });
        res.json({ message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

module.exports = router;
