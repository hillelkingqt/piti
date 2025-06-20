const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { MessageMedia } = require('whatsapp-web.js'); // Required for findMessageMedia, though not in the primary list, good to anticipate.

// Utility functions for WhatsApp bot

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeMsgId(msgId) {
    if (typeof msgId !== 'string') return msgId;
    return msgId.replace(/^true_|^false_/, "").replace(/@c\.us_([A-F0-9]+)$/, "");
}

function getBaseId(msgId) {
    if (typeof msgId !== 'string') return null;
    return msgId.split('_')[1] || msgId;
}

function getBaseIdForOwnerCheck(fullId) {
    if (typeof fullId !== 'string') return null;
    // Examples: "972501234567@c.us" or "false_972501234567@c.us_ABCDEF123456"
    // We want to extract "972501234567@c.us"
    const match = fullId.match(/(\d+@c\.us)/);
    return match ? match[1] : fullId; // Return the matched part or the original if no match
}

function getLocalTimestamp() {
    const now = new Date();
    const datePart = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD format
    const timePart = now.toLocaleTimeString('he-IL', { hour12: false }); // HH:MM:SS format (Israeli locale)
    return `[${datePart} ${timePart}]`;
}

function pcmToWav(pcm, sampleRate, channels, bits) {
    const blockAlign = channels * (bits / 8);
    const byteRate = sampleRate * blockAlign;
    const buffer = new ArrayBuffer(44 + pcm.length);
    const view = new DataView(buffer);
    let p = 0;
    const writeU16 = n => (view.setUint16(p, n, true), p += 2);
    const writeU32 = n => (view.setUint32(p, n, true), p += 4);
    const writeStr = s => {
        for (let i = 0; i < s.length; i++) {
            view.setUint8(p++, s.charCodeAt(i));
        }
    };

    writeStr("RIFF");
    writeU32(buffer.byteLength - 8);
    writeStr("WAVE");
    writeStr("fmt ");
    writeU32(16); // Subchunk1Size
    writeU16(1); // PCM format
    writeU16(channels);
    writeU32(sampleRate);
    writeU32(byteRate);
    writeU16(blockAlign);
    writeU16(bits);
    writeStr("data");
    writeU32(pcm.length);
    new Uint8Array(buffer, 44).set(pcm);
    return Buffer.from(buffer);
}

async function streamToString(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

function formatDateKey(date) {
    return date.toISOString().split('T')[0];
}

function formatDateForDisplay(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('he-IL', options);
}

function formatTimeForDisplay(date) {
    const options = { hour: 'numeric', minute: 'numeric' };
    return date.toLocaleTimeString('he-IL', options);
}

function getWeeklyHabitStatus(habitData) {
    const today = new Date();
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateKey = formatDateKey(date);
        const status = habitData[dateKey] || 'לא נרשם';
        days.push(`${formatDateForDisplay(date)}: ${status}`);
    }
    return days.reverse();
}

async function generateBarcode(text) {
    const tempDir = path.join(__dirname, 'temp_files'); // Store in a temp_files subdir of utilityHelpers
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const filePath = path.join(tempDir, `barcode_${Date.now()}.png`);
    return new Promise((resolve, reject) => {
        QRCode.toFile(filePath, text, { errorCorrectionLevel: 'H' }, function(err) {
            if (err) {
                console.error("Error generating QR code:", err);
                reject(err);
            } else {
                console.log('QR code saved to', filePath);
                resolve(filePath);
            }
        });
    });
}

async function getSafeNameForChat(client, chat) { // Added client as a parameter
    let safeName = '';
    if (chat.isGroup) {
        safeName = chat.name.replace(/[^\w\u0590-\u05FF\s-]/g, "").replace(/\s+/g, "_"); // Allowed hyphens
    } else {
        const contact = await client.getContactById(chat.id._serialized); // Uses the passed client
        safeName = contact.pushname || contact.name || contact.number || chat.id._serialized.split('@')[0];
        safeName = safeName.replace(/[^\w\u0590-\u05FF\s-]/g, "").replace(/\s+/g, "_"); // Allowed hyphens
    }
    // Ensure the name is not excessively long and doesn't start/end with underscores/hyphens
    safeName = safeName.substring(0, 50).replace(/^_+|-+$/g, '').replace(/^[-]+|[-]+$/g, '');
    return `${chat.id.user}_${safeName || 'unknown'}`; // Added fallback for empty safeName
}

// Exporting all functions
module.exports = {
    delay,
    normalizeMsgId,
    getBaseId,
    getBaseIdForOwnerCheck,
    getLocalTimestamp,
    pcmToWav,
    streamToString,
    formatDateKey,
    formatDateForDisplay,
    formatTimeForDisplay,
    getWeeklyHabitStatus,
    generateBarcode,
    getSafeNameForChat // Added getSafeNameForChat
};
