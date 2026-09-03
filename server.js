// Clerk Authentication Server v2.0 - Force Vercel Update
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');





const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const { pool, initDB } = require('./db');
const { sendDiscordWebhook } = require('./discord');

const app = express();

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
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Add CSP headers for Clerk
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://cdn.jsdelivr.net https://challenges.cloudflare.com; " +
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://*.clerk.accounts.dev; " +
        "img-src 'self' data: https: blob:; " +
        "font-src 'self' data: https://cdn.jsdelivr.net; " +
        "connect-src 'self' https://*.clerk.accounts.dev https://api.clerk.dev wss://*.clerk.accounts.dev; " +
        "frame-src 'self' https://*.clerk.accounts.dev https://challenges.cloudflare.com; " +
        "worker-src 'self' blob:;"
    );
    next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Clerk authentication middleware


// Custom middleware to sync Clerk user with our database


// Middleware to require admin role
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).send('Forbidden: Admins only');
    }
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

app.get('/', requireAuth, (req, res) => {
    res.redirect('/dashboard');
});


app.get('/login', (req, res) => {
    if (req.cookies.token) {
        return res.redirect('/dashboard');
    }
    res.render('login', { error: null });
});

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

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
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
        const seniorsResult = await pool.query("SELECT id, name FROM users WHERE role = 'senior' ORDER BY name");
        
        const duration = Date.now() - startTime;
        console.log(`[DASHBOARD] Loaded in ${duration}ms for ${req.user.username}`);
        
        res.render('dashboard', { 
            user: req.user, 
            issues, 
            juniors: juniorsResult.rows, seniors: seniorsResult.rows, 
            toast: req.query.toast || null 
        });
    } catch (err) {
        console.error('[DASHBOARD] Error:', err);
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

        emitToUser(junior.id, 'new_issue', issue);
        sendDiscordWebhook(`🚀 **New Issue Assigned!**\n**Title:** ${title}\n**Project:** ${project_name}\n**Client:** ${client_name}\n**Priority:** ${priority}\n**Assigned To:** ${junior.name} by ${req.user.name}`);

        res.redirect(`/dashboard?toast=Issue assigned to ${junior.name}`);
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

        emitToUser(senior.id, 'issue_updated', { ...issue, updated_by: req.user.name });
        sendDiscordWebhook(`🔄 **Issue Status Update**\n**Issue:** ${issue.title}\n**New Status:** ${newStatus}\n**Updated By:** ${req.user.name}`, 0xf59e0b);

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error responding to issue.');
    }
});

// POST /api/issues/:id/update — Junior posts update or marks resolved

