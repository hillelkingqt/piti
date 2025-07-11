// whatsapp_modules/apiServiceIntegrations.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types'); // For functions like searchAndDownloadWebImages
const { apiKeyManager } = require('../services/ApiKeyManager.js'); // Adjusted path
const { generateCloudflareImage, transcribeAudioCF } = require('../services/CloudflareService.js');

let lastGeminiApiKey = null; // track last Gemini API key used
let gemini2FlashCooldownUntil = 0;
let geminiFallbackModel = null;

// --- Cloudflare API Constants ---
// Moved from what_FIXED (1).js
const CLOUDFLARE_ACCOUNT_ID = "38a8437a72c997b85a542a6b64a699e2";
const CLOUDFLARE_API_TOKEN = "jCnlim7diZ_oSCKIkSUxRJGRS972sHEHfgGTmDWK";
const BASE_IMAGE_GENERATION_API_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/`;
// const CLOUDFLARE_VISION_API_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/unum/uform-gen2-qwen-500m`; // Not currently used
const CLOUDFLARE_WHISPER_API_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/openai/whisper-large-v3-turbo`;
// --- End Cloudflare API Constants ---


// Constants that might be moved or defined here
// Example: const PIXABAY_API_KEY = 'your_pixabay_api_key';
// For now, these will be moved along with the functions that use them.

// Dependencies for askGeminiWithSearchGrounding
// const { getRandomGeminiEndpoints } = require('./utilityHelpers.js'); // This will be defined locally now
// Note: apiKeyManager is not directly used by askGeminiWithSearchGrounding,
// but getRandomGeminiEndpoints likely uses it.

// --- Gemini Endpoint Helper Functions ---
// Moved from what_FIXED (1).js / utilityHelpers.js

function getRandomGeminiEndpoint(hasMedia = false) {
    const now = Date.now();
    let model = "gemini-2.0-flash-thinking-exp";
    if (gemini2FlashCooldownUntil > now) {
        model = geminiFallbackModel || "gemini-2.5-flash-preview-05-20";
    } else {
        geminiFallbackModel = null;
    }
    const apiKey = apiKeyManager.getRandomApiKey();
    lastGeminiApiKey = apiKey;
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function getRandomGeminiImageEndpoint() {
    const apiKey = apiKeyManager.getRandomApiKey();
    lastGeminiApiKey = apiKey;
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp:generateContent?key=${apiKey}`;
}

function getRandomGeminiEndpoints(hasMedia = false, modelVersion = "v1beta") {
    const apiKey = apiKeyManager.getRandomApiKey();
    lastGeminiApiKey = apiKey;
    let modelName = "gemini-2.0-flash-thinking-exp";
    if (hasMedia) {
        modelName = "gemini-2.0-flash-thinking-exp";
    }
    return `https://generativelanguage.googleapis.com/${modelVersion}/models/${modelName}:generateContent?key=${apiKey}`;
}

function handleGeminiOverloadError(err) {
    const isOverload = err?.response?.status === 503 &&
        /model is overloaded/i.test(err.response?.data?.error?.message || '');
    if (!isOverload) return;

    const now = Date.now();
    if (gemini2FlashCooldownUntil <= now) {
        gemini2FlashCooldownUntil = now + 30 * 60 * 1000;
        geminiFallbackModel = "gemini-2.5-flash-preview-05-20";
        console.warn(`[Gemini] Main model overloaded. Using ${geminiFallbackModel} for 30 minutes.`);
    } else if (geminiFallbackModel === "gemini-2.5-flash-preview-05-20") {
        geminiFallbackModel = "gemini-1.5-flash-latest";
        console.warn(`[Gemini] Fallback model overloaded. Switching to ${geminiFallbackModel}.`);
    }
}
// --- End Gemini Endpoint Helper Functions ---

async function uploadMediaToGemini(base64Data, mimeType) {
    const apiKey = apiKeyManager.getRandomApiKey(); // Uses apiKeyManager from this module
    const GEMINI_UPLOAD_URL = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
    const buffer = Buffer.from(base64Data, 'base64'); // Buffer is global
    try {
        const response = await axios.post(GEMINI_UPLOAD_URL, buffer, { // Uses axios from this module
            headers: {
                'Content-Type': mimeType,
            },
        });
        if (response.data && response.data.file && response.data.file.uri) {
            return response.data.file.uri;
        }
        return null;
    } catch (error) {
        console.error("❌ [uploadMediaToGemini API Service] Gemini media upload error:", error?.response?.data || error);
        handleGeminiOverloadError(error);
        if (error?.response && error.response.status === 429 &&
            (error.response.data?.error?.status === 'RESOURCE_EXHAUSTED' ||
             /quota/i.test(error.response.data?.error?.message || '')) && lastGeminiApiKey) {
            apiKeyManager.disableKey(lastGeminiApiKey);
        }
        throw error; // Re-throw to be handled by caller
    }
}

async function askGeminiWithSearchGrounding(promptText) {
    try {
        const endpoint = getRandomGeminiEndpoints(); // Now uses local getRandomGeminiEndpoints
        const response = await axios.post(endpoint, {
            contents: [
                {
                    parts: [{ text: promptText }]
                }
            ],
            tools: [{ googleSearchRetrieval: {} }] // Corrected format
        });
        const answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ לא התקבלה תשובה.";
        return answer;
    } catch (error) {
        console.error("❌ [askGeminiWithSearchGrounding API Service] שגיאה:", error.response?.data || error.message || error);
        handleGeminiOverloadError(error);
        if (error?.response && error.response.status === 429 &&
            (error.response.data?.error?.status === 'RESOURCE_EXHAUSTED' ||
             /quota/i.test(error.response.data?.error?.message || '')) && lastGeminiApiKey) {
            apiKeyManager.disableKey(lastGeminiApiKey);
        }
        return "⚠️ הייתה שגיאה בזמן הבקשה ל-Gemini עם Grounding.";
    }
}

module.exports = {
    askGeminiWithSearchGrounding,
    getRandomGeminiEndpoint,
    getRandomGeminiImageEndpoint,
    getRandomGeminiEndpoints,
    uploadMediaToGemini,
    callCloudflareImageGen: generateCloudflareImage,
    callCloudflareWhisper: transcribeAudioCF,
    // Other functions will be added here
};
