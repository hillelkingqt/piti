// services/GmailService.js
const { google } = require('googleapis');
const { getGoogleAuthClient } = require('./GoogleAuthService'); // Import the function

/**
 * Sends an email using the Gmail API.
 * @param {string} rawEmail Base64 encoded raw email content (RFC 2822 format).
 * @returns {Promise<object|null>} The Gmail API send response or null on error.
 */
async function sendGmail(rawEmail) {
    const oAuth2Client = getGoogleAuthClient();
    if (!oAuth2Client) {
        console.error("❌ [GmailService] Cannot send email: Google Auth Client not initialized.");
        return null;
    }

    // Check if credentials are set (token exists)
    if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
        console.error("❌ [GmailService] Cannot send email: Missing Google API credentials/token. Please authenticate.");
        // Optionally try to refresh token here if applicable, but authentication is likely needed
        return null;
    }

    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    try {
        console.log("[GmailService] Attempting to send email...");
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: rawEmail,
            },
        });
        console.log("[GmailService] Email sent successfully via API. Response Status:", response.status);
        return response.data; // Return the response data
    } catch (err) {
        console.error("❌ [GmailService] Error sending email via API:", err.response?.data || err.message || err);
        // Specific check for invalid grant/expired token
        if (err.response?.data?.error === 'invalid_grant' || err.code === 401) {
            console.error("  >>> Gmail Token seems expired or revoked. Re-authentication required! <<<");
            // Maybe clear the oAuth2Client instance in GoogleAuthService?
        }
        // Re-throw the error so the calling handler knows it failed
        throw err;
    }
}

module.exports = {
    sendGmail
};