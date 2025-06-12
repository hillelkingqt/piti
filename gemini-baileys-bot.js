const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore, // Optional: for storing minimal data like chats
    useSingleFileAuthState // Import useSingleFileAuthState
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const P = require('pino'); // Optional: for logging

// --- Configuration ---
const AUTH_FILE_PATH = path.join(__dirname, 'baileys_auth_info_simple_test.json');
const store = makeInMemoryStore({});
store?.readFromFile('./baileys_store_simple_test.json');
setInterval(() => {
    store?.writeToFile('./baileys_store_simple_test.json');
}, 10_000);

// --- Function to Start the Bot ---
async function startSimpleBot() {
    console.log('--- Starting Simple Baileys Test ---');

    // --- REMOVE THIS SECTION - useSingleFileAuthState handles auth file ---
    // if (fs.existsSync(AUTH_FILE_PATH)) {
    //     console.log('Removing previous test auth state...');
    //     try {
    //         fs.unlinkSync(AUTH_FILE_PATH);
    //         console.log('Previous test auth state removed.');
    //     } catch (err) {
    //         console.error('Error removing previous auth state:', err);
    //     }
    // }
    // --- REMOVE THIS SECTION ---

    if (fs.existsSync('./baileys_store_simple_test.json')) {
        console.log('Removing previous test store file...');
        try {
            fs.unlinkSync('./baileys_store_simple_test.json');
            console.log('Previous test store file removed.');
        } catch (err) {
            console.error('Error removing previous store file:', err);
        }
    }

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA version: ${version.join('.')}, isLatest: ${isLatest}`);

    // --- Use useSingleFileAuthState here ---
    const { state, saveCreds } = await useSingleFileAuthState(AUTH_FILE_PATH);

    const sock = makeWASocket({
        version,
        printQRInTerminal: true,
        logger: P({ level: 'silent' }),
        auth: state, // Pass the auth state here
    });

    store?.bind(sock.ev);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('--------------------------------------------------');
            console.log('[QR Code] Scan the QR code above using WhatsApp.');
            console.log('--------------------------------------------------');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.error('[Connection Close] Connection closed due to:', lastDisconnect?.error);
            console.log('[Connection Close] Should reconnect:', shouldReconnect);
            if (shouldReconnect) {
                console.log('[Connection Close] Attempting to reconnect...');
                startSimpleBot();
            } else {
                console.log('[Connection Close] Connection closed permanently (likely logged out). Delete the auth file (`baileys_auth_info_simple_test.json`) and restart.');
            }
        } else if (connection === 'open') {
            console.log('--------------------------------------------------');
            console.log('✅ [Connection Open] Connected successfully!');
            console.log('>>> NOW, SEND A MESSAGE CONTAINING HEBREW TEXT <<<');
            console.log('>>> FROM ANOTHER WHATSAPP ACCOUNT TO THIS BOT <<<');
            console.log('--------------------------------------------------');
        }
    });

    sock.ev.on('creds.update', saveCreds); // Use saveCreds from useSingleFileAuthState

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log(`\n[Message Event] Type: ${type}`);
        if (type !== 'notify') {
            console.log('[Message Event] Ignoring non-notify event.');
            return;
        }

        const msg = messages[0];
        if (!msg.message) {
            console.log('[Message Event] Ignoring message without content.');
            return;
        }
        if (msg.key.fromMe) {
            console.log('[Message Event] Ignoring message sent by the bot.');
            return;
        }

        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || null;
        if (messageText) {
            console.log('Received Text:', messageText);
            try {
                await sock.sendMessage(msg.key.remoteJid, { text: `[TEST BOT] קיבלתי את ההודעה שלך: "${messageText}"` });
            } catch (replyErr) {
                console.error(`Failed to send reply to ${msg.key.remoteJid}:`, replyErr);
            }
        } else {
            console.log('Message does not contain text.');
        }
    });

    console.log('Simple bot setup complete. Waiting for connection...');
}

// --- Run the Bot ---
startSimpleBot().catch(err => {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!! BOT היהיהיהFAILED TO START:", err);
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
});