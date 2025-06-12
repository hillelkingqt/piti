// services/GeminiService.js
const axios = require('axios');
const { Buffer } = require('buffer');
const { apiKeyManager } = require('./ApiKeyManager'); // Import the manager instance
// const config = require('../config'); // Import if needed for base URLs etc.

// Base URLs (could also be in config.js)
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const GEMINI_UPLOAD_URL_BASE = "https://generativelanguage.googleapis.com/upload/v1beta/";

// --- Model Names ---
// Use descriptive names, map them to actual model IDs if needed
const MODEL_FLASH = "gemini-2.5-pro-exp-03-25"; // Or specific preview like "gemini-1.5-flash-001"
const MODEL_FLASH_EXP = "gemini-2.5-pro-exp-03-25"; // Your experimental model
const MODEL_PRO = "gemini-2.5-pro-exp-03-25"; // Or "gemini-pro" for the older one
const MODEL_VISION = "gemini-2.5-pro-exp-03-25"; // Older vision model if needed, 1.5 models handle vision
const MODEL_UPLOAD = "files"; // Endpoint for uploads

/**
 * Selects a Gemini model based on needs (e.g., media, complexity).
 * @param {boolean} [hasMedia=false] - Does the request include inline media?
 * @param {boolean} [useExperimental=true] - Prefer the experimental model?
 * @returns {string} The selected model name string.
 */
function selectGeminiModel(hasMedia = false, useExperimental = true) {
    if (useExperimental) {
        return MODEL_FLASH_EXP;
    }
    if (hasMedia) {
        // Gemini 1.5 Flash/Pro handle media well
        return MODEL_FLASH; // Or MODEL_PRO if preferred for vision
    }
    // For text-only, Flash is usually fastest/cheapest
    return MODEL_FLASH;
}

/**
 * Constructs the full Gemini API endpoint URL.
 * @param {string} modelName - The model name (e.g., 'gemini-1.5-flash-latest').
 * @param {string} [action='generateContent'] - The API action.
 * @param {boolean} [isUpload=false] - Is this an upload request?
 * @returns {string} The full API endpoint URL with API key.
 */
function getGeminiUrl(modelName, action = 'generateContent', isUpload = false) {
    const apiKey = apiKeyManager.getRandomApiKey(); // Get a key for this request
    const baseUrl = isUpload ? GEMINI_UPLOAD_URL_BASE : GEMINI_BASE_URL;
    return `${baseUrl}${modelName}:${action}?key=${apiKey}`;
}

/**
 * Sends a request to the Gemini generateContent endpoint.
 * @param {object} payload - The request payload (contents, tools, generationConfig).
 * @param {boolean} [hasMedia=false] - Does the payload contain inline media?
 * @param {boolean} [useExperimental=true] - Prefer experimental model?
 * @returns {Promise<object>} The full Axios response object.
 * @throws {Error} Throws error if the API call fails after retries (handled by caller).
 */
async function generateGeminiContent(payload, hasMedia = false, useExperimental = true) {
    const model = selectGeminiModel(hasMedia, useExperimental);
    const url = getGeminiUrl(model, 'generateContent');
    console.log(`[Gemini Service] Calling generateContent: ${model}`);
    // The actual axios call with retries should ideally be handled
    // by the function calling this service (e.g., handleMessage's callApiWithRetry)
    // or wrapped in a retry mechanism here.
    // For simplicity now, just make the call.
    return await axios.post(url, payload);
}

/**
 * Asks Gemini a question with Google Search grounding enabled.
 * @param {string} promptText - The user's prompt.
 * @returns {Promise<string>} The generated answer text or an error message.
 */
async function askGeminiWithSearchGrounding(promptText) {
    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ googleSearchRetrieval: {} }] // Correct grounding tool
    };
    // Use a reliable model for grounding, 1.5 Flash is good
    const url = getGeminiUrl(MODEL_FLASH, 'generateContent');
    console.log(`[Gemini Service] Calling with Search Grounding: ${MODEL_FLASH}`);

    try {
        const response = await axios.post(url, payload);
        // Add more robust checking for candidate/content/parts
        const answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ לא התקבלה תשובה תקינה מ-Gemini.";
         // Log grounding results if present
         if (response.data?.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length > 0) {
            console.log(" -> Grounding Search Queries:", response.data.candidates[0].groundingMetadata.webSearchQueries);
        }
        return answer;
    } catch (error) {
        console.error("❌ [Gemini Service - Grounding] Error:", error.response?.data || error.message);
        return `⚠️ שגיאה (${error.response?.status || 'Network Error'}) בבקשה ל-Gemini עם חיפוש.`;
    }
}

/**
 * Uploads media data to Gemini for later reference.
 * @param {string} base64Data - Base64 encoded media data (without prefix).
 * @param {string} mimeType - The MIME type of the media.
 * @returns {Promise<string|null>} The Gemini file URI (e.g., 'files/...') or null on error.
 */
async function uploadMediaToGemini(base64Data, mimeType) {
    const url = getGeminiUrl(MODEL_UPLOAD, '', true); // Action is empty for upload, isUpload=true
    const buffer = Buffer.from(base64Data, 'base64');
    console.log(`[Gemini Service] Uploading media (${mimeType}, size: ${buffer.length})...`);

    try {
        const response = await axios.post(url, buffer, {
            headers: {
                'Content-Type': mimeType, // Correct header for direct upload
                // 'X-Goog-Upload-Protocol': 'raw' // This might sometimes be needed? Test without first.
            },
            timeout: 60000 // 1 minute timeout for upload
        });

        // Gemini upload API returns file info directly in response.data
        if (response.data?.file?.uri) {
            console.log(` -> Media uploaded successfully. URI: ${response.data.file.uri}`);
            return response.data.file.uri; // Return format like "files/abc123xyz"
        } else {
            console.error("[Gemini Service - Upload] Upload response missing file URI:", response.data);
            return null;
        }
    } catch (error) {
        console.error("❌ [Gemini Service - Upload] Error:", error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    getGeminiUrl,
    generateGeminiContent,
    askGeminiWithSearchGrounding,
    uploadMediaToGemini,
    selectGeminiModel // Export if needed externally
};