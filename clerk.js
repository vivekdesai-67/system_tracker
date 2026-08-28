require('dotenv').config();
const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');

// Clerk middleware for protecting routes
const clerkMiddleware = ClerkExpressWithAuth({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
});

// Custom middleware to sync Clerk user with our database
async function syncClerkUser(req, res, next) {
    if (!req.auth.userId) {
        return next();
    }

    const { pool } = require('./db');
    
    try {
        // Check if user exists in our database
        const result = await pool.query(
            'SELECT * FROM users WHERE clerk_id = $1',
            [req.auth.userId]
        );

        if (result.rows.length === 0) {
            // Create user in our database
            const clerkUser = await req.auth.getUser();
            
            const insertResult = await pool.query(`
                INSERT INTO users (
                    name, 
                    role, 
                    username, 
                    email, 
                    clerk_id, 
                    password_hash
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [
                clerkUser.firstName + ' ' + (clerkUser.lastName || ''),
                'junior', // Default role
                clerkUser.username || clerkUser.emailAddresses[0].emailAddress,
                clerkUser.emailAddresses[0].emailAddress,
                req.auth.userId,
                'clerk_managed'
            ]);
            
            req.user = insertResult.rows[0];
        } else {
            req.user = result.rows[0];
        }
        
        next();
    } catch (err) {
        console.error('Error syncing Clerk user:', err);
        next(err);
    }
}

// Middleware to require authentication
function requireClerkAuth(req, res, next) {
    if (!req.auth.userId) {
        return res.redirect('/sign-in');
    }
    next();
}

// Middleware to require admin role
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).send('Forbidden: Admins only');
    }
    next();
}

module.exports = {
    clerkMiddleware,
    syncClerkUser,
    requireClerkAuth,
    requireAdmin
};
