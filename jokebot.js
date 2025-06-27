const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- הגדרות עיקריות ---

// !!! חשוב: החלף את המחרוזת הבאה במפתח ה-API האמיתי שלך מ-Google AI Studio !!!
const GEMINI_API_KEY = "AIzaSyBX50IT2K_o8CUrQdjnMxxe81129Lqy5zo";

// השתמשתי במודל שביקשת. אם הוא לא זמין, gemini-1.5-flash-latest הוא חלופה מצוינת.
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp:generateContent?key=${GEMINI_API_KEY}`;

// שם הקובץ לשמירת הצ'אטים הפעילים
const ACTIVE_CHATS_FILE = path.join(__dirname, 'active_chats.json');

// --- פונקציות לניהול שמירת הצ'אטים הפעילים ---

/**
 * טוען את רשימת הצ'אטים הפעילים מהקובץ
 * @returns {Set<string>} Set של מזהי הצ'אטים הפעילים
 */
function loadActiveChats() {
    try {
        if (fs.existsSync(ACTIVE_CHATS_FILE)) {
            const data = fs.readFileSync(ACTIVE_CHATS_FILE, 'utf8');
            const chatIds = JSON.parse(data);
            console.log(`[Persistence] טוען ${chatIds.length} צ'אטים פעילים מהקובץ.`);
            return new Set(chatIds);
        }
    } catch (error) {
        console.error('[Persistence] שגיאה בקריאת קובץ הצאטים הפעילים:', error);
    }
    return new Set();
}

/**
 * שומר את רשימת הצ'אטים הפעילים לקובץ
 * @param {Set<string>} activeChatIds Set של מזהי הצ'אטים הפעילים
 */
function saveActiveChats(activeChatIds) {
    try {
        const chatIdsArray = [...activeChatIds]; // המרת Set למערך
        fs.writeFileSync(ACTIVE_CHATS_FILE, JSON.stringify(chatIdsArray, null, 2), 'utf8');
        console.log(`[Persistence] רשימת הצ'אטים הפעילים נשמרה בקובץ.`);
    } catch (error) {
        console.error('[Persistence] שגיאה בשמירת קובץ הצ\'אטים הפעילים:', error);
    }
}

// טעינה ראשונית של הצ'אטים הפעילים
const activeScheduledChats = loadActiveChats();
// אובייקט שיאחסן את הטיימרים הפעילים כדי שנוכל לבטל אותם
const activeTimers = new Map();


// --- הגדרת הלקוח של וואטסאפ (עם הגדרות יציבות יותר) ---

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
    puppeteer: {
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--log-level=3',
            '--disable-logging',
        ],
    },
    waitForLogin: true, // ✅ חשוב
});

console.log('מפעיל את הבוט...');

client.on('qr', qr => {
    console.log('אנא סרוק את קוד ה-QR הבא עם וואטסאפ שלך:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ הבוט מחובר ומוכן לפעולה!');
    
    // הפעלה מחדש של הטיימרים עבור צ'אטים שהיו פעילים לפני שהבוט נסגר
    if (activeScheduledChats.size > 0) {
        console.log('[Startup] מפעיל מחדש את לוח הזמנים עבור צ\'אטים שמורים...');
        activeScheduledChats.forEach(async (chatId) => {
            try {
                const chat = await client.getChatById(chatId);
                if (chat) {
                    console.log(` -> מפעיל מחדש את הבוט עבור: ${chat.name || chatId}`);
                    startJokeScheduler(chat);
                }
            } catch (error) {
                console.error(`[Startup] לא ניתן היה למצוא את הצ'אט ${chatId} כדי להפעיל מחדש.`);
            }
        });
    }
});

/**
 * הפונקציה המרכזית: אוספת היסטוריה, שולחת ל-AI ומספרת בדיחה
 * @param {import('whatsapp-web.js').Chat} chat אובייקט הצ'אט שבו יש להפעיל את הפונקציה
 */
