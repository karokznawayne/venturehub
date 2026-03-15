const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireVerifiedBusiness } = require('../middleware/auth');
const { createUploader } = require('../config/cloudinary');

const upload = createUploader('services');

// Public: Get all services
router.get('/', async (req, res) => {
    try {
        const db = getDbConnection();
        const result = await db.execute(`
            SELECT s.* FROM services s
            JOIN users u ON u.id = s.business_id
            WHERE u.is_verified = 1
        `);
        const services = result.rows;

        const formatted = await Promise.all(services.map(async s => {
            const revResult = await db.execute({ sql: 'SELECT COUNT(*) as c FROM evaluations WHERE service_id = ?', args: [s.id] });
            let categoriesList = [];
            try {
                categoriesList = JSON.parse(s.categories || '[]');
                if (!Array.isArray(categoriesList)) categoriesList = s.category ? [s.category] : [];
            } catch(e) { categoriesList = s.category ? [s.category] : []; }

            return {
                id: s.id, bizId: s.business_id, bizName: s.business_name,
                name: s.title, description: s.description,
                price: s.price, priceType: s.price_type,
                category: s.category, categories: categoriesList,
                emoji: s.emoji, likes: s.likes,
                comments: revResult.rows[0].c,
                likedBy: (() => { try { return JSON.parse(s.liked_by || '[]'); } catch(e) { return []; } })(),
                color: s.color, imageUrl: s.image_url, createdAt: s.created_at
            };
        }));

        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Create a new service
router.post('/', authenticateToken, requireVerifiedBusiness, upload.single('image'), async (req, res) => {
    try {
        const { id, bizId, bizName, name, description, price, priceType, category, categories, emoji, color, createdAt } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const db = getDbConnection();
        const imageUrl = req.file ? req.file.path : '';
        let parsedCategories = [];
        try { parsedCategories = JSON.parse(categories); } catch(e) { parsedCategories = categories || []; }

        await db.execute({
            sql: `INSERT INTO services (id, business_id, business_name, title, description, price, price_type, category, categories, emoji, color, created_at, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [id, bizId, bizName, name, description || '', price || 0, priceType || 'fixed', category || '', JSON.stringify(parsedCategories), emoji || '🛠️', color, createdAt, imageUrl]
        });

        res.status(201).json({ id, message: 'Service created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Update a service
router.put('/:id', authenticateToken, requireVerifiedBusiness, upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, priceType, category, emoji } = req.body;
        const db = getDbConnection();

        const svcResult = await db.execute({ sql: 'SELECT * FROM services WHERE id = ? AND business_id = ?', args: [req.params.id, req.user.id] });
        const service = svcResult.rows[0];
        if (!service) return res.status(404).json({ error: 'Service not found' });

        const imageUrl = req.file ? req.file.path : service.image_url;

        await db.execute({
            sql: 'UPDATE services SET title = ?, description = ?, price = ?, price_type = ?, category = ?, emoji = ?, image_url = ? WHERE id = ?',
            args: [name || service.title, description !== undefined ? description : service.description, price !== undefined ? price : service.price, priceType || service.price_type, category || service.category, emoji || service.emoji, imageUrl, req.params.id]
        });

        res.json({ message: 'Service updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Delete a service
router.delete('/:id', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const db = getDbConnection();
        const svcResult = await db.execute({ sql: 'SELECT * FROM services WHERE id = ? AND business_id = ?', args: [req.params.id, req.user.id] });
        if (svcResult.rows.length === 0) return res.status(404).json({ error: 'Service not found' });

        await db.execute({ sql: 'DELETE FROM services WHERE id = ?', args: [req.params.id] });
        res.json({ message: 'Service deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Public: Like a service
router.post('/:id/like', async (req, res) => {
    try {
        const { action, userId } = req.body;
        const db = getDbConnection();

        const svcResult = await db.execute({ sql: 'SELECT * FROM services WHERE id = ?', args: [req.params.id] });
        const service = svcResult.rows[0];
        if (!service) return res.status(404).json({ error: 'Service not found' });

        let likedBy = [];
        try { likedBy = JSON.parse(service.liked_by || '[]'); } catch(e) { likedBy = []; }
        let likes = service.likes || 0;

        if (action === 'like' && !likedBy.includes(userId)) { likedBy.push(userId); likes++; }
        else if (action === 'unlike') { likedBy = likedBy.filter(u => u !== userId); likes = Math.max(0, likes - 1); }

        await db.execute({ sql: 'UPDATE services SET likes = ?, liked_by = ? WHERE id = ?', args: [likes, JSON.stringify(likedBy), req.params.id] });
        res.json({ likes, likedBy });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get reviews for a service
router.get('/:id/reviews', async (req, res) => {
    try {
        const db = getDbConnection();
        const result = await db.execute({ sql: 'SELECT * FROM evaluations WHERE service_id = ? ORDER BY created_at DESC', args: [req.params.id] });
        res.json(result.rows);
    } catch(err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Client: Add a review
router.post('/:id/reviews', authenticateToken, upload.single('image'), async (req, res) => {
    if (req.user.role !== 'client') return res.status(403).json({ error: 'Only clients can submit reviews' });
    try {
        const { rating, comment } = req.body;
        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1–5' });

        const db = getDbConnection();
        const cpResult = await db.execute({ sql: 'SELECT first_name, last_name FROM client_profiles WHERE user_id = ?', args: [req.user.id] });
        const clientName = `${cpResult.rows[0].first_name} ${cpResult.rows[0].last_name}`;
        const evalId = 'rev_' + Date.now();
        const imageUrl = req.file ? req.file.path : null;

        await db.execute({
            sql: 'INSERT INTO evaluations (id, service_id, client_id, client_name, rating, comment, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
            args: [evalId, req.params.id, req.user.id, clientName, rating, comment || '', imageUrl]
        });

        const svcResult = await db.execute({ sql: 'SELECT comments FROM services WHERE id = ?', args: [req.params.id] });
        if (svcResult.rows[0]) {
            await db.execute({ sql: 'UPDATE services SET comments = ? WHERE id = ?', args: [(svcResult.rows[0].comments || 0) + 1, req.params.id] });
        }

        res.status(201).json({ message: 'Review added' });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
