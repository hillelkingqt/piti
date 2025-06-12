const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const moment = require('moment-timezone'); // *** ADDED for date/time handling ***
const express = require('express'); // ADD THIS
const adminApiRoutes = require('./adminApiRoutes'); // ADD THIS
const cors = require('cors'); // Will be installed

// --- Configuration ---
const TELEGRAM_BOT_TOKEN = '7876061979:AAF4qdcalkpseJq6buMrEMTJQsobYVUIH-4';
const GEMINI_API_KEY = 'AIzaSyCqQDiGTA-wX4Aggm-xxWATqTjO7tvW8W8'; // Use your actual Gemini API Key
const TARGET_CHAT_ID = 5610767655; // Your specific chat ID
const GEMINI_MODEL_NAME = 'gemini-2.0-flash-thinking-exp'; // *** Specific Model Name - UNCHANGED ***

const CREDENTIALS_PATH = path.join(__dirname, 'client_secret_170964452340-4a28usprg4v3ga2mua7rlgf3uvp3u8ns.apps.googleusercontent.com.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const MEMORIES_PATH = path.join(__dirname, 'memories.json');
const LAST_HISTORY_ID_PATH = path.join(__dirname, 'lastHistoryId.txt');
const TEMP_FILES_DIR = path.join(__dirname, 'temp_telegram_files');

const GMAIL_CHECK_INTERVAL = 30000; // Check Gmail every 30 seconds
const HISTORY_LENGTH = 30;
const MAX_SEARCH_RESULTS = 20; // Max emails to return in a search
const ISRAEL_TIMEZONE = 'Asia/Jerusalem'; // *** ADDED for timezone ***

// --- Global Variables ---
let oAuth2Client;
let gmail;
/** @type {TelegramBot} */
let bot;
let chatHistory = {}; // Store history per chat { chatId: [messages] }
let recentSearchResults = {}; // Store recent search results per chat { chatId: results }
let memories = [];
let telegramFileMap = new Map(); // Map<telegramMessageId, {filePath, originalName, mimeType}>
let lastHistoryId;
let botInfo = null; // Store bot info like ID and username after connection

// --- Initialization ---

async function initialize() {
    console.log("🚀 Initializing Bot...");
    moment.tz.setDefault(ISRAEL_TIMEZONE); // *** Set default timezone ***

    // Ensure temp directory exists
    if (!fs.existsSync(TEMP_FILES_DIR)) {
        fs.mkdirSync(TEMP_FILES_DIR);
        console.log(`Created temporary files directory: ${TEMP_FILES_DIR}`);
    }

    // Load Memories
    loadMemories();
    console.log(`🧠 Loaded ${memories.length} initial memories.`);

    // Load Last History ID
    loadLastHistoryId();
    console.log(`📨 Initial Gmail History ID: ${lastHistoryId || 'None (will fetch)'}`);

    // Initialize Google Auth and Gmail API
    if (!initializeGoogleApis()) {
        console.error("❌ CRITICAL: Failed to initialize Google APIs. Exiting.");
        process.exit(1);
    }
    console.log("🔑 Google APIs initialized.");

    // Initialize Telegram Bot
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

    try {
        botInfo = await bot.getMe(); // Get bot's own info
        console.log(`🤖 Telegram Bot connected: ${botInfo.first_name} (@${botInfo.username}, ID: ${botInfo.id})`);
    } catch (error) {
        console.error("❌ Failed to get bot info:", error);
        process.exit(1); // Exit if we can't verify bot connection
    }

    setupTelegramListeners(); // Sets up message listener AND error handlers

    // Start Gmail check loop
    console.log(`📧 Starting Gmail check loop (interval: ${GMAIL_CHECK_INTERVAL / 1000}s)...`);
    // Run the first check with a slight delay to allow bot connection to fully stabilize
    setTimeout(checkNewEmails, 5000);
    setInterval(checkNewEmails, GMAIL_CHECK_INTERVAL);

    console.log("✅ Bot initialization complete. Waiting for messages and emails...");
}

// --- Google API Initialization (Same as before, includes token refresh) ---
function initializeGoogleApis() {
    try {
        const credentials = loadCredentials();
        if (!credentials) return false;
        oAuth2Client = authorize(credentials);
        if (!oAuth2Client) return false;
        gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        return true;
    } catch (error) {
        console.error('❌ Error initializing Google APIs:', error);
        return false;
    }
}

function loadCredentials() {
    try {
        const content = fs.readFileSync(CREDENTIALS_PATH);
        return JSON.parse(content);
    } catch (err) {
        console.error(`❌ Error loading credentials file (${CREDENTIALS_PATH}):`, err);
        return null;
    }
}

function authorize(credentials) {
    try {
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        // Load token or throw error if it doesn't exist
        if (!fs.existsSync(TOKEN_PATH)) {
            throw new Error(`Token file not found at ${TOKEN_PATH}. Please authenticate first.`);
        }
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
        client.setCredentials(token);

        client.on('tokens', (newTokens) => {
            const currentToken = client.credentials; // Get current token state
            let tokenToSave = {...currentToken}; // Clone it
            if (newTokens.refresh_token) {
                console.log('🔑 Received new refresh token.');
                tokenToSave.refresh_token = newTokens.refresh_token;
            }
            if(newTokens.access_token){
                tokenToSave.access_token = newTokens.access_token;
            }
            if(newTokens.expiry_date){
                tokenToSave.expiry_date = newTokens.expiry_date;
            }

            try {
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenToSave, null, 2));
                console.log('🔑 Token refreshed and saved successfully.');
                client.setCredentials(tokenToSave); // Update client immediately
            } catch (err) {
                console.error('❌ Error saving refreshed token:', err);
            }
        });
        return client;
    } catch (err) {
        console.error('❌ Error authorizing Google Client:', err);
        return null;
    }
}

// --- Memory Persistence (Same as before) ---
function loadMemories() {
    try {
        if (fs.existsSync(MEMORIES_PATH)) {
            const data = fs.readFileSync(MEMORIES_PATH, 'utf8');
            memories = JSON.parse(data);
            if (!Array.isArray(memories)) {
                console.warn("⚠️ Memories file exists but is not an array. Resetting to empty.");
                memories = [];
            }
            memories.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        } else {
            console.log("No memories file found, creating one.");
            memories = [];
            fs.writeFileSync(MEMORIES_PATH, JSON.stringify([]), 'utf8');
        }
    } catch (err) {
        console.error("❌ Error loading memories:", err);
        memories = [];
    }
}

function saveMemories() {
    try {
        if (!Array.isArray(memories)) {
            console.error("❌ Attempted to save non-array data to memories. Aborting.");
            return;
        }
        fs.writeFileSync(MEMORIES_PATH, JSON.stringify(memories, null, 2), 'utf8');
    } catch (err) {
        console.error("❌ Error saving memories:", err);
    }
}

// --- Gmail History Persistence (Same as before) ---
function loadLastHistoryId() {
    try {
        if (fs.existsSync(LAST_HISTORY_ID_PATH)) {
            lastHistoryId = fs.readFileSync(LAST_HISTORY_ID_PATH, 'utf8').trim();
            if (lastHistoryId === "") lastHistoryId = null; // Treat empty file as null
        } else {
            console.log("No last history ID file found, creating one.");
            lastHistoryId = null;
            fs.writeFileSync(LAST_HISTORY_ID_PATH, '', 'utf8');
        }
    } catch (err) {
        console.error("❌ Error loading last history ID:", err);
        lastHistoryId = null;
    }
}

function saveLastHistoryId(historyId) {
    if (!historyId) {
         console.warn("⚠️ Attempted to save null or empty history ID. Skipping.");
         return;
     }
    try {
        fs.writeFileSync(LAST_HISTORY_ID_PATH, historyId.toString(), 'utf8'); // Ensure it's a string
        lastHistoryId = historyId;
    } catch (err) {
        console.error("❌ Error saving last history ID:", err);
    }
}

// --- Bot Message Logging Wrapper ---
async function sendMessageAndLog(chatId, text, options = {}) {
    if (!bot) {
        console.error("❌ Attempted to send message before bot was initialized.");
        return null;
    }
    if (!botInfo) {
        try { botInfo = await bot.getMe(); } catch(e){ console.error("Failed to get bot info in send log"); return null;}
    }
    try {
        const sentMsg = await bot.sendMessage(chatId, text, options);
        if (sentMsg) {
            addToHistory(chatId, {
                message_id: sentMsg.message_id,
                from: { id: botInfo.id, first_name: botInfo.first_name, username: botInfo.username, is_bot: true },
                chat: { id: chatId },
                date: Math.floor(Date.now() / 1000),
                text: text
            });
        } else {
             console.warn("[sendMessageAndLog] bot.sendMessage did not return a message object. Cannot log to history.");
        }
        return sentMsg;
    } catch (error) {
        console.error(`❌ Error sending message or logging bot reply in chat ${chatId}:`, error.response?.data || error.message);
        // Log error message to history
        addToHistory(chatId, {
             message_id: Date.now(), // Fake ID for logging
             from: { id: botInfo?.id || -1, first_name: botInfo?.first_name || 'Bot', is_bot: true },
             chat: { id: chatId },
             date: Math.floor(Date.now() / 1000),
             text: `[BOT_SEND_ERROR: ${error.message}]`
         });
        // Don't re-throw here, let the calling function decide based on context
        // throw error;
        return null; // Indicate failure
    }
}


