const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireVerifiedBusiness } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Setup for product images
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, './uploads/'); },
  filename: function (req, file, cb) { cb(null, 'prd-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// Public: Get all products
router.get('/', async (req, res) => {
    try {
        const db = await getDbConnection();
        const products = await db.all(`
            SELECT p.* 
            FROM products p
            JOIN users u ON u.id = p.business_id
            WHERE u.is_verified = 1
        `);
        const formatted = products.map(p => {
            let cats = [];
            try { cats = JSON.parse(p.category || p.categories || '[]'); } catch(e) { cats = p.category ? [p.category] : []; }
            return { ...p, categories: cats };
        });
        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Add single product
router.post('/', authenticateToken, requireVerifiedBusiness, upload.single('image'), async (req, res) => {
    try {
        const { id, name, description, price, stock_quantity, category, emoji, color } = req.body;
        if (!name) return res.status(400).json({ error: 'Product name is required' });

        const db = await getDbConnection();
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';
        
        // Fetch bizName
        const biz = await db.get('SELECT company_name FROM business_profiles WHERE id = ?', [req.user.id]);

        await db.run(
            `INSERT INTO products (id, business_id, business_name, name, description, price, stock_quantity, category, emoji, color, image_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
            [id || 'prd_' + Date.now(), req.user.id, biz?.company_name || 'Unknown', name, description || '', price || 0, stock_quantity || 0, category || '', emoji || '📦', color, imageUrl]
        );

        res.status(201).json({ message: 'Product added successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Bulk CSV Upload
router.post('/bulk', authenticateToken, requireVerifiedBusiness, upload.single('csv'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

    try {
        const db = await getDbConnection();
        const biz = await db.get('SELECT company_name FROM business_profiles WHERE id = ?', [req.user.id]);
        
        const filePath = req.file.path;
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        
        if (lines.length < 2) return res.status(400).json({ error: 'CSV file is empty or missing headers' });

        // Simple CSV Parser (Name, Description, Price, Stock, Category)
        const products = [];
        const headers = lines[0].toLowerCase().split(',');
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const p = {};
            headers.forEach((h, idx) => {
                p[h.trim()] = values[idx]?.trim();
            });
            products.push(p);
        }

        // Transactional insert
        await db.run('BEGIN TRANSACTION');
        for (const p of products) {
            if (!p.name) continue;
            const id = 'prd_bulk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            await db.run(
                `INSERT INTO products (id, business_id, business_name, name, description, price, stock_quantity, category, emoji, color) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                [id, req.user.id, biz?.company_name || 'Unknown', p.name, p.description || '', parseFloat(p.price) || 0, parseInt(p.stock) || 0, p.category || '', '📦', '#0d4040']
            );
        }
        await db.run('COMMIT');

        fs.unlinkSync(filePath); // Cleanup
        res.json({ message: `Successfully imported ${products.length} products` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Bulk upload failed' });
    }
});

// Private: Update product
router.put('/:id', authenticateToken, requireVerifiedBusiness, upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, stock_quantity, category, emoji } = req.body;
        const db = await getDbConnection();
        
        const product = await db.get('SELECT * FROM products WHERE id = ? AND business_id = ?', [req.params.id, req.user.id]);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        let imageUrl = product.image_url;
        if (req.file) imageUrl = `/uploads/${req.file.filename}`;

        await db.run(
            'UPDATE products SET name = ?, description = ?, price = ?, stock_quantity = ?, category = ?, emoji = ?, image_url = ? WHERE id = ?',
            [name || product.name, description !== undefined ? description : product.description, price !== undefined ? price : product.price, stock_quantity !== undefined ? stock_quantity : product.stock_quantity, category || product.category, emoji || product.emoji, imageUrl, req.params.id]
        );

        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Delete product
router.delete('/:id', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const db = await getDbConnection();
        const product = await db.get('SELECT * FROM products WHERE id = ? AND business_id = ?', [req.params.id, req.user.id]);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
