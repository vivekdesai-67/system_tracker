require('dotenv').config();

// Twilio WhatsApp helper
// If credentials are not set, falls back to console.log (safe for dev/testing)
let twilioClient = null;

if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_ACCOUNT_SID !== 'YOUR_TWILIO_ACCOUNT_SID' &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_AUTH_TOKEN !== 'YOUR_TWILIO_AUTH_TOKEN'
) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio client initialized.');
} else {
    console.log('⚠️  Twilio credentials not set. WhatsApp messages will be logged to console only.');
}

/**
 * Send a WhatsApp message to a given phone number.
 * @param {string} toPhone - Recipient phone number with country code (e.g. "+919876543210")
 * @param {string} message - Message body
 */
async function sendWhatsApp(toPhone, message) {
    if (!toPhone) {
        console.log(`[WhatsApp SKIP] No phone number on file. Message: "${message}"`);
        return;
    }

    const to = `whatsapp:${toPhone}`;
    const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

    if (twilioClient) {
        try {
            const msg = await twilioClient.messages.create({ body: message, from, to });
            console.log(`✅ WhatsApp sent to ${toPhone} (SID: ${msg.sid})`);
        } catch (err) {
            console.error(`❌ WhatsApp failed to ${toPhone}:`, err.message);
        }
    } else {
        // Simulated output for development
        console.log(`\n📱 [WhatsApp SIMULATED]\n  To: ${toPhone}\n  Message: "${message}"\n`);
    }
}

module.exports = { sendWhatsApp };