// --- Gmail Fetching Logic (Same as before, handles token refresh) ---
async function checkNewEmails() {
    if (!gmail || !oAuth2Client) {
        console.warn("⏳ Gmail client not ready, skipping check.");
        return;
    }
     if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
         console.warn("⏳ Missing Google credentials/token, skipping Gmail check.");
         if(oAuth2Client.credentials.refresh_token){
             try {
                 console.log("Attempting token refresh before Gmail check...");
                 await oAuth2Client.refreshAccessToken();
                 console.log("Token refreshed successfully.");
             } catch (refreshError) {
                 console.error("❌ Token refresh failed:", refreshError.message);
                 return; // Don't proceed if refresh fails
             }
         } else {
             console.error("❌ No refresh token available. Manual re-authentication needed.");
             return;
         }
     }

     if (!lastHistoryId) {
         try {
             console.log("⏳ No last history ID. Fetching latest message ID...");
             const res = await gmail.users.messages.list({ userId: 'me', maxResults: 1 });
             if (res.data.messages && res.data.messages.length > 0 && res.data.historyId) {
                 console.log(`📚 Established starting history ID: ${res.data.historyId}`);
                 saveLastHistoryId(res.data.historyId);
             } else if (res.data.messages && res.data.messages.length > 0) {
                 const latestMsgId = res.data.messages[0].id;
                 const msgDetails = await gmail.users.messages.get({ userId: 'me', id: latestMsgId, format: 'metadata', metadataHeaders: ['historyId'] });
                 if (msgDetails.data.historyId) {
                      console.log(`📚 Found starting history ID from message: ${msgDetails.data.historyId}`);
                     saveLastHistoryId(msgDetails.data.historyId);
                 } else {
                     console.error("❌ Could not retrieve history ID from the latest message or list call.");
                     return;
                 }
             } else {
                 console.log("📬 Inbox seems empty. No history ID baseline set yet.");
                  if (res.data.historyId) {
                      saveLastHistoryId(res.data.historyId);
                  }
                  return;
             }
         } catch (err) {
             console.error("❌ Error getting initial history ID:", err.response?.data?.error?.message || err.message);
              if (err.response?.status === 401 || err.response?.data?.error === 'invalid_grant') {
                  console.error("Authentication error fetching initial history ID. Token might be invalid/expired.");
              }
             return;
         }
     }

    try {
        const response = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: lastHistoryId,
            historyTypes: ['messageAdded'],
        });

         let currentHistoryId = response.data.historyId;

        if (response.data.history) {
            const addedMessages = response.data.history
                .flatMap(record => record.messagesAdded || [])
                 .map(added => added.message)
                 .filter(msg => !msg.labelIds || (!msg.labelIds.includes('DRAFT') && !msg.labelIds.includes('SENT') ) || msg.labelIds.includes('INBOX') || msg.labelIds.includes('UNREAD'))
                 .filter((msg, index, self) => self.findIndex(m => m.id === msg.id) === index);

            if (addedMessages.length > 0) {
                console.log(`💌 Found ${addedMessages.length} potentially new message(s). Processing...`);
                for (const message of addedMessages) {
                    await processGmailMessage(message.id);
                    await delay(600);
                }
            }
        }

         if (currentHistoryId && currentHistoryId !== lastHistoryId) { // Only save if it changed
              saveLastHistoryId(currentHistoryId);
         }

    } catch (error) {
        console.error("❌ Error checking Gmail history:", error.response?.data?.error?.message || error.message);
         if (error.response?.status === 401 || error.response?.data?.error === 'invalid_grant') {
             console.error("Authentication error during Gmail check. Token invalid/expired.");
         } else if (error.response?.status === 404 && error.response?.data?.error?.message?.includes('historyId not found') ) {
             console.warn(`⚠️ History ID ${lastHistoryId} not found or too old. Resetting history ID.`);
             saveLastHistoryId(null);
             loadLastHistoryId();
         }
    }
}

async function processGmailMessage(messageId) {
    console.log(`📧 Processing Gmail message ID: ${messageId}`);
    try {
        const msg = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full' // Need full format for body/attachments
        });

        if (msg.data.labelIds && (msg.data.labelIds.includes('SENT') || msg.data.labelIds.includes('DRAFT')) && !msg.data.labelIds.includes('INBOX') ) {
             console.log(`🚫 Skipping message ID ${messageId} as it appears to be SENT/DRAFT only.`);
             return;
        }

        const payload = msg.data.payload;
        if(!payload) {
             console.warn(`⚠️ No payload found for message ID ${messageId}. Skipping.`);
             return;
         }
        const headers = payload.headers;
        if (!headers) {
             console.warn(`⚠️ No headers found for message ID ${messageId}. Skipping.`);
             return;
         }
        const subjectHeader = headers.find(header => header.name.toLowerCase() === 'subject');
        const fromHeader = headers.find(header => header.name.toLowerCase() === 'from');

        const subject = subjectHeader ? subjectHeader.value : 'No Subject';
        const sender = fromHeader ? fromHeader.value : 'Unknown Sender';
        const originalGmailId = msg.data.id;

        let body = extractTextBody(payload); // Use helper function

        // Crude HTML simplification if only HTML was found
        if (!body && payload.mimeType === 'text/html' && payload.body?.data) {
           const htmlBody = Buffer.from(payload.body.data, 'base64').toString('utf8');
           body = `(תצוגה פשוטה של תוכן HTML):\n${stripHtmlTags(htmlBody).substring(0, 3000)}...`;
        } else if (!body) {
            body = extractHtmlBody(payload); // Try extracting HTML if plain text failed
            if(body) {
                 body = `(תצוגה פשוטה של תוכן HTML):\n${stripHtmlTags(body).substring(0, 3000)}...`;
            } else {
                body = 'Email body not found or could not be decoded.';
            }
        }


        let telegramMessage = `📬 *הודעת דוא"ל חדשה התקבלה* 📬\n\n`;
        telegramMessage += `*מאת:* \`${sender}\`\n`;
        telegramMessage += `*נושא:* ${subject}\n`;
        telegramMessage += `*מזהה דוא"ל (למענה/חיפוש):* \`${originalGmailId}\`\n\n`; // Use backticks
        telegramMessage += `------------------\n`;
        telegramMessage += body.substring(0, 3500);
        if (body.length > 3500) {
            telegramMessage += "\n\n_[הודעה קוצרה]_";
        }

        // --- Check for Attachments and list them ---
        const attachments = findAttachments(payload);
        if (attachments.length > 0) {
            telegramMessage += `\n\n📎 *קבצים מצורפים:*\n`;
            attachments.forEach(att => {
                telegramMessage += `- ${att.filename} (${formatBytes(att.size)})\n`;
                // Note: We don't expose attachment IDs here for simplicity,
                // they will be handled during specific forwarding requests via search.
            });
        }
        // --- End Attachment Check ---

        console.log(`✅ Forwarding Email ID: ${originalGmailId}, Subject: ${subject}`);
        await sendMessageAndLog(TARGET_CHAT_ID, telegramMessage, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error(`❌ Error processing Gmail message ID ${messageId}:`, error.response?.data || error.message);
        try {
           await sendMessageAndLog(TARGET_CHAT_ID, `❌ שגיאה בעיבוד דוא"ל עם מזהה \`${messageId}\`.\n\`\`\`${error.message}\`\`\``, { parse_mode: 'Markdown' });
        } catch (notifyError) {
            console.error("❌ Additionally failed to send processing error notification to Telegram:", notifyError);
        }
    }
}

// --- Telegram Bot Logic ---

