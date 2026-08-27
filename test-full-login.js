require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

async function simulateLogin(username, password) {
    console.log(`\n🔐 Simulating login for: ${username}`);
    console.log('━'.repeat(50));
    
    try {
        // Step 1: Query database (exactly as server.js does)
        console.log('Step 1: Querying database...');
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 OR email = $1',
            [username.trim().toLowerCase()]
        );
        
        if (result.rows.length === 0) {
            console.log('❌ FAIL: User not found');
            console.log('Error message: "Invalid username or password."');
            return false;
        }
        console.log('✅ User found:', result.rows[0].name);
        
        // Step 2: Compare password (exactly as server.js does)
        console.log('\nStep 2: Verifying password...');
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        
        if (!valid) {
            console.log('❌ FAIL: Password mismatch');
            console.log('Error message: "Invalid username or password."');
            return false;
        }
        console.log('✅ Password valid');
        
        // Step 3: Create JWT token (exactly as server.js does)
        console.log('\nStep 3: Creating JWT token...');
        const payload = { 
            id: user.id, 
            name: user.name, 
            role: user.role, 
            username: user.username, 
            email: user.email 
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        console.log('✅ Token created:', token.substring(0, 50) + '...');
        
        // Step 4: Verify token can be decoded (exactly as requireAuth does)
        console.log('\nStep 4: Verifying token...');
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('✅ Token verified. Decoded user:', decoded.name, `(${decoded.role})`);
        
        // Step 5: Success
        console.log('\n✅ LOGIN SUCCESSFUL!');
        console.log('Would redirect to: /dashboard');
        console.log('Cookie set: token=' + token.substring(0, 30) + '...');
        
        return true;
    } catch (err) {
        console.log('❌ ERROR:', err.message);
        console.log(err.stack);
        return false;
    }
}

async function main() {
    console.log('\n╔═════════════════════════════════════════════════╗');
    console.log('║        FULL LOGIN FLOW SIMULATION              ║');
    console.log('╚═════════════════════════════════════════════════╝');
    
    // Test multiple accounts
    const tests = [
        { username: 'admin', password: 'Password@123' },
        { username: 'vivek', password: 'Password@123' },
        { username: 'tamil', password: 'Password@123' },
        { username: 'admin', password: 'wrongpassword' },  // Should fail
        { username: 'nonexistent', password: 'Password@123' }  // Should fail
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        const expected = test.password === 'Password@123' && 
                        ['admin', 'vivek', 'tamil'].includes(test.username);
        const result = await simulateLogin(test.username, test.password);
        
        if (result === expected) {
            passed++;
        } else {
            failed++;
            console.log('⚠️  UNEXPECTED RESULT!');
        }
    }
    
    console.log('\n╔═════════════════════════════════════════════════╗');
    console.log(`║  RESULTS: ${passed} passed, ${failed} failed                     ║`);
    console.log('╚═════════════════════════════════════════════════╝\n');
    
    await pool.end();
}

main();
