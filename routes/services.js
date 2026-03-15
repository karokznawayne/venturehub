const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireVerifiedBusiness } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Image Upload setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, './uploads/'); },
  filename: function (req, file, cb) { cb(null, 'srv-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// Public: Get all services
router.get('/', async (req, res) => {
    try {
        const db = await getDbConnection();
        const services = await db.all(`
            SELECT s.* 
            FROM services s
            JOIN users u ON u.id = s.business_id
            WHERE u.is_verified = 1
        `);

        // Fetch review counts dynamically
        const formatted = await Promise.all(services.map(async s => {
            const reviewsCount = await db.get('SELECT COUNT(*) as c FROM evaluations WHERE service_id = ?', [s.id]);
            let categoriesList = [];
            try { 
                categoriesList = JSON.parse(s.categories || '[]'); 
                if (!Array.isArray(categoriesList)) categoriesList = s.category ? [s.category] : [];
            } catch(e) { 
                categoriesList = s.category ? [s.category] : [];
            }
            
            return {
                id: s.id,
                bizId: s.business_id,
                bizName: s.business_name,
                name: s.title,
                description: s.description,
                price: s.price,
                priceType: s.price_type,
                category: s.category,
                categories: categoriesList,
                emoji: s.emoji,
                likes: s.likes,
                comments: reviewsCount.c,
                likedBy: (() => { try { return JSON.parse(s.liked_by || '[]'); } catch(e) { return []; } })(),
                color: s.color,
                imageUrl: s.image_url,
                createdAt: s.created_at
            };
        }));

        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Create a new service (with image upload)
router.post('/', authenticateToken, requireVerifiedBusiness, upload.single('image'), async (req, res) => {
    try {
        const { id, bizId, bizName, name, description, price, priceType, category, categories, emoji, color, createdAt } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const db = await getDbConnection();
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';
        let parsedCategories = [];
        try { parsedCategories = JSON.parse(categories); } catch(e) { parsedCategories = categories || []; }

        await db.run(
            `INSERT INTO services (id, business_id, business_name, title, description, price, price_type, category, categories, emoji, color, created_at, image_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
            [id, bizId, bizName, name, description || '', price || 0, priceType || 'fixed', category || '', JSON.stringify(parsedCategories), emoji || '🛠️', color, createdAt, imageUrl]
        );

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
        const db = await getDbConnection();
        
        const service = await db.get('SELECT * FROM services WHERE id = ? AND business_id = ?', [req.params.id, req.user.id]);
        if (!service) return res.status(404).json({ error: 'Service not found' });

        let imageUrl = service.image_url;
        if (req.file) imageUrl = `/uploads/${req.file.filename}`;

        await db.run(
            'UPDATE services SET title = ?, description = ?, price = ?, price_type = ?, category = ?, emoji = ?, image_url = ? WHERE id = ?',
            [name || service.title, description !== undefined ? description : service.description, price !== undefined ? price : service.price, priceType || service.price_type, category || service.category, emoji || service.emoji, imageUrl, req.params.id]
        );

        res.json({ message: 'Service updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Delete a service
router.delete('/:id', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const db = await getDbConnection();
        const service = await db.get('SELECT * FROM services WHERE id = ? AND business_id = ?', [req.params.id, req.user.id]);
        if (!service) return res.status(404).json({ error: 'Service not found' });

        await db.run('DELETE FROM services WHERE id = ?', [req.params.id]);
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
        const db = await getDbConnection();
        
        const service = await db.get('SELECT * FROM services WHERE id = ?', [req.params.id]);
        if (!service) return res.status(404).json({ error: 'Service not found' });

        let likedBy = [];
        try { likedBy = JSON.parse(service.liked_by || '[]'); } catch(e) { likedBy = []; }
        let likes = service.likes || 0;

        if (action === 'like' && !likedBy.includes(userId)) {
            likedBy.push(userId);
            likes++;
        } else if (action === 'unlike') {
            likedBy = likedBy.filter(u => u !== userId);
            likes = Math.max(0, likes - 1);
        }

        await db.run('UPDATE services SET likes = ?, liked_by = ? WHERE id = ?', [likes, JSON.stringify(likedBy), req.params.id]);
        res.json({ likes, likedBy });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ======== REVIEWS (Evaluations) ========

// Public: Get reviews for a service
router.get('/:id/reviews', async (req, res) => {
    try {
        const db = await getDbConnection();
        const reviews = await db.all('SELECT * FROM evaluations WHERE service_id = ? ORDER BY created_at DESC', [req.params.id]);
        res.json(reviews);
    } catch(err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private (Client): Add a review
router.post('/:id/reviews', authenticateToken, upload.single('image'), async (req, res) => {
    if (req.user.role !== 'client') return res.status(403).json({ error: 'Only clients can submit reviews' });
    
    try {
        const { rating, comment } = req.body;
        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

        const db = await getDbConnection();
        const clientProfile = await db.get('SELECT first_name, last_name FROM client_profiles WHERE user_id = ?', [req.user.id]);
        const clientName = `${clientProfile.first_name} ${clientProfile.last_name}`;
        
        const evalId = 'rev_' + Date.now();
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        await db.run(
            'INSERT INTO evaluations (id, service_id, client_id, client_name, rating, comment, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [evalId, req.params.id, req.user.id, clientName, rating, comment || '', imageUrl]
        );
        
        // Also increment aggregate comments count 
        const service = await db.get('SELECT * FROM services WHERE id = ?', [req.params.id]);
        if(service) {
           await db.run('UPDATE services SET comments = ? WHERE id = ?', [(service.comments || 0) + 1, req.params.id]);
        }

        res.status(201).json({ message: 'Review added' });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