function setupTelegramListeners() {
    console.log("Setting up Telegram listeners...");

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const messageId = msg.message_id;

        if (!botInfo || !botInfo.id) {
            console.error("❌ Cannot process message: Bot info not available yet.");
             try { botInfo = await bot.getMe(); } catch (e) { console.error("Failed to get bot info on retry:", e); return; }
             if (!botInfo) return;
        }

        if (chatId !== TARGET_CHAT_ID || userId === botInfo.id) {
            return; // Ignore messages not from target chat or from the bot itself
        }

        console.log(`📩 Received message ${messageId} from target chat ${chatId} (User: ${userId})`);

        // --- Add incoming USER message to History ---
        addToHistory(chatId, msg);
        // --- Clear previous search results for this chat when user sends a new message ---
        delete recentSearchResults[chatId];

        // --- Handle File Uploads ---
        let fileInfoForPrompt = null;
        if (msg.document || msg.photo || msg.audio || msg.video || msg.voice) {
            try {
                const fileSource = msg.document || (msg.photo ? msg.photo[msg.photo.length - 1] : null) || msg.audio || msg.video || msg.voice;
                if (fileSource) {
                    const fileId = fileSource.file_id;
                    const mimeType = fileSource.mime_type || mime.lookup(msg.document?.file_name || '') || 'application/octet-stream';
                    const originalName = msg.document?.file_name || `photo_${messageId}.${mime.extension(mimeType) || 'jpg'}` || `audio_${messageId}.${mime.extension(mimeType) || 'ogg'}` || `video_${messageId}.${mime.extension(mimeType) || 'mp4'}` || `voice_${messageId}.${mime.extension(mimeType) || 'ogg'}` || `file_${messageId}.${mime.extension(mimeType) || 'bin'}`;

                    console.log(`Downloading file ${originalName} (ID: ${fileId})...`);
                    fs.mkdirSync(TEMP_FILES_DIR, { recursive: true });
                    const downloadedPath = await bot.downloadFile(fileId, TEMP_FILES_DIR);

                    telegramFileMap.set(messageId, { filePath: downloadedPath, originalName, mimeType });
                    fileInfoForPrompt = {
                        telegramMessageId: messageId,
                        filename: originalName,
                        mimeType: mimeType
                    };
                    console.log(`📄 File received & saved: ${originalName} -> ${downloadedPath}, Mapped to Msg ID: ${messageId}`);
                }
            } catch (downloadError) {
                console.error(`❌ Error downloading/processing Telegram file for msg ${messageId}:`, downloadError);
                await sendMessageAndLog(chatId, "⚠️ סליחה, היתה שגיאה בהורדת הקובץ ששלחת.");
                fileInfoForPrompt = { error: `Failed to download/process file: ${downloadError.message}` };
            }
        }

        // --- Extract Reply Context ---
        let replyToTextForPrompt = null;
        let replyToMsgIdForPrompt = null;
         if (msg.reply_to_message) {
            const repliedMsg = msg.reply_to_message;
             replyToMsgIdForPrompt = repliedMsg.message_id;
            let senderName = 'Unknown User';
             let senderId = repliedMsg.from?.id;
             if(senderId === botInfo.id){
                 senderName = "אני (הבוט)";
             } else if (repliedMsg.from){
                  senderName = repliedMsg.from.first_name || repliedMsg.from.username || `User_${senderId}`;
             }
             replyToTextForPrompt = `[מאת: ${senderName} - ID: ${replyToMsgIdForPrompt}] ${repliedMsg.text || ''}`;
             if (repliedMsg.caption) replyToTextForPrompt += ` [כיתוב: ${repliedMsg.caption}]`;
             if (repliedMsg.document) replyToTextForPrompt += ` [מסמך: ${repliedMsg.document.file_name || 'קובץ'}]`;
             else if (repliedMsg.photo) replyToTextForPrompt += ` [תמונה]`;
             else if (repliedMsg.audio) replyToTextForPrompt += ` [שמע]`;
             else if (repliedMsg.video) replyToTextForPrompt += ` [וידאו]`;
             else if (repliedMsg.voice) replyToTextForPrompt += ` [הודעה קולית]`;
              console.log(`↩️ User replied to message ID: ${replyToMsgIdForPrompt}`);
        }

        // --- Prepare Context for Gemini ---
        const historyText = getChatHistory(chatId);
        const memoriesText = formatMemoriesForPrompt();
        const searchResultsText = formatSearchResultsForPrompt(chatId); // *** ADDED ***
        const currentTimeText = moment().format('LLLL'); // *** ADDED (e.g., Tuesday, July 9, 2024 3:54 PM) ***

        // --- Construct Gemini Prompt (HEBREW INSTRUCTIONS - UPDATED) ---
        const geminiPrompt = `
אתה עוזר וירטואלי המוטמע בטלגרם, ומחובר לחשבון ה-Gmail של המשתמש. שמך "בוט Gmail".
**חובה לענות אך ורק בפורמט JSON תקני. אין להוסיף טקסט לפני או אחרי אובייקט ה-JSON.**
אסור להשתמש ב-markdown (\`\`\`) סביב ה-JSON.

התאריך והשעה הנוכחיים (שעון ישראל): ${currentTimeText}

הפעולות הזמינות (ציין אחת בשדה "action"):

1.  **"text"**: שליחת הודעת טקסט פשוטה למשתמש.
    שדות JSON נדרשים:
    - "action": "text"
    - "message": "תוכן התגובה שלך בעברית."
    - "replyToTelegramMessageId": <מספר> (ה-message_id של הודעת המשתמש שעליה אתה מגיב)

2.  **"send_email"**: שליחת דוא"ל חדש מחשבון ה-Gmail של המשתמש.
    שדות JSON נדרשים:
    - "action": "send_email"
    - "to": "recipient@example.com"
    - "subject": "נושא הדוא""ל"
    - "body": "גוף ההודעה (טקסט פשוט מומלץ)."
    - "replyToTelegramMessageId": <מספר>
    שדות אופציונליים:
    - "attachmentTelegramMessageId": <מספר> (אם המשתמש ביקש לצרף קובץ ששלח בטלגרם, ספק את ה-message_id של ההודעה עם הקובץ. עיין ב'פרטי הקובץ' למטה.)
    - "message": "הודעת ביניים למשתמש בטלגרם (לדוגמה: 'שולח את המייל...')", תישלח לפני ניסיון השליחה.

3.  **"reply_email"**: מענה לדוא"ל קיים ב-Gmail (שהבוט העביר קודם).
    שדות JSON נדרשים:
    - "action": "reply_email"
    - "gmailMessageId": "string" (מזהה הדוא"ל המקורי ב-Gmail, שהבוט סיפק בהודעה המקורית)
    - "subject": "RE: [נושא מקורי]" // או נושא חדש אם מתאים
    - "body": "תוכן המענה שלך."
    - "replyToTelegramMessageId": <מספר>
    שדות אופציונליים:
    - "attachmentTelegramMessageId": <מספר> (כמו ב-send_email)
    - "message": "הודעת ביניים למשתמש בטלגרם (לדוגמה: 'מנסה לשלוח תשובה למייל...')", תישלח לפני ניסיון השליחה.

4.  **"add_memory"**: הוספת פרט מידע לזיכרון המתמשך.
    שדות JSON נדרשים:
    - "action": "add_memory"
    - "memoryData": { "info": "הטקסט שיש לזכור", "person": "(אופציונלי) על מי המידע?", "type": "(אופציונלי) סוג: עובדה/העדפה וכו'." }
    - "message": "הודעת אישור למשתמש בעברית (לדוגמה: 'בסדר, אזכור זאת.')"
    - "replyToTelegramMessageId": <מספר>

5.  **"delete_memory"**: מחיקת זיכרון ספציפי לפי המזהה (ID) שלו.
    שדות JSON נדרשים:
    - "action": "delete_memory"
    - "memoryIdToDelete": <מספר> (המזהה הייחודי של הזיכרון למחיקה - ראה 'זיכרונות נוכחיים' למטה)
    - "message": "הודעת אישור/שגיאה למשתמש (לדוגמה: 'הזיכרון נמחק.', 'מזהה זיכרון לא נמצא.')"
    - "replyToTelegramMessageId": <מספר>

6.  **"search_email"**: חיפוש הודעות דוא"ל בחשבון ה-Gmail של המשתמש.
    שדות JSON נדרשים:
    - "action": "search_email"
    - "query": "string" (שאילתת החיפוש. לדוגמה: "חשבונית PDF", "from:client@example.com subject:דחוף", "has:attachment filename:report.docx"). תמוך באופרטורים סטנדרטיים של Gmail.
    - "replyToTelegramMessageId": <מספר>
    שדות אופציונליים:
    - "searchPeriod": "string" (ציון תקופת זמן. דוגמאות: "today", "yesterday", "last_7_days", "YYYY-MM-DD", "after:YYYY-MM-DD before:YYYY-MM-DD"). אם זה השדה *היחיד* לסינון (ללא query), התוצאות יישלחו ישירות למשתמש. אחרת, התוצאות יוחזרו אליך להמשך עיבוד.
    - "message": "הודעת ביניים למשתמש (לדוגמה: 'מחפש במיילים...')", תישלח לפני החיפוש.

7.  **"forward_email_from_search"**: העברת תוכן (סיכום) של דוא"ל שנמצא בחיפוש למשתמש בטלגרם.
    שדות JSON נדרשים:
    - "action": "forward_email_from_search"
    - "searchResultGmailId": "string" (מזהה ה-Gmail של ההודעה מהחיפוש האחרון - ראה 'תוצאות חיפוש אחרונות')
    - "replyToTelegramMessageId": <מספר>
    שדות אופציונליים:
    - "message": "הודעת ביניים למשתמש (לדוגמה: 'מעביר את המייל...')", תישלח לפני ההעברה.

8.  **"forward_attachment_from_search"**: העברת קובץ מצורף ספציפי מדוא"ל שנמצא בחיפוש למשתמש בטלגרם.
    שדות JSON נדרשים:
    - "action": "forward_attachment_from_search"
    - "searchResultGmailId": "string" (מזהה ה-Gmail של ההודעה מהחיפוש האחרון)
    - "attachmentInfo": { "filename": "string", "partId": "string", "attachmentId": "string" } (פרטי הקובץ המצורף כפי שהופיעו בתוצאות החיפוש האחרונות)
    - "replyToTelegramMessageId": <מספר>
    שדות אופציונליים:
    - "message": "הודעת ביניים למשתמש (לדוגמה: 'מעביר את הקובץ...')", תישלח לפני ההעברה.

מענה מרובה פעולות:
ניתן להחזיר מערך של אובייקטי פעולה בשדה "replies" ברמה העליונה אם נדרשות מספר פעולות נפרדות. אם אתה משתמש ב-"replies", אל תכלול "action" ברמה העליונה.

--- הקשר ---

זיכרונות נוכחיים (ID | תאריך | פרטים):
${memoriesText || "אין זיכרונות שמורים."}
---
${searchResultsText}
---
היסטוריית השיחה (${HISTORY_LENGTH} הודעות אחרונות):
${historyText}
---
${replyToTextForPrompt ? `הודעה שצוטטה (המשתמש ענה לה):\n${replyToTextForPrompt}\n---` : ''}
${fileInfoForPrompt?.error ? `שגיאת קובץ: ${fileInfoForPrompt.error}\n---` : (fileInfoForPrompt ? `פרטי הקובץ שהמשתמש שלח בהודעה זו (ID: ${fileInfoForPrompt.telegramMessageId}):\nשם קובץ: ${fileInfoForPrompt.filename}\nסוג: ${fileInfoForPrompt.mimeType}\n(ניתן להתייחס למזהה ההודעה ${fileInfoForPrompt.telegramMessageId} בשדה 'attachmentTelegramMessageId' אם המשתמש יבקש לצרפו למייל חדש/מענה)\n---` : '')}
הודעת המשתמש הנוכחית (ID: ${messageId}):
${msg.text || '[אין טקסט בהודעה]'}

--- הוראות ---
נתח את הודעת המשתמש הנוכחית בהקשר של היסטוריית השיחה, הזיכרונות, תוצאות החיפוש האחרונות (אם קיימות), ההודעה המצוטטת (אם קיימת) והקובץ שצורף (אם קיים). צור תגובת JSON תקנית המכילה את הפעולה המתאימה ואת השדות הנדרשים.
- אם המשתמש מבקש לחפש מיילים (למשל לפי מילות מפתח, שולח, נושא), השתמש בפעולה **"search_email"**. אם הבקשה כוללת מילות מפתח, אני (הבוט) אקבל את תוצאות החיפוש בהקשר הבא ואז תוכל להחליט מה לעשות איתן (לסכם, להציע העברה וכו'). אם החיפוש הוא *רק* לפי תאריך/טווח תאריכים (ללא מילות מפתח נוספות), התוצאות יישלחו ישירות למשתמש.
- אם המשתמש מבקש להעביר מייל או קובץ מתוך תוצאות החיפוש שהוצגו לך, השתמש בפעולות **"forward_email_from_search"** או **"forward_attachment_from_search"** בהתאמה, תוך שימוש ב-\`searchResultGmailId\` ובפרטי הקובץ המצורף מתוך 'תוצאות חיפוש אחרונות'.
- ודא שהשדה "replyToTelegramMessageId" תמיד מכיל את המזהה של הודעת המשתמש הנוכחית: ${messageId}.
- התגובה למשתמש תמיד צריכה להיות בעברית.
- אם אינך בטוח, בקש הבהרה באמצעות פעולת "text".

תגובת JSON:
`;

        // --- Log the Prompt before sending ---
        console.log("\n===================== Gemini Prompt Start =====================");
        // console.log(geminiPrompt); // Keep this commented unless debugging - it's very long
        console.log(`Prompt length: ${geminiPrompt.length} chars`);
        console.log(`User Message for Prompt (ID ${messageId}): ${msg.text || '[No Text]'}`);
        console.log(`Includes Search Results: ${!!searchResultsText.includes('--- תוצאות חיפוש אחרונות ---')}`);
        console.log("====================== Gemini Prompt End ======================\n");

        try {
            const jsonResponse = await callGemini(geminiPrompt);

            // Handle potential multiple actions
            if (jsonResponse.replies && Array.isArray(jsonResponse.replies)) {
                console.log(`⚡ Received ${jsonResponse.replies.length} actions from Gemini.`);
                for (const actionData of jsonResponse.replies) {
                    if (!actionData || !actionData.replyToTelegramMessageId) {
                        console.warn("⚠️ Skipping action in 'replies' array due to missing data or replyToTelegramMessageId:", actionData);
                        continue;
                    }
                    // *** Pass the current search results context to the handler ***
                    await handleGeminiAction(actionData, msg, recentSearchResults[chatId]);
                    await delay(600);
                }
            } else {
                 if (!jsonResponse || !jsonResponse.replyToTelegramMessageId) {
                     console.warn("⚠️ Gemini response is missing replyToTelegramMessageId. Using fallback.", jsonResponse);
                     jsonResponse.replyToTelegramMessageId = msg.message_id;
                 }
                // *** Pass the current search results context to the handler ***
                await handleGeminiAction(jsonResponse, msg, recentSearchResults[chatId]);
            }

        } catch (geminiError) {
            console.error("❌ Error calling Gemini or processing response:", geminiError);
            let errorMsgToSend = `סליחה, נתקלתי בשגיאה בניסיון להבין את הבקשה שלך.`;
            // Avoid sending overly technical details from Gemini errors to user unless necessary
            if (geminiError.message && (geminiError.message.includes("JSON") || geminiError.message.includes("חסמה"))) {
                 errorMsgToSend += `\n(שגיאה פנימית)`;
            } else if (geminiError.message) {
                 errorMsgToSend += `\nפרטים: ${geminiError.message}`; // Show other error types
            }
            await sendMessageAndLog(chatId, errorMsgToSend, { reply_to_message_id: msg.message_id });
        }
    });

    // --- Centralized Error Listeners (Same as before) ---
    bot.on('polling_error', (error) => {
        console.error(`🅿️ Polling error: ${error.code || 'Unknown Code'} - ${error.message || error}`);
        if (error.code === 'EFATAL') {
            console.error("FATAL POLLING ERROR! Bot may not recover without restart.");
        }
    });
    bot.on('webhook_error', (error) => {
        console.error(`🕸️ Webhook error: ${error.code || 'Unknown Code'} - ${error.message || error}`);
    });
    bot.on('error', (error) => { // General catch-all for library errors
        console.error('🤖 General Telegram Bot Error:', error);
    });

    console.log("✅ Telegram message and error listeners are active.");
}


