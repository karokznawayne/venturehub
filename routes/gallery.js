const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireVerifiedBusiness } = require('../middleware/auth');
const { createUploader } = require('../config/cloudinary');

const upload = createUploader('gallery');

// Public: Get gallery items for a business
router.get('/:businessId', async (req, res) => {
    try {
        const db = getDbConnection();
        const result = await db.execute({
            sql: 'SELECT * FROM gallery_items WHERE business_id = ? ORDER BY created_at DESC',
            args: [req.params.businessId]
        });
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Upload a gallery item
router.post('/', authenticateToken, requireVerifiedBusiness, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    try {
        const { caption } = req.body;
        const db = getDbConnection();
        const id = 'gal_' + Date.now();
        const imageUrl = req.file.path;

        await db.execute({
            sql: 'INSERT INTO gallery_items (id, business_id, image_url, caption) VALUES (?, ?, ?, ?)',
            args: [id, req.user.id, imageUrl, caption || '']
        });

        res.status(201).json({ id, image_url: imageUrl, message: 'Gallery item added' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Delete a gallery item
router.delete('/:id', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const db = getDbConnection();
        const result = await db.execute({
            sql: 'SELECT * FROM gallery_items WHERE id = ? AND business_id = ?',
            args: [req.params.id, req.user.id]
        });
        if (result.rows.length === 0) return res.status(404).json({ error: 'Gallery item not found' });

        await db.execute({ sql: 'DELETE FROM gallery_items WHERE id = ?', args: [req.params.id] });
        res.json({ message: 'Gallery item deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
