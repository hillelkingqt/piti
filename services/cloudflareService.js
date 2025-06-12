const axios = require('axios');
const config = require('../config'); // Assuming config.js is in the root

/**
 * Runs an image generation task using a specified Cloudflare model.
 * @param {string} modelEndpointSuffix - The specific model endpoint suffix (e.g., '@cf/bytedance/stable-diffusion-xl-lightning').
 * @param {object} requestBody - The body for the POST request, specific to the model.
 * @returns {Promise<object>} An object containing { buffer: Buffer | null, mimeType: string | null, error: string | null }.
 */
async function runImageGeneration(modelEndpointSuffix, requestBody) {
    if (!modelEndpointSuffix || !requestBody) {
        return { buffer: null, mimeType: null, error: "Model endpoint suffix and request body are required for image generation." };
    }
    const fullEndpoint = `${config.BASE_IMAGE_GENERATION_API_ENDPOINT}${modelEndpointSuffix}`;
    console.log(`[CloudflareService] Requesting image from: ${fullEndpoint}`);

    try {
        const response = await axios.post(
            fullEndpoint,
            requestBody,
            {
                headers: {
                    "Authorization": `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
                    "Content-Type": "application/json"
                },
                responseType: 'arraybuffer',
                validateStatus: status => status >= 200 && status < 300
            }
        );

        const contentType = response.headers['content-type'];
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
                const errorMsg = responseJson?.errors?.[0]?.message || 'Cloudflare JSON response indicates failure.';
                console.error(`[CloudflareService] Image generation JSON error:`, responseJson);
                return { buffer: null, mimeType: null, error: errorMsg };
            }
        } else if (contentType && contentType.startsWith('image/')) {
            imageBuffer = Buffer.from(response.data, 'binary');
            imageMimeType = contentType;
        } else {
            console.error(`[CloudflareService] Unexpected Content-Type for image generation: ${contentType}`);
            return { buffer: null, mimeType: null, error: `Unexpected Content-Type: ${contentType}` };
        }

        if (!imageBuffer || imageBuffer.length < 100) {
            console.error(`[CloudflareService] Invalid or empty image buffer. Size: ${imageBuffer?.length}`);
            return { buffer: null, mimeType: null, error: 'Invalid or empty image buffer from Cloudflare.' };
        }

        return { buffer: imageBuffer, mimeType: imageMimeType, error: null };

    } catch (error) {
        console.error(`[CloudflareService] Error in runImageGeneration for ${modelEndpointSuffix}:`, error.message);
        let errorDataText = 'Error details not available.';
        if (error.response) {
            try {
                errorDataText = Buffer.from(error.response.data).toString('utf8');
            } catch (e) { /* ignore */ }
        }
        return {
            buffer: null,
            mimeType: null,
            error: `Cloudflare API error (${error.response?.status || 'unknown status'}): ${error.message}. Details: ${errorDataText.substring(0,200)}`
        };
    }
}

/**
 * Runs a voice transcription task using Cloudflare Whisper.
 * @param {string} audioBase64 - The base64 encoded audio data.
 * @param {string} language - The language of the audio (e.g., "he" for Hebrew).
 * @returns {Promise<object>} An object containing { text: string | null, error: string | null, transcription_info: object | null }.
 */
async function runWhisperTranscription(audioBase64, language = "he") {
    if (!audioBase64) {
        return { text: null, error: "Audio data is required for transcription.", transcription_info: null };
    }
    console.log(`[CloudflareService] Requesting Whisper transcription. Language: ${language}`);
    try {
        const response = await axios.post(
            config.CLOUDFLARE_WHISPER_API_ENDPOINT,
            {
                audio: audioBase64, // Cloudflare expects the base64 string directly if it's small enough, or a Buffer for larger files.
                                     // For simplicity here, assuming it's a base64 string as per original code.
                                     // If sending raw bytes, the Content-Type might need to be audio/*
                model_kwargs: { language: language }
            },
            {
                headers: {
                    "Authorization": `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
                    "Content-Type": "application/json" // Assuming sending base64 encoded audio within JSON
                }
            }
        );

        if (response.data && response.data.result && response.data.result.text) {
            return {
                text: response.data.result.text,
                error: null,
                transcription_info: response.data.result.transcription_info || null
            };
        } else {
            console.error("[CloudflareService] Whisper response missing expected text result:", response.data);
            return { text: null, error: "Whisper response missing expected text result.", transcription_info: null };
        }
    } catch (error) {
        console.error("❌ [CloudflareService] Error in runWhisperTranscription:", error.response?.data || error.message || error);
        return {
            text: null,
            error: `Cloudflare Whisper API error: ${error.response?.data?.errors?.[0]?.message || error.message}`,
            transcription_info: null
        };
    }
}

/**
 * Placeholder for running a vision task using Cloudflare Vision.
 * @param {string} imageBase64 - Base64 encoded image data.
 * @param {object} body - Additional parameters for the vision task.
 * @returns {Promise<object>}
 */
async function runVisionTask(imageBase64, body = {}) {
    // This function's implementation would depend on the specific vision model and its expected payload.
    // The current vision endpoint is: config.CLOUDFLARE_VISION_API_ENDPOINT
    // Which corresponds to @cf/unum/uform-gen2-qwen-500m
    // This model typically expects a payload like: { "image": [byte_array_of_image], "prompt": "Describe this image." }
    // Or for VQA: { "image": [byte_array_of_image], "question": "What color is the cat?" }

    console.warn("[CloudflareService] runVisionTask is a placeholder and not fully implemented.");
    if (!imageBase64) {
         return { data: null, error: "Image data is required for vision task." };
    }

    // Example of how it *might* be called, actual payload needs to be verified from Cloudflare docs for the model
    try {
        // Convert base64 to a simple byte array (Uint8Array) for the model if needed
        // const imageBytes = Buffer.from(imageBase64, 'base64'); // This gives a Node.js Buffer
        // const imageByteArray = [...imageBytes]; // Spread into a simple array

        const response = await axios.post(
            config.CLOUDFLARE_VISION_API_ENDPOINT,
            {
                // This payload is an EXAMPLE and needs to be confirmed for the specific model
                // image: imageByteArray, // Send as byte array
                // prompt: "Describe what you see in this image."
                // For now, sending base64 directly as some models might support it or for simplicity.
                // Check Cloudflare documentation for the exact payload for @cf/unum/uform-gen2-qwen-500m
                image: imageBase64, // Sending base64 string - THIS MIGHT BE WRONG FOR THE MODEL
                prompt: body.prompt || "Describe this image in detail."
            },
            {
                headers: {
                    "Authorization": `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );
        return { data: response.data, error: null };
    } catch (error) {
        console.error("❌ [CloudflareService] Error in runVisionTask:", error.response?.data || error.message || error);
        return {
            data: null,
            error: `Cloudflare Vision API error: ${error.response?.data?.errors?.[0]?.message || error.message}`
        };
    }
}

module.exports = {
    runImageGeneration,
    runWhisperTranscription,
    runVisionTask,
};
