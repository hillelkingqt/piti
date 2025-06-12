// services/CloudflareService.js
const axios = require('axios');
const config = require('../config');

/**
 * Generates an image using a specified Cloudflare Workers AI model.
 * @param {string} prompt - The text prompt for the image.
 * @param {string} modelName - The key for the model endpoint (e.g., 'stable-diffusion-xl-base-1.0').
 * @param {number} [width=1024] - Optional image width.
 * @param {number} [height=1024] - Optional image height.
 * @param {number} [num_steps=20] - Optional number of steps.
 * @returns {Promise<{success: boolean, data: Buffer | null, error: string | null, mimeType: string | null}>} - Result object.
 */
async function generateCloudflareImage(prompt, modelName, width = 1024, height = 1024, num_steps = 20) {
    const modelEndpointName = config.IMAGE_MODEL_ENDPOINTS[modelName];
    if (!modelEndpointName) {
        console.error(`[CF Service] Image model "${modelName}" not found.`);
        return { success: false, data: null, error: `מודל תמונה לא ידוע: ${modelName}`, mimeType: null };
    }

    const apiUrl = `${config.BASE_IMAGE_GENERATION_API_ENDPOINT}${modelEndpointName}`;
    // Base request body, can be customized per model if needed
    const requestBody = { prompt, width, height, num_steps };

    // Customize steps for specific models if needed
    if (modelName === 'flux-1-schnell') {
        requestBody.steps = 4; // Override steps for flux
        delete requestBody.num_steps; // Remove num_steps if not applicable
        delete requestBody.width; // Remove width/height if not applicable
        delete requestBody.height;
    } else if (modelName === 'stable-diffusion-xl-lighting') {
        requestBody.num_steps = 8; // Example specific steps
    }

    console.log(`[CF Service] Requesting image from ${modelEndpointName} with body:`, requestBody);

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                "Authorization": `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            responseType: 'arraybuffer', // Expect binary data for images
            validateStatus: status => status >= 200 && status < 300
        });

        const contentType = response.headers['content-type'];
        console.log(`[CF Service] Image response received. Status: ${response.status}, Content-Type: ${contentType}`);

        if (contentType && contentType.startsWith('image/')) {
            const imageBuffer = Buffer.from(response.data, 'binary');
            if (imageBuffer.length < 100) { // Basic validation
                console.error(`[CF Service] Received empty or invalid image buffer for ${modelName}.`);
                return { success: false, data: null, error: "קובץ התמונה שהתקבל ריק או לא תקין.", mimeType: contentType };
            }
            return { success: true, data: imageBuffer, error: null, mimeType: contentType };
        } else {
            // Handle cases where API might return JSON error even with 2xx status? Unlikely but possible.
            let errorText = `סוג תוכן לא צפוי התקבל: ${contentType}`;
            try { // Attempt to parse if it's JSON error
                const errorJson = JSON.parse(Buffer.from(response.data).toString('utf8'));
                errorText = errorJson.errors?.[0]?.message || errorText;
                console.error("[CF Service] Received unexpected JSON response:", errorJson);
            } catch { /* ignore parsing error */ }
            return { success: false, data: null, error: errorText, mimeType: null };
        }

    } catch (error) {
        console.error(`❌ [CF Service] Error generating image with ${modelName}:`, error.response?.status || error.message);
        let errorMsg = `שגיאה בגישה לשרת התמונות (${modelName}).`;
        let errorDetails = '';
        if (error.response) {
            errorMsg = `שגיאה ${error.response.status} משרת התמונות (${modelName}).`;
            try {
                // Try to parse error data as text/json
                const errorDataString = Buffer.from(error.response.data).toString('utf8');
                console.error("   -> Error Data:", errorDataString);
                errorDetails = errorDataString.slice(0, 200); // Limit details length
                try {
                    const errorJson = JSON.parse(errorDataString);
                    errorDetails = errorJson.errors?.[0]?.message || errorDetails;
                } catch { /* ignore */ }
            } catch { console.error("   -> Could not read error response data buffer."); }
        }
        return { success: false, data: null, error: `${errorMsg} ${errorDetails}`, mimeType: null };
    }
}

/**
 * Transcribes audio using Cloudflare Whisper.
 * @param {string} audioBase64 - Base64 encoded audio data.
 * @returns {Promise<{success: boolean, text: string | null, error: string | null}>} Result object.
 */
async function transcribeAudioCF(audioBase64) {
    console.log(`[CF Service] Sending audio to Whisper...`);
    try {
        const response = await axios.post(
            config.CLOUDFLARE_WHISPER_API_ENDPOINT,
            { audio: audioBase64 },
            {
                headers: {
                    "Authorization": `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log(`[CF Service] Whisper response status: ${response.status}`);
        if (response.data?.result?.text) {
            console.log(`  -> Transcription: "${response.data.result.text}"`);
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

// Add function for Vision API if needed later
// async function analyzeImageCF(imageBase64) { ... }

module.exports = {
    generateCloudflareImage,
    transcribeAudioCF,
    // analyzeImageCF
};