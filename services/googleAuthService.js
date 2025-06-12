const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const config = require('../config'); // Assuming config.js is in the root

let oAuth2Client = null; // Cache the client

/**
 * Sets up and returns an authenticated Google OAuth2 client.
 * Reads credentials and token from paths specified in config.js.
 * @returns {google.auth.OAuth2|null} The authenticated OAuth2 client, or null if setup fails.
 */
function getOAuth2Client() {
    if (oAuth2Client) {
        // TODO: Add token expiry check and refresh logic if necessary
        // For now, returning cached client
        return oAuth2Client;
    }

    try {
        if (!config.CREDENTIALS_PATH || !config.TOKEN_PATH) {
            console.error("[GoogleAuthService] CREDENTIALS_PATH or TOKEN_PATH not defined in config.");
            return null;
        }

        if (!fs.existsSync(config.CREDENTIALS_PATH)) {
            console.error(`[GoogleAuthService] Credentials file not found at: ${config.CREDENTIALS_PATH}`);
            return null;
        }
        if (!fs.existsSync(config.TOKEN_PATH)) {
            console.error(`[GoogleAuthService] Token file not found at: ${config.TOKEN_PATH}`);
            // This might be a valid scenario if token needs to be generated for the first time.
            // For a running bot, token should exist.
            return null;
        }

        const credentialsContent = fs.readFileSync(config.CREDENTIALS_PATH);
        const credentials = JSON.parse(credentialsContent);
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

        if (!client_secret || !client_id || !redirect_uris) {
            console.error("[GoogleAuthService] Invalid credentials file format. Missing client_secret, client_id, or redirect_uris.");
            return null;
        }

        const currentOAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        const tokenContent = fs.readFileSync(config.TOKEN_PATH);
        const token = JSON.parse(tokenContent);

        if (!token.refresh_token && !token.access_token) { // Basic check for a valid token
            console.error("[GoogleAuthService] Invalid token file format or empty token.");
            return null;
        }

        currentOAuth2Client.setCredentials(token);

        // Optionally, handle token refresh if needed, though googleapis library might do it automatically
        // currentOAuth2Client.on('tokens', (newTokens) => {
        //     if (newTokens.refresh_token) {
        //         // store the new refresh token
        //         console.log('[GoogleAuthService] New refresh token received:', newTokens.refresh_token);
        //         token.refresh_token = newTokens.refresh_token;
        //     }
        //     token.access_token = newTokens.access_token;
        //     token.expiry_date = newTokens.expiry_date;
        //     try {
        //        fs.writeFileSync(config.TOKEN_PATH, JSON.stringify(token));
        //        console.log('[GoogleAuthService] Token refreshed and saved to', config.TOKEN_PATH);
        //     } catch (saveErr) {
        //        console.error('[GoogleAuthService] Error saving refreshed token:', saveErr);
        //     }
        // });


        oAuth2Client = currentOAuth2Client; // Cache it
        console.log("[GoogleAuthService] OAuth2 client configured and authenticated successfully.");
        return oAuth2Client;

    } catch (error) {
        console.error("❌ [GoogleAuthService] Error setting up OAuth2 client:", error);
        oAuth2Client = null; // Clear cache on error
        return null;
    }
}

/**
 * Initializes the Gmail API client using the authenticated OAuth2 client.
 * @returns {object|null} The Gmail API client instance, or null if auth fails.
 */
function getGmailClient() {
    const client = getOAuth2Client();
    if (client) {
        return google.gmail({ version: 'v1', auth: client });
    }
    return null;
}


module.exports = {
    getOAuth2Client,
    getGmailClient, // Exporting this as a convenience
};
