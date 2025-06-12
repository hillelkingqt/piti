// services/GeminiService.js
const axios = require('axios');
const { Buffer } = require('buffer');
const { apiKeyManager } = require('./ApiKeyManager');
const config = require('../config');

// Default model names - these can be overridden by config.js if present there
const MODEL_MAPPING = {
    flash: config.GEMINI_MODEL_FLASH || "gemini-1.5-flash-latest",
    pro: config.GEMINI_MODEL_PRO || "gemini-1.5-pro-latest",
    vision: config.GEMINI_MODEL_VISION || "gemini-1.5-pro-latest", // 1.5 Pro is vision capable
    image_gen: config.GEMINI_MODEL_IMAGE_GEN || "gemini-pro", // gemini-pro can do image generation with specific prompt structures
    text_embedding: config.GEMINI_MODEL_TEXT_EMBEDDING || "text-embedding-004", // Or specific embedding model
    upload: "files", // This is not a model but part of the URL structure for uploads
    // Specific models that might be directly requested
    "gemini-2.0-flash-thinking-exp": "gemini-1.5-flash-latest", // Mapping older experimental name to current
    "gemini-2.5-flash-preview-05-20": "gemini-1.5-flash-latest", // Mapping older experimental name
    "gemini-2.0-flash-exp-image-generation": "gemini-pro", // Map to gemini-pro for image generation tasks
    "gemini-2.5-flash-preview-tts": "text-to-speech", // This is a different base URL structure usually
    "gemini-2.0-pro-exp": "gemini-1.5-pro-latest", // Mapping older experimental name
};

const BASE_URLS = {
    default: config.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/models/",
    upload: config.GEMINI_UPLOAD_URL_BASE || "https://generativelanguage.googleapis.com/upload/v1beta/",
    textToSpeech: config.GEMINI_TTS_BASE_URL || "https://texttospeech.googleapis.com/v1/" // Standard TTS endpoint
};

/**
 * Selects a Gemini model name.
 * @param {object} options - Options like { modelName: string, type: 'flash' | 'pro' | 'vision' | 'image_gen' | 'text_embedding' | 'upload' }
 *                           If modelName is provided, it's used directly (after mapping if needed).
 *                           Otherwise, type is used to get a default model.
 * @returns {string} The selected model name string.
 */
function selectGeminiModel(options = {}) {
    if (options.modelName && MODEL_MAPPING[options.modelName]) {
        return MODEL_MAPPING[options.modelName];
    }
    if (options.modelName) { // If a specific model name is given and not in mapping, use it directly
        return options.modelName;
    }

    switch (options.type) {
        case 'pro':
            return MODEL_MAPPING.pro;
        case 'vision': // Vision is often handled by pro or flash 1.5 models
            return MODEL_MAPPING.vision;
        case 'image_gen':
            return MODEL_MAPPING.image_gen;
        case 'text_embedding':
            return MODEL_MAPPING.text_embedding;
        case 'upload':
            return MODEL_MAPPING.upload;
        case 'tts': // Special case for TTS model identifier
            return config.GEMINI_TTS_MODEL_NAME || "text-to-speech"; // This might be just 'text-to-speech' or a specific voice model
        case 'flash':
        default:
            return MODEL_MAPPING.flash;
    }
}

/**
 * Constructs the full Gemini API endpoint URL.
 * @param {string} modelIdentifier - The model name or identifier (e.g., 'gemini-1.5-flash-latest', 'text-to-speech').
 * @param {string} [action='generateContent'] - The API action (e.g., 'generateContent', 'embedText', 'synthesizeSpeech').
 * @param {boolean} [isUpload=false] - Is this an upload request?
 * @returns {string} The full API endpoint URL with API key.
 * @throws {Error} If no valid API key is available.
 */
