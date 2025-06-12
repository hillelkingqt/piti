// services/ElevenLabsService.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Generates Text-to-Speech audio using ElevenLabs API.
 * @param {string} text - The text to synthesize.
 * @param {string} [voiceId=config.ELEVENLABS_DEFAULT_VOICE_ID] - The voice ID to use.
 * @returns {Promise<string|null>} Path to the generated MP3 file or null on error.
 */
async function generateTTS(text, voiceId = config.ELEVENLABS_DEFAULT_VOICE_ID) {
    const apiKey = config.ELEVENLABS_API_KEY;
    if (!apiKey || apiKey.startsWith('sk_YOUR_API_KEY')) { // Basic check
        console.error("❌ [ElevenLabs Service] API key is missing or invalid.");
        return null;
    }
    if (!text || typeof text !== 'string') {
        console.error("❌ [ElevenLabs Service] Invalid text provided for TTS.");
        return null;
    }

    const outputPath = path.join(__dirname, '..', `tts_output_${Date.now()}.mp3`); // Go up one level from services
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const requestData = {
        text: text,
        model_id: 'eleven_multilingual_v2', // Use v2 model
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    };

    console.log(`[ElevenLabs Service] Sending TTS request to ${apiUrl}`);
    try {
        const response = await axios({
            method: 'POST',
            url: apiUrl,
            data: requestData,
            responseType: 'stream',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            validateStatus: status => status >= 200 && status < 300,
            timeout: 60000 // 60 second timeout
        });

        const writer = fs.createWriteStream(outputPath);
        const stream = response.data;

        // Promise for stream handling
        await new Promise((resolve, reject) => {
            stream.on('error', (streamError) => {
                console.error("❌ [ElevenLabs Service] Stream error:", streamError);
                writer.close(() => { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); }); // Cleanup
                reject(new Error(`Stream error: ${streamError.message}`));
            });
            writer.on('finish', resolve);
            writer.on('error', (writeError) => {
                console.error("❌ [ElevenLabs Service] File write error:", writeError);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); // Cleanup
                reject(new Error(`File write error: ${writeError.message}`));
            });
            stream.pipe(writer);
        });

        console.log(`[ElevenLabs Service] TTS file saved: ${outputPath}`);
        // Basic validation after write
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
            console.error("❌ [ElevenLabs Service] Output file is missing or too small.");
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            throw new Error("Generated audio file invalid or empty.");
        }

        return outputPath; // Return the path to the generated file

    } catch (err) {
        console.error("❌ [ElevenLabs Service] Overall TTS Error:", err.response?.data || err.message || err);
        // Try to clean up if file exists
        if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch (e) { }
        }
        // Log specific API errors if available
        if (err.response?.data) {
            try {
                // If data is streamable, read it
                if (typeof err.response.data.read === 'function') {
                    const errorBody = await streamToString(err.response.data); // Use helper from handleTTSAction
                    console.error("   -> API Error Body:", errorBody);
                } else {
                    console.error("   -> API Error Data:", err.response.data);
                }
            } catch { /* ignore read errors */ }
        }
        return null; // Return null on error
    }
}

// Helper needs to be defined or imported if used here
async function streamToString(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    })
}

module.exports = {
    generateTTS
};