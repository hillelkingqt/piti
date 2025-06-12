// services/GeminiService.js
const axios = require('axios');
const { Buffer } = require('buffer');
const { apiKeyManager } = require('./ApiKeyManager'); // Assumes ApiKeyManager class is exported and instantiated elsewhere, then passed or required
const config = require('../config'); // For base URLs and model names

// Default model names - these can be overridden by config.js if present there
const DEFAULT_MODEL_FLASH = "gemini-1.5-flash-latest";
const DEFAULT_MODEL_PRO = "gemini-1.5-pro-latest";
const DEFAULT_MODEL_VISION = "gemini-pro-vision"; // Or a newer 1.5 vision-capable model like flash/pro
const DEFAULT_MODEL_IMAGE_GEN = "gemini-2.0-flash-exp-image-generation"; // Placeholder, specific model may vary
const DEFAULT_MODEL_UPLOAD = "files";

/**
 * Selects a Gemini model. Prefers config values if available.
 * @param {object} options - Options like { type: 'flash' | 'pro' | 'vision' | 'image_gen' | 'upload', hasMedia: boolean }
 * @returns {string} The selected model name string.
 */
function selectGeminiModel(options = { type: 'flash' }) {
    switch (options.type) {
        case 'pro':
            return config.GEMINI_MODEL_PRO || DEFAULT_MODEL_PRO;
        case 'vision':
            // For Gemini 1.5, Flash and Pro are vision-capable.
            // If a specific older vision model is needed, it should be in config.
            return config.GEMINI_MODEL_VISION || (options.hasMedia ? (config.GEMINI_MODEL_PRO || DEFAULT_MODEL_PRO) : (config.GEMINI_MODEL_FLASH || DEFAULT_MODEL_FLASH));
        case 'image_gen':
             // This is a made-up endpoint for the example, actual image gen is usually separate
            return config.GEMINI_MODEL_IMAGE_GEN || DEFAULT_MODEL_IMAGE_GEN;
        case 'upload':
            return config.GEMINI_MODEL_UPLOAD || DEFAULT_MODEL_UPLOAD;
        case 'flash':
        default:
            return config.GEMINI_MODEL_FLASH || DEFAULT_MODEL_FLASH;
    }
}

/**
 * Constructs the full Gemini API endpoint URL.
 * @param {string} modelName - The model name (e.g., 'gemini-1.5-flash-latest').
 * @param {string} [action='generateContent'] - The API action.
 * @param {boolean} [isUpload=false] - Is this an upload request?
 * @returns {string} The full API endpoint URL with API key.
 * @throws {Error} If no valid API key is available.
 */
function getGeminiUrl(modelName, action = 'generateContent', isUpload = false) {
    const apiKey = apiKeyManager.getRandomApiKey();
    if (apiKey === "NO_VALID_API_KEYS_CONFIGURED") {
        console.error("❌ GeminiService: No valid API key available from ApiKeyManager.");
        throw new Error("GeminiService: API Key configuration error.");
    }
    const baseUrl = isUpload ? (config.GEMINI_UPLOAD_URL_BASE || "https://generativelanguage.googleapis.com/upload/v1beta/")
                           : (config.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/models/");
    return `${baseUrl}${modelName}${action ? `:${action}` : ''}?key=${apiKey}`;
}

/**
 * Sends a request to the Gemini API (typically for generateContent).
 * @param {object} payload - The request payload (contents, tools, generationConfig).
 * @param {object} modelOptions - Options for model selection (e.g., { type: 'flash', hasMedia: true }).
 * @returns {Promise<object>} The full Axios response object from Gemini.
 */
async function callGeminiApi(payload, modelOptions = { type: 'flash' }) {
    const model = selectGeminiModel(modelOptions);
    const url = getGeminiUrl(model, 'generateContent', false);
    console.log(`[GeminiService] Calling Gemini (${model}) at ${url.split('?')[0]}`);

    // Axios automatically throws for non-2xx status codes, so specific retry logic
    // based on status code might be better handled by the caller if complex retries are needed.
    // This service will just make the attempt.
    return await axios.post(url, payload, { timeout: config.GEMINI_API_TIMEOUT || 120000 }); // Default 2 min timeout
}

/**
 * A specialized function for requests that need Google Search grounding.
 * @param {string} promptText - The user's prompt.
 * @returns {Promise<string>} The generated answer text or an error message string.
 */
async function generateTextWithSearchGrounding(promptText) {
    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ googleSearchRetrieval: {} }]
    };
    try {
        const response = await callGeminiApi(payload, { type: 'flash' }); // Grounding typically works well with flash
        const answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (response.data?.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length > 0) {
            console.log(" -> Gemini Grounding Search Queries:", response.data.candidates[0].groundingMetadata.webSearchQueries);
        }
        return answer || "❌ No valid answer from Gemini with search grounding.";
    } catch (error) {
        console.error("❌ [GeminiService - Grounding] Error:", error.response?.data || error.message);
        return `⚠️ Error with Gemini (Search Grounding): ${error.response?.status || 'Network/Request Error'}. ${error.message}`;
    }
}

/**
 * Uploads media data to Gemini.
 * @param {string} base64Data - Base64 encoded media data (without data: prefix).
 * @param {string} mimeType - The MIME type of the media.
 * @returns {Promise<string|null>} The Gemini file URI (e.g., 'files/...') or null on error.
 */
async function uploadMedia(base64Data, mimeType) {
    const model = selectGeminiModel({ type: 'upload' });
    const url = getGeminiUrl(model, '', true); // action is empty for file uploads
    const buffer = Buffer.from(base64Data, 'base64');
    console.log(`[GeminiService] Uploading media (${mimeType}, size: ${buffer.length})...`);

    try {
        const response = await axios.post(url, buffer, {
            headers: { 'Content-Type': mimeType },
            timeout: config.GEMINI_UPLOAD_TIMEOUT || 60000 // 1 minute timeout for upload
        });
        const fileUri = response.data?.file?.uri;
        if (fileUri) {
            console.log(` -> Media uploaded successfully. URI: ${fileUri}`);
            return fileUri;
        } else {
            console.error("[GeminiService - Upload] Upload response missing file URI:", response.data);
            return null;
        }
    } catch (error) {
        console.error("❌ [GeminiService - Upload] Error:", error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    selectGeminiModel,
    getGeminiUrl,
    callGeminiApi,
    generateTextWithSearchGrounding,
    uploadMedia,
};
