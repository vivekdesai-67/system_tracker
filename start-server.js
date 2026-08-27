require('dotenv').config();
const { Pool } = require('pg');

async function checkSetup() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║           SystemCall - Pre-Start Checks                  ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    let allGood = true;
    
    // 1. Check environment variables
    console.log('1️⃣  Checking environment variables...');
    if (!process.env.DATABASE_URL) {
        console.log('   ❌ DATABASE_URL not found');
        allGood = false;
    } else {
        console.log('   ✅ DATABASE_URL is set');
    }
    
    if (!process.env.JWT_SECRET) {
        console.log('   ⚠️  JWT_SECRET not found (will use fallback)');
    } else {
        console.log('   ✅ JWT_SECRET is set');
    }
    
    // 2. Check database connection
    console.log('\n2️⃣  Testing database connection...');
    try {
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        
        await pool.query('SELECT NOW()');
        console.log('   ✅ Database connected successfully');
        
        // Check users
        const usersResult = await pool.query('SELECT COUNT(*) FROM users');
        console.log(`   ✅ Found ${usersResult.rows[0].count} users in database`);
        
        await pool.end();
    } catch (err) {
        console.log('   ❌ Database connection failed:', err.message);
        allGood = false;
    }
    
    // 3. Check port availability
    console.log('\n3️⃣  Checking port 3000...');
    const net = require('net');
    const checkPort = () => {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            server.listen(3000);
        });
    };
    
    const portAvailable = await checkPort();
    if (portAvailable) {
        console.log('   ✅ Port 3000 is available');
    } else {
        console.log('   ⚠️  Port 3000 is already in use');
        console.log('      Another process might be running or you need to restart the server');
    }
    
    // 4. Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    if (allGood) {
        console.log('║  ✅ All checks passed! Starting server...                ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');
        
        console.log('🔑 Login Credentials:');
        console.log('   Username: admin');
        console.log('   Password: Password@123');
        console.log('   URL: http://localhost:3000/login\n');
        
        console.log('━'.repeat(60));
        
        // Start the actual server
        require('./server.js');
    } else {
        console.log('║  ❌ Some checks failed. Please fix the issues above.     ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');
        process.exit(1);
    }
}

checkSetup().catch(err => {
    console.error('❌ Startup check failed:', err.message);
    process.exit(1);
});
