require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
async function check() {
    const res = await pool.query('SELECT id, username, password_hash FROM users');
    console.table(res.rows);
    pool.end();
}
check();