// --- Gemini Interaction (Uses specific model, same parsing logic) ---
async function callGemini(promptText) {
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

    const requestPayload = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
             temperature: 0.6, // Slightly lower temp for more consistent JSON?
        },
        safetySettings: [
             { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
             { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
             { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
             { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
        ]
    };

    console.log(`🧠 Calling Gemini model: ${GEMINI_MODEL_NAME}...`);

    let response;
    let retryCount = 0;
    const maxRetries = 2; // Reduce retries slightly
    const retryDelayMs = 2000;

    while (retryCount < maxRetries) {
        try {
            response = await axios.post(GEMINI_API_URL, requestPayload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 45000 // Add timeout for Gemini API call
            });

             if (!response.data || !response.data.candidates || !Array.isArray(response.data.candidates) || response.data.candidates.length === 0 ||
                 !response.data.candidates[0].content || !response.data.candidates[0].content.parts || !Array.isArray(response.data.candidates[0].content.parts) || response.data.candidates[0].content.parts.length === 0 ||
                 !response.data.candidates[0].content.parts[0].text) {

                 if (response.data.promptFeedback?.blockReason) {
                     const blockReason = response.data.promptFeedback.blockReason;
                     console.error(`❌ Gemini response blocked due to: ${blockReason}.`);
                     const safetyRatings = response.data.promptFeedback.safetyRatings || [];
                     console.error("Safety Ratings:", JSON.stringify(safetyRatings));
                      // Log more context if blocked
                      console.error("Prompt leading to block (first 500 chars):", promptText.substring(0, 500) + "...");
                      throw new Error(`הבקשה נחסמה על ידי מסנני התוכן של Gemini (סיבה: ${blockReason}). נסה לנסח מחדש.`);
                 }
                 if (response.data.candidates?.[0]?.finishReason && response.data.candidates[0].finishReason !== 'STOP') {
                      console.error(`❌ Gemini response finished unexpectedly: ${response.data.candidates[0].finishReason}`);
                      console.error("Full Candidate:", JSON.stringify(response.data.candidates[0]));
                       if(response.data.candidates[0].finishReason === 'MAX_TOKENS') {
                           throw new Error("תגובת Gemini נקטעה עקב מגבלת אורך.");
                       }
                       throw new Error(`תגובה לא תקינה מ-Gemini (סיבה: ${response.data.candidates[0].finishReason}).`);
                  }

                 console.error("❌ Gemini response missing expected structure or text content:", JSON.stringify(response.data, null, 2));
                 throw new Error("תגובה לא תקינה או ריקה מ-Gemini.");
             }

             const responseText = response.data.candidates[0].content.parts[0].text;
            console.log(`✅ Gemini API call successful (attempt ${retryCount + 1}). Raw Text Length: ${responseText.length}`);

             const jsonResponse = attemptJsonParsingRecovery(responseText);
             if(jsonResponse){
                 console.log("🤖 Gemini Response (Parsed/Recovered JSON):", JSON.stringify(jsonResponse, null, 2));
                  if (typeof jsonResponse !== 'object' || jsonResponse === null) {
                       console.error("❌ Recovered response is not a valid object:", jsonResponse);
                       throw new Error("תגובת Gemini פוענחה אך אינה אובייקט JSON תקני.");
                  }
                 return jsonResponse;
             } else {
                 console.error("❌ Failed to parse Gemini response as JSON even after recovery.");
                 console.error("--- Raw Gemini Response Text Start ---");
                 console.error(responseText);
                 console.error("--- Raw Gemini Response Text End ---");
                  throw new Error("תגובת Gemini אינה בפורמט JSON תקני. בדוק אם יש תוכן לא צפוי בתגובה.");
             }

        } catch (apiError) {
            // Handle specific thrown errors first
             if (apiError instanceof Error && (apiError.message.includes("חסמה") || apiError.message.includes("JSON תקני") || apiError.message.includes("תגובה לא תקינה"))) {
                  throw apiError; // Re-throw specific parsing/safety/format errors immediately
             }

            retryCount++;
             // Handle Axios / network / timeout errors
             let errorMessage = apiError.message;
             if (apiError.code === 'ECONNABORTED') {
                 errorMessage = `Timeout waiting for Gemini API response (${apiError.config.timeout}ms).`;
             } else if (apiError.response) {
                 errorMessage = `Gemini API error: ${apiError.response.status} ${apiError.response.statusText} - ${apiError.response.data?.error?.message || ''}`;
             }
            console.error(`❌ Gemini API error (attempt ${retryCount}/${maxRetries}): ${errorMessage}`);

            const statusCode = apiError.response?.status;
             if ((statusCode === 429 || statusCode === 500 || statusCode === 503 || apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) && retryCount < maxRetries) { // Retriable server/network errors
                const calculatedDelay = retryDelayMs * Math.pow(2, retryCount - 1);
                console.log(`⏳ Retrying Gemini in ${calculatedDelay / 1000} seconds... (Status: ${statusCode || apiError.code || 'N/A'})`);
                await delay(calculatedDelay);
             } else {
                 console.error(`❌ Unrecoverable API error or max retries reached. Not retrying.`);
                 // Throw a user-friendly error for common issues
                  if (statusCode === 400) {
                      throw new Error(`שגיאת Gemini (400 - Bad Request): בדוק את מפתח ה-API או שמבנה הבקשה תקין.`);
                  } else if (statusCode === 403) {
                      throw new Error(`שגיאת Gemini (403 - Forbidden): בדוק הרשאות API Key או הגדרות פרויקט Google Cloud.`);
                  }
                  throw new Error(`תקשורת עם Gemini נכשלה: ${errorMessage}`); // Throw generic error for others
             }
        }
    }
     // Only reached if all retries failed for retriable errors
     throw new Error(`Gemini API נכשל לאחר ${maxRetries} ניסיונות.`);
}

// --- Robust JSON Parsing (Same as before) ---
function attemptJsonParsingRecovery(responseText) {
    if (typeof responseText !== 'string') return null;
    let text = responseText.trim();
    if (text.length === 0) return null;

     if (text.startsWith("```json") && text.endsWith("```")) {
         text = text.substring(7, text.length - 3).trim();
     } else if (text.startsWith("```") && text.endsWith("```")) {
          text = text.substring(3, text.length - 3).trim();
     }

    try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch (e) {}

    let match = text.match(/^\{[\s\S]*\}$/m) || text.match(/^\[[\s\S]*\]$/m);
    if (match) {
        try {
            const parsed = JSON.parse(match[0]);
             if (typeof parsed === 'object' && parsed !== null) {
                 if (Array.isArray(parsed)) {
                      return { replies: parsed }; // Standardize array response
                 }
                 return parsed;
             }
        } catch (e) {}
    }

    console.error("❌ Recovery: Failed all attempts to parse or recover JSON structure from text.");
    return null;
}

// --- Action Handlers (Main router - UPDATED) ---
async function handleGeminiAction(actionData, originalMsg, currentSearchResults) {
    const chatId = originalMsg.chat.id;
    const replyToId = actionData.replyToTelegramMessageId;

     if(!replyToId){
         console.error("❌ CRITICAL: Gemini action response is missing 'replyToTelegramMessageId'. Cannot proceed reliably.", actionData);
         await sendMessageAndLog(chatId, "⚠️ שגיאה פנימית: חסר מזהה הודעה למענה מהבינה המלאכותית.", { reply_to_message_id: originalMsg.message_id });
         return;
     }

    console.log(`🎬 Executing action: ${actionData.action || 'N/A'} (Replying to Msg ID: ${replyToId})`);

    // --- Send Intermediate Message if provided ---
     if (actionData.message && actionData.action !== 'text') { // Don't send intermediate for simple text replies
         try {
             await sendMessageAndLog(chatId, actionData.message, { reply_to_message_id: replyToId });
             await delay(300); // Short delay after intermediate message
         } catch (sendError) {
              console.warn("⚠️ Failed to send intermediate message:", sendError.message);
         }
     }
     // --- ---

    try {
        switch (actionData.action) {
            case 'text':
                if (actionData.message) { // Message is mandatory here
                    await sendMessageAndLog(chatId, actionData.message, { reply_to_message_id: replyToId });
                } else {
                     console.warn("⚠️ Action 'text' received without 'message' content.");
                     await sendMessageAndLog(chatId, "❓ קיבלתי הוראה לשלוח הודעה ריקה.", { reply_to_message_id: replyToId });
                 }
                break;

            case 'send_email':
                await handleSendEmailAction(actionData, originalMsg); // Handles its own confirmation
                break;

            case 'reply_email':
                await handleReplyEmailAction(actionData, originalMsg); // Handles its own confirmation
                break;

            case 'add_memory':
                const added = handleAddMemoryAction(actionData);
                // Confirmation logic (prefer Gemini's message if available)
                 if (!actionData.message) { // If Gemini didn't provide a specific message
                     await sendMessageAndLog(chatId, added ? "🧠 פרט המידע נשמר בזיכרון." : "⚠️ לא הצלחתי לשמור את המידע.", { reply_to_message_id: replyToId });
                 } // If Gemini provided a message, it was already sent as intermediate
                break;

            case 'delete_memory':
                 const deleted = handleDeleteMemoryAction(actionData);
                 if (!actionData.message) {
                     await sendMessageAndLog(chatId, deleted ? "🧠 הזיכרון נמחק." : "❓ לא נמצא זיכרון עם המזהה שצויין למחיקה.", { reply_to_message_id: replyToId });
                 }
                break;

            // *** NEW ACTIONS ***
             case 'search_email':
                 await handleSearchEmailAction(actionData, originalMsg); // Handles its own flow (direct send or results back to AI)
                 break;
             case 'forward_email_from_search':
                 // Pass search results context for validation if needed
                 await handleForwardEmailFromSearchAction(actionData, originalMsg, currentSearchResults); // Handles its own confirmation
                 break;
             case 'forward_attachment_from_search':
                  // Pass search results context for validation if needed
                 await handleForwardAttachmentFromSearchAction(actionData, originalMsg, currentSearchResults); // Handles its own confirmation
                 break;
            // *** END NEW ACTIONS ***

            default:
                console.warn(`❓ Unhandled action type from Gemini: ${actionData.action}`);
                await sendMessageAndLog(chatId, `🤔 קיבלתי פעולה לא מוכרת: '${actionData.action}'. אני עדיין לומד/ת.`, { reply_to_message_id: replyToId });
        }
    } catch (error) {
        console.error(`❌ Error executing action '${actionData.action}':`, error);
        // Avoid double reporting if intermediate message failed
        if (!(actionData.message && actionData.action !== 'text')) {
            await sendMessageAndLog(chatId, `⚠️ סליחה, קרתה שגיאה בעת ניסיון ביצוע הפעולה (${actionData.action}).\n פרטים: \`${error.message}\``, { reply_to_message_id: replyToId, parse_mode: 'Markdown'});
        }
    }
}

// --- Specific Action Handlers ---

// (makeBody and makeMultipartBody remain the same)
function makeBody(to, from, subject, message, headers = {}) {
    const emailLines = [
        `To: ${to}`,
        `From: ${from}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    ];
    if (headers['In-Reply-To']) emailLines.push(`In-Reply-To: ${headers['In-Reply-To']}`);
    if (headers['References']) emailLines.push(`References: ${headers['References']}`);
    emailLines.push('', message);
    const email = emailLines.join('\n');
    return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeMultipartBody(to, from, subject, message, attachmentPath, attachmentOriginalName, originalHeaders = {}) {
    const boundary = `boundary_${Date.now().toString(16)}`;
    const attachment = fs.readFileSync(attachmentPath);
    const encodedAttachment = attachment.toString('base64');
    const filename = path.basename(attachmentOriginalName || attachmentPath); // Use original name if provided
    const mimeType = mime.lookup(filename) || 'application/octet-stream';
    const emailLines = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ];
    if (originalHeaders['In-Reply-To']) emailLines.push(`In-Reply-To: ${originalHeaders['In-Reply-To']}`);
    if (originalHeaders['References']) emailLines.push(`References: ${originalHeaders['References']}`);
    emailLines.push(
        '',
        `--${boundary}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `Content-Transfer-Encoding: base64`,
        '', Buffer.from(message).toString('base64'),
        '',
        `--${boundary}`,
        // Ensure filename* is UTF-8 encoded for non-ASCII names
        `Content-Type: ${mimeType}; name*=UTF-8''${encodeURIComponent(filename)}`,
        `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        `Content-Transfer-Encoding: base64`,
        '', encodedAttachment,
        '',
        `--${boundary}--`
    );
    const email = emailLines.join('\r\n'); // Use CRLF for email line endings
    return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}


async function handleSendEmailAction(actionData, originalMsg) {
    console.log(`📨 Handling send_email: To=${actionData.to}, Subject=${actionData.subject}`);
     if (!actionData.to || !actionData.subject || !actionData.body) {
         throw new Error("יש למלא נמען ('to'), נושא ('subject'), וגוף הודעה ('body') לשליחת אימייל.");
     }
    const replyToTelegramId = actionData.replyToTelegramMessageId || originalMsg.message_id;

    let attachmentPath = null;
    let attachmentOriginalName = null;
    if (actionData.attachmentTelegramMessageId) {
         const fileData = telegramFileMap.get(Number(actionData.attachmentTelegramMessageId));
        if (fileData && fs.existsSync(fileData.filePath)) {
            attachmentPath = fileData.filePath;
            attachmentOriginalName = fileData.originalName; // Get original name
            console.log(`📎 Attaching file: ${attachmentPath} (Original: ${attachmentOriginalName})`);
        } else {
            console.warn(`⚠️ Attachment file for Telegram message ID ${actionData.attachmentTelegramMessageId} not found or invalid.`);
             await sendMessageAndLog(originalMsg.chat.id, "⚠️ לא מצאתי את הקובץ שביקשת לצרף. המייל ישלח בלעדיו.", { reply_to_message_id: replyToTelegramId });
        }
    }

    try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const userEmail = profile.data.emailAddress;
        if (!userEmail) throw new Error("לא ניתן היה לקבל את כתובת המייל של המשתמש.");

        let rawEmail;
        if (attachmentPath) {
            rawEmail = makeMultipartBody(actionData.to, userEmail, actionData.subject, actionData.body, attachmentPath, attachmentOriginalName);
        } else {
            rawEmail = makeBody(actionData.to, userEmail, actionData.subject, actionData.body);
        }

        const sentMessage = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: rawEmail } });
        console.log(`✅ Gmail API: Email sent successfully to ${actionData.to} (ID: ${sentMessage.data.id})`);

        // Send SUCCESS confirmation
        await sendMessageAndLog(originalMsg.chat.id, `✅ המייל נשלח בהצלחה אל: ${actionData.to}`, { reply_to_message_id: replyToTelegramId });

        // Clean up temp file AFTER successful send
        if (attachmentPath && actionData.attachmentTelegramMessageId) {
            cleanupTemporaryFile(attachmentPath, Number(actionData.attachmentTelegramMessageId));
        }
    } catch (error) {
        console.error("❌ Failed to send email via Gmail API:", error.response?.data?.error?.message || error.message);
        throw new Error(`שגיאה בשליחת המייל: ${error.response?.data?.error?.message || error.message}`);
    }
}

async function handleReplyEmailAction(actionData, originalMsg) {
    console.log(`↪️ Handling reply_email: GmailID=${actionData.gmailMessageId}, Subject=${actionData.subject}`);
    if (!actionData.gmailMessageId || !actionData.subject || !actionData.body) {
         throw new Error("יש לציין מזהה דוא\"ל מקורי ('gmailMessageId'), נושא ('subject'), וגוף תשובה ('body') למענה.");
     }
    const replyToTelegramId = actionData.replyToTelegramMessageId || originalMsg.message_id;

    let attachmentPath = null;
    let attachmentOriginalName = null;
     if (actionData.attachmentTelegramMessageId) {
        const fileData = telegramFileMap.get(Number(actionData.attachmentTelegramMessageId));
         if (fileData && fs.existsSync(fileData.filePath)) {
             attachmentPath = fileData.filePath;
             attachmentOriginalName = fileData.originalName;
             console.log(`📎 Attaching file to reply: ${attachmentPath} (Original: ${attachmentOriginalName})`);
         } else {
             console.warn(`⚠️ Attachment file for Telegram message ID ${actionData.attachmentTelegramMessageId} not found for reply.`);
              await sendMessageAndLog(originalMsg.chat.id, "⚠️ לא מצאתי את הקובץ שביקשת לצרף לתשובה. המענה למייל ישלח בלעדיו.", { reply_to_message_id: replyToTelegramId });
         }
     }

     try {
        const originalMsgData = await gmail.users.messages.get({
             userId: 'me',
             id: actionData.gmailMessageId,
             format: 'metadata', // Need metadata for headers and threadId
             metadataHeaders: ['Subject', 'From', 'To', 'Message-ID', 'References', 'In-Reply-To']
         });

        const payload = originalMsgData.data.payload;
         if(!payload || !payload.headers){ throw new Error("לא ניתן היה לקבל את הכותרות מהאימייל המקורי.");}
        const headers = payload.headers;

        const originalMessageId = headers.find(h => h.name.toLowerCase() === 'message-id')?.value;
        const originalReferences = headers.find(h => h.name.toLowerCase() === 'references')?.value;
        const originalInReplyTo = headers.find(h => h.name.toLowerCase() === 'in-reply-to')?.value || originalMessageId; // Fallback to Message-ID
         const originalFromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
         const originalToHeader = headers.find(h => h.name.toLowerCase() === 'to')?.value || ''; // Needed to determine sender address in reply

        // Find the actual sender's address from the original 'To' header if replying to own sent mail, otherwise use 'From'.
        // This isn't perfect but handles common reply scenarios.
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const userEmail = profile.data.emailAddress;
        if (!userEmail) throw new Error("לא ניתן היה לקבל את כתובת המייל של המשתמש.");

        let replyToAddress;
        const fromAddress = originalFromHeader.match(/<([^>]+)>/)?.[1] || originalFromHeader.trim();

        // Simple check: if the original sender is the user, reply to the 'To' address. Otherwise, reply to 'From'.
        // This might need refinement for complex CC/BCC scenarios.
        if (fromAddress.toLowerCase() === userEmail.toLowerCase()) {
            replyToAddress = originalToHeader.match(/<([^>]+)>/)?.[1] || originalToHeader.trim();
        } else {
            replyToAddress = fromAddress;
        }

         if(!replyToAddress) {
             console.error("Original From:", originalFromHeader);
             console.error("Original To:", originalToHeader);
             console.error("User Email:", userEmail);
             throw new Error("לא ניתן היה לקבוע את נמען התשובה מהכותרות 'From' או 'To'.");
         }


         // Construct threading headers
         let references = originalReferences ? `${originalReferences} ${originalMessageId}` : originalMessageId;
         if (!originalMessageId) { references = originalReferences || ''; } // Avoid 'undefined'

        const replyHeaders = {};
         if(originalInReplyTo) replyHeaders['In-Reply-To'] = originalInReplyTo;
         if(references) replyHeaders['References'] = references;

        // Prepare raw email
        let rawEmail;
         if (attachmentPath) {
             rawEmail = makeMultipartBody(replyToAddress, userEmail, actionData.subject, actionData.body, attachmentPath, attachmentOriginalName, replyHeaders);
         } else {
             rawEmail = makeBody(replyToAddress, userEmail, actionData.subject, actionData.body, replyHeaders);
         }

        const sentReply = await gmail.users.messages.send({
             userId: 'me',
             requestBody: {
                 raw: rawEmail,
                 threadId: originalMsgData.data.threadId // Ensure threading
             },
         });
         console.log(`✅ Gmail API: Email reply sent successfully for Gmail ID ${actionData.gmailMessageId} (Thread: ${originalMsgData.data.threadId}, Reply ID: ${sentReply.data.id})`);

          // Send SUCCESS confirmation
         await sendMessageAndLog(originalMsg.chat.id, `✅ המענה למייל (ID: ${actionData.gmailMessageId}) נשלח בהצלחה אל: ${replyToAddress}`, { reply_to_message_id: replyToTelegramId });

        // Clean up temp file AFTER successful send
         if (attachmentPath && actionData.attachmentTelegramMessageId) {
             cleanupTemporaryFile(attachmentPath, Number(actionData.attachmentTelegramMessageId));
         }

     } catch (error) {
         console.error(`❌ Failed to reply to email (Gmail ID: ${actionData.gmailMessageId}):`, error.response?.data?.error?.message || error.message);
         throw new Error(`שגיאה בשליחת המענה למייל: ${error.response?.data?.error?.message || error.message}`);
     }
}

function handleAddMemoryAction(actionData) {
    if (!actionData.memoryData || !actionData.memoryData.info) {
         console.warn("⚠️ Attempted to add memory without 'memoryData.info' field.");
         return false;
    }
    try {
        const memoryId = Date.now(); // Simple unique ID
        const newMemory = {
            id: memoryId,
            timestamp: memoryId,
            info: actionData.memoryData.info,
            person: actionData.memoryData.person || null,
            type: actionData.memoryData.type || null
        };
        // Load current memories safely
        let currentMemories = [];
        try {
            if (fs.existsSync(MEMORIES_PATH)) {
                 const data = fs.readFileSync(MEMORIES_PATH, 'utf8');
                 const parsed = JSON.parse(data);
                 if(Array.isArray(parsed)) currentMemories = parsed;
             }
         } catch (loadErr) { console.error("Error loading memories before adding:", loadErr); }

        currentMemories.unshift(newMemory); // Add to beginning (most recent)
         memories = currentMemories; // Update global
        saveMemories(); // Persist
        console.log(`🧠 Memory added (ID: ${memoryId}): "${newMemory.info.substring(0, 50)}..."`);
         return true;
    } catch (err) {
         console.error("❌ CRITICAL: Failed to save memory:", err);
         return false;
    }
}

function handleDeleteMemoryAction(actionData) {
     if (actionData.memoryIdToDelete === undefined || actionData.memoryIdToDelete === null) {
         console.warn("⚠️ Attempted to delete memory without specifying 'memoryIdToDelete'.");
         return false;
     }
     try {
        const idToDelete = Number(actionData.memoryIdToDelete);
         if(isNaN(idToDelete)){
             console.warn(`⚠️ Invalid memory ID provided for deletion: '${actionData.memoryIdToDelete}'`);
             return false;
         }

        // Load fresh memories safely before filtering
         let currentMemories = [];
         try {
             if (fs.existsSync(MEMORIES_PATH)) {
                 const data = fs.readFileSync(MEMORIES_PATH, 'utf8');
                 const parsed = JSON.parse(data);
                  if(Array.isArray(parsed)) currentMemories = parsed;
              }
          } catch (loadErr) { console.error("Error loading memories before deleting:", loadErr); }

        const initialLength = currentMemories.length;
        const filteredMemories = currentMemories.filter(mem => mem.id !== idToDelete);

        if (filteredMemories.length < initialLength) {
             memories = filteredMemories; // Update global
            saveMemories(); // Persist
            console.log(`🧠 Memory deleted (ID: ${idToDelete})`);
            return true;
        } else {
             console.log(`❓ Memory ID ${idToDelete} not found for deletion.`);
             return false;
         }
    } catch (err) {
        console.error("❌ CRITICAL: Failed to delete memory:", err);
        return false;
    }
}


// --- *** NEW: Gmail Search Action Handler *** ---
async function handleSearchEmailAction(actionData, originalMsg) {
    const chatId = originalMsg.chat.id;
    const replyToTelegramId = actionData.replyToTelegramMessageId || originalMsg.message_id;
    const query = actionData.query || '';
    const searchPeriod = actionData.searchPeriod || null;

    if (!query && !searchPeriod) {
        throw new Error("יש לספק מילות חיפוש ('query') או תקופת זמן ('searchPeriod') לחיפוש אימיילים.");
    }

    console.log(`🔍 Handling search_email: Query='${query}', Period='${searchPeriod}'`);

    try {
        // Build the Gmail search query string
        const gmailQuery = buildGmailQuery(query, searchPeriod);
        if (!gmailQuery) {
            throw new Error("לא ניתן היה ליצור שאילתת חיפוש חוקית מהפרמטרים שסופקו.");
        }
        console.log(`📊 Constructed Gmail Query: ${gmailQuery}`);

        // Perform the search
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: gmailQuery,
            maxResults: MAX_SEARCH_RESULTS
        });

        const messages = listResponse.data.messages || [];
        const resultSizeEstimate = listResponse.data.resultSizeEstimate || 0;
        console.log(`🔍 Found ${messages.length} messages (Estimate: ${resultSizeEstimate}) matching query.`);

        if (messages.length === 0) {
            await sendMessageAndLog(chatId, "🤷 לא נמצאו הודעות דוא\"ל התואמות לחיפוש שלך.", { reply_to_message_id: replyToTelegramId });
            recentSearchResults[chatId] = null; // Clear previous results
            return;
        }

        // Fetch details for each message
        const detailedResults = [];
        // Limit details fetching to avoid hitting rate limits aggressively
        const messagesToFetch = messages.slice(0, MAX_SEARCH_RESULTS);

        for (const messageHeader of messagesToFetch) {
            try {
                const msg = await gmail.users.messages.get({
                    userId: 'me',
                    id: messageHeader.id,
                    format: 'full' // Need full to get snippet, date, attachments easily
                });

                const payload = msg.data.payload;
                if (!payload) continue;
                const headers = payload.headers || [];

                const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
                const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
                const dateHeader = headers.find(h => h.name.toLowerCase() === 'date')?.value;
                const date = dateHeader ? moment(dateHeader).tz(ISRAEL_TIMEZONE).format('DD/MM/YYYY HH:mm') : 'Unknown Date';
                const snippet = msg.data.snippet || '(אין תצוגה מקדימה)';

                const attachments = findAttachments(payload); // Use helper

                detailedResults.push({
                    id: msg.data.id,
                    threadId: msg.data.threadId,
                    subject,
                    from,
                    date,
                    snippet: snippet.substring(0, 150), // Keep snippet reasonably short
                    attachments: attachments.map(att => ({ // Include necessary info for forwarding
                        filename: att.filename,
                        mimeType: att.mimeType,
                        size: att.size,
                        partId: att.partId,
                        attachmentId: att.attachmentId
                    }))
                });
                await delay(150); // Small delay between message gets
            } catch (getErr) {
                console.error(`❌ Error fetching details for message ID ${messageHeader.id}:`, getErr.message);
                // Add a placeholder or skip? Let's skip for now.
            }
        }
        console.log(`ℹ️ Fetched details for ${detailedResults.length} messages.`);

        // Store results for potential follow-up by AI
        recentSearchResults[chatId] = {
            query: actionData.query, // Store original query/period for context
            searchPeriod: actionData.searchPeriod,
            results: detailedResults
        };

        // --- Decide how to present results ---
        // If search was *only* by date range (no keywords), send directly to user.
        const isDateOnlySearch = !query && searchPeriod;

        if (isDateOnlySearch) {
            console.log("📅 Date-only search detected. Sending results directly to user.");
            let resultsMessage = `📬 *תוצאות חיפוש עבור ${searchPeriod}:*\n\n`;
            if (detailedResults.length === 0) {
                resultsMessage = `🤷 לא נמצאו הודעות דוא"ל עבור ${searchPeriod}.`;
            } else {
                 detailedResults.forEach((res, index) => {
                     resultsMessage += `*${index + 1}.* \`${res.id}\`\n`; // Show ID
                     resultsMessage += `  *נושא:* ${res.subject}\n`;
                     resultsMessage += `  *מאת:* ${res.from}\n`;
                     resultsMessage += `  *תאריך:* ${res.date}\n`;
                     resultsMessage += `  *תצוגה מקדימה:* ${res.snippet}...\n`;
                     if (res.attachments.length > 0) {
                         resultsMessage += `  📎 ${res.attachments.length} קבצים מצורפים\n`;
                     }
                     resultsMessage += `----\n`;
                 });
                 if (messages.length > MAX_SEARCH_RESULTS) {
                     resultsMessage += `\n_(הוצגו ${MAX_SEARCH_RESULTS} תוצאות מתוך ${messages.length})_`;
                 }
            }
            // Split message if too long
             const messageChunks = splitMessage(resultsMessage, 4000); // Split into chunks
             for (const chunk of messageChunks) {
                 await sendMessageAndLog(chatId, chunk, { parse_mode: 'Markdown', reply_to_message_id: replyToTelegramId });
                 await delay(300); // Delay between chunks
             }

        } else {
            // Keyword search: Send results back to AI for processing
            console.log("📝 Keyword search detected. Sending results back to Gemini.");

            // Format results concisely for the AI prompt
            const resultsForPrompt = formatSearchResultsForPrompt(chatId); // Use the helper

            // Add a system message to history indicating search was done
            addToHistory(chatId, {
                 message_id: Date.now(), // Fake ID
                 from: { id: botInfo.id, first_name: 'System', is_bot: true },
                 chat: { id: chatId },
                 date: Math.floor(Date.now() / 1000),
                 text: `[בוצע חיפוש Gmail עבור: "${query || ''}" ${searchPeriod || ''}. התוצאות סופקו להקשר של Gemini.]`
             });


            // Call Gemini again with the results in context
            const followUpPrompt = `
המשתמש ביקש ממך לחפש הודעות דוא"ל עם הפרמטרים:
שאילתה: ${query || 'לא צוינה'}
תקופת זמן: ${searchPeriod || 'לא צוינה'}

להלן התוצאות שנמצאו (${detailedResults.length} הודעות):
${resultsForPrompt}

---
היסטוריית השיחה (${HISTORY_LENGTH} הודעות אחרונות):
${getChatHistory(chatId)}
---
הודעת המשתמש המקורית (שגרמה לחיפוש, ID: ${originalMsg.message_id}):
${originalMsg.text || '[אין טקסט בהודעה]'}

--- הוראות להמשך ---
בהתבסס על תוצאות החיפוש והבקשה המקורית של המשתמש, מה הצעד הבא?
- האם לסכם את התוצאות למשתמש? (פעולת "text")
- האם המשתמש ביקש להעביר מייל ספציפי? (פעולת "forward_email_from_search" עם ה-searchResultGmailId המתאים)
- האם המשתמש ביקש להעביר קובץ מצורף ספציפי? (פעולת "forward_attachment_from_search" עם ה-searchResultGmailId ופרטי ה-attachmentInfo המתאימים)
- האם לשאול את המשתמש מה הוא רוצה לעשות עם התוצאות? (פעולת "text")
- ודא שהשדה "replyToTelegramMessageId" בתגובתך יהיה המזהה של *ההודעה המקורית* של המשתמש: ${originalMsg.message_id}.

צור תגובת JSON תקנית עם הפעולה הבאה.
תגובת JSON:
`;
            console.log("\n===================== Gemini Follow-up Prompt Start =====================");
            // console.log(followUpPrompt); // Usually too long
            console.log(`Follow-up Prompt length: ${followUpPrompt.length} chars`);
            console.log("====================== Gemini Follow-up Prompt End ======================\n");

            try {
                 const jsonFollowUpResponse = await callGemini(followUpPrompt);

                 // Handle potential multiple actions from follow-up
                 if (jsonFollowUpResponse.replies && Array.isArray(jsonFollowUpResponse.replies)) {
                     console.log(`⚡ Received ${jsonFollowUpResponse.replies.length} follow-up actions from Gemini.`);
                     for (const actionDataFollowUp of jsonFollowUpResponse.replies) {
                         if (!actionDataFollowUp || !actionDataFollowUp.replyToTelegramMessageId) {
                             console.warn("⚠️ Skipping follow-up action in 'replies' array due to missing data or replyToTelegramMessageId:", actionDataFollowUp);
                             continue;
                         }
                         // Pass the *same* search results context again
                         await handleGeminiAction(actionDataFollowUp, originalMsg, recentSearchResults[chatId]);
                         await delay(600);
                     }
                 } else {
                      // Handle single follow-up action
                      if (!jsonFollowUpResponse || !jsonFollowUpResponse.replyToTelegramMessageId) {
                           console.warn("⚠️ Gemini follow-up response is missing replyToTelegramMessageId. Using fallback.", jsonFollowUpResponse);
                           jsonFollowUpResponse.replyToTelegramMessageId = originalMsg.message_id;
                       }
                       // Pass the *same* search results context again
                     await handleGeminiAction(jsonFollowUpResponse, originalMsg, recentSearchResults[chatId]);
                 }

             } catch (geminiFollowUpError) {
                 console.error("❌ Error calling Gemini for follow-up after search:", geminiFollowUpError);
                 await sendMessageAndLog(chatId, `⚠️ סליחה, מצאתי תוצאות חיפוש אך נתקלתי בשגיאה בעיבודן.\nפרטים: ${geminiFollowUpError.message}`, { reply_to_message_id: originalMsg.message_id });
             }
        }

    } catch (error) {
        console.error("❌ Failed to perform Gmail search:", error.response?.data?.error?.message || error.message);
        throw new Error(`שגיאה בחיפוש מיילים: ${error.response?.data?.error?.message || error.message}`);
    }
}

// --- *** NEW: Forward Email from Search Handler *** ---
async function handleForwardEmailFromSearchAction(actionData, originalMsg, currentSearchResults) {
    const chatId = originalMsg.chat.id;
    const replyToTelegramId = actionData.replyToTelegramMessageId || originalMsg.message_id;
    const gmailIdToForward = actionData.searchResultGmailId;

    if (!gmailIdToForward) {
        throw new Error("יש לציין את מזהה הדוא\"ל מהחיפוש ('searchResultGmailId') להעברה.");
    }

    // Optional: Validate if the ID exists in the recent search results for this chat
     const foundInRecent = currentSearchResults?.results?.find(r => r.id === gmailIdToForward);
     if (!foundInRecent) {
         console.warn(`⚠️ Gmail ID ${gmailIdToForward} requested for forwarding not found in recent search results for chat ${chatId}. Proceeding anyway.`);
         // Consider throwing an error or confirming with user if strict validation is needed
         // throw new Error(`מזהה הדוא"ל '${gmailIdToForward}' לא נמצא בתוצאות החיפוש האחרונות.`);
     }

    console.log(`📬 Handling forward_email_from_search: GmailID=${gmailIdToForward}`);

    try {
        // Fetch full message details (again, might be cached but safer to fetch)
        const msg = await gmail.users.messages.get({
            userId: 'me',
            id: gmailIdToForward,
            format: 'full' // Need full format for body
        });

        const payload = msg.data.payload;
        if (!payload) throw new Error("לא נמצא תוכן (payload) בהודעה.");
        const headers = payload.headers || [];

        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
        const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
        const dateHeader = headers.find(h => h.name.toLowerCase() === 'date')?.value;
        const date = dateHeader ? moment(dateHeader).tz(ISRAEL_TIMEZONE).format('DD/MM/YYYY HH:mm') : 'Unknown Date';

        let body = extractTextBody(payload); // Prefer plain text
        if (!body) {
             let htmlBody = extractHtmlBody(payload);
             if (htmlBody) {
                 body = `(תצוגה פשוטה של תוכן HTML):\n${stripHtmlTags(htmlBody).substring(0, 3500)}...`;
             } else {
                 body = '(לא נמצא גוף הודעה)';
             }
        }

         // Prepare Telegram message for the forwarded email
         let forwardMessage = ` Forwarded Email (ID: \`${gmailIdToForward}\`) \n\n`; // English title? Or Hebrew? Let's keep it simple.
         forwardMessage = `📧 *הודעת דוא"ל מועברת (מזהה: \`${gmailIdToForward}\`)* 📧\n\n`;
         forwardMessage += `*מאת:* \`${from}\`\n`;
         forwardMessage += `*נושא:* ${subject}\n`;
         forwardMessage += `*תאריך:* ${date}\n`;
         forwardMessage += `------------------\n`;
         forwardMessage += body.substring(0, 3800); // Slightly larger limit for forwarded content
         if (body.length > 3800) {
             forwardMessage += "\n\n_[הודעה קוצרה]_";
         }

         // List attachments if any
         const attachments = findAttachments(payload);
         if (attachments.length > 0) {
             forwardMessage += `\n\n📎 *קבצים מצורפים קיימים (לא הועברו אוטומטית):*\n`;
             attachments.forEach(att => {
                 forwardMessage += `- ${att.filename} (${formatBytes(att.size)})\n`;
             });
             forwardMessage += `_(ניתן לבקש העברת קובץ ספציפי בנפרד)_`;
         }

         console.log(`✅ Forwarding email content for ID: ${gmailIdToForward}`);
         // Split message if too long
          const messageChunks = splitMessage(forwardMessage, 4000);
          for (const chunk of messageChunks) {
              await sendMessageAndLog(chatId, chunk, { parse_mode: 'Markdown', reply_to_message_id: replyToTelegramId });
              await delay(300);
          }

         // Send SUCCESS confirmation (already sent via loop above)
         // await sendMessageAndLog(chatId, `✅ תוכן המייל (ID: ${gmailIdToForward}) הועבר.`, { reply_to_message_id: replyToTelegramId });

    } catch (error) {
        console.error(`❌ Failed to forward email content (ID: ${gmailIdToForward}):`, error.response?.data || error.message);
        throw new Error(`שגיאה בהעברת תוכן המייל: ${error.message}`);
    }
}

// --- *** NEW: Forward Attachment from Search Handler *** ---
async function handleForwardAttachmentFromSearchAction(actionData, originalMsg, currentSearchResults) {
    const chatId = originalMsg.chat.id;
    const replyToTelegramId = actionData.replyToTelegramMessageId || originalMsg.message_id;
    const gmailId = actionData.searchResultGmailId;
    const attachmentInfo = actionData.attachmentInfo;

    if (!gmailId || !attachmentInfo || !attachmentInfo.filename || (!attachmentInfo.partId && !attachmentInfo.attachmentId)) {
        throw new Error("יש לציין מזהה דוא\"ל ('searchResultGmailId') ופרטי קובץ מצורף ('attachmentInfo' עם filename ו-partId או attachmentId) להעברת קובץ.");
    }

    // Extract necessary IDs
    const filename = attachmentInfo.filename;
    const partId = attachmentInfo.partId; // May not always be present
    const attachmentId = attachmentInfo.attachmentId; // Often present for non-inline

    if (!attachmentId) {
         // If no attachmentId, we MUST have partId to fetch via messages.get
         if (!partId) {
             throw new Error(`לא סופק מזהה ('attachmentId' או 'partId') עבור הקובץ '${filename}'.`);
         }
         console.warn(`⚠️ Attachment ID missing for '${filename}', attempting fetch using Part ID: ${partId}. This might fail for some attachments.`);
         // Proceeding with partId method below
    }


    console.log(`📎 Handling forward_attachment_from_search: GmailID=${gmailId}, Filename=${filename}, AttID=${attachmentId}, PartID=${partId}`);

    let tempFilePath = null; // To ensure cleanup

    try {
        let attachmentData;

        // Prefer fetching using attachmentId if available (more direct)
        if (attachmentId) {
            try {
                 console.log(`Fetching attachment using attachmentId: ${attachmentId}`);
                 const response = await gmail.users.messages.attachments.get({
                    userId: 'me',
                    messageId: gmailId,
                    id: attachmentId
                });
                if (!response.data || !response.data.data) {
                    throw new Error(`תגובה ריקה בעת קבלת קובץ מצורף עם attachmentId ${attachmentId}`);
                }
                attachmentData = response.data.data;
             } catch(attachError) {
                 console.error(`❌ Error fetching attachment using attachmentId ${attachmentId}: ${attachError.message}. Trying with partId if available.`);
                 // Fallback to partId method if attachmentId fetch fails and partId exists
                 if (!partId) throw attachError; // Re-throw if no partId fallback
                  else console.log("Trying fallback using partId...");
                  // Clear attachmentData to trigger the partId block below
                  attachmentData = null;
             }
        }


        // Fetch using messages.get and partId if attachmentId wasn't available or failed
        if (!attachmentData && partId) {
            console.log(`Fetching attachment using partId: ${partId}`);
            const msg = await gmail.users.messages.get({
                userId: 'me',
                id: gmailId,
                format: 'full' // Need full payload
            });
            const part = findPartById(msg.data.payload, partId);
            if (!part || !part.body || !part.body.attachmentId) {
                console.error("Payload structure:", JSON.stringify(msg.data.payload, null, 2).substring(0, 1000)); // Log relevant part structure
                throw new Error(`לא נמצא חלק (part) עם מזהה ${partId} או שחסר לו attachmentId בגוף ההודעה ${gmailId}.`);
            }
            // Now get the attachment using the attachmentId found in the part
            const actualAttachmentId = part.body.attachmentId;
            console.log(`Found attachmentId ${actualAttachmentId} within part ${partId}. Fetching...`);
             const response = await gmail.users.messages.attachments.get({
                 userId: 'me',
                 messageId: gmailId,
                 id: actualAttachmentId
             });
             if (!response.data || !response.data.data) {
                    throw new Error(`תגובה ריקה בעת קבלת קובץ מצורף עם attachmentId ${actualAttachmentId} (דרך partId ${partId})`);
             }
            attachmentData = response.data.data;
        } else if (!attachmentData && !partId) {
             // This case should be caught earlier, but as a safeguard
             throw new Error("לא סופק מזהה (attachmentId או partId) תקין לאיתור הקובץ.");
         }


        // Decode Base64 data (handle URL-safe variant)
        const decodedData = Buffer.from(attachmentData.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

        // Save to temporary file
        fs.mkdirSync(TEMP_FILES_DIR, { recursive: true }); // Ensure dir exists
        // Use a unique name to avoid collisions, but keep original extension
        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_'); // Sanitize
        tempFilePath = path.join(TEMP_FILES_DIR, `${Date.now()}_${safeFilename}`);
        fs.writeFileSync(tempFilePath, decodedData);
        console.log(`💾 Saved attachment to temporary file: ${tempFilePath}`);

        // Send the file via Telegram
        console.log(`📲 Sending attachment '${filename}' to Telegram...`);
        await bot.sendDocument(chatId, tempFilePath, {
            caption: `📄 קובץ מצורף מהמייל (ID: \`${gmailId}\`)\nשם קובץ: ${filename}`,
            reply_to_message_id: replyToTelegramId
        }, {
             filename: filename, // Pass original filename for display
             contentType: mime.lookup(filename) || 'application/octet-stream'
        });

        console.log(`✅ Attachment '${filename}' sent successfully.`);

        // Send SUCCESS confirmation (already implied by file send)
        // await sendMessageAndLog(chatId, `✅ הקובץ '${filename}' מהמייל (ID: ${gmailId}) הועבר.`, { reply_to_message_id: replyToTelegramId });

    } catch (error) {
        console.error(`❌ Failed to forward attachment (GmailID: ${gmailId}, File: ${filename}):`, error.response?.data || error.message);
        // Try to send an error message to the user
        await sendMessageAndLog(chatId, `⚠️ סליחה, קרתה שגיאה בעת ניסיון להעביר את הקובץ '${filename}'.\nפרטים: ${error.message}`, { reply_to_message_id: replyToTelegramId });
        // Don't re-throw, error is reported.
    } finally {
        // Clean up the temporary file regardless of success or failure
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            cleanupTemporaryFile(tempFilePath, null); // No telegram ID associated here
        }
    }
}


