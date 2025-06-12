// services/YouTubeService.js
const axios = require('axios');
const cheerio = require('cheerio');
const play = require('play-dl');

/**
 * Searches YouTube using web scraping and returns top video links.
 * NOTE: Scraping can break if YouTube changes its HTML structure.
 * @param {string} query The search query.
 * @param {number} [numResults=2] The maximum number of results to return.
 * @returns {Promise<string[]>} Array of video URLs.
 */
async function searchYouTube(query, numResults = 2) {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    console.log(`[YouTube Service] Searching URL: ${searchUrl}`);
    const results = [];

    try {
        const { data } = await axios.get(searchUrl, {
            headers: { // Use a common user agent
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9' // Request English results?
            },
            timeout: 15000 // 15 seconds timeout
        });

        // --- Method 1: Extract from ytInitialData (more reliable if structure holds) ---
        const $ = cheerio.load(data);
        const initialDataScript = $('script')
            .toArray()
            .map(el => $(el).html())
            .find(txt => txt && txt.includes('var ytInitialData')); // Check txt exists

        if (initialDataScript) {
            const jsonStrMatch = initialDataScript.match(/var ytInitialData\s*=\s*({.*?});/s);
            if (jsonStrMatch && jsonStrMatch[1]) {
                try {
                    const ytInitialData = JSON.parse(jsonStrMatch[1]);
                    const contents = ytInitialData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                    // Navigate complex structure (may need adjustment if YouTube changes it)
                    const itemSection = contents?.find(c => c.itemSectionRenderer)?.itemSectionRenderer?.contents;
                    if (itemSection) {
                        for (const item of itemSection) {
                            if (results.length >= numResults) break;
                            if (item.videoRenderer && item.videoRenderer.videoId) {
                                results.push(`https://www.youtube.com/watch?v=${item.videoRenderer.videoId}`);
                            }
                        }
                        console.log(`[YouTube Service] Found ${results.length} videos via ytInitialData.`);
                        return results; // Return if successful
                    }
                } catch (parseError) {
                    console.warn("[YouTube Service] Failed to parse ytInitialData:", parseError.message);
                    // Fallback to Cheerio scraping if JSON parsing fails
                }
            }
        }

        // --- Method 2: Fallback Cheerio Scraping (Less reliable) ---
        console.warn("[YouTube Service] ytInitialData extraction failed or yielded no results. Falling back to Cheerio scraping.");
        $('a#video-title').each((i, el) => {
            if (results.length >= numResults) return false;
            const href = $(el).attr('href');
            if (href && href.startsWith('/watch?v=')) {
                results.push(`https://www.youtube.com${href}`);
            }
        });
        console.log(`[YouTube Service] Found ${results.length} videos via Cheerio scraping.`);
        return results;

    } catch (err) {
        console.error("❌ [YouTube Service] Error during YouTube search:", err.response?.status || err.message || err);
        return []; // Return empty array on error
    }
}

// Add download functionality if needed (or keep it in the handler)
// async function downloadYouTubeVideo(videoUrl) { ... using play.stream ... }

module.exports = {
    searchYouTube,
    // downloadYouTubeVideo // Export if you move download logic here
};