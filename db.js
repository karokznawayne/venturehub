const { createClient } = require('@libsql/client');
const bcrypt = require('bcrypt');

function getDbConnection() {
    return createClient({
        url: process.env.TURSO_URL,
        authToken: process.env.TURSO_TOKEN,
    });
}

async function initializeDb() {
    const db = getDbConnection();

    // Users Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'client',
            is_verified INTEGER DEFAULT 0,
            is_featured INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Business Profiles Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS business_profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE,
            type TEXT NOT NULL,
            owner_first TEXT NOT NULL,
            owner_last TEXT NOT NULL,
            owner_phone TEXT NOT NULL,
            company_name TEXT NOT NULL,
            description TEXT,
            city TEXT,
            state TEXT,
            website TEXT,
            gst TEXT,
            categories TEXT,
            color TEXT,
            logo_url TEXT,
            status TEXT DEFAULT 'pending',
            is_featured INTEGER DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    // Client Profiles Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS client_profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    // Services Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS services (
            id TEXT PRIMARY KEY,
            business_id TEXT,
            business_name TEXT,
            title TEXT,
            description TEXT,
            price REAL,
            price_type TEXT,
            category TEXT,
            categories TEXT,
            emoji TEXT,
            likes INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            liked_by TEXT,
            color TEXT,
            image_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (business_id) REFERENCES users(id)
        )
    `);

    // Products Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            business_id TEXT,
            business_name TEXT,
            name TEXT,
            description TEXT,
            price REAL,
            stock_quantity INTEGER DEFAULT 0,
            category TEXT,
            emoji TEXT,
            color TEXT,
            image_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (business_id) REFERENCES users(id)
        )
    `);

    // Evaluations Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS evaluations (
            id TEXT PRIMARY KEY,
            service_id TEXT,
            client_id TEXT,
            client_name TEXT,
            rating INTEGER,
            comment TEXT,
            image_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (service_id) REFERENCES services(id),
            FOREIGN KEY (client_id) REFERENCES users(id)
        )
    `);

    // Enquiries Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS enquiries (
            id TEXT PRIMARY KEY,
            business_id TEXT,
            client_id TEXT,
            client_name TEXT,
            client_email TEXT,
            subject TEXT,
            message TEXT,
            status TEXT DEFAULT 'new',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (business_id) REFERENCES users(id)
        )
    `);

    // Gallery Items Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS gallery_items (
            id TEXT PRIMARY KEY,
            business_id TEXT,
            image_url TEXT,
            caption TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (business_id) REFERENCES users(id)
        )
    `);

    // Global Categories Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS global_categories (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE,
            icon TEXT,
            type TEXT DEFAULT 'both',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Ensure Admin Exists
    const result = await db.execute("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    if (result.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.execute({
            sql: 'INSERT INTO users (id, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)',
            args: ['admin_1', 'admin@example.com', hashedPassword, 'admin', 1]
        });
        console.log('Admin user created: admin@example.com / admin123');
    }

    console.log('Turso DB initialized successfully.');
    return db;
}

module.exports = { getDbConnection, initializeDb };
