const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireVerifiedBusiness } = require('../middleware/auth');
const { createUploader } = require('../config/cloudinary');

const upload = createUploader('products');

// Public: Get all products
router.get('/', async (req, res) => {
    try {
        const db = getDbConnection();
        const result = await db.execute(`
            SELECT p.* FROM products p
            JOIN users u ON u.id = p.business_id
            WHERE u.is_verified = 1
        `);
        const formatted = result.rows.map(p => {
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

        const db = getDbConnection();
        const imageUrl = req.file ? req.file.path : '';
        const bizResult = await db.execute({ sql: 'SELECT company_name FROM business_profiles WHERE id = ?', args: [req.user.id] });

        await db.execute({
            sql: `INSERT INTO products (id, business_id, business_name, name, description, price, stock_quantity, category, emoji, color, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [id || 'prd_' + Date.now(), req.user.id, bizResult.rows[0]?.company_name || 'Unknown', name, description || '', price || 0, stock_quantity || 0, category || '', emoji || '📦', color, imageUrl]
        });

        res.status(201).json({ message: 'Product added successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Bulk CSV Upload (parsed in memory, no disk writes)
router.post('/bulk', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const { products: csvData } = req.body; // Expect CSV text sent as JSON body
        if (!csvData) return res.status(400).json({ error: 'No CSV data provided' });

        const db = getDbConnection();
        const bizResult = await db.execute({ sql: 'SELECT company_name FROM business_profiles WHERE id = ?', args: [req.user.id] });
        const bizName = bizResult.rows[0]?.company_name || 'Unknown';

        const lines = csvData.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) return res.status(400).json({ error: 'CSV file is empty or missing headers' });

        const headers = lines[0].toLowerCase().split(',');
        const productsToInsert = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const p = {};
            headers.forEach((h, idx) => { p[h.trim()] = values[idx]?.trim(); });
            if (p.name) productsToInsert.push(p);
        }

        for (const p of productsToInsert) {
            const id = 'prd_bulk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            await db.execute({
                sql: `INSERT INTO products (id, business_id, business_name, name, description, price, stock_quantity, category, emoji, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [id, req.user.id, bizName, p.name, p.description || '', parseFloat(p.price) || 0, parseInt(p.stock) || 0, p.category || '', '📦', '#0d4040']
            });
        }

        res.json({ message: `Successfully imported ${productsToInsert.length} products` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Bulk upload failed' });
    }
});

// Private: Update product
router.put('/:id', authenticateToken, requireVerifiedBusiness, upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, stock_quantity, category, emoji } = req.body;
        const db = getDbConnection();

        const prdResult = await db.execute({ sql: 'SELECT * FROM products WHERE id = ? AND business_id = ?', args: [req.params.id, req.user.id] });
        const product = prdResult.rows[0];
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const imageUrl = req.file ? req.file.path : product.image_url;

        await db.execute({
            sql: 'UPDATE products SET name = ?, description = ?, price = ?, stock_quantity = ?, category = ?, emoji = ?, image_url = ? WHERE id = ?',
            args: [name || product.name, description !== undefined ? description : product.description, price !== undefined ? price : product.price, stock_quantity !== undefined ? stock_quantity : product.stock_quantity, category || product.category, emoji || product.emoji, imageUrl, req.params.id]
        });

        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Delete product
router.delete('/:id', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const db = getDbConnection();
        const prdResult = await db.execute({ sql: 'SELECT * FROM products WHERE id = ? AND business_id = ?', args: [req.params.id, req.user.id] });
        if (prdResult.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

        await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [req.params.id] });
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
