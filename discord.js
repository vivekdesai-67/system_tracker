
async function sendDiscordWebhook(message, color = 0x3b82f6) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn("DISCORD_WEBHOOK_URL is not set. Skipping notification.");
        return;
    }

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    description: message,
                    color: color,
                    timestamp: new Date().toISOString()
                }]
            })
        });
    } catch (err) {
        console.error("Failed to send Discord webhook:", err);
    }
}

module.exports = { sendDiscordWebhook };
