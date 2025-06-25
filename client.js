const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path'); // Required for path.join if AUTH_DIR is constructed with it

// Import configurations from config.js
const config = require('./config');

// --- AUTH Check and Initialization ---
const authDir = config.AUTH_DIR || './.wwebjs_auth'; // Use from config or default
const deleteAuthFlag = process.argv.includes('--delete-auth') || process.argv.includes('--delete-session');

if (deleteAuthFlag) {
    console.log(`--delete-auth flag detected. Removing ${authDir}...`);
    if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`🗑️ Deleted ${authDir}. Please scan the QR code.`);
    } else {
        console.log(`ℹ️ Directory ${authDir} not found, nothing to delete.`);
    }
} else {
    console.log(`ℹ️ Using session data from ${authDir}. Run with --delete-auth to reset.`);
}

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authDir }), // Use authDir here
    puppeteer: {
        executablePath: config.PUPPETEER_EXECUTABLE_PATH,
        headless: true, // Keep headless true, can be configured if needed
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--log-level=3', // Suppress excessive logging from Puppeteer/Chrome
            '--disable-logging', // Alias for --enable-logging=stderr --v=0
            // '--single-process', // Consider if still facing issues, but can impact stability
        ],
    },
    webVersionCache: {
        type: 'remote',
        remotePath: config.WEB_VERSION_CACHE_REMOTE_PATH,
    },
    waitForLogin: true,
});

client.on('qr', qr => {
    console.log('📱 Scan this QR code to log in:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    // This will be expanded later or moved to a dedicated ready handler
    console.log(`✅ Client is ready! Logged in as ${client.info.pushname} (${client.info.wid._serialized})`);
    // botStartTime can be set here or in the main bot initialization logic
    // global.botStartTime = Date.now(); // Example of setting a global variable
});

// Error handling for the client itself
client.on('auth_failure', msg => {
    console.error('❌❌❌ CLIENT AUTHENTICATION FAILURE:', msg);
    // Potentially try to delete auth and restart, or notify admin
});

client.on('disconnected', (reason) => {
    console.warn('🔌 Client was logged out:', reason);
    // Implement reconnection logic or graceful shutdown if necessary
    // process.exit(1); // Example: Exit if disconnected, to be restarted by a process manager
});

module.exports = client;