// Senior verifies a resolved task
app.post('/api/issues/:id/verify', requireAuth, async (req, res) => {
    if (req.user.role !== 'senior') return res.status(403).send('Forbidden');
    const issueId = parseInt(req.params.id);
    try {
        const result = await pool.query(`
            UPDATE issues
            SET status = 'Verified', updated_at = NOW(),
                updates = updates || $1::jsonb
            WHERE id = $2 AND created_by = $3::int RETURNING *
        `, [
            JSON.stringify([{ text: "Senior Verified this resolution.", timestamp: new Date().toISOString(), status_at_time: 'Verified' }]),
            issueId,
            req.user.id
        ]);

        if (result.rows.length === 0) return res.redirect('/dashboard');
        const issue = result.rows[0];

        const juniorRes = await pool.query('SELECT * FROM users WHERE id = $1::int', [issue.assigned_to]);
        const junior = juniorRes.rows[0];

        if (junior && junior.discord_id) {
            sendDiscordWebhook(
                `**Task Verified**\n\n**Issue #${issue.id}** "${issue.title}" has been successfully VERIFIED by Senior **${req.user.name}**! Great job!`,
                0x10b981,
                `<@${junior.discord_id}>`
            );
        } else {
            sendDiscordWebhook(
                `**Task Verified**\n\n**Issue #${issue.id}** "${issue.title}" was verified by **${req.user.name}**.`,
                0x10b981
            );
        }

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

app.post('/api/issues/:id/update', requireAuth, async (req, res) => {
    if (req.user.role !== 'junior') return res.status(403).send('Forbidden');
    const { update_text, mark_resolved, notify_senior_id } = req.body;
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

        // Notify specific senior if marked resolved
        if (mark_resolved === 'true' && notify_senior_id) {
            const selectedSeniorRes = await pool.query('SELECT * FROM users WHERE id = $1', [notify_senior_id]);
            if (selectedSeniorRes.rows.length > 0) {
                const selectedSenior = selectedSeniorRes.rows[0];
                const pingContent = selectedSenior.discord_id ? `<@${selectedSenior.discord_id}>` : null;
                await sendDiscordWebhook(`✅ **Issue Resolved (Verification Required)**\n**Title:** ${issue.title}\n**Project:** ${issue.project_name}\n**Resolved By:** ${req.user.name}\n**Verify Please:** ${selectedSenior.name}\n**Note:** ${update_text}`, 0x10b981, pingContent);
            }
        } else {
            // General update notification
            await sendDiscordWebhook(`💬 **New Issue Update**\n**Issue:** ${issue.title}\n**Update:** ${update_text}\n**Status:** ${newStatus}\n**By:** ${req.user.name}`, 0x10b981);
        }

        res.redirect('/dashboard?toast=' + encodeURIComponent('Update saved!' + (mark_resolved === 'true' ? ' Senior notified.' : '')));
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
    const { name, phone_number } = req.body;
    try {
        await pool.query(
            'UPDATE users SET name = $1, phone_number = $2 WHERE id = $3',
            [name, phone_number, req.user.id]
        );
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

// POST /api/admin/users/:id/update-role
app.post('/api/admin/users/:id/update-role', requireAuth, requireAdmin, async (req, res) => {
    const { role } = req.body;
    try {
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
        res.redirect('/admin?success=User role updated');
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=Failed to update role');
    }
});

// GET /logout (Clerk handles this via their component)
app.get('/logout', (req, res) => {
    res.redirect('/sign-in');
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const dbCheck = await pool.query('SELECT COUNT(*) FROM users');
        res.json({
            status: 'ok',
            auth: 'clerk',
            database: 'connected',
            users: dbCheck.rows[0].count,
            clerk_publishable_key: process.env.CLERK_PUBLISHABLE_KEY ? 'set' : 'missing',
            clerk_secret_key: process.env.CLERK_SECRET_KEY ? 'set' : 'missing',
            next_public_key: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? 'set' : 'missing',
            vercel: process.env.VERCEL ? 'yes' : 'no'
        });
    } catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message,
            clerk_publishable_key: process.env.CLERK_PUBLISHABLE_KEY ? 'set' : 'missing',
            clerk_secret_key: process.env.CLERK_SECRET_KEY ? 'set' : 'missing'
        });
    }
});

// ─── Start ────────────────────────────────────────────────────────────────────

let dbInitialized = false;
let dbInitPromise = null;

async function ensureDB() {
    if (dbInitialized) return;
    
    if (dbInitPromise) {
        await dbInitPromise;
        return;
    }
    
    dbInitPromise = (async () => {
        console.log('[INIT] Starting database initialization...');
        const startTime = Date.now();
        await initDB();
        dbInitialized = true;
        const duration = Date.now() - startTime;
        console.log(`✅ Database initialized in ${duration}ms`);
    })();
    
    await dbInitPromise;
}


// Custom global error handler to show exactly what's breaking on Vercel
app.use((err, req, res, next) => {
    console.error('🔥 FATAL EXPRESS ERROR:', err);
    res.status(500).send(`
        <div style="font-family: monospace; padding: 40px; background: #ffebee; color: #b71c1c; border: 2px solid #ef5350; border-radius: 8px; margin: 40px auto; max-width: 800px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="margin-top: 0;">Internal Server Error</h2>
            <p>Your server crashed because of the following error:</p>
            <pre style="background: #fff; padding: 20px; border-radius: 4px; overflow-x: auto;">${err.message}</pre>
            <p><strong>Diagnosis:</strong> This usually means you forgot to add your Environment Variables (like DATABASE_URL or CLERK_SECRET_KEY) in the Vercel dashboard!</p>
        </div>
    `);
});

if (process.env.VERCEL) {
    ensureDB().catch(err => {
        console.error('Failed to initialize database:', err);
    });
    module.exports = app;
} else {
    initDB().then(() => {
        server.listen(PORT, () => console.log(`\n🚀 SystemCall with Clerk running at http://localhost:${PORT}\n`));
    }).catch(err => {
        console.error('❌ Failed to initialize database:', err.message);
        process.exit(1);
    });
}
