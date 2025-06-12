const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { URL } = require('url'); // For parsing image URLs
const config = require('../config'); // Assuming config.js is in the root

/**
 * Searches images on Pixabay and downloads them.
 * @param {string} query - The search query.
 * @param {number} maxImagesToDownload - Maximum number of images to download.
 * @param {string} filenamePrefix - Prefix for the downloaded image filenames.
 * @param {string} saveDir - Directory to save the downloaded images.
 * @param {object} [chatMsgForFeedback=null] - Optional whatsapp-web.js message object for sending feedback directly.
 *                                            If provided, the function will use msg.reply().
 * @returns {Promise<Array<object>>} A list of objects, each containing { localPath, latexPath, sourceUrl, originalImageUrl }.
 */
async function searchAndDownloadPixabayImages(query, maxImagesToDownload, filenamePrefix, saveDir, chatMsgForFeedback = null) {
    console.log(`🖼️ [PixabayService] Searching for "${query}", max: ${maxImagesToDownload}, prefix: ${filenamePrefix}, saveDir: ${saveDir}`);
    const downloadedImagesInfo = [];

    if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
    }

    if (!config.PIXABAY_API_KEY || config.PIXABAY_API_KEY === 'YOUR_PIXABAY_API_KEY_HERE' || config.PIXABAY_API_KEY === 'המפתח_API_שלך_מפיקסביי') {
        console.error("❌ PixabayService: PIXABAY_API_KEY is not set or is a placeholder.");
        if (chatMsgForFeedback && chatMsgForFeedback.reply) {
            try {
                await chatMsgForFeedback.reply("פיתי\n\n⚠️ שירות חיפוש התמונות ברשת (Pixabay) אינו מוגדר כראוי (חסר מפתח API).");
            } catch (e) { console.error("Error sending feedback reply in PixabayService:", e); }
        }
        return [];
    }

    try {
        const response = await axios.get('https://pixabay.com/api/', {
            params: {
                key: config.PIXABAY_API_KEY,
                q: query,
                image_type: 'photo',
                per_page: Math.max(3, Math.min(200, maxImagesToDownload * 2)), // Fetch a bit more to have choice, cap at 200
                safesearch: true,
                page: 1
            },
            timeout: config.PIXABAY_API_TIMEOUT || 15000 // 15 seconds timeout
        });

        if (response.data && response.data.hits && response.data.hits.length > 0) {
            const imagesToProcess = response.data.hits.slice(0, maxImagesToDownload);
            console.log(`[PixabayService] Found ${response.data.hits.length} images on Pixabay, processing up to ${imagesToProcess.length}.`);

            for (let i = 0; i < imagesToProcess.length; i++) {
                if (downloadedImagesInfo.length >= maxImagesToDownload) break;

                const hit = imagesToProcess[i];
                const imageUrl = hit.largeImageURL || hit.webformatURL;
                if (!imageUrl) continue;

                let extension = 'jpg';
                try {
                    const urlParts = new URL(imageUrl);
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
                } catch (headError) {
                    console.warn(`  [PixabayService] Could not get HEAD for ${imageUrl}, defaulting to jpg. Error: ${headError.message}`);
                }

                try {
                    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 }); // 20s for download
                    const imageBuffer = Buffer.from(imageResponse.data, 'binary');

                    if (imageBuffer && imageBuffer.length > 1000) { // Basic size check
                        const filename = `${filenamePrefix}${downloadedImagesInfo.length + 1}.${extension}`;
                        const localPath = path.join(saveDir, filename);
                        fs.writeFileSync(localPath, imageBuffer);

                        downloadedImagesInfo.push({
                            localPath: localPath,
                            latexPath: `files/${filename.replace(/\\/g, '/')}`, // Relative path for LaTeX
                            sourceUrl: hit.pageURL,
                            originalImageUrl: imageUrl
                        });
                        console.log(`  [PixabayService] Downloaded and saved: ${filename} (from Pixabay: ${hit.pageURL})`);
                    } else {
                        console.warn(`  [PixabayService] Skipped small/invalid image from Pixabay URL: ${imageUrl}`);
                    }
                } catch (downloadError) {
                    console.error(`  [PixabayService] Error downloading image from Pixabay URL ${imageUrl}: ${downloadError.message}`);
                }
            }

            if (chatMsgForFeedback && chatMsgForFeedback.reply && downloadedImagesInfo.length === 0 && response.data.hits.length > 0) {
                 try {
                    await chatMsgForFeedback.reply("פיתי\n\nמצאתי תמונות ב-Pixabay אך נתקלתי בבעיה בהורדה שלהן.");
                } catch (e) { console.error("Error sending feedback reply in PixabayService:", e); }
            }

        } else {
            console.warn(`[PixabayService] No images found on Pixabay for query: "${query}"`);
            if (chatMsgForFeedback && chatMsgForFeedback.reply) {
                 try {
                    await chatMsgForFeedback.reply(`פיתי\n\nלא מצאתי תמונות מתאימות ב-Pixabay עבור החיפוש: "${query}".`);
                } catch (e) { console.error("Error sending feedback reply in PixabayService:", e); }
            }
        }
    } catch (error) {
        console.error(`❌ [PixabayService] API or general error for "${query}":`, error.response?.data || error.message);
        if (chatMsgForFeedback && chatMsgForFeedback.reply) {
            let errMsgText = "שגיאה בחיפוש תמונות ב-Pixabay.";
            if (error.response?.status === 401 || error.response?.status === 403) {
                errMsgText = "שגיאת גישה ל-Pixabay. בדוק את מפתח ה-API.";
            } else if (error.response?.status === 400) {
                errMsgText = "בקשה לא תקינה ל-Pixabay (ייתכן שהשאילתה מורכבת מדי).";
            }
             try {
                await chatMsgForFeedback.reply(`פיתי\n\n${errMsgText}`);
            } catch (e) { console.error("Error sending feedback reply in PixabayService:", e); }
        }
    }
    return downloadedImagesInfo;
}

module.exports = {
    searchAndDownloadPixabayImages,
};
