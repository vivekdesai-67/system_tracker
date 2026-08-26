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
                role VARCHAR(10) NOT NULL CHECK (role IN ('senior', 'junior', 'admin')),
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
        
        // Auto-seed admin and all default users
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('Password@123', 10);
        
        const USERS = [
            { name: 'System Admin', role: 'admin', username: 'admin' },
            // Seniors
            { name: 'Tamil',       role: 'senior', username: 'tamil' },
            { name: 'Arun',        role: 'senior', username: 'arun' },
            { name: 'Pavan',       role: 'senior', username: 'pavan' },
            { name: 'Mani',        role: 'senior', username: 'mani' },
            { name: 'Lakshman',    role: 'senior', username: 'lakshman' },
            // Juniors
            { name: 'Vivek',       role: 'junior', username: 'vivek' },
            { name: 'Manikhandan', role: 'junior', username: 'manikhandan' },
            { name: 'Harikrishna', role: 'junior', username: 'harikrishna' },
            { name: 'Adharsh',     role: 'junior', username: 'adharsh' },
            { name: 'Santosh',     role: 'junior', username: 'santosh' },
            { name: 'Chandan',     role: 'junior', username: 'chandan' },
            { name: 'Kushal',      role: 'junior', username: 'kushal' },
            { name: 'Sreya',       role: 'junior', username: 'sreya' }
        ];

        for (const u of USERS) {
            await client.query(`
                INSERT INTO users (name, role, username, password_hash)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (username) DO NOTHING
            `, [u.name, u.role, u.username, hash]);
        }
        
        console.log('✅ Database tables initialized and default users seeded.');
    } finally {
        client.release();
    }
}

module.exports = { pool, initDB };
