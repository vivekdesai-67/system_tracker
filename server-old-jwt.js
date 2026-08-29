require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { pool, initDB } = require('./db');
const { sendDiscordWebhook } = require('./discord');

const app = express();
const { clerkMiddleware } = require("@clerk/express");
app.use(clerkMiddleware());
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.redirect('/login');
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie('token');
        return res.redirect('/login');
    }
}


function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).send('Forbidden: Admins only');
    next();
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
    
    console.log('[LOGIN] Attempt for username:', username);
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $1', [username.trim().toLowerCase()]);
        
        if (result.rows.length === 0) {
            console.log('[LOGIN] User not found:', username);
            return res.render('login', { error: 'Invalid username or password.' });
        }

        const user = result.rows[0];
        console.log('[LOGIN] User found:', user.username, user.name);
        
        const valid = await bcrypt.compare(password, user.password_hash);
        
        if (!valid) {
            console.log('[LOGIN] Invalid password for:', username);
            return res.render('login', { error: 'Invalid username or password.' });
        }
        
        console.log('[LOGIN] Password valid for:', username);

        const payload = { id: user.id, name: user.name, role: user.role, username: user.username, email: user.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        
        console.log('[LOGIN] Token created for:', username);
        
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

        console.log('[LOGIN] Success! Redirecting to dashboard');
        res.redirect('/dashboard');
    } catch (err) {
        console.error('[LOGIN] Error:', err);
        res.render('login', { error: 'Server error: ' + err.message });
    }
});


// GET /dashboard
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        let issues;
        
        const startTime = Date.now();
        
        if (req.user.role === 'senior') {
            const result = await pool.query(`
                SELECT i.*, u.name AS assigned_name, u.email AS assigned_email
                FROM issues i 
                JOIN users u ON u.id = i.assigned_to
                WHERE i.created_by = $1::int 
                ORDER BY i.created_at DESC
                LIMIT 100
            `, [userId]);
            issues = result.rows;
        } else {
            const result = await pool.query(`
                SELECT i.*, u.name AS created_name, u.email AS senior_email
                FROM issues i 
                JOIN users u ON u.id = i.created_by
                WHERE i.assigned_to = $1::int 
                ORDER BY i.created_at DESC
                LIMIT 100
            `, [userId]);
            issues = result.rows;
        }

        const juniorsResult = await pool.query("SELECT id, name FROM users WHERE role = 'junior' ORDER BY name");
        
        const duration = Date.now() - startTime;
        console.log(`[DASHBOARD] Loaded in ${duration}ms for ${req.user.username}`);
        
        res.render('dashboard', { user: req.user, issues, juniors: juniorsResult.rows, toast: req.query.toast || null });
    } catch (err) {
        console.error('[DASHBOARD] Error:', err);
        res.status(500).send('Server error loading dashboard.');
    }
});

// POST /api/issues — Senior creates an issue

// Delete Issue
app.post('/api/issues/:id/delete', requireAuth, async (req, res) => {
    if (req.user.role !== 'senior' && req.user.role !== 'admin') return res.status(403).send('Forbidden');
    try {
        await pool.query('DELETE FROM issues WHERE id = $1', [req.params.id]);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard?error=Failed to delete issue');
    }
});

// Edit Issue
app.post('/api/issues/:id/edit', requireAuth, async (req, res) => {
    if (req.user.role !== 'senior' && req.user.role !== 'admin') return res.status(403).send('Forbidden');
    const { project_name, title, priority, assigned_to } = req.body;
    try {
        await pool.query(`
            UPDATE issues 
            SET project_name = $1, title = $2, priority = $3, assigned_to = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
        `, [project_name || 'General', title, priority, parseInt(assigned_to), req.params.id]);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard?error=Failed to edit issue');
    }
});

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
        
        // Discord Webhook
        const mention = junior.discord_id ? `<@${junior.discord_id}>` : `**${junior.name}**`;
        await sendDiscordWebhook(`🚀 **New Issue Assigned!**\n**Title:** ${title}\n**Project:** ${project_name}\n**Priority:** ${priority}\n**Assigned To:** ${junior.name} (by ${req.user.name})`, 0x3b82f6, junior.discord_id ? `<@${junior.discord_id}>` : null);

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
        
        // Discord Webhook
        await sendDiscordWebhook(`🔄 **Issue Status Update**\n**Issue:** ${issue.title}\n**New Status:** ${newStatus}\n**Updated By:** ${req.user.name}`, 0xf59e0b);

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
        
        // Discord Webhook
        await sendDiscordWebhook(`💬 **New Issue Update**\n**Issue:** ${issue.title}\n**Update:** ${update_text}\n**Status:** ${newStatus}\n**By:** ${req.user.name}`, 0x10b981);

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

app.post('/api/admin/users/:id/edit', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, role, discord_id } = req.body;
        await pool.query('UPDATE users SET name = $1, role = $2, discord_id = $3 WHERE id = $4', [name, role, discord_id || null, req.params.id]);
        res.redirect('/admin?toast=User updated successfully');
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=Failed to update user');
    }
});

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

// DEBUG endpoint - check if server is working
app.get('/api/health', async (req, res) => {
    try {
        const dbCheck = await pool.query('SELECT COUNT(*) FROM users');
        res.json({
            status: 'ok',
            database: 'connected',
            users: dbCheck.rows[0].count,
            jwt_secret: process.env.JWT_SECRET ? 'set' : 'missing',
            database_url: process.env.DATABASE_URL ? 'set' : 'missing',
            vercel: process.env.VERCEL ? 'yes' : 'no'
        });
    } catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message,
            jwt_secret: process.env.JWT_SECRET ? 'set' : 'missing',
            database_url: process.env.DATABASE_URL ? 'set' : 'missing'
        });
    }
});



// ─── Start ────────────────────────────────────────────────────────────────────

// Initialize database once (cached across requests in serverless)
let dbInitialized = false;
let dbInitPromise = null;

async function ensureDB() {
    if (dbInitialized) return;
    
    if (dbInitPromise) {
        // If already initializing, wait for it
        await dbInitPromise;
        return;
    }
    
    dbInitPromise = (async () => {
        console.log('[INIT] Starting database initialization...');
        const startTime = Date.now();
        
        if (!process.env.DATABASE_URL) {
            console.error('❌ DATABASE_URL not set! Check environment variables.');
            throw new Error('DATABASE_URL is required');
        }
        
        await initDB();
        dbInitialized = true;
        
        const duration = Date.now() - startTime;
        console.log(`✅ Database initialized in ${duration}ms`);
    })();
    
    await dbInitPromise;
}

if (process.env.VERCEL) {
    // Vercel serverless environment
    // Initialize DB once on module load (cached across warm starts)
    ensureDB().catch(err => {
        console.error('Failed to initialize database:', err);
    });
    
    module.exports = app;
} else {
    // Local environment
    initDB().then(() => {
        server.listen(PORT, () => console.log(`\n🚀 SystemCall running at http://localhost:${PORT}\n`));
    }).catch(err => {
        console.error('❌ Failed to initialize database:', err.message);
        process.exit(1);
    });
}