function getGeminiUrl(modelIdentifier, action = 'generateContent', isUpload = false) {
    const apiKey = apiKeyManager.getRandomApiKey();
    if (apiKey === "NO_VALID_API_KEYS_CONFIGURED") {
        console.error("❌ GeminiService: No valid API key available from ApiKeyManager.");
        throw new Error("GeminiService: API Key configuration error.");
    }

    let baseUrl;
    let fullModelPath;

    if (isUpload) {
        baseUrl = BASE_URLS.upload;
        fullModelPath = `${modelIdentifier}`; // For uploads, modelIdentifier is 'files'
    } else if (action === 'synthesizeSpeech' || modelIdentifier === 'text-to-speech') {
        baseUrl = BASE_URLS.textToSpeech;
        // For Google Cloud TTS, the action is part of the URL, and model might be in payload
        fullModelPath = (action === 'synthesizeSpeech') ? `text:${action}` : modelIdentifier;
         return `${baseUrl}${fullModelPath}?key=${apiKey}`; // TTS has a slightly different URL structure
    } else {
        baseUrl = BASE_URLS.default;
        fullModelPath = `${modelIdentifier}:${action}`;
    }
    return `${baseUrl}${fullModelPath}?key=${apiKey}`;
}

/**
 * Generic function to call the Gemini API.
 * @param {object} payload - The request payload.
 * @param {object} modelOptions - Options for model selection (e.g., { type: 'flash', modelName: 'gemini-1.5-flash-latest' }).
 * @param {string} [action='generateContent'] - The API action.
 * @returns {Promise<object>} The full Axios response object from Gemini.
 * @throws {Error} If API call fails.
 */
async function callGeminiApi(payload, modelOptions = { type: 'flash' }, action = 'generateContent') {
    const model = selectGeminiModel(modelOptions);
    const url = getGeminiUrl(model, action, false);
    console.log(`[GeminiService] Calling Gemini (${model}, action: ${action}) at ${url.split('?')[0]}`);

    try {
        return await axios.post(url, payload, { timeout: config.GEMINI_API_TIMEOUT || 180000 }); // 3 min timeout
    } catch (error) {
        console.error(`❌ [GeminiService - API Call] Error for model ${model}, action ${action}:`, error.response?.data || error.message);
        throw error; // Re-throw to be handled by the caller
    }
}

/**
 * Generates content using a specified Gemini model (e.g. text, function calling).
 * @param {object} contents - The 'contents' part of the Gemini payload.
 * @param {object} [modelOptions={ type: 'flash' }] - Options for model selection (e.g., { type: 'flash', modelName: 'gemini-1.5-flash-latest' }).
 * @param {object} [generationConfig=null] - Optional 'generationConfig' for the payload.
 * @param {object} [tools=null] - Optional 'tools' for the payload (e.g., for function calling or search grounding).
 * @returns {Promise<object>} The candidates part of the Gemini API response or throws an error.
 */
async function generateContent(contents, modelOptions = { type: 'flash' }, generationConfig = null, tools = null) {
    const payload = { contents };
    if (generationConfig) {
        payload.generationConfig = generationConfig;
    }
    if (tools) {
        payload.tools = tools;
    }

    const response = await callGeminiApi(payload, modelOptions, 'generateContent');
    if (response.data?.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length > 0) {
        console.log(" -> Gemini Grounding Search Queries:", response.data.candidates[0].groundingMetadata.webSearchQueries);
    }
    return response.data; // Return the full response data for flexibility
}

/**
 * Generates text with Google Search grounding.
 * @param {string} promptText - The user's prompt.
 * @param {object} [modelOptions={ type: 'flash' }] - Model options.
 * @returns {Promise<string>} The generated answer text or an error message string.
 */
async function generateTextWithSearchGrounding(promptText, modelOptions = { type: 'flash' }) {
    const tools = [{ googleSearchRetrieval: {} }];
    const contents = [{ parts: [{ text: promptText }] }];
    try {
        const responseData = await generateContent(contents, modelOptions, null, tools);
        return responseData?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ No valid answer from Gemini with search grounding.";
    } catch (error) {
        return `⚠️ Error with Gemini (Search Grounding): ${error.response?.status || 'Network/Request Error'}. ${error.message}`;
    }
}

/**
 * Uploads media data to Gemini for later use in prompts.
 * @param {string} base64Data - Base64 encoded media data (without data: prefix).
 * @param {string} mimeType - The MIME type of the media.
 * @returns {Promise<string|null>} The Gemini file URI (e.g., 'files/...') or null on error.
 */
