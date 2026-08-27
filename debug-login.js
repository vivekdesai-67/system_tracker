require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

async function debugLogin() {
    console.log('\n🔍 LOGIN DEBUG TOOL\n');
    console.log('================================\n');
    
    // Test 1: Check environment
    console.log('1️⃣ Environment Check:');
    console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Missing');
    console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Missing (using fallback)');
    
    // Test 2: Check database connection
    console.log('\n2️⃣ Database Connection:');
    try {
        await pool.query('SELECT NOW()');
        console.log('   ✅ Database connected');
    } catch (err) {
        console.log('   ❌ Database connection failed:', err.message);
        await pool.end();
        return;
    }
    
    // Test 3: List all users
    console.log('\n3️⃣ Available Users:');
    try {
        const result = await pool.query('SELECT id, username, name, role, email, password_hash FROM users ORDER BY id');
        console.table(result.rows.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name,
            role: u.role,
            email: u.email || 'NULL',
            has_valid_hash: u.password_hash.startsWith('$2b$') || u.password_hash.startsWith('$2a$')
        })));
    } catch (err) {
        console.log('   ❌ Failed to fetch users:', err.message);
    }
    
    // Test 4: Test specific logins
    console.log('\n4️⃣ Testing Login Scenarios:\n');
    
    const testCases = [
        { username: 'admin', password: 'Password@123' },
        { username: 'vivek', password: 'Password@123' },
        { username: 'tamil', password: 'Password@123' }
    ];
    
    for (const testCase of testCases) {
        console.log(`   Testing: ${testCase.username} / ${testCase.password}`);
        try {
            const result = await pool.query(
                'SELECT * FROM users WHERE username = $1 OR email = $1',
                [testCase.username.trim().toLowerCase()]
            );
            
            if (result.rows.length === 0) {
                console.log('   ❌ User not found\n');
                continue;
            }
            
            const user = result.rows[0];
            const valid = await bcrypt.compare(testCase.password, user.password_hash);
            
            if (valid) {
                const payload = { 
                    id: user.id, 
                    name: user.name, 
                    role: user.role, 
                    username: user.username, 
                    email: user.email 
                };
                const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
                
                // Verify token
                const decoded = jwt.verify(token, JWT_SECRET);
                
                console.log('   ✅ Login SUCCESS');
                console.log('   ✅ Token generated and verified');
                console.log('   User:', user.name, `(${user.role})`);
            } else {
                console.log('   ❌ Invalid password');
            }
        } catch (err) {
            console.log('   ❌ Error:', err.message);
        }
        console.log('');
    }
    
    // Test 5: Check for problematic users
    console.log('5️⃣ Checking for Problematic Users:');
    try {
        const badUsers = await pool.query(`
            SELECT id, username, email, password_hash 
            FROM users 
            WHERE password_hash NOT LIKE '$2%'
        `);
        
        if (badUsers.rows.length > 0) {
            console.log('   ⚠️  Found users with invalid password hashes:');
            console.table(badUsers.rows);
        } else {
            console.log('   ✅ All users have valid bcrypt hashes');
        }
    } catch (err) {
        console.log('   ❌ Error checking users:', err.message);
    }
    
    await pool.end();
    console.log('\n================================');
    console.log('Debug complete!\n');
}

debugLogin();
