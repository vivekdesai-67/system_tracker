async function sendDiscordWebhook(message, color = 0x3b82f6, pingContent = null) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn("DISCORD_WEBHOOK_URL is not set. Skipping notification.");
        return;
    }

    try {
        const payload = {
            embeds: [{
                description: message,
                color: color,
                timestamp: new Date().toISOString()
            }]
        };
        
        // Mentions ONLY trigger push notifications if they are in the 'content' field outside the embed
        if (pingContent) {
            payload.content = pingContent;
        }

        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Failed to send Discord webhook:", err);
    }
}

module.exports = { sendDiscordWebhook };
