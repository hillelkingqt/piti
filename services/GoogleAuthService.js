// services/GoogleAuthService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path'); // Include path

// Define the list of authorized email addresses
const AUTHORIZED_EMAILS = ['hillelben14@gmail.com', 'hagben@gmail.com'];
const config = require('../config'); // Import paths from config

let oAuth2ClientInstance = null;

// Updated to be an async function
async function initializeGoogleAuth() {
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

        // Load token and verify user
        if (!fs.existsSync(config.TOKEN_PATH)) {
            console.warn(`⚠️ Google Token file not found at: ${config.TOKEN_PATH}. Need to authenticate.`);
            // In a real app, you'd trigger the authentication flow here.
            // For this example, we'll throw an error if the token doesn't exist,
            // as user verification is now part of this process.
            oAuth2ClientInstance = null; // Ensure instance is null
            throw new Error("Missing Google Token file. Please authenticate first.");
        }

        const tokenContent = fs.readFileSync(config.TOKEN_PATH, 'utf8');
        const token = JSON.parse(tokenContent);
        oAuth2Client.setCredentials(token);
        console.log("✅ Google OAuth2 client credentials set from token.json.");

        // Retrieve user's email and check authorization
        const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
        const { data: userInfo } = await oauth2.userinfo.get(); // This makes the function async

        if (!userInfo || !userInfo.email) {
            console.error("❌ Could not retrieve user email from Google.");
            oAuth2ClientInstance = null; // Ensure instance is null
            throw new Error("Failed to retrieve user email for authorization check.");
        }
        const userEmail = userInfo.email;
        console.log(`ℹ️ Authenticated user email: ${userEmail}`);

        if (!AUTHORIZED_EMAILS.includes(userEmail)) {
            console.error(`❌ Unauthorized email: ${userEmail}. Access denied.`);
            // Clear the potentially problematic instance
            oAuth2ClientInstance = null;
            throw new Error(`User email ${userEmail} is not authorized.`);
        }

        console.log(`✅ User email ${userEmail} is authorized.`);
        oAuth2ClientInstance = oAuth2Client;
        return oAuth2ClientInstance;

    } catch (error) {
        console.error("❌❌ ERROR during Google Auth initialization or user verification:", error.message);
        oAuth2ClientInstance = null; // Ensure instance is null on error
        throw error; // Re-throw to allow calling code to handle
    }
}


// Export a function that returns the initialized client
module.exports = {
    getGoogleAuthClient: initializeGoogleAuth // Export the modified async function
};