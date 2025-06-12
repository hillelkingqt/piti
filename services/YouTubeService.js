// services/YouTubeService.js
const axios = require('axios');
const cheerio = require('cheerio');
const play = require('play-dl'); // Added play-dl

/**
 * Searches YouTube using web scraping (ytInitialData and fallback) and returns video links.
 * @param {string} query The search query.
 * @param {number} [numResults=3] The maximum number of results to return.
 * @returns {Promise<{success: boolean, videos: Array<{id: string, title: string, url: string}>, error: string | null}>}
 */
async function searchYouTube(query, numResults = 3) {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    console.log(`[YouTubeService] Searching URL: ${searchUrl}`);
    const videos = [];

    try {
        const { data } = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 15000
        });

        const $ = cheerio.load(data);
        const initialDataScript = $('script')
            .toArray()
            .map(el => $(el).html())
            .find(txt => txt && txt.includes('var ytInitialData'));

        if (initialDataScript) {
            const jsonStrMatch = initialDataScript.match(/var ytInitialData\s*=\s*({.*?});/s);
            if (jsonStrMatch && jsonStrMatch[1]) {
                try {
                    const ytInitialData = JSON.parse(jsonStrMatch[1]);
                    const contents = ytInitialData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                    const itemSection = contents?.find(c => c.itemSectionRenderer)?.itemSectionRenderer?.contents;
                    if (itemSection) {
                        for (const item of itemSection) {
                            if (videos.length >= numResults) break;
                            if (item.videoRenderer && item.videoRenderer.videoId) {
                                videos.push({
                                    id: item.videoRenderer.videoId,
                                    title: item.videoRenderer.title?.runs?.[0]?.text || 'Unknown Title',
                                    url: `https://www.youtube.com/watch?v=${item.videoRenderer.videoId}`
                                });
                            }
                        }
                        console.log(`[YouTubeService] Found ${videos.length} videos via ytInitialData.`);
                        if (videos.length > 0) return { success: true, videos: videos, error: null };
                    }
                } catch (parseError) {
                    console.warn("[YouTubeService] Failed to parse ytInitialData:", parseError.message);
                }
            }
        }

        console.warn("[YouTubeService] ytInitialData extraction failed or yielded no results. Falling back to Cheerio scraping.");
        $('a#video-title').each((i, el) => {
            if (videos.length >= numResults) return false;
            const href = $(el).attr('href');
            const title = $(el).attr('title');
            if (href && href.startsWith('/watch?v=')) {
                videos.push({
                    id: href.substring('/watch?v='.length),
                    title: title || 'Unknown Title',
                    url: `https://www.youtube.com${href}`
                });
            }
        });
        console.log(`[YouTubeService] Found ${videos.length} videos via Cheerio scraping.`);
        return { success: true, videos: videos, error: null };

    } catch (err) {
        console.error("❌ [YouTubeService] Error during YouTube search:", err.response?.status || err.message || err);
        return { success: false, videos: [], error: err.message || "Failed to search YouTube." };
    }
}

/**
 * Fetches captions for a YouTube video.
 * @param {string} videoUrl The URL of the YouTube video.
 * @param {string} [lang='en'] The preferred language for captions (e.g., 'en', 'he').
 * @returns {Promise<{success: boolean, captions: string | null, error: string | null}>}
 */
async function getYouTubeVideoCaptions(videoUrl, lang = 'en') {
    console.log(`[YouTubeService] Getting captions for ${videoUrl} in ${lang}`);
    try {
        if (!play.yt_validate(videoUrl) || !videoUrl.includes("youtube.com/watch?v=")) { // More robust validation
            return { success: false, captions: null, error: 'Invalid YouTube video URL.' };
        }
        const captionsData = await play.captions(videoUrl, { lang });
        if (!captionsData || captionsData.length === 0) {
            // Try Hebrew as a fallback if English fails and lang was 'en'
            if (lang === 'en') {
                console.log(`[YouTubeService] No English captions found for ${videoUrl}, trying Hebrew...`);
                const heCaptionsData = await play.captions(videoUrl, { lang: 'he' });
                if (heCaptionsData && heCaptionsData.length > 0) {
                    const heTranscript = heCaptionsData.map(cap => cap.text).join(' ');
                    return { success: true, transcript: heTranscript, lang: 'he', error: null };
                }
            }
            return { success: false, transcript: null, lang: lang, error: 'No captions found for the specified language(s).' };
        }
        const transcript = captionsData.map(cap => cap.text).join(' ');
        return { success: true, transcript: transcript, lang: lang, error: null };
    } catch (error) {
        console.error(`❌ [YouTubeService] Error fetching captions for ${videoUrl}:`, error);
        return { success: false, transcript: null, lang: lang, error: error.message || 'Failed to fetch captions.' };
    }
}

/**
 * Downloads a YouTube video and returns its content as a Buffer.
 * @param {string} videoUrl The URL of the YouTube video.
 * @returns {Promise<{success: boolean, buffer: Buffer | null, title: string | null, mimeType: string | null, error: string | null}>}
 */
async function downloadVideoAndGetBuffer(videoUrl) {
    console.log(`[YouTubeService] Attempting to download video: ${videoUrl}`);
    try {
        if (!play.yt_validate(videoUrl) || !videoUrl.includes("youtube.com/watch?v=")) { // More robust validation
            return { success: false, buffer: null, title: null, mimeType: null, error: 'Invalid YouTube video URL.' };
        }

        const videoInfo = await play.video_info(videoUrl);
        if (!videoInfo || !videoInfo.video_details) {
            return { success: false, buffer: null, title: null, mimeType: null, error: 'Could not fetch video info.' };
        }
        const title = videoInfo.video_details.title || `youtube_video_${Date.now()}`;

        const streamData = await play.stream(videoUrl, {
            quality: 1, // Prioritize lower quality for faster processing if full quality not essential
        });

        if (!streamData || !streamData.stream) {
            return { success: false, buffer: null, title: title, mimeType: null, error: 'Could not get video stream.' };
        }

        const chunks = [];
        for await (const chunk of streamData.stream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        console.log(`[YouTubeService] Video "${title}" downloaded. Buffer size: ${buffer.length}, Type: ${streamData.type}`);
        if (buffer.length < 1000) { // Arbitrary small size check
             return { success: false, buffer: null, title: title, mimeType: streamData.type, error: 'Downloaded video buffer seems too small.' };
        }
        return { success: true, buffer: buffer, title: title, mimeType: streamData.type || 'video/mp4', error: null };

    } catch (error) {
        console.error(`❌ [YouTubeService] Error downloading video ${videoUrl}:`, error);
        return { success: false, buffer: null, title: null, mimeType: null, error: error.message || 'Failed to download video.' };
    }
}

module.exports = {
    searchYouTube, // Retains the axios/cheerio based search
    getYouTubeVideoCaptions,
    downloadVideoAndGetBuffer,
};
