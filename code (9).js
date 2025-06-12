// pdf_tester.js
const fs = require('fs');
const path = require('path');
const open = require('open'); // For opening the PDF in browser (npm install open)

// ייבוא הפונקציות והמשתנים הרלוונטיים מהקובץ הראשי שלך
const pitiBotFunctions = require('./what_FIXED (1).js');

// --- הגדרות לדמה של הודעה וצ'אט ---
const MOCK_CHAT_ID_USER_PART = "9876543210"; // מספר טלפון דמה שונה לבדיקה זו
const MOCK_CHAT_NAME = "PDF_Web_Images_Test_Chat";
const MOCK_MESSAGE_ID = `false_${MOCK_CHAT_ID_USER_PART}@c.us_TESTWEBIMGID456`;
const MOCK_SENDER_NAME = "WebImageTestUser";

const BASE_CHAT_DIR_FOR_TESTER = "C:\\Users\\hillel1\\Desktop\\WHAT\\chats"; 

console.log("🚀 [PDF Tester - Web Images] Starting PDF generation test script.");

const mockClient = {
    sendMessage: async (chatId, content, options = {}) => {
        console.log(`✉️ [MockClient.sendMessage] To: ${chatId}, Content: ${(typeof content === 'string' ? content.substring(0,100) + "..." : "[Media Object]")}, Options:`, options);
        return {
            id: { _serialized: `mock_sent_msg_${Date.now()}` },
            reply: async (text) => console.log(`↪️ [MockClient.reply on sentMsg] ${text.substring(0,100)}...`)
        };
    },
};

const mockTriggeringMsg = {
    id: {
        remote: `${MOCK_CHAT_ID_USER_PART}@c.us`,
        _serialized: MOCK_MESSAGE_ID,
    },
    author: `${MOCK_CHAT_ID_USER_PART}@c.us`,
    from: `${MOCK_CHAT_ID_USER_PART}@c.us`,
    body: "בדיקה: צור לי PDF על כוכבי לכת עם תמונות מהאינטרנט.",
    hasQuotedMsg: false,
    getChat: async () => {
        console.log("📞 [MockMsg.getChat] Called.");
        return {
            id: {
                _serialized: `${MOCK_CHAT_ID_USER_PART}@c.us`,
                user: MOCK_CHAT_ID_USER_PART,
            },
            isGroup: false,
            name: MOCK_CHAT_NAME,
            getContact: async () => {
                console.log("📞 [MockChat.getContact] Called.");
                return {
                    number: MOCK_CHAT_ID_USER_PART,
                    pushname: MOCK_SENDER_NAME,
                    name: MOCK_SENDER_NAME
                };
            }
        };
    },
    reply: async (content, _chatIdIgnored, options = {}) => {
        console.log(`↪️ [MockMsg.reply] Content: ${(typeof content === 'string' ? content.substring(0,100) + "..." : "[Media Object]")}, Options:`, options);
        return {
            id: { _serialized: `mock_reply_msg_${Date.now()}` },
            reply: async (text) => console.log(`↪️ [MockMsg.reply on replyMsg] ${text.substring(0,100)}...`)
        };
    },
};

const documentDetails = {
    documentPrompt: "מסמך על כוכבי לכת במערכת השמש, עם תמונות אמיתיות או איורים מהאינטרנט.",
    documentName: `Solar_System_Web_Images_Doc_${Date.now()}`,
    documentDescription: "מסמך בדיקה על כוכבי לכת עם תמונות מהאינטרנט.",
    replyToIdFromGemini: mockTriggeringMsg.id._serialized,
};

// *** שינוי מרכזי כאן ***
const imageIntegrationConfig = {
    decision: "web_search", // <--- שינוי לחיפוש ברשת
    placementHintGlobal: "שלב כל תמונה ליד התיאור של כוכב הלכת המתאים. אם יש תמונה כללית של מערכת השמש, שלב אותה בהתחלה.",
    aiImageRequests: [ 
        // השאר ריק או הסר אם decision הוא לא "ai_generated"
    ],
    webImageSearchQueries: [
        {
            query: "planet Jupiter real photo telescope",
            intendedFilenamePrefix: "jupiter_web_",
            maxImagesToConsider: 1, // נוריד רק תמונה אחת ליופיטר
            placementContext: "ליד הפסקה על צדק (Jupiter)."
        },
        {
            query: "planet Saturn rings real photo space",
            intendedFilenamePrefix: "saturn_web_",
            maxImagesToConsider: 1, // נוריד רק תמונה אחת לשבתאי
            placementContext: "בפרק על שבתאי (Saturn), להדגיש את הטבעות."
        },
        {
            query: "Earth from space real photo NASA",
            intendedFilenamePrefix: "earth_web_",
            maxImagesToConsider: 1,
            placementContext: "בתחילת הפרק על כדור הארץ."
        }
    ]
};

