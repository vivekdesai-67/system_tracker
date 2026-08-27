require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { pool, initDB } = require('./db');
const { sendDiscordWebhook } = require('./discord');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
app.locals.clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const { clerkMiddleware } = require("@clerk/express");
app.use(clerkMiddleware());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Middleware ───────────────────────────────────────────────────────────
const { createClerkClient } = require('@clerk/express');
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function requireAuth(req, res, next) {
    console.log("--- requireAuth:", req.path, "| clerk userId:", req.auth?.userId || 'none');

    if (req.auth && req.auth.userId) {
        try {
            const clerkUserId = req.auth.userId;

            // 1. Try find by clerk_id
            let result = await pool.query('SELECT * FROM users WHERE clerk_id = $1', [clerkUserId]);
            if (result.rows.length > 0) {
                req.user = result.rows[0];
                return next();
            }

            // 2. Get email from req.auth session claims (no external API call needed)
            //    Clerk puts email in sessionClaims.email when configured, otherwise fall back to API
            let email = null;
            let name = 'New User';

            try {
                // Try the Clerk API for email/name (works on Vercel/real network)
                const clerkUser = await clerkClient.users.getUser(clerkUserId);
                email = clerkUser.emailAddresses[0]?.emailAddress;
                name = ((clerkUser.firstName || '') + ' ' + (clerkUser.lastName || '')).trim() || 'New User';
                console.log("Got from Clerk API:", email, name);
            } catch (apiErr) {
                // Fallback: try session claims
                email = req.auth.sessionClaims?.email || req.auth.sessionClaims?.['email'] || null;
                name = req.auth.sessionClaims?.name || 'New User';
                console.warn("Clerk API unavailable, using session claims. email:", email);
            }

            // 3. Try match by email
            if (email) {
                result = await pool.query('SELECT * FROM users WHERE email = $1 ORDER BY id ASC LIMIT 1', [email]);
                if (result.rows.length > 0) {
                    await pool.query('UPDATE users SET clerk_id = $1 WHERE id = $2', [clerkUserId, result.rows[0].id]);
                    req.user = result.rows[0];
                    return next();
                }
            }

            // 4. Create new user
            const username = email || clerkUserId;
            const insertRes = await pool.query(`
                INSERT INTO users (name, role, username, password_hash, email, clerk_id)
                VALUES ($1, 'junior', $2, 'clerk_managed', $3, $4)
                ON CONFLICT (clerk_id) DO UPDATE SET name = EXCLUDED.name
                RETURNING *
            `, [name, username, email, clerkUserId]);
            req.user = insertRes.rows[0];
            console.log("Created/updated user:", req.user.id, req.user.name);
            return next();
        } catch (e) {
            console.error('requireAuth Clerk sync error:', e.message);
            return res.redirect('/login');
        }
    }

    // Fallback: legacy JWT cookie
    const token = req.cookies.token;
    if (!token) return res.redirect('/login');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        decoded.id = parseInt(decoded.id);
        if (isNaN(decoded.id)) { res.clearCookie('token'); return res.redirect('/login'); }
        req.user = decoded;
        next();
    } catch {
        res.clearCookie('token');
        res.redirect('/login');
    }
}


function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).send('Forbidden: Admins only');
    next();
}

// ─── Socket.io ─────────────────────────────────────────────────────────────────
const userSockets = new Map();

io.on('connection', (socket) => {
    socket.on('register', (userId) => {
        if (!userSockets.has(userId)) userSockets.set(userId, new Set());
        userSockets.get(userId).add(socket.id);
    });
    socket.on('disconnect', () => {
        for (const [userId, sids] of userSockets.entries()) sids.delete(socket.id);
    });
});

function emitToUser(userId, event, data) {
    const sids = userSockets.get(String(userId));
    if (sids) sids.forEach(sid => io.to(sid).emit(event, data));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.redirect('/dashboard'));

// GET /login
app.get('/login', (req, res) => {
    // If Clerk session exists, skip to dashboard
    if (req.auth && req.auth.userId) return res.redirect('/dashboard');
    if (req.cookies.token) return res.redirect('/dashboard');
    res.render('login', { error: null });
});

app.get('/test-auth', (req, res, next) => {
    req.auth = { userId: 'user_3IRezBmnhmApBVK3kFxcRA9VwQN', sessionClaims: { email: 'test_sso@gmail.com', name: 'SSO Test' } };
    next();
}, requireAuth, (req, res) => {
    res.json({ success: true, user: req.user });
});

