require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Fallback to Index.html for root and unknown routes
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'Index.html'));
});
app.get('/Index.html', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'Index.html'));
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/services', require('./routes/services'));
app.use('/api/products', require('./routes/products'));
app.use('/api/enquiries', require('./routes/enquiries'));
app.use('/api/gallery', require('./routes/gallery'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'VentureHub API is running' });
});

// For local dev: start server. For Vercel: export app.
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    const { initializeDb } = require('./db');
    initializeDb().then(() => {
        app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
    }).catch(err => { console.error('DB init failed:', err); process.exit(1); });
}

module.exports = app;