async function testPdfGeneration() {
    console.log("🏁 [PDF Tester - Web Images] testPdfGeneration - STARTING TEST 🏁");

    if (typeof pitiBotFunctions.generateDocument !== 'function' ||
        typeof pitiBotFunctions.getSafeNameForChat !== 'function' ||
        typeof pitiBotFunctions.getChatPaths !== 'function' ||
        typeof pitiBotFunctions.searchAndDownloadWebImages !== 'function' // ודא שפונקציה זו מיוצאת
       ) {
        console.error("❌ [PDF Tester] ERROR: One or more required functions are not exported from what_FIXED (1).js.");
        console.log("   Missing generateDocument:", !!pitiBotFunctions.generateDocument);
        console.log("   Missing getSafeNameForChat:", !!pitiBotFunctions.getSafeNameForChat);
        console.log("   Missing getChatPaths:", !!pitiBotFunctions.getChatPaths);
        console.log("   Missing searchAndDownloadWebImages:", !!pitiBotFunctions.searchAndDownloadWebImages);
        return;
    }
    
    const originalClient = pitiBotFunctions.client;
    pitiBotFunctions.client = mockClient;

    const tempChat = await mockTriggeringMsg.getChat();
    const tempSafeName = await pitiBotFunctions.getSafeNameForChat(tempChat);
    const testChatPaths = pitiBotFunctions.getChatPaths(mockTriggeringMsg.id.remote, tempSafeName);
    console.log("📂 [PDF Tester] Test chat paths will be based in:", testChatPaths.chatDir);
    console.log("📂 [PDF Tester] Images will be saved in:", testChatPaths.filesDir);
    console.log("📂 [PDF Tester] Final PDF should appear in:", testChatPaths.chatDir);

    // ניקוי תיקיית הקבצים לפני הבדיקה (אופציונלי)
    if (fs.existsSync(testChatPaths.filesDir)) {
        console.log(`🧹 Cleaning up previous images in ${testChatPaths.filesDir}...`);
        fs.readdirSync(testChatPaths.filesDir).forEach(file => {
            try {
                fs.unlinkSync(path.join(testChatPaths.filesDir, file));
            } catch (e) {
                console.warn(`Could not delete ${file}`, e.message);
            }
        });
    }
     // ניקוי קבצי PDF קודמים בתיקיית הצ'אט (אופציונלי)
    if (fs.existsSync(testChatPaths.chatDir)) {
        fs.readdirSync(testChatPaths.chatDir).forEach(file => {
            if (file.startsWith(documentDetails.documentName.substring(0,10)) && file.endsWith('.pdf')) { // substring to match prefix
                try {
                    console.log(`🧹 Deleting old test PDF: ${path.join(testChatPaths.chatDir, file)}`);
                    fs.unlinkSync(path.join(testChatPaths.chatDir, file));
                } catch (e) {
                     console.warn(`Could not delete old test PDF ${file}`, e.message);
                }
            }
        });
    }


    try {
        console.log("⏳ [PDF Tester] Calling generateDocument with WEB IMAGE mock data...");
        await pitiBotFunctions.generateDocument({
            triggeringMsg: mockTriggeringMsg,
            replyToIdFromGemini: documentDetails.replyToIdFromGemini,
            documentPrompt: documentDetails.documentPrompt,
            documentName: documentDetails.documentName,
            documentDescription: documentDetails.documentDescription,
            imageIntegration: imageIntegrationConfig
        });

        console.log("✅ [PDF Tester] generateDocument call completed.");

        const expectedPdfPath = path.join(testChatPaths.chatDir, `${documentDetails.documentName}.pdf`);
        console.log(`🔍 [PDF Tester] Checking for PDF at: ${expectedPdfPath}`);

        // המתן קצת זמן כדי לתת לתהליך הקומפילציה להסתיים לגמרי
        await new Promise(resolve => setTimeout(resolve, 5000)); // המתן 5 שניות

        if (fs.existsSync(expectedPdfPath)) {
            console.log(`🎉 [PDF Tester] SUCCESS! PDF found: ${expectedPdfPath}`);
            console.log(`🌍 [PDF Tester] Attempting to open PDF in default browser...`);
            await open(expectedPdfPath);
        } else {
            console.error(`❌ [PDF Tester] FAILURE! PDF NOT FOUND at: ${expectedPdfPath}`);
            console.log("   Possible reasons: LaTeX compilation error (check console for xelatex output), file naming issue, or error in generateDocument/compileLatexDocument.");
            console.log("   Make sure XeLaTeX is installed and in your system's PATH.");
            console.log("   Check for any .log files in:", testChatPaths.chatDir);
        }

    } catch (error) {
        console.error("❌❌ [PDF Tester] CRITICAL ERROR during testPdfGeneration:", error);
    } finally {
        pitiBotFunctions.client = originalClient;
        console.log("🏁 [PDF Tester - Web Images] testPdfGeneration - FINISHED TEST 🏁");
    }
}

testPdfGeneration();