async function uploadMedia(base64Data, mimeType) {
    const modelId = selectGeminiModel({ type: 'upload' }); // Returns 'files'
    const url = getGeminiUrl(modelId, '', true); // action is empty for file uploads
    const buffer = Buffer.from(base64Data, 'base64');
    console.log(`[GeminiService] Uploading media (${mimeType}, size: ${buffer.length}) to ${url.split('?')[0]}...`);

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

/**
 * Generates an image or edits an existing one using a Gemini model.
 * This function assumes the model specified by 'image_gen' type or a direct modelName
 * can handle image generation/editing tasks based on the provided payload.
 * @param {object} contents - The 'contents' part of the payload, typically including a text prompt and optionally an inline image.
 * @param {object} [modelOptions={ type: 'image_gen' }] - Options for model selection.
 * @param {object} [generationConfig=null] - Optional 'generationConfig'.
 * @returns {Promise<object>} The Gemini API response data.
 */
async function generateImageFromContent(contents, modelOptions = { type: 'image_gen' }, generationConfig = null) {
    // Ensure the model is appropriate for image generation
    const effectiveModelOptions = { ...modelOptions, type: modelOptions.type || 'image_gen' };

    // Gemini image generation often expects specific response modalities
    const defaultConfig = { responseMimeType: "image/png" }; // Or other types if supported
    const mergedConfig = generationConfig ? { ...defaultConfig, ...generationConfig } : defaultConfig;

    // If the model is gemini-pro (often used for image generation), it might need a specific structure.
    // The 'gemini-2.0-flash-exp-image-generation' was a placeholder; new models might have different reqs.
    // For gemini-pro with image generation, the payload might be simpler, focusing on the prompt.
    // This is a generic wrapper; specific payload adjustments might be needed by the caller.

    return generateContent(contents, effectiveModelOptions, mergedConfig);
}

/**
 * Generates speech from text using Google Text-to-Speech API (often associated with Gemini ecosystem).
 * @param {string} textToSpeak - The text to synthesize.
 * @param {object} [voiceConfig={}] - Voice selection parameters (e.g., languageCode, name, ssmlGender).
 * @param {object} [audioConfig={ audioEncoding: 'MP3' }] - Audio configuration.
 * @returns {Promise<string|null>} Base64 encoded audio string or null on error.
 */
async function generateTextToSpeech(textToSpeak, voiceConfig = {}, audioConfig = { audioEncoding: 'MP3' }) {
    const modelId = selectGeminiModel({type: 'tts'}); // This will return 'text-to-speech' or config override
    const url = getGeminiUrl(modelId, 'synthesizeSpeech'); // Action 'synthesizeSpeech'

    const payload = {
        input: { text: textToSpeak },
        voice: {
            languageCode: voiceConfig.languageCode || 'en-US', // Default to English
            name: voiceConfig.name, // Specific voice name e.g., en-US-Wavenet-D
            ssmlGender: voiceConfig.ssmlGender // "MALE", "FEMALE", "NEUTRAL"
        },
        audioConfig: {
            audioEncoding: audioConfig.audioEncoding || 'MP3', // e.g., "MP3", "LINEAR16"
            speakingRate: audioConfig.speakingRate,
            pitch: audioConfig.pitch,
            volumeGainDb: audioConfig.volumeGainDb,
            sampleRateHertz: audioConfig.sampleRateHertz,
            effectsProfileId: audioConfig.effectsProfileId
        }
    };
     // Remove undefined optional params from voice and audioConfig
    Object.keys(payload.voice).forEach(key => payload.voice[key] === undefined && delete payload.voice[key]);
    Object.keys(payload.audioConfig).forEach(key => payload.audioConfig[key] === undefined && delete payload.audioConfig[key]);


    console.log(`[GeminiService TTS] Calling TTS API at ${url.split('?')[0]} for text: "${textToSpeak.substring(0, 30)}..."`);
    try {
        const response = await axios.post(url, payload, { timeout: config.GEMINI_TTS_TIMEOUT || 30000 });
        if (response.data?.audioContent) {
            return response.data.audioContent; // This is a base64 encoded string
        } else {
            console.error("[GeminiService TTS] TTS response missing audioContent:", response.data);
            return null;
        }
    } catch (error) {
        console.error("❌ [GeminiService TTS] Error:", error.response?.data?.error || error.message);
        return null;
    }
}


module.exports = {
    selectGeminiModel,
    getGeminiUrl,
    callGeminiApi, // Exporting for advanced use if needed, but prefer generateContent
    generateContent,
    generateTextWithSearchGrounding,
    uploadMedia,
    generateImageFromContent,
    generateTextToSpeech,
};
