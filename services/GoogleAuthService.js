// services/GoogleAuthService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path'); // Include path
const config = require('../config'); // Import paths from config

let oAuth2ClientInstance = null;

function initializeGoogleAuth() {
    if (oAuth2ClientInstance) {
        return oAuth2ClientInstance;
    }

    try {
        // Load credentials
        if (!fs.existsSync(config.CREDENTIALS_PATH)) {
            console.error(`❌ Google Credentials file not found at: ${config.CREDENTIALS_PATH}`);
            throw new Error("Missing Google Credentials file.");
        }
        const credentialsContent = fs.readFileSync(config.CREDENTIALS_PATH, 'utf8');
        const credentials = JSON.parse(credentialsContent);
        const { client_secret, client_id, redirect_uris } = credentials.installed;

        // Create OAuth2 client
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        // Load token
        if (!fs.existsSync(config.TOKEN_PATH)) {
            console.warn(`⚠️ Google Token file not found at: ${config.TOKEN_PATH}. Need to authenticate.`);
            // In a real app, you'd trigger the authentication flow here.
            // For now, we'll let it proceed, and API calls will fail until authenticated.
            // The authentication flow typically needs user interaction via console/web.
            // Triggering that flow automatically from here is complex.
            // It's better handled in the main script on initial setup or error.
        } else {
            try {
                const tokenContent = fs.readFileSync(config.TOKEN_PATH, 'utf8');
                const token = JSON.parse(tokenContent);
                oAuth2Client.setCredentials(token);
                console.log("✅ Google OAuth2 client credentials set from token.json.");
            } catch (tokenError) {
                console.error(`❌ Error reading or parsing Google Token file (${config.TOKEN_PATH}):`, tokenError);
                // Should probably trigger re-authentication flow here as well.
                console.error("   >>> Gmail functionality will likely fail until re-authenticated! <<<");
            }
        }

        oAuth2ClientInstance = oAuth2Client;
        return oAuth2ClientInstance;

    } catch (error) {
        console.error("❌❌ FATAL ERROR initializing Google Auth:", error);
        // Decide how to handle this - maybe exit the bot?
        // throw error; // Re-throw to potentially stop the bot
        return null; // Return null to indicate failure
    }
}

// Export a function that returns the initialized client
module.exports = {
    getGoogleAuthClient: initializeGoogleAuth
};