// --- Chat History and Context Management ---

function addToHistory(chatId, msg) {
    if (!chatHistory[chatId]) {
        chatHistory[chatId] = [];
    }
    const history = chatHistory[chatId];

     let senderPrefix = `User_${msg.from?.id || 'Unknown'}`;
     if (msg.from?.is_bot && msg.from?.id === botInfo?.id) {
         senderPrefix = "אני (הבוט)";
     } else if (msg.from?.is_bot && msg.from?.first_name === 'System') { // Handle System messages
          senderPrefix = "[System]";
     } else if (msg.from) {
         senderPrefix = msg.from.first_name || msg.from.username || senderPrefix;
     }

     let messageText = msg.text || '';
     if (msg.caption) messageText += ` [כיתוב: ${msg.caption}]`;
     if (msg.document) messageText += ` [מסמך: ${msg.document.file_name || 'קובץ'}]`;
     else if (msg.photo) messageText += ` [תמונה]`;
     else if (msg.audio) messageText += ` [שמע]`;
     else if (msg.video) messageText += ` [וידאו]`;
     else if (msg.voice) messageText += ` [הודעה קולית]`;
     else if (msg.sticker) messageText += ` [סטיקר: ${msg.sticker.emoji || 'sticker'}]`;
     if (messageText.trim() === '') messageText = '[תוכן לא טקסטואלי או הודעה ריקה]';

    const messageEntry = {
        id: msg.message_id,
        sender: senderPrefix,
        text: messageText,
        timestamp: (msg.date || Math.floor(Date.now() / 1000)) * 1000
    };

    history.push(messageEntry);
    if (history.length > HISTORY_LENGTH) {
        history.shift();
    }
    chatHistory[chatId] = history;
}