// POST /login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim().toLowerCase()]);
        if (result.rows.length === 0) return res.render('login', { error: 'Invalid username or password.' });

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.render('login', { error: 'Invalid username or password.' });

        const payload = { id: user.id, name: user.name, role: user.role, username: user.username, email: user.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

        if (!user.email) return res.redirect('/setup-email');
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Server error. Please try again.' });
    }
});


// GET /dashboard
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        let issues;
        if (req.user.role === 'senior') {
            const result = await pool.query(`
                SELECT i.*, u.name AS assigned_name, u.email AS assigned_email
                FROM issues i JOIN users u ON u.id = i.assigned_to
                WHERE i.created_by = $1::int ORDER BY i.created_at DESC
            `, [userId]);
            issues = result.rows;
        } else {
            const result = await pool.query(`
                SELECT i.*, u.name AS created_name, u.email AS senior_email
                FROM issues i JOIN users u ON u.id = i.created_by
                WHERE i.assigned_to = $1::int ORDER BY i.created_at DESC
            `, [userId]);
            issues = result.rows;
        }

        const juniorsResult = await pool.query("SELECT id, name FROM users WHERE role = 'junior' ORDER BY name");
        res.render('dashboard', { user: req.user, issues, juniors: juniorsResult.rows, toast: req.query.toast || null });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error loading dashboard.');
    }
});

