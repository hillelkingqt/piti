const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config'); // Assuming config.js is in the root

/**
 * Generates Text-to-Speech audio using ElevenLabs API.
 * @param {string} text - The text to convert to speech.
 * @param {string} [voiceId='21m00Tcm4TlvDq8ikWAM'] - The ElevenLabs voice ID to use.
 * @param {string} [modelId='eleven_monolingual_v1'] - The ElevenLabs model ID.
 * @returns {Promise<string|null>} Path to the generated MP3 file or null on error.
 */
async function generateElevenLabsTTS(text, voiceId = '21m00Tcm4TlvDq8ikWAM', modelId = 'eleven_monolingual_v1') {
    if (!config.ELEVENLABS_API_KEY || config.ELEVENLABS_API_KEY === 'YOUR_ELEVENLABS_API_KEY_HERE') {
        console.error("❌ ElevenLabsService: API key is not configured.");
        // Depending on how critical this is, you might throw an error or return null.
        // await someGlobalErrorHandler("ElevenLabs API key not set.");
        return null;
    }

    if (!text) {
        console.error("❌ ElevenLabsService: Text to speak is required.");
        return null;
    }

    const outputPath = config.TTS_OUTPUT_PATH || path.join(__dirname, '..', 'tts_output.mp3'); // Default if not in config
    console.log(`[ElevenLabsService] Generating TTS for text: "${text.substring(0,30)}..." Output path: ${outputPath}`);

    try {
        const response = await axios({
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            data: {
                text,
                model_id: modelId,
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            },
            responseType: 'stream',
            headers: {
                'xi-api-key': config.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            timeout: config.ELEVENLABS_API_TIMEOUT || 30000 // 30 seconds timeout
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`[ElevenLabsService] TTS audio file saved successfully: ${outputPath}`);
                resolve(outputPath);
            });
            writer.on('error', (err) => {
                console.error("❌ ElevenLabsService: Error writing TTS audio file:", err);
                reject(err); // This will be caught by the outer catch block
            });
        });

    } catch (err) {
        console.error("❌ [ElevenLabsService] Error generating TTS:", err.response?.data ? Buffer.from(err.response.data).toString() : err.message);
        // Clean up partial file if error occurs
        if (fs.existsSync(outputPath)) {
            try {
                fs.unlinkSync(outputPath);
            } catch (cleanupErr) {
                console.error("❌ ElevenLabsService: Error cleaning up partial TTS file:", cleanupErr);
            }
        }
        return null;
    }
}

module.exports = {
    generateElevenLabsTTS,
};
