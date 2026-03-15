const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ error: 'No token provided' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

async function requireVerifiedBusiness(req, res, next) {
    if (req.user.role === 'admin') {
        return next();
    }
    
    // Check database for real-time verification status instead of relying on JWT payload
    try {
        const { getDbConnection } = require('../db');
        const db = getDbConnection();
        const result = await db.execute({ sql: 'SELECT is_verified FROM users WHERE id = ?', args: [req.user.id] });
        const user = result.rows[0];
        
        if (req.user.role !== 'business' || !user || !user.is_verified) {
            return res.status(403).json({ error: 'Access denied: Requires verified business account' });
        }
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied: Admin only' });
    }
    next();
}

module.exports = { authenticateToken, requireVerifiedBusiness, requireAdmin };
