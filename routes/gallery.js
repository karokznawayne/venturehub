const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireVerifiedBusiness } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Setup for gallery images
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, './uploads/'); },
  filename: function (req, file, cb) { cb(null, 'gal-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// Public: Get gallery items for a business
router.get('/:businessId', async (req, res) => {
    try {
        const db = await getDbConnection();
        const items = await db.all(
            'SELECT * FROM gallery_items WHERE business_id = ? ORDER BY created_at DESC',
            [req.params.businessId]
        );
        res.json(items);
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
        const db = await getDbConnection();
        const id = 'gal_' + Date.now();
        const imageUrl = `/uploads/${req.file.filename}`;

        await db.run(
            'INSERT INTO gallery_items (id, business_id, image_url, caption) VALUES (?, ?, ?, ?)',
            [id, req.user.id, imageUrl, caption || '']
        );

        res.status(201).json({ id, image_url: imageUrl, message: 'Gallery item added' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Delete a gallery item
router.delete('/:id', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const db = await getDbConnection();
        const item = await db.get('SELECT * FROM gallery_items WHERE id = ? AND business_id = ?', [req.params.id, req.user.id]);
        if (!item) return res.status(404).json({ error: 'Gallery item not found' });

        await db.run('DELETE FROM gallery_items WHERE id = ?', [req.params.id]);
        res.json({ message: 'Gallery item deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