// POST /api/issues — Senior creates an issue
app.post('/api/issues', requireAuth, async (req, res) => {
    if (req.user.role !== 'senior') return res.status(403).send('Forbidden');
    const { project_name, client_name, title, description, priority, assigned_to } = req.body;
    try {
        const juniorRes = await pool.query('SELECT * FROM users WHERE id = $1::int', [parseInt(assigned_to)]);
        if (juniorRes.rows.length === 0) return res.status(400).send('Invalid junior selected.');
        const junior = juniorRes.rows[0];

        const result = await pool.query(`
            INSERT INTO issues (project_name, client_name, title, description, priority, created_by, assigned_to, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending Response') RETURNING *
        `, [project_name, client_name, title, description, priority, req.user.id, assigned_to]);

        const issue = result.rows[0];
        issue.assigned_name = junior.name;

        // Real-time push to junior
        emitToUser(junior.id, 'new_issue', issue);

        // Discord Webhook
        sendDiscordWebhook(`🚀 **New Issue Assigned!**\n**Title:** ${title}\n**Project:** ${project_name}\n**Client:** ${client_name}\n**Priority:** ${priority}\n**Assigned To:** ${junior.name} by ${req.user.name}`);

        res.redirect(`/dashboard?toast=Issue assigned to ${junior.name} — Discord notification sent!`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error creating issue.');
    }
});

// POST /api/issues/:id/respond — Junior Accepts or Denies
app.post('/api/issues/:id/respond', requireAuth, async (req, res) => {
    if (req.user.role !== 'junior') return res.status(403).send('Forbidden');
    const { action } = req.body;
    const newStatus = action === 'accept' ? 'Accepted' : 'Denied';
    const issueId = parseInt(req.params.id);
    try {
        const result = await pool.query(`
            UPDATE issues SET status = $1, response_at = NOW(), updated_at = NOW()
            WHERE id = $2 AND assigned_to = $3::int AND status = 'Pending Response' RETURNING *
        `, [newStatus, issueId, req.user.id]);

        if (result.rows.length === 0) return res.redirect('/dashboard');
        const issue = result.rows[0];

        const seniorRes = await pool.query('SELECT * FROM users WHERE id = $1::int', [issue.created_by]);
        const senior = seniorRes.rows[0];

        // Real-time push to senior
        emitToUser(senior.id, 'issue_updated', { ...issue, updated_by: req.user.name });

        // Discord Webhook
        sendDiscordWebhook(`🔄 **Issue Status Update**\n**Issue:** ${issue.title}\n**New Status:** ${newStatus}\n**Updated By:** ${req.user.name}`, 0xf59e0b);

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error responding to issue.');
    }
});

// POST /api/issues/:id/update — Junior posts update or marks resolved
app.post('/api/issues/:id/update', requireAuth, async (req, res) => {
    if (req.user.role !== 'junior') return res.status(403).send('Forbidden');
    const { update_text, mark_resolved } = req.body;
    const newStatus = mark_resolved === 'true' ? 'Resolved' : 'In Progress';
    const issueId = parseInt(req.params.id);
    try {
        const result = await pool.query(`
            UPDATE issues
            SET status = $1, updated_at = NOW(),
                updates = updates || $2::jsonb
            WHERE id = $3 AND assigned_to = $4::int RETURNING *
        `, [
            newStatus,
            JSON.stringify([{ text: update_text, timestamp: new Date().toISOString(), status_at_time: newStatus }]),
            issueId,
            req.user.id
        ]);

        if (result.rows.length === 0) return res.redirect('/dashboard');
        const issue = result.rows[0];

        const seniorRes = await pool.query('SELECT * FROM users WHERE id = $1::int', [issue.created_by]);
        const senior = seniorRes.rows[0];

        // Real-time push to senior
        emitToUser(senior.id, 'issue_updated', { ...issue, updated_by: req.user.name });

        // Discord Webhook
        sendDiscordWebhook(`💬 **New Issue Update**\n**Issue:** ${issue.title}\n**Update:** ${update_text}\n**Status:** ${newStatus}\n**By:** ${req.user.name}`, 0x10b981);

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error posting update.');
    }
});
// GET /profile
app.get('/profile', requireAuth, (req, res) => {
    res.render('profile', { user: req.user, error: null, success: req.query.success || null });
});

// POST /api/profile
app.post('/api/profile', requireAuth, async (req, res) => {
    const { name, email, password } = req.body;
    try {
        let query = 'UPDATE users SET name = $1, email = $2';
        let params = [name, email.trim().toLowerCase()];
        let idx = 3;

        if (password && password.trim().length > 0) {
            const hash = await bcrypt.hash(password, 10);
            query += `, password_hash = $${idx}`;
            params.push(hash);
            idx++;
        }
        query += ` WHERE id = $${idx} RETURNING *`;
        params.push(req.user.id);

        const result = await pool.query(query, params);
        const updatedUser = result.rows[0];

        // Update token
        const payload = { id: updatedUser.id, name: updatedUser.name, role: updatedUser.role, username: updatedUser.username, email: updatedUser.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

        res.redirect('/profile?success=Profile updated successfully');
    } catch (err) {
        console.error(err);
        res.render('profile', { user: req.user, error: 'Failed to update profile.', success: null });
    }
});

// GET /admin
app.get('/admin', requireAuth, requireAdmin, async (req, res) => {
    try {
        const usersRes = await pool.query('SELECT id, name, role, username, email, created_at FROM users ORDER BY created_at DESC');
        const issuesRes = await pool.query(`
            SELECT i.*, u1.name AS created_name, u2.name AS assigned_name 
            FROM issues i 
            JOIN users u1 ON u1.id = i.created_by 
            JOIN users u2 ON u2.id = i.assigned_to 
            ORDER BY i.created_at DESC
        `);
        res.render('admin', { user: req.user, users: usersRes.rows, issues: issuesRes.rows, error: req.query.error, success: req.query.success });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error loading admin panel.');
    }
});

// POST /api/admin/users
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    const { name, username, password, role } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)',
            [name, username.trim().toLowerCase(), hash, role]
        );
        res.redirect('/admin?success=User created');
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=Failed to create user (username might be taken)');
    }
});

// POST /api/admin/users/:id/delete
app.post('/api/admin/users/:id/delete', requireAuth, requireAdmin, async (req, res) => {
    if (parseInt(req.params.id) === req.user.id) return res.redirect('/admin?error=Cannot delete yourself');
    try {
        await pool.query('DELETE FROM users WHERE id = $1::int', [req.params.id]);
        res.redirect('/admin?success=User deleted');
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=Failed to delete user (they might have existing issues)');
    }
});

// POST /api/admin/issues/:id/delete
app.post('/api/admin/issues/:id/delete', requireAuth, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM issues WHERE id = $1::int', [req.params.id]);
        res.redirect('/admin?success=Issue deleted');
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=Failed to delete issue');
    }
});
// GET /logout
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (process.env.VERCEL) {
    // Vercel serverless environment
    // Note: initDB() might take time, but we just export the app immediately for Vercel
    initDB().catch(console.error);
    module.exports = server;
} else {
    // Local environment
    initDB().then(() => {
        server.listen(PORT, () => console.log(`\n🚀 SystemCall running at http://localhost:${PORT}\n`));
    });
}