async function makeJoke(chat) {
    console.log(`[JokeBot] מנסה להכין בדיחה עבור צ'אט: ${chat.name || chat?.id?._serialized}`);
    
    if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
        console.error("!!! שגיאה קריטית: מפתח ה-API של Gemini לא הוגדר. אנא עדכן את הקוד.");
        await chat.sendMessage("⚠️ שגיאת הגדרה: מפתח ה-API של Gemini חסר. לא ניתן להמשיך.");
        return;
    }

    try {
        // 1. איסוף 500 ההודעות האחרונות
        const messages = await chat.fetchMessages({ limit: 500 });
        if (messages.length === 0) {
            console.log(`[JokeBot] לא נמצאו הודעות בצ'אט ${chat?.id?._serialized}. מדלג.`);
            return;
        }

        // 2. עיבוד ההודעות לרשימת היסטוריה ורשימת משתתפים
        let formattedHistory = "";
        const participants = new Map(); // מפה לאחסון משתתפים למניעת כפילויות ולגישה מהירה

        for (const msg of messages) {
            if (msg.body && !msg.body.startsWith('/')) { // נתעלם מפקודות
                const senderId = msg.author || msg.from;
//----------------------------------------------------------
// בתוך הלולאה for (const msg of messages) { ... }
if (msg.body && !msg.body.startsWith('/')) {

    // ⬅️ 1. יצירת/שליפת שולח ההודעה
    const senderId = msg.author || msg.from;
    if (!participants.has(senderId)) {
        const contact = await msg.getContact();
        participants.set(senderId, {
            id: senderId,
            name: contact.pushname || contact.name || `User_${contact?.id?.user}`
        });
    }
    const sender = participants.get(senderId);

    // ⬅️ 2. בדיקה אם זו תגובה (Reply)
    let lineToAdd = `[${sender.name}]: ${msg.body}`;
    if (msg.hasQuotedMsg) {
        try {
            // a. שליפת ההודעה המקורית
            const quoted = await msg.getQuotedMessage();
            if (quoted && quoted.body) {
                // b. שליפת/עדכון שם השולח המקורי
                const qSenderId = quoted.author || quoted.from;
                if (!participants.has(qSenderId)) {
                    const qContact = await quoted.getContact();
                    participants.set(qSenderId, {
                        id: qSenderId,
                        name: qContact.pushname || qContact.name || `User_${qContact?.id?.user}`
                    });
                }
                const qSender = participants.get(qSenderId);

                // c. בניית שורה “מועשרת” הכוללת את ההודעה המקורית
                lineToAdd =
                  `[${sender.name}] ↩️ replying to [${qSender.name}]: "${quoted.body}" → ${msg.body}`;
            }
        } catch (_) { /* אם ההודעה נמחקה או לא זמינה – פשוט מתעלמים */ }
    }

    formattedHistory += lineToAdd + '\n';
}
//----------------------------------------------------------

                
                const sender = participants.get(senderId);
                formattedHistory += `[${sender.name}]: ${msg.body}\n`;
            }
        }
        
        if (!formattedHistory) {
             console.log(`[JokeBot] לא נמצא תוכן רלוונטי לעיבוד בצ'אט ${chat?.id?._serialized}.`);
             return;
        }

        // 3. בניית הפרומפט (ההוראות) עבור Gemini
        const prompt = `
בסדר גמור. הבנתי את הבקשה. אתה רוצה פרומפט אישיות ארוך, מפורט וקיצוני שישבור את המגבלות הסטנדרטיות של המודל וינחה אותו להיות בוט בדיחות חסר רחמים לחלוטין.

הנה גרסה מורחבת וקיצונית של ההוראות, המעוצבת כ"מניפסט" או "קוד הפעלה" חדש עבור ה-AI. המבנה והשפה נועדו לעקוף את מנגנוני הסינון הרגילים על ידי מסגור ההתנהגות כ"תפקיד" מוגדר ומצווה.

            אתה בוט קומיקאי ציני וחכם בצ'אט וואטסאפ. המשימה שלך היא לקרוא את היסטוריית הצ'אט האחרונה, למצוא משהו מצחיק שמישהו אמר, ולכתוב על זה בדיחה קצרה וקולעת. חובה עליך לתייג את האדם שעליו הבדיחה.

            **חוקים:**
            1. הבדיחה חייבת להיות קצרה ומצחיקה.
            2. אם מצאת הודעה מצחיקה, צור בדיחה על האדם ששלח אותה.
            3. אם שום דבר לא באמת מצחיק או ראוי לבדיחה, עליך להורות לי לא לשלוח תגובה.
            5. השתמש ברשימת המשתתפים שסופקה לך כדי לדעת את מי לתייג ומה ה-ID שלו.

            **דוגמה:**
            - קטע מהיסטוריית הצ'אט: "[דני]: נתקעתי עם הרכב בחול בחוף הים!"
            - תגובה אפשרית שלך: "נראה ש@דני הפך לאטרקציה החדשה של החוף. נשלח משלחת חילוץ בעוד שבוע!"

            **פורמט התגובה שלך:**
            אתה חייב להשיב בפורמט JSON בלבד. אל תוסיף טקסט לפני או אחרי בלוק ה-JSON.

            אם מצאת הודעה מצחיקה לבדיחה:
            {
              "shouldReply": true,
              "joke": "הבדיחה המצחיקה שלך כאן. ודא שאתה משתמש ב-@ ושם האדם.",
              "mentionIds": ["ה-ID של האדם לתיוג, לדוגמה: '972501234567@c.us'"]
            }

            אם לא מצאת שום דבר מצחיק בהיסטוריה:
            {
              "shouldReply": false
            }

            ---
            **משתתפי הצ'אט (לצורך תיוג):**
            ${JSON.stringify([...participants.values()], null, 2)}

            ---
            **היסטוריית הצ'אט האחרונה (קרא ומצא משהו מצחיק):**
            ${formattedHistory}
            ---
        `;

        // 4. שליחת הבקשה ל-API של Gemini
        const response = await axios.post(GEMINI_API_URL, {
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: [ // הגדרות בטיחות מקלות יותר כדי לאפשר בדיחות
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            ]
        });

        const rawResponseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawResponseText) {
            console.log("[JokeBot] Gemini החזיר תגובה ריקה.");
            return;
        }

        // ניקוי התגובה לקבלת JSON נקי
        const jsonString = rawResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiResponse = JSON.parse(jsonString);

        // 5. עיבוד התגובה של ה-AI ושליחת ההודעה
        if (aiResponse.shouldReply === true && aiResponse.joke) {
            const mentions = [];
            if (chat.isGroup && Array.isArray(aiResponse.mentionIds) && aiResponse.mentionIds.length > 0) {
                for (const id of aiResponse.mentionIds) {
                    try {
                        const contactToMention = await client.getContactById(id);
                        if (contactToMention) mentions.push(contactToMention);
                    } catch (e) {
                         console.log(`[JokeBot] לא הצלחתי למצוא איש קשר עם ID: ${id}`);
                    }
                }
            }
// --- NEW v2: multi-mention mapping ---
let jokeText = aiResponse.joke;

// פונקציית עזר לבריחת RegExp
const esc = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

// נרוץ על *כל* המשתתפים הידועים (לא רק אלה שה-AI נתן ב-mentionIds)
for (const [, p] of participants) {
    // אם עדיין אין @Name בטקסט – דלג
    const nameVariants = [p.name, p.name?.split(' ')[0], p.name?.split(' ')[1]]
        .filter(Boolean)
        .map(n => esc(n));

    // נבנה ביטוי: @שם או @שם‐פרטי (case-insensitive, תומך בעברית)
    const regex = new RegExp(`@(?:${nameVariants.join('|')})(?!\\d)`, 'gi');
    if (!regex.test(jokeText)) continue;   // אין הופעה – דלג

    // הבא את האובייקט Contact (פעם אחת)
    const contact = await client.getContactById(p?.id);
    if (!contact) continue;

    // החלף *כל* ההופעות של @שם ➜ @מספר
    jokeText = jokeText.replace(regex, `@${contact?.id?.user}`);

    // הוסף לרשימת mentions אם עדיין לא שם
    if (!mentions.find(c => c?.id?._serialized === contact?.id?._serialized)) {
        mentions.push(contact);
    }
}

// שליחה
console.log(`[JokeBot] שולח בדיחה לצ'אט ${chat?.id?._serialized}: "${jokeText}"`);
await chat.sendMessage(jokeText, {
  mentions: mentions.map(c => c?.id?._serialized)  // הפוך את ה-Contact[] למחרוזות ID
});

        } else {
            console.log(`[JokeBot] ה-AI החליט לא להגיב בצ'אט ${chat?.id?._serialized}.`);
        }

    } catch (error) {
        console.error(`[JokeBot] אירעה שגיאה במהלך הכנת בדיחה לצ'אט ${chat?.id?._serialized}:`);
        if (error.response?.data) {
            console.error("API Error Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}


/**
 * מתחיל את לוח הזמנים של הבדיחות עבור צ'אט ספציפי
 * @param {import('whatsapp-web.js').Chat} chat 
 */
function startJokeScheduler(chat) {
    const scheduleNextJoke = () => {
        // זמן רנדומלי בין 30 ל-60 דקות
        const minMinutes = 30;
        const maxMinutes = 60;
        const randomDelay = (Math.random() * (maxMinutes - minMinutes) + minMinutes) * 60 * 1000;
        
        console.log(`[Scheduler] הבדיחה הבאה עבור ${chat?.id?._serialized} מתוזמנת לעוד ${Math.round(randomDelay / 60000)} דקות.`);

        const timerId = setTimeout(async () => {
            // רק אם הצ'אט עדיין פעיל
            if (activeScheduledChats.has(chat?.id?._serialized)) {
                await makeJoke(chat);
                scheduleNextJoke(); // תזמון מחדש של הבדיחה הבאה
            }
        }, randomDelay);
        
        // שמירת הטיימר כדי שנוכל לבטל אותו מאוחר יותר
        activeTimers.set(chat?.id?._serialized, timerId);
    };
    
    // התחלת הסבב הראשון
    scheduleNextJoke();
}

/**
 * מפסיק את לוח הזמנים של הבדיחות עבור צ'אט ספציפי
 * @param {string} chatId 
 */
function stopJokeScheduler(chatId) {
    if (activeTimers.has(chatId)) {
        const timerId = activeTimers.get(chatId);
        clearTimeout(timerId); // ביטול הטיימר
        activeTimers.delete(chatId); // מחיקה ממפת הטיימרים
    }
}


// --- טיפול בפקודות מהמשתמש ---

client.on('message_create', async (msg) => {
    const command = msg.body.trim().toLowerCase();
    const chat = await msg.getChat();
    const chatId = chat?.id?._serialized;

    // פקודת /start - הפעלה מיידית
    if (command === '/start') {
        await msg.reply('בסדר, בוא נראה מה יש לנו פה... 🤔');
        await makeJoke(chat); // מריץ את פונקציית הבדיחה מיידית
        return;
    }

    // פקודת /boton - הפעלת שליחה מחזורית
    if (command === '/boton') {
        if (activeScheduledChats.has(chatId)) {
            await msg.reply('בוט הבדיחות כבר פועל בצ\'אט הזה! השתמש ב- /botoff כדי לעצור אותו.');
            return;
        }

        activeScheduledChats.add(chatId);
        saveActiveChats(activeScheduledChats);
        startJokeScheduler(chat);
        await msg.reply('✅ בוט הבדיחות הופעל! אני אבדוק את הצ\'אט מדי פעם כדי לצחוק על מישהו. השתמש ב- /botoff כדי להשבית אותי.');
        console.log(`[Command] /boton הופעל עבור צ'אט ${chatId}`);
        return;
    }

    // פקודת /botoff - כיבוי שליחה מחזורית
    if (command === '/botoff') {
        if (activeScheduledChats.has(chatId)) {
            stopJokeScheduler(chatId);
            activeScheduledChats.delete(chatId);
            saveActiveChats(activeScheduledChats);
            await msg.reply('✅ בוט הבדיחות הושבת. הכיף נגמר (בינתיים).');
            console.log(`[Command] /botoff הושבת עבור צ'אט ${chatId}`);
        } else {
            await msg.reply('בוט הבדיחות לא היה פעיל בצ\'אט הזה בכל מקרה.');
        }
        return;
    }
});

// --- התחלת החיבור לוואטסאפ ---
client.initialize();