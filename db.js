require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(10) NOT NULL CHECK (role IN ('senior', 'junior')),
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                phone_number VARCHAR(25) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS issues (
                id SERIAL PRIMARY KEY,
                project_name VARCHAR(255) NOT NULL,
                client_name VARCHAR(255),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                priority VARCHAR(10) NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
                created_by INTEGER NOT NULL REFERENCES users(id),
                assigned_to INTEGER NOT NULL REFERENCES users(id),
                status VARCHAR(30) NOT NULL DEFAULT 'Pending Response'
                    CHECK (status IN ('Pending Response', 'Accepted', 'Denied', 'In Progress', 'Resolved')),
                response_at TIMESTAMP DEFAULT NULL,
                updates JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Database tables initialized.');
    } finally {
        client.release();
    }
}

module.exports = { pool, initDB };
