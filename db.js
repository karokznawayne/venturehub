const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const fs = require('fs');

async function getDbConnection() {
    return open({
        filename: './business_db.sqlite',
        driver: sqlite3.Database
    });
}

async function initializeDb() {
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync('./uploads')) {
        fs.mkdirSync('./uploads');
    }

    const db = await getDbConnection();

    // Users Table (Authentication)
    // role can be: 'admin', 'business', 'client'
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'client',
            is_verified BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Business Profiles Table
    // Added logo_url
    await db.exec(`
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
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    `);

    // Client Profiles Table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS client_profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    `);

    // Services Table
    // 4. Services
    await db.exec(`
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

    // 5. Products [NEW Phase 4]
    await db.exec(`
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

    // 6. Evaluations [Updated Phase 5 with image_url]
    await db.exec(`
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

    // 7. Enquiries [NEW Phase 5]
    await db.exec(`
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

    // 8. Gallery Items [NEW Phase 5]
    await db.exec(`
        CREATE TABLE IF NOT EXISTS gallery_items (
            id TEXT PRIMARY KEY,
            business_id TEXT,
            image_url TEXT,
            caption TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (business_id) REFERENCES users(id)
        )
    `);

    // 9. Global Categories [NEW Phase 5]
    await db.exec(`
        CREATE TABLE IF NOT EXISTS global_categories (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE,
            icon TEXT,
            type TEXT DEFAULT 'both',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Alterations for Phase 5 [Featured Status]
    try { await db.exec('ALTER TABLE business_profiles ADD COLUMN is_featured INTEGER DEFAULT 0'); } catch(e){}
    try { await db.exec('ALTER TABLE users ADD COLUMN is_featured INTEGER DEFAULT 0'); } catch(e){}


    // Ensure Admin Exists
    const adminExists = await db.get('SELECT * FROM users WHERE role = ?', ['admin']);
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.run('INSERT INTO users (id, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)', ['admin_1', 'admin@example.com', hashedPassword, 'admin', 1]);
        console.log('Admin user created: admin@example.com / admin123');
    }

    console.log('Database initialized successfully with Phase 3 schema.');
    return db;
}

module.exports = { getDbConnection, initializeDb };
