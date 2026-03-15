const express = require('express');
const router = express.Router();
const { getDbConnection } = require('../db');
const { authenticateToken, requireVerifiedBusiness } = require('../middleware/auth');

// Public: Send an Enquiry
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { business_id, subject, message } = req.body;
        if (!business_id || !subject || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const db = await getDbConnection();
        // Fetch client details from profiles
        const client = await db.get(`
            SELECT u.email, cp.first_name, cp.last_name 
            FROM users u 
            LEFT JOIN client_profiles cp ON cp.user_id = u.id 
            WHERE u.id = ?`, [req.user.id]);
        
        const clientName = client?.first_name ? `${client.first_name} ${client.last_name}` : 'Registered User';
        const clientEmail = client?.email || 'unknown@example.com';

        const id = 'enq_' + Date.now();
        await db.run(
            `INSERT INTO enquiries (id, business_id, client_id, client_name, client_email, subject, message) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, business_id, req.user.id, clientName, clientEmail, subject, message]
        );

        res.status(201).json({ message: 'Enquiry sent successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Get Enquiries (for Business)
router.get('/', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const db = await getDbConnection();
        const enquiries = await db.all(
            'SELECT * FROM enquiries WHERE business_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(enquiries);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Private: Update Enquiry Status (e.g. read/responded)
router.put('/:id', authenticateToken, requireVerifiedBusiness, async (req, res) => {
    try {
        const { status } = req.body;
        const db = await getDbConnection();
        await db.run(
            'UPDATE enquiries SET status = ? WHERE id = ? AND business_id = ?',
            [status, req.params.id, req.user.id]
        );
        res.json({ message: 'Status updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
