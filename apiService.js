// services/apiService.js (**INSECURE Frontend Direct Calls**)
// !! WARNING: EXPOSES Cloudflare API Token. Use a backend proxy in production. !!
// Chat persistence functions are still placeholders needing a REAL backend.

// --- INSECURE HARDCODED CREDENTIALS ---
// (Ideally load from a config, but still insecure on frontend)
const CF_ACCOUNT_ID = "38a8437a72c997b85a542a6b64a699e2"; // Your Account ID
const CF_API_TOKEN = "jCnlim7diZ_oSCKIkSUxRJGRS972sHEHfgGTmDWK"; // Your API Token (SECRET!)
const CF_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/`;

// Cloudflare Model Endpoints Map (Same as in your original script)
const CF_IMAGE_MODELS = {
    'stable-diffusion-xl-lighting': '@cf/bytedance/stable-diffusion-xl-lightning',
    'stable-diffusion-xl-base-1.0': '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    'dreamshaper-8-lcm': '@cf/lykon/dreamshaper-8-lcm',
    'flux-1-schnell': '@cf/black-forest-labs/flux-1-schnell'
};

// --- Chat Management Placeholders (NEED A REAL BACKEND) ---
const FAKE_LATENCY_MS = 300;

async function loadChats(userId) {
    console.warn(`[API Insecure] loadChats called for user: ${userId}. Using localStorage (Placeholder).`);
    await new Promise(resolve => setTimeout(resolve, FAKE_LATENCY_MS));
    // Needs REAL backend logic
    let storedChats = localStorage.getItem(`pithi_chats_${userId}`);
    try { return storedChats ? JSON.parse(storedChats) : [{ id: `chat_initial_${Date.now()}`, name: "שיחה עם פיתי", lastMessage: "👋" }]; } catch (e) { return [{ id: `chat_initial_${Date.now()}`, name: "שיחה עם פיתי", lastMessage: "👋" }]; }
}

async function saveChats(userId, chats) {
     console.warn(`[API Insecure] saveChats called for user: ${userId}. Saving to localStorage (Placeholder).`);
     localStorage.setItem(`pithi_chats_${userId}`, JSON.stringify(chats));
    await new Promise(resolve => setTimeout(resolve, FAKE_LATENCY_MS / 2));
     return { success: true };
}

async function getChatHistory(chatId) {
    console.warn(`[API Insecure] getChatHistory called for chat: ${chatId}. Using localStorage (Placeholder).`);
    await new Promise(resolve => setTimeout(resolve, FAKE_LATENCY_MS));
    let storedHistory = localStorage.getItem(`pithi_history_${chatId}`);
    try { return storedHistory ? JSON.parse(storedHistory) : []; } catch (e) { return []; }
}

async function saveChatHistory(chatId, messages) {
    console.warn(`[API Insecure] saveChatHistory called for chat: ${chatId}. Saving to localStorage (Placeholder).`);
    localStorage.setItem(`pithi_history_${chatId}`, JSON.stringify(messages));
    await new Promise(resolve => setTimeout(resolve, FAKE_LATENCY_MS / 2));
    return { success: true };
}

async function renameChatOnServer(chatId, newName, userId) {
     console.warn(`[API Insecure] renameChatOnServer called for chat: ${chatId}. Updating localStorage (Placeholder).`);
     let storedChats = localStorage.getItem(`pithi_chats_${userId}`);
     if (storedChats) { try { let c=JSON.parse(storedChats); const i=c.findIndex(x=>x.id===chatId); if(i>-1)c[i].name=newName; localStorage.setItem(`pithi_chats_${userId}`,JSON.stringify(c)); } catch(e){} }
     await new Promise(resolve => setTimeout(resolve, FAKE_LATENCY_MS / 2)); return { success: true };
}

// --- INSECURE: Direct Frontend Image Generation ---
/**
 * Generates an image using Cloudflare API directly from the frontend.
 * WARNING: Exposes CF_API_TOKEN. Not recommended for production.
 */

// --- INSECURE: Direct Frontend Email Sending Placeholder ---
// !! THIS CANNOT WORK reliably without a backend using Google OAuth2 !!
// You cannot securely authenticate and use Gmail API directly from browser JS
// due to security restrictions and the OAuth flow requirement.
async function sendEmailOnServer(emailData) {
    console.error(`❌ [API Insecure] Direct email sending from frontend is NOT possible due to OAuth2 security. This requires a backend server implementation.`);
    await new Promise(resolve => setTimeout(resolve, FAKE_LATENCY_MS)); // Simulate doing nothing
    return { success: false, message: "שגיאה: שליחת אימייל דורשת טיפול בצד שרת מאובטח." };
}

// Placeholder for TTS (Could also be direct if using a simpler API, but ElevenLabs usually needs a key)
async function generateTtsOnServer(textToSpeak) {
     console.warn(`[API Insecure] generateTtsOnServer called. Simulating.`);
     await new Promise(resolve => setTimeout(resolve, FAKE_LATENCY_MS * 2));
     return { success: false, audioUrl: null, error: "TTS requires server-side implementation for key security." }; // Simulate failure requiring backend
}


// --- Export Service Object ---
const apiService = {
    loadChats,
    saveChats,
    getChatHistory,
    saveChatHistory,
    renameChatOnServer,
    // Direct (insecure) frontend functions
    generateImageCloudflareFrontend,
    // Placeholders that *require* a backend
    sendEmailOnServer,
    generateTtsOnServer
};