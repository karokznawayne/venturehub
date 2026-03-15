require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files (Index.html, CSS, JS) natively
app.use(express.static(__dirname));

// Serve Uploads folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/services', require('./routes/services'));
app.use('/api/products', require('./routes/products'));
app.use('/api/enquiries', require('./routes/enquiries'));
app.use('/api/gallery', require('./routes/gallery'));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Business Registration API is running' });
});

// Initialize database and start server
initializeDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
