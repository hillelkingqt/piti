// services/CloudflareService.js
const axios = require('axios');
const config = require('../config'); // Assuming config.js is in the parent directory

// Helper function for delays
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates an image using a specified Cloudflare Workers AI model with robust error handling and retries.
 * @param {string} prompt - The text prompt for the image.
 * @param {string} modelName - The key for the model endpoint (e.g., 'stable-diffusion-xl-base-1.0').
 * @param {object} [options] - Optional parameters like width, height, num_steps, stickerGenData.
 * @param {number} [options.width=512] - Optional image width, default for stickers/general.
 * @param {number} [options.height=512] - Optional image height, default for stickers/general.
 * @param {boolean} [options.isSticker=false] - If true, uses sticker-optimized defaults for some models.
 * @returns {Promise<{success: boolean, data: Buffer | null, error: string | null, mimeType: string | null, seed?: any}>} - Result object.
 */
async function generateCloudflareImage(prompt, modelName, options = {}) {
    const MAX_CLOUDFLARE_RETRIES = 3;
    const INITIAL_RETRY_DELAY_MS = 2500;

    const { width: optionWidth, height: optionHeight, isSticker = false } = options;

    const modelEndpointName = config.IMAGE_MODEL_ENDPOINTS[modelName];
    if (!modelEndpointName) {
        console.error(`[CF Service] Image model "${modelName}" not found in config.IMAGE_MODEL_ENDPOINTS.`);
        return { success: false, data: null, error: `Image model "${modelName}" not found.`, mimeType: null };
    }

    let requestBody;
    // Default dimensions, can be overridden by options or model specifics
    let currentWidth = optionWidth || (isSticker ? 512 : 768); // Default 768 for non-stickers
    let currentHeight = optionHeight || (isSticker ? 512 : 768); // Default 768 for non-stickers

    // Model-specific request body adjustments
    switch (modelName) {
        case 'flux-1-schnell':
            requestBody = { prompt: prompt, steps: 4, guidance: 0, num_inference_steps: 4, strength: 0.9, width: optionWidth || 512, height: optionHeight || 512 };
            break;
        case 'dreamshaper-8-lcm':
            requestBody = { prompt: prompt, width: currentWidth, height: currentHeight, num_steps: 8, guidance: 2 };
            break;
        case 'stable-diffusion-xl-lighting':
            requestBody = { prompt: prompt, width: currentWidth, height: currentHeight, num_steps: 6, guidance: 1.5 };
            break;
        case 'stable-diffusion-xl-base-1.0':
            requestBody = { prompt: prompt, width: currentWidth, height: currentHeight, num_steps: isSticker ? 20 : 25, guidance: 7 };
            break;
        default:
            console.warn(`[CF Service] Model "${modelName}" not explicitly handled in switch, using default body.`);
            requestBody = { prompt: prompt, width: currentWidth, height: currentHeight, num_steps: isSticker ? 15 : 20, guidance: 7 };
    }

    console.log(`[CF Service] Requesting image from Cloudflare model "${modelName}" (${modelEndpointName}) with body:`, JSON.stringify(requestBody));
    const apiUrl = `${config.BASE_IMAGE_GENERATION_API_ENDPOINT}${modelEndpointName}`;

    for (let attempt = 1; attempt <= MAX_CLOUDFLARE_RETRIES; attempt++) {
        try {
            const response = await axios.post(
                apiUrl,
                requestBody,
                {
                    headers: { "Authorization": `Bearer ${config.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
                    responseType: 'arraybuffer',
                    validateStatus: status => status >= 200 && status < 300
                }
            );

            const contentType = response.headers['content-type'];
            console.log(`[CF Service Attempt ${attempt}] Response Content-Type: ${contentType} from ${modelName}`);

            let imageBuffer = null;
            let imageMimeType = 'image/png'; // Default

            if (contentType && contentType.includes('application/json')) {
                const jsonString = Buffer.from(response.data).toString('utf8');
                const responseJson = JSON.parse(jsonString);
                if (responseJson.success === true && responseJson.result && responseJson.result.image) {
                    const base64Image = responseJson.result.image;
                    if (base64Image.startsWith('/9j/')) imageMimeType = 'image/jpeg';
                    imageBuffer = Buffer.from(base64Image, 'base64');
                } else {
                    const errorMessage = responseJson?.errors?.[0]?.message || 'פרטים לא זמינים';
                    throw new Error(`JSON response indicates failure from ${modelName}: ${errorMessage}`);
                }
            } else if (contentType && contentType.startsWith('image/')) {
                imageBuffer = Buffer.from(response.data, 'binary');
                imageMimeType = contentType;
            } else {
                throw new Error(`Unexpected Content-Type from ${modelName}: ${contentType}`);
            }

            if (!imageBuffer || imageBuffer.length < 1000) {
                throw new Error(`Invalid or empty image buffer from ${modelName}. Size: ${imageBuffer?.length}`);
            }

            console.log(`[CF Service Attempt ${attempt}] Image buffer successfully obtained for ${modelName}. Mime: ${imageMimeType}, Size: ${imageBuffer.length}`);
            // Note: Seed is not typically returned by Cloudflare image models in this direct way.
            // If it were, e.g., in responseJson.result.seed, we would add it here.
            return { success: true, data: imageBuffer, error: null, mimeType: imageMimeType, seed: response.data?.result?.seed };

        } catch (error) {
            console.error(`[CF Service Attempt ${attempt}] Error for ${modelName}:`, error.message);
            if (error.response) {
                console.error(`  Status: ${error.response.status}`);
                try {
                    const errorDataText = Buffer.from(error.response.data).toString('utf8');
                    console.error(`  Data: ${errorDataText.substring(0, 500)}`);
                } catch (e) { /* ignore if cannot read data */ }
            }

            if (attempt < MAX_CLOUDFLARE_RETRIES && error.response && [429, 500, 503, 504].includes(error.response.status)) {
                const delayTime = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                console.warn(`[CF Service] Received ${error.response.status} for ${modelName}. Retrying attempt ${attempt + 1}/${MAX_CLOUDFLARE_RETRIES} in ${delayTime / 1000}s...`);
                await delay(delayTime);
            } else {
                let userErrorMessage = `שגיאה ביצירת תמונה עם מודל ${modelName}.`;
                if (error.response) {
                    userErrorMessage += ` (קוד: ${error.response.status})`;
                    try {
                        const errorData = JSON.parse(Buffer.from(error.response.data).toString('utf8'));
                        if (errorData.errors && errorData.errors[0] && errorData.errors[0].message) {
                            userErrorMessage += `: ${errorData.errors[0].message.substring(0, 100)}`;
                        }
                    } catch (e) { /* ignore parsing error */ }
                } else {
                    userErrorMessage += `: ${error.message.substring(0, 100)}`;
                }
                return { success: false, data: null, error: userErrorMessage, mimeType: null };
            }
        }
    }
    return { success: false, data: null, error: `Failed all ${MAX_CLOUDFLARE_RETRIES} retries for ${modelName}.`, mimeType: null };
}

/**
 * Transcribes audio using Cloudflare Whisper.
 * @param {string} audioBase64 - Base64 encoded audio data.
 * @param {string} [language='he'] - Optional language hint for transcription.
 * @returns {Promise<{success: boolean, text: string | null, error: string | null}>} Result object.
 */
async function transcribeAudio(audioBase64, language = 'he') {
    console.log(`[CF Service] Sending audio to Whisper (Language hint: ${language})...`);
    try {
        const response = await axios.post(
            config.CLOUDFLARE_WHISPER_API_ENDPOINT,
            // Cloudflare's Whisper endpoint might not directly support 'model_kwargs' in the root.
            // It expects the audio data directly, or sometimes a more specific structure.
            // For simplicity, sending audio directly. If language hints are via model_kwargs,
            // ensure the endpoint or a wrapper handles that.
            // The provided example `handleVoiceMessage` sends `{ audio: audioBase64, model_kwargs: { language: "he" } }`
            // So we will replicate that if the API supports it.
            // However, typical direct AI model calls often take parameters like 'language' at the root or not at all if auto-detected.
            // Let's assume for now the structure used in what_FIXED (1).js's handleVoiceMessage is correct for this endpoint.
            {
                audio: audioBase64,
                ...(language && { model_kwargs: { language: language } }) // Add model_kwargs if language is provided
            },
            {
                headers: {
                    "Authorization": `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log(`[CF Service] Whisper response status: ${response.status}`);
        if (response.data && response.data.result && response.data.result.text) {
            console.log(`  -> Transcription: "${response.data.result.text}"`);
            if (response.data.result.transcription_info) {
                const info = response.data.result.transcription_info;
                console.log(`  Language detected: ${info.language} (Prob: ${info.language_probability}), Duration: ${info.duration}s`);
            }
            return { success: true, text: response.data.result.text, error: null };
        } else {
            console.error("[CF Service] Whisper response missing expected text result:", response.data);
            return { success: false, text: null, error: "שירות התמלול לא החזיר טקסט תקין." };
        }
    } catch (error) {
        console.error("❌ [CF Service] Error during Whisper transcription:", error.response?.data || error.message);
        const errorMsg = error.response?.data?.errors?.[0]?.message || "שגיאה בתקשורת עם שירות התמלול.";
        return { success: false, text: null, error: errorMsg };
    }
}

/**
 * Analyzes an image using Cloudflare Vision (Placeholder).
 * @param {string} imageBase64 - Base64 encoded image data.
 * @returns {Promise<{success: boolean, analysis: object | null, error: string | null}>} Result object.
 */
async function analyzeImageWithVision(imageBase64) {
    console.log(`[CF Service] Sending image to Vision API (Placeholder)...`);
    if (!config.CLOUDFLARE_VISION_API_ENDPOINT) {
        return { success: false, analysis: null, error: "Vision API endpoint not configured." };
    }
    // This is a placeholder. Actual implementation will depend on the specific Vision model's API.
    // For example, some models might take { image: imageBase64, prompt: "Describe this image" }
    // Others might just take the image buffer.
    try {
        // Example request structure (adjust as per actual API docs for the chosen vision model)
        const response = await axios.post(
            config.CLOUDFLARE_VISION_API_ENDPOINT,
            { image: imageBase64 }, // This is a common pattern
            {
                headers: {
                    "Authorization": `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
                    "Content-Type": "application/json" // Or 'application/octet-stream' if sending raw buffer
                }
            }
        );
        console.log(`[CF Service] Vision API response status: ${response.status}`);
        if (response.data && response.data.result) { // Adjust based on actual response structure
            return { success: true, analysis: response.data.result, error: null };
        } else {
            console.error("[CF Service] Vision API response missing expected result:", response.data);
            return { success: false, analysis: null, error: "Vision API did not return a valid analysis." };
        }
    } catch (error) {
        console.error("❌ [CF Service] Error during Vision API call:", error.response?.data || error.message);
        const errorMsg = error.response?.data?.errors?.[0]?.message || "שגיאה בתקשורת עם שירות הראייה הממוחשבת.";
        return { success: false, analysis: null, error: errorMsg };
    }
}


module.exports = {
    generateCloudflareImage,
    transcribeAudio,
    analyzeImageWithVision
};