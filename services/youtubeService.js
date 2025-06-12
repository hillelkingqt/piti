const axios = require('axios');
const cheerio = require('cheerio');
const play = require('play-dl'); // For downloads and potentially stream info/captions
const config = require('../config'); // For any future YouTube specific configs

// play-dl configuration (optional, if needed globally for the service)
// if (config.YOUTUBE_COOKIE) {
//     play.setToken({ youtube : { cookie : config.YOUTUBE_COOKIE }});
// }

/**
 * Searches YouTube for videos based on a query.
 * This version uses cheerio to scrape search results.
 * @param {string} query - The search query.
 * @param {number} [maxResults=2] - Maximum number of video links to return.
 * @returns {Promise<Array<string>|null>} An array of YouTube video URLs or null on error.
 */
async function searchYouTubeVideosScraping(query, maxResults = 2) {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const results = [];
    console.log(`[YouTubeService] Searching (scraping) YouTube for: "${query}"`);

    try {
        const { data } = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }, // Basic user agent
            timeout: config.YOUTUBE_SEARCH_TIMEOUT || 10000 // 10s timeout
        });

        const $ = cheerio.load(data);
        // This selector might be fragile and break if YouTube changes its HTML structure.
        // A more robust solution would use the YouTube Data API v3 if quotas allow.
        $('a#video-title').each((i, el) => {
            if (results.length < maxResults) {
                const href = $(el).attr('href');
                if (href && href.startsWith('/watch?v=')) {
                    results.push(`https://www.youtube.com${href}`);
                }
            }
        });

        // Fallback if the primary selector fails, try to find video IDs in script tags
        if (results.length === 0) {
            console.warn("[YouTubeService] Primary selector for video titles failed. Attempting script tag parsing...");
            const initialDataScript = $('script')
                .toArray()
                .map(el => $(el).html())
                .find(txt => txt && txt.includes('var ytInitialData'));

            if (initialDataScript) {
                const jsonStrMatch = initialDataScript.match(/var ytInitialData = ({.*?});/s);
                if (jsonStrMatch && jsonStrMatch[1]) {
                    const jsonData = JSON.parse(jsonStrMatch[1]);
                    const contents = jsonData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                    if (contents) {
                        const videos = contents.flatMap(section =>
                            section.itemSectionRenderer?.contents?.filter(item => item.videoRenderer)
                        );
                        for (let i = 0; i < Math.min(videos?.length || 0, maxResults); i++) {
                            const videoId = videos[i]?.videoRenderer?.videoId;
                            if (videoId) {
                                results.push(`https://www.youtube.com/watch?v=${videoId}`);
                            }
                        }
                    }
                }
            }
        }

        console.log(`[YouTubeService] Found ${results.length} videos (scraping).`);
        return results.length > 0 ? results : null;

    } catch (err) {
        console.error("❌ [YouTubeService] Error during YouTube search (scraping):", err.message);
        return null;
    }
}

/**
 * Downloads a YouTube video stream.
 * @param {string} videoUrl - The URL of the YouTube video.
 * @returns {Promise<object|null>} An object with { stream, type, title } or null on error.
 *                                 'stream' is a readable stream.
 */
async function downloadYouTubeVideoStream(videoUrl) {
    console.log(`[YouTubeService] Attempting to get stream for: ${videoUrl}`);
    if (!videoUrl || !play.yt_validate(videoUrl)) {
        console.error("❌ [YouTubeService] Invalid YouTube URL for download:", videoUrl);
        return null;
    }
    try {
        const videoInfo = await play.video_info(videoUrl); // Fetches basic info
        const streamData = await play.stream(videoUrl, {
            quality: 2, // Automatically picks the best quality with video and audio
            // filter: 'audioandvideo' // Ensure we get both, though quality:2 usually does this
        });

        if (!streamData || !streamData.stream) {
            console.error("❌ [YouTubeService] Could not obtain stream from play-dl for:", videoUrl);
            return null;
        }

        console.log(`[YouTubeService] Stream obtained. Type: ${streamData.type}. Title: ${videoInfo.video_details.title}`);
        return {
            stream: streamData.stream, // This is the readable stream
            type: streamData.type || 'video/mp4',
            title: videoInfo.video_details.title || 'youtube_video',
        };
    } catch (error) {
        console.error("❌ [YouTubeService] Error downloading video stream:", error.message);
        if (error.message.includes("private") || error.message.includes("unavailable")) {
            // Specific error for private/unavailable videos
        }
        return null;
    }
}

/**
 * Fetches captions for a YouTube video.
 * @param {string} videoUrl - The URL of the YouTube video.
 * @param {string} [lang='en'] - Preferred language for captions (e.g., 'en', 'he').
 * @returns {Promise<string|null>} A string containing the transcript or null if not found/error.
 */
async function getYouTubeVideoCaptions(videoUrl, lang = 'en') {
    console.log(`[YouTubeService] Fetching captions for: ${videoUrl}, Lang: ${lang}`);
    if (!videoUrl || !play.yt_validate(videoUrl)) {
        console.error("❌ [YouTubeService] Invalid YouTube URL for captions:", videoUrl);
        return null;
    }
    try {
        // play-dl's captions function might require cookies for some videos.
        const captionsData = await play.captions(videoUrl, { lang: lang });
        if (captionsData && captionsData.length > 0) {
            const transcript = captionsData.map(cap => cap.text).join(' ');
            console.log(`[YouTubeService] Captions fetched successfully (length: ${transcript.length}).`);
            return transcript;
        } else {
            console.warn(`[YouTubeService] No captions found for lang '${lang}' for ${videoUrl}.`);
            // Optionally try to find auto-generated captions if primary language failed
            // const videoInfo = await play.video_info(videoUrl);
            // const autoCaps = videoInfo.format.find(f => f.language === `a.${lang}`); // e.g., a.en
            // if (autoCaps) { ... logic to download and parse these ... }
            return null;
        }
    } catch (error) {
        console.error(`❌ [YouTubeService] Error fetching captions for ${videoUrl}:`, error.message);
        return null;
    }
}


module.exports = {
    searchYouTubeVideosScraping,
    downloadYouTubeVideoStream,
    getYouTubeVideoCaptions,
};
