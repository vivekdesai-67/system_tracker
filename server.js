require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { pool, initDB } = require('./db');
const { sendMail, newIssueEmail, responseEmail, updateEmail } = require('./mailer');

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
    console.log("--- requireAuth triggered for:", req.path);
    console.log("req.auth exists?", !!req.auth);
    if (req.auth) console.log("req.auth.userId:", req.auth.userId);

    if (req.auth && req.auth.userId) {
        try {
            console.log("Searching for clerk_id in DB:", req.auth.userId);
            let result = await pool.query('SELECT * FROM users WHERE clerk_id = $1', [req.auth.userId]);
            if (result.rows.length > 0) {
                console.log("Found existing user by clerk_id!");
                req.user = result.rows[0];
                return next();
            }
            
            console.log("User not found by clerk_id. Fetching from Clerk API...");
            const clerkUser = await clerkClient.users.getUser(req.auth.userId);
            const email = clerkUser.emailAddresses[0]?.emailAddress;
            const name = (clerkUser.firstName || '') + ' ' + (clerkUser.lastName || '');
            console.log("Clerk API returned email:", email, "name:", name);
            
            if (email) {
                console.log("Checking DB for existing email...");
                result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
                if (result.rows.length > 0) {
                    console.log("Found existing user by email, updating clerk_id...");
                    await pool.query('UPDATE users SET clerk_id = $1 WHERE email = $2', [req.auth.userId, email]);
                    req.user = result.rows[0];
                    return next();
                }
            }
            
            console.log("Inserting new user into DB...");
            const insertRes = await pool.query(`
                INSERT INTO users (name, role, username, password_hash, email, clerk_id)
                VALUES ($1, 'junior', $2, 'clerk_managed', $3, $4)
                RETURNING *
            `, [name.trim() || 'New User', email || req.auth.userId, email, req.auth.userId]);
            console.log("Inserted new user:", insertRes.rows[0]);
            req.user = insertRes.rows[0];
            return next();
        } catch(e) {
            console.error('Clerk user sync error', e);
            return res.redirect('/login');
        }
    }

    console.log("No req.auth.userId found. Falling back to JWT token check...");
    const token = req.cookies.token;
    if (!token) {
        console.log("No JWT token found either. Redirecting to /login.");
        return res.redirect('/login');
    }
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

function requireEmail(req, res, next) {
    if (!req.user.email) return res.redirect('/setup-email');
    next();
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
    if (req.cookies.token) return res.redirect('/dashboard');
    res.render('login', { error: null });
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

// GET /setup-email
app.get('/setup-email', requireAuth, (req, res) => {
    res.render('setup-email', { user: req.user, error: null });
});

// POST /setup-email
app.post('/setup-email', requireAuth, async (req, res) => {
    const { email } = req.body;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return res.render('setup-email', { user: req.user, error: 'Enter a valid email address.' });
    }
    try {
        await pool.query('UPDATE users SET email = $1 WHERE id = $2::int', [trimmed, req.user.id]);
        const { exp, iat, ...rest } = req.user;
        const token = jwt.sign({ ...rest, email: trimmed }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.render('setup-email', { user: req.user, error: 'Server error. Please try again.' });
    }
});

// GET /dashboard
app.get('/dashboard', requireAuth, requireEmail, async (req, res) => {
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
app.post('/api/issues', requireAuth, requireEmail, async (req, res) => {
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

        // Email to junior
        const { subject, html } = newIssueEmail(req.user.name, title, project_name, client_name, priority);
        sendMail(junior.email, subject, html);

        res.redirect(`/dashboard?toast=Issue assigned to ${junior.name} — Email notification sent!`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error creating issue.');
    }
});

// POST /api/issues/:id/respond — Junior Accepts or Denies
app.post('/api/issues/:id/respond', requireAuth, requireEmail, async (req, res) => {
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

        // Email to senior
        const { subject, html } = responseEmail(req.user.name, newStatus, issue.title);
        sendMail(senior.email, subject, html);

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error responding to issue.');
    }
});

// POST /api/issues/:id/update — Junior posts update or marks resolved
app.post('/api/issues/:id/update', requireAuth, requireEmail, async (req, res) => {
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

        // Email to senior
        const { subject, html } = updateEmail(req.user.name, issue.title, update_text, newStatus);
        sendMail(senior.email, subject, html);

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error posting update.');
    }
});
// GET /profile
app.get('/profile', requireAuth, requireEmail, (req, res) => {
    res.render('profile', { user: req.user, error: null, success: req.query.success || null });
});

// POST /api/profile
app.post('/api/profile', requireAuth, requireEmail, async (req, res) => {
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
app.get('/admin', requireAuth, requireEmail, requireAdmin, async (req, res) => {
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
app.post('/api/admin/users', requireAuth, requireEmail, requireAdmin, async (req, res) => {
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
app.post('/api/admin/users/:id/delete', requireAuth, requireEmail, requireAdmin, async (req, res) => {
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
app.post('/api/admin/issues/:id/delete', requireAuth, requireEmail, requireAdmin, async (req, res) => {
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
