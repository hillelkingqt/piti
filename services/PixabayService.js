// services/PixabayService.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const config = require('../config'); // Assuming config.js is in the parent directory
const { Buffer } = require('buffer'); // Included for completeness, though often global
const { URL } = require('url'); // Included for completeness

/**
 * Searches for images on Pixabay and downloads them.
 * @param {string} query - The search query.
 * @param {number} maxImagesToDownload - Maximum number of images to download.
 * @param {string} filenamePrefix - Prefix for the downloaded image filenames.
 * @param {string} saveDir - Directory to save the downloaded images.
 * @param {object} chatMsgForFeedback - Optional WhatsApp message object for sending feedback to the user.
 * @returns {Promise<Array<object>>} A list of objects, each containing info about a downloaded image.
 */
async function searchAndDownloadWebImages(query, maxImagesToDownload, filenamePrefix, saveDir, chatMsgForFeedback) {
    console.log(`🖼️ [PixabayService] Searching for "${query}", max: ${maxImagesToDownload}, prefix: ${filenamePrefix}`);
    const downloadedImagesInfo = [];
    fs.mkdirSync(saveDir, { recursive: true });

    const apiKey = config.PIXABAY_API_KEY;

    if (!apiKey || apiKey === 'YOUR_PIXABAY_API_KEY' || apiKey === 'המפתח_API_שלך_מפיקסביי') {
        console.error("❌ [PixabayService] PIXABAY_API_KEY is not set in config.js. Please obtain an API key from pixabay.com/api/docs/ and add it.");
        if (chatMsgForFeedback && typeof chatMsgForFeedback.reply === 'function') {
            await chatMsgForFeedback.reply("פיתי\n\n⚠️ שירות חיפוש התמונות ברשת (Pixabay) אינו מוגדר כראוי (חסר מפתח API). לא ניתן להוריד תמונות מהרשת.");
        }
        return [];
    }

    try {
        const response = await axios.get('https://pixabay.com/api/', {
            params: {
                key: apiKey,
                q: query,
                image_type: 'photo',
                per_page: Math.max(3, Math.min(200, maxImagesToDownload * 2)), // Fetch a bit more to have choices, max 200 by API
                safesearch: true,
                page: 1
            }
        });

        if (response.data && response.data.hits && response.data.hits.length > 0) {
            const imagesToProcess = response.data.hits.slice(0, maxImagesToDownload);
            console.log(`[PixabayService] Found ${response.data.hits.length} images, processing up to ${imagesToProcess.length}.`);

            for (let i = 0; i < imagesToProcess.length; i++) {
                const hit = imagesToProcess[i];
                const imageUrl = hit.largeImageURL || hit.webformatURL;
                if (!imageUrl) continue;

                let extension = 'jpg';
                try {
                    const urlParts = new URL(imageUrl); // Use the global URL constructor
                    const extFromUrl = path.extname(urlParts.pathname).toLowerCase();
                    if (['.jpg', '.jpeg', '.png'].includes(extFromUrl)) {
                        extension = extFromUrl.substring(1);
                    } else {
                        const headResponse = await axios.head(imageUrl, { timeout: 5000 });
                        const contentType = headResponse.headers['content-type'];
                        if (contentType) {
                            extension = mime.extension(contentType) || 'jpg';
                        }
                    }
                } catch (urlOrHeadError) {
                    console.warn(`[PixabayService]  Could not determine extension for ${imageUrl}, defaulting to jpg. Error: ${urlOrHeadError.message}`);
                    // Fallback to jpg if URL parsing or HEAD request fails
                    extension = 'jpg';
                }

                try {
                    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
                    const imageBuffer = Buffer.from(imageResponse.data, 'binary');

                    if (imageBuffer && imageBuffer.length > 1000) {
                        const filename = `${filenamePrefix}${i + 1}.${extension}`;
                        const localPath = path.join(saveDir, filename);
                        fs.writeFileSync(localPath, imageBuffer);
                        downloadedImagesInfo.push({
                            localPath: localPath,
                            latexPath: `files/${filename.replace(/\\/g, '/')}`,
                            sourceUrl: hit.pageURL,
                            originalImageUrl: imageUrl
                        });
                        console.log(`[PixabayService]  Downloaded and saved: ${filename} (from Pixabay: ${hit.pageURL})`);
                    } else {
                        console.warn(`[PixabayService]  Skipped small/invalid image from Pixabay URL: ${imageUrl}`);
                    }
                } catch (downloadError) {
                    console.error(`[PixabayService]  Error downloading image from Pixabay URL ${imageUrl}: ${downloadError.message}`);
                }
                if (downloadedImagesInfo.length >= maxImagesToDownload) break;
            }

            // Feedback messages can be handled by the caller based on the returned array.
        } else {
            console.warn(`[PixabayService] No images found on Pixabay for query: "${query}"`);
            if (chatMsgForFeedback && typeof chatMsgForFeedback.reply === 'function') {
                await chatMsgForFeedback.reply(`פיתי\n\nלא מצאתי תמונות מתאימות ב-Pixabay עבור החיפוש: "${query}".`);
            }
        }
    } catch (error) {
        console.error(`❌ [PixabayService] API or general error for "${query}":`, error.response?.data || error.message);
        if (chatMsgForFeedback && typeof chatMsgForFeedback.reply === 'function') {
            let errMsg = "שגיאה בחיפוש תמונות ב-Pixabay.";
            if (error.response?.status === 401 || error.response?.status === 403) {
                errMsg = "שגיאת גישה ל-Pixabay. בדוק את מפתח ה-API בקונפיגורציה.";
            } else if (error.response?.status === 400) {
                errMsg = "בקשה לא תקינה ל-Pixabay (ייתכן שהשאילתה מורכבת מדי).";
            } else if (error.response?.status === 429) {
                errMsg = "חרגת ממגבלת הבקשות ל-Pixabay. נסה שוב מאוחר יותר.";
            }
            await chatMsgForFeedback.reply(`פיתי\n\n${errMsg}`);
        }
    }
    return downloadedImagesInfo;
}

module.exports = {
    searchAndDownloadWebImages
};
