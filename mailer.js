require('dotenv').config();
const nodemailer = require('nodemailer');

let transporter = null;

if (
    process.env.GMAIL_USER &&
    process.env.GMAIL_USER !== 'YOUR_GMAIL@gmail.com' &&
    process.env.GMAIL_APP_PASSWORD &&
    process.env.GMAIL_APP_PASSWORD !== 'YOUR_16_CHAR_APP_PASSWORD'
) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
        },
    });
    console.log(`✅ Mailer ready — sending from ${process.env.GMAIL_USER}`);
} else {
    console.log('⚠️  Gmail credentials not set. Emails will be logged to console only.');
}

/**
 * Send an email notification.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 */
async function sendMail(to, subject, html) {
    if (!to) {
        console.log(`[MAIL SKIP] No email on file. Subject: "${subject}"`);
        return;
    }

    if (transporter) {
        try {
            const info = await transporter.sendMail({
                from: `"SystemCall" <${process.env.GMAIL_USER}>`,
                to,
                subject,
                html,
            });
            console.log(`✅ Email sent to ${to} (ID: ${info.messageId})`);
        } catch (err) {
            console.error(`❌ Email failed to ${to}:`, err.message);
        }
    } else {
        // Simulated output for development
        console.log(`\n📧 [EMAIL SIMULATED]\n  To: ${to}\n  Subject: "${subject}"\n`);
    }
}

// ── Email templates ─────────────────────────────────────────────────────────

function newIssueEmail(seniorName, issueTitle, projectName, clientName, priority) {
    return {
        subject: `New Issue Assigned — ${issueTitle}`,
        html: `
        <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0f1115; color: #f1f5f9; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #10b981, #3b82f6); padding: 28px 32px;">
                <h1 style="margin:0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">SystemCall</h1>
                <p style="margin: 6px 0 0; opacity: 0.85; font-size: 14px;">Issue Assignment & Tracking</p>
            </div>
            <div style="padding: 32px;">
                <p style="font-size: 15px; color: #94a3b8; margin-top: 0;">You have a new issue assigned to you.</p>
                <div style="background: #17191e; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 20px; margin: 20px 0;">
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">Issue Details</div>
                    <h2 style="margin: 0 0 12px; font-size: 18px; color: #f1f5f9;">${issueTitle}</h2>
                    <table style="width:100%; border-collapse: collapse; font-size: 14px;">
                        <tr><td style="padding: 6px 0; color: #64748b; width: 120px;">Assigned by</td><td style="color: #f1f5f9; font-weight: 600;">${seniorName}</td></tr>
                        <tr><td style="padding: 6px 0; color: #64748b;">Project</td><td style="color: #f1f5f9;">${projectName}</td></tr>
                        ${clientName ? `<tr><td style="padding: 6px 0; color: #64748b;">Client</td><td style="color: #f1f5f9;">${clientName}</td></tr>` : ''}
                        <tr><td style="padding: 6px 0; color: #64748b;">Priority</td><td style="color: ${priority === 'High' ? '#ef4444' : priority === 'Medium' ? '#f59e0b' : '#22c55e'}; font-weight: 600;">${priority}</td></tr>
                    </table>
                </div>
                <a href="http://localhost:3000/dashboard" style="display: inline-block; background: #10b981; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-top: 8px;">
                    View &amp; Respond →
                </a>
            </div>
            <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: #64748b;">
                Log in to SystemCall to Accept or Deny this issue.
            </div>
        </div>`
    };
}

function responseEmail(juniorName, action, issueTitle) {
    const color = action === 'Accepted' ? '#22c55e' : '#ef4444';
    return {
        subject: `${juniorName} ${action} — ${issueTitle}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0f1115; color: #f1f5f9; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #10b981, #3b82f6); padding: 28px 32px;">
                <h1 style="margin:0; font-size: 22px; font-weight: 700;">SystemCall</h1>
            </div>
            <div style="padding: 32px;">
                <div style="background: #17191e; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 20px; margin-bottom: 20px; border-left: 4px solid ${color};">
                    <p style="margin: 0; font-size: 16px;"><strong style="color: ${color};">${juniorName}</strong> has <strong style="color: ${color};">${action.toUpperCase()}</strong> the issue:</p>
                    <p style="margin: 10px 0 0; font-size: 18px; font-weight: 600;">${issueTitle}</p>
                </div>
                <a href="http://localhost:3000/dashboard" style="display: inline-block; background: #10b981; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                    View in Dashboard →
                </a>
            </div>
        </div>`
    };
}

function updateEmail(juniorName, issueTitle, updateText, status) {
    const color = status === 'Resolved' ? '#22c55e' : '#8b5cf6';
    return {
        subject: `Update on "${issueTitle}" — ${status}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0f1115; color: #f1f5f9; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #10b981, #3b82f6); padding: 28px 32px;">
                <h1 style="margin:0; font-size: 22px; font-weight: 700;">SystemCall</h1>
            </div>
            <div style="padding: 32px;">
                <p style="color: #94a3b8; margin-top: 0;">An update has been posted on your issue.</p>
                <div style="background: #17191e; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 20px; margin-bottom: 20px; border-left: 4px solid ${color};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">${issueTitle}</div>
                    <p style="margin: 0 0 12px; font-style: italic; color: #f1f5f9;">"${updateText}"</p>
                    <span style="background: ${color}22; color: ${color}; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">${status}</span>
                </div>
                <p style="font-size: 14px; color: #64748b;">Posted by <strong style="color: #f1f5f9;">${juniorName}</strong></p>
                <a href="http://localhost:3000/dashboard" style="display: inline-block; background: #10b981; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                    View in Dashboard →
                </a>
            </div>
        </div>`
    };
}

module.exports = { sendMail, newIssueEmail, responseEmail, updateEmail };
