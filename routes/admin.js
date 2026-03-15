const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Get all businesses (Admin view)
router.get('/businesses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = await getDbConnection();
        const businesses = await db.all('SELECT * FROM business_profiles');
        
        const formatted = businesses.map(b => {
            let cats = [];
            try { cats = JSON.parse(b.categories || '[]'); } catch(e) { cats = []; }
            return {
                id: b.id, ref: b.id, type: b.type,
                ownerFirst: b.owner_first, ownerLast: b.owner_last,
                ownerEmail: 'hidden@example.com', ownerPhone: b.owner_phone,
                bizName: b.company_name, bizDesc: b.description,
                bizCity: b.city, bizState: b.state, website: b.website,
                gst: b.gst,
                categories: cats,
                status: b.status, color: b.color, logoUrl: b.logo_url,
                isFeatured: b.is_featured === 1,
                submittedAt: b.created_at
            };
        });

        // Fetch emails from users table
        for (let b of formatted) {
            const user = await db.get('SELECT email FROM users WHERE id = ?', [b.id]);
            if (user) b.ownerEmail = user.email;
        }

        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update business verification & featured status (Admin action)
router.put('/businesses/:id/verify', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { isVerified, isFeatured } = req.body;
        const db = await getDbConnection();
        
        if (isVerified !== undefined) {
          const newStatus = isVerified ? 'approved' : 'rejected';
          await db.run('UPDATE users SET is_verified = ? WHERE id = ?', [isVerified ? 1 : 0, req.params.id]);
          await db.run('UPDATE business_profiles SET status = ? WHERE id = ?', [newStatus, req.params.id]);
        }
        
        if (isFeatured !== undefined) {
          await db.run('UPDATE users SET is_featured = ? WHERE id = ?', [isFeatured ? 1 : 0, req.params.id]);
          await db.run('UPDATE business_profiles SET is_featured = ? WHERE id = ?', [isFeatured ? 1 : 0, req.params.id]);
        }

        res.json({ message: 'Business updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin Analytics Stats Endpoint
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = await getDbConnection();
        
        const totalBusinesses = await db.get('SELECT COUNT(*) as count FROM business_profiles');
        const approvedBusinesses = await db.get('SELECT COUNT(*) as count FROM business_profiles WHERE status = "approved"');
        const totalServices = await db.get('SELECT COUNT(*) as count FROM services');
        const totalClients = await db.get('SELECT COUNT(*) as count FROM users WHERE role = "client"');
        const totalLikes = await db.get('SELECT SUM(likes) as count FROM services');
        
        res.json({
           totalBusinesses: totalBusinesses.count,
           approvedBusinesses: approvedBusinesses.count,
           totalServices: totalServices.count,
           totalClients: totalClients.count,
           totalLikes: totalLikes.count || 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Category Management
router.get('/categories', async (req, res) => {
    try {
        const db = await getDbConnection();
        const categories = await db.all('SELECT * FROM global_categories ORDER BY name ASC');
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/categories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, icon, type } = req.body;
        const db = await getDbConnection();
        const id = 'cat_' + Date.now();
        await db.run('INSERT INTO global_categories (id, name, icon, type) VALUES (?, ?, ?, ?)', [id, name, icon, type || 'both']);
        res.json({ id, message: 'Category added' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add category' });
    }
});

router.delete('/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = await getDbConnection();
        await db.run('DELETE FROM global_categories WHERE id = ?', [req.params.id]);
        res.json({ message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

module.exports = router;
