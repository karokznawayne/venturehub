const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireVerifiedBusiness } = require('../middleware/auth');

// Send an Enquiry (authenticated users)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { business_id, subject, message } = req.body;
        if (!business_id || !subject || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const db = getDbConnection();
        const clientResult = await db.execute({
            sql: `SELECT u.email, cp.first_name, cp.last_name FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id WHERE u.id = ?`,
            args: [req.user.id]
        });
        const client = clientResult.rows[0];
        const clientName = client?.first_name ? `${client.first_name} ${client.last_name}` : 'Registered User';
        const clientEmail = client?.email || 'unknown@example.com';

        const id = 'enq_' + Date.now();
        await db.execute({
            sql: 'INSERT INTO enquiries (id, business_id, client_id, client_name, client_email, subject, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
            args: [id, business_id, req.user.id, clientName, clientEmail, subject, message]
        });

        res.status(201).json({ message: 'Enquiry sent successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get Enquiries (for Business)
router.get('/', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const db = getDbConnection();
        const result = await db.execute({
            sql: 'SELECT * FROM enquiries WHERE business_id = ? ORDER BY created_at DESC',
            args: [req.user.id]
        });
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update Enquiry Status
router.put('/:id', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const { status } = req.body;
        const db = getDbConnection();
        await db.execute({
            sql: 'UPDATE enquiries SET status = ? WHERE id = ? AND business_id = ?',
            args: [status, req.params.id, req.user.id]
        });
        res.json({ message: 'Status updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
