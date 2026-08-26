require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, initDB } = require('./db');

const USERS = [
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
    { name: 'Sreya',       role: 'junior', username: 'sreya' },
];

const DEFAULT_PASSWORD = 'Password@123';

async function seed() {
    await initDB();
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    for (const user of USERS) {
        try {
            await pool.query(
                `INSERT INTO users (name, role, username, password_hash)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (username) DO NOTHING`,
                [user.name, user.role, user.username, hash]
            );
            console.log(`✅ Seeded: ${user.name} (${user.role}) → username: ${user.username}`);
        } catch (err) {
            console.error(`❌ Failed to seed ${user.name}:`, err.message);
        }
    }

    console.log('\n🎉 Seeding complete! Default password for all users: Password@123');
    process.exit(0);
}

seed();