function getChatHistory(chatId) {
    const history = chatHistory[chatId] || [];
    if (history.length === 0) return "אין היסטוריית שיחה.";
    return history.map(entry => `${entry.sender} (ID:${entry.id}): ${entry.text}`).join('\n');
}

function formatMemoriesForPrompt() {
     if (!memories || memories.length === 0) return "אין זיכרונות שמורים.";
    return memories.slice(0, 20) // Limit memories in prompt
        .map(mem => `${mem.id} | ${moment(mem.timestamp).format('DD/MM/YY HH:mm')} | ${mem.person || 'כללי'}: ${mem.info}`)
        .join('\n');
}

// *** NEW: Format Search Results for Prompt ***
function formatSearchResultsForPrompt(chatId) {
    const searchData = recentSearchResults[chatId];
    if (!searchData || !searchData.results || searchData.results.length === 0) {
        return "אין תוצאות חיפוש אחרונות.";
    }

    let formatted = `--- תוצאות חיפוש אחרונות (שאילתה: "${searchData.query || ''}" ${searchData.searchPeriod || ''}) ---\n`;
    searchData.results.forEach((res, index) => {
        formatted += `[${index + 1}] ID: ${res.id} | תאריך: ${res.date} | מאת: ${res.from} | נושא: ${res.subject}\n`;
        formatted += `    תקציר: ${res.snippet}\n`;
        if (res.attachments.length > 0) {
            formatted += `    קבצים מצורפים:\n`;
            res.attachments.forEach((att, attIndex) => {
                 // CRUCIAL: Provide the necessary info for the AI to use forward_attachment_from_search
                formatted += `      - ${attIndex+1}: ${att.filename} (partId: ${att.partId || 'N/A'}, attachmentId: ${att.attachmentId || 'N/A'})\n`;
            });
        }
    });
     formatted += `--- סוף תוצאות חיפוש ---`;
    return formatted;
}

// --- Utility Functions ---
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function stripHtmlTags(html) {
    if (!html) return '';
    let text = html.replace(/<style([\s\S]*?)<\/style>/gi, '');
    text = text.replace(/<script([\s\S]*?)<\/script>/gi, '');
    text = text.replace(/<[^>]*>/g, ' ');
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&apos;/gi, "'");
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function cleanupTemporaryFile(filePath, telegramMessageId = null) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🧹 Cleaned up temporary file: ${filePath}`);
        }
        if (telegramMessageId !== null) {
            telegramFileMap.delete(telegramMessageId); // Remove from map if associated with Telegram msg
            console.log(`🗺️ Removed file mapping for Telegram message ID: ${telegramMessageId}`);
        }
    } catch (cleanupError) {
        console.error(`⚠️ Error cleaning up file ${filePath}:`, cleanupError);
    }
}

// Helper to find attachments within payload parts recursively
function findAttachments(payload) {
    let attachments = [];
    const parts = payload.parts || [];

    for (const part of parts) {
        if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
             // This is likely a standard attachment
            attachments.push({
                filename: part.filename,
                mimeType: part.mimeType || 'application/octet-stream',
                size: part.body.size || 0,
                partId: part.partId, // Include partId
                attachmentId: part.body.attachmentId // Include attachmentId
            });
        } else if (part.parts) {
            // Recursively search in nested parts
            attachments = attachments.concat(findAttachments(part));
        } else if (payload.mimeType?.startsWith('multipart/') && !part.parts && part.filename && part.body?.size > 0){
             // Handle cases where the main payload is multipart but parts lack detail,
             // yet individual parts *might* be attachments (e.g., inline images without attachmentId but with filename)
             // This heuristic might need refinement.
              if(part.body?.attachmentId){ // Prefer parts with attachmentId
                  attachments.push({
                      filename: part.filename,
                      mimeType: part.mimeType || 'application/octet-stream',
                      size: part.body.size || 0,
                      partId: part.partId,
                      attachmentId: part.body.attachmentId
                  });
              } else {
                   // Consider logging or handling parts without attachmentId differently if needed
                   // console.log(`Part ${part.partId} has filename but no attachmentId, potential inline?`)
              }
        }
    }
    return attachments;
}

// Helper to find a specific part by its ID recursively
function findPartById(payload, partIdToFind) {
     if (payload.partId === partIdToFind) {
         return payload;
     }
     if (payload.parts) {
         for (const part of payload.parts) {
             const found = findPartById(part, partIdToFind);
             if (found) {
                 return found;
             }
         }
     }
     return null; // Not found
}


// Helper to extract plain text body recursively
function extractTextBody(payload) {
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return Buffer.from(payload.body.data, 'base64').toString('utf8');
    }
    if (payload.parts) {
        for (const part of payload.parts) {
             if (part.mimeType === 'text/plain' && part.body?.data) {
                 return Buffer.from(part.body.data, 'base64').toString('utf8');
             } else if (part.mimeType?.startsWith('multipart/')) {
                 const nestedBody = extractTextBody(part); // Recurse
                 if (nestedBody) return nestedBody;
             }
        }
    }
    // If no direct text/plain found, check the top level if it wasn't multipart
     if (payload.body?.data && !payload.parts && payload.mimeType !== 'text/html') { // Basic fallback
         // This might grab non-text data if mimeType is wrong, use cautiously
         // return Buffer.from(payload.body.data, 'base64').toString('utf8');
     }
    return null;
}
// Helper to extract HTML body recursively
function extractHtmlBody(payload) {
    if (payload.mimeType === 'text/html' && payload.body?.data) {
        return Buffer.from(payload.body.data, 'base64').toString('utf8');
    }
     if (payload.parts) {
         for (const part of payload.parts) {
             if (part.mimeType === 'text/html' && part.body?.data) {
                 return Buffer.from(part.body.data, 'base64').toString('utf8');
             } else if (part.mimeType?.startsWith('multipart/')) {
                 const nestedBody = extractHtmlBody(part); // Recurse
                 if (nestedBody) return nestedBody;
             }
         }
     }
    return null;
}


// *** NEW: Helper to build Gmail query string ***
function buildGmailQuery(query, searchPeriod) {
    let qParts = [];
    if (query && query.trim().length > 0) {
        qParts.push(`(${query.trim()})`); // Wrap main query in parentheses
    }

    if (searchPeriod) {
        const now = moment();
        let afterDate = null;
        let beforeDate = null;
         const periodLower = searchPeriod.toLowerCase();

        if (periodLower === 'today') {
            afterDate = now.startOf('day');
            beforeDate = now.endOf('day');
        } else if (periodLower === 'yesterday') {
            afterDate = now.subtract(1, 'day').startOf('day');
            beforeDate = now.endOf('day'); // Yesterday ends at the start of today
        } else if (periodLower.startsWith('last_')) {
             const match = periodLower.match(/^last_(\d+)_days$/);
             if (match && match[1]) {
                 const days = parseInt(match[1], 10);
                 if (!isNaN(days) && days > 0) {
                     afterDate = now.subtract(days, 'days').startOf('day');
                     beforeDate = moment().endOf('day'); // Use moment() for current end of day
                 }
             }
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(searchPeriod)) {
             // Specific date YYYY-MM-DD
             const specificDate = moment(searchPeriod, 'YYYY-MM-DD');
             if (specificDate.isValid()) {
                 afterDate = specificDate.startOf('day');
                 beforeDate = specificDate.endOf('day');
             }
        } else {
             // Check for after:YYYY-MM-DD before:YYYY-MM-DD syntax
             const afterMatch = searchPeriod.match(/after:(\d{4}-\d{2}-\d{2})/);
             const beforeMatch = searchPeriod.match(/before:(\d{4}-\d{2}-\d{2})/);
             if (afterMatch && afterMatch[1]) {
                 const parsedAfter = moment(afterMatch[1], 'YYYY-MM-DD');
                 if(parsedAfter.isValid()) afterDate = parsedAfter.startOf('day');
             }
             if (beforeMatch && beforeMatch[1]) {
                  const parsedBefore = moment(beforeMatch[1], 'YYYY-MM-DD');
                  // Gmail 'before:' is exclusive, so use the start of that day
                  if(parsedBefore.isValid()) beforeDate = parsedBefore.startOf('day');
             }
        }

        // Format for Gmail query (YYYY/MM/DD)
        if (afterDate) {
            qParts.push(`after:${afterDate.format('YYYY/MM/DD')}`);
        }
        if (beforeDate) {
             // Gmail 'before' is exclusive, so if we want to include the 'beforeDate',
             // we actually need to set the 'before' to the *next* day.
             // Exception: if afterDate and beforeDate are the same day (e.g., 'today' or specific date)
             if (afterDate && beforeDate.isSame(afterDate, 'day')) {
                  qParts.push(`before:${beforeDate.add(1, 'day').format('YYYY/MM/DD')}`);
             } else {
                  qParts.push(`before:${beforeDate.format('YYYY/MM/DD')}`);
             }
        }
    }

    return qParts.join(' '); // Combine parts with spaces
}


// Helper to split long messages for Telegram
function splitMessage(text, maxLength = 4096) {
     const chunks = [];
     let currentChunk = '';

     // Split by lines first
     const lines = text.split('\n');

     for (const line of lines) {
         // If adding the next line exceeds max length
         if (currentChunk.length + line.length + 1 > maxLength) {
             // If the current chunk is not empty, push it
             if (currentChunk.length > 0) {
                 chunks.push(currentChunk);
             }
             // Start a new chunk with the current line
             currentChunk = line;
             // Handle case where a single line itself is too long
             while (currentChunk.length > maxLength) {
                 chunks.push(currentChunk.substring(0, maxLength));
                 currentChunk = currentChunk.substring(maxLength);
             }
         } else {
             // Add line to current chunk
             if (currentChunk.length > 0) {
                 currentChunk += '\n' + line;
             } else {
                 currentChunk = line;
             }
         }
     }

     // Push the last remaining chunk
     if (currentChunk.length > 0) {
         chunks.push(currentChunk);
     }

     return chunks;
 }


// --- Start the Bot ---
// initialize().catch(err => {
//     console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
//     console.error("!!! BOT FAILED TO INITIALIZE !!!", err);
//     console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
//     process.exit(1);
// });

// --- HTTP Server Setup (ADD THIS SECTION) ---
function setupHttpServer() {
    const app = express();
    const PORT = process.env.PORT || 3000;

    app.use(cors()); // Enable CORS for all routes - good for local dev
    app.use(express.json()); // Middleware to parse JSON bodies

    // Mount the admin API routes
    app.use('/api/admins', adminApiRoutes);

    app.get('/', (req, res) => {
        res.send('Telegram Bot and Admin API are running.');
    });

    app.listen(PORT, () => {
        console.log(`🚀 HTTP Admin API server running on port ${PORT}`);
    });

    return app; // Return app if needed elsewhere, though not strictly for this setup
}

// --- Modify how initialize is called ---
// Original: initialize().catch(...)
// New:
async function startApp() {
    await initialize(); // Initialize the bot
    setupHttpServer(); // Setup and start the HTTP server
}

startApp().catch(err => {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!! APP FAILED TO START (BOT OR HTTP SERVER) !!!", err);
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    process.exit(1);
});