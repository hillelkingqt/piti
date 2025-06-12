// services/DuckDuckGoService.js
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Searches DuckDuckGo and returns the top N result links.
 * @param {string} query The search query.
 * @param {number} [numResults=10] The maximum number of results to return.
 * @returns {Promise<string[]>} Array of result URLs.
 */
async function searchDuckDuckGoTopN(query, numResults = 10) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    console.log(`[DDG Service] Searching URL: ${searchUrl}`);
    const results = [];

    try {
        const { data } = await axios.get(searchUrl, {
            headers: { // Use a common user agent
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 10000 // 10 second timeout
        });

        const $ = cheerio.load(data);

        $('a.result__a').each((i, el) => {
            if (results.length >= numResults) return false; // Stop if we have enough results

            const rawLink = $(el).attr('href');
            if (!rawLink) return true; // Continue to next link if href is missing

            // Extract clean URL from DDG's redirect link
            const urlParams = new URLSearchParams(rawLink.substring(rawLink.indexOf('?') + 1));
            const decodedUrl = urlParams.get('uddg'); // The actual URL is in the 'uddg' parameter

            if (decodedUrl) {
                const cleanUrl = decodeURIComponent(decodedUrl);
                // Basic validation of the cleaned URL
                if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
                    console.log(` -> Found Link [${results.length + 1}]: ${cleanUrl}`);
                    results.push(cleanUrl);
                } else {
                    console.warn(` -> Skipping invalid decoded URL: ${cleanUrl}`);
                }
            } else {
                // Fallback if 'uddg' is not found (less common now)
                if (rawLink.startsWith('http://') || rawLink.startsWith('https://')) {
                    console.log(` -> Found Link (Fallback) [${results.length + 1}]: ${rawLink}`);
                    results.push(rawLink);
                } else {
                    console.warn(` -> Skipping invalid raw link: ${rawLink}`);
                }
            }
        });
        console.log(`[DDG Service] Found ${results.length} results for "${query}".`);
        return results;
    } catch (err) {
        console.error("❌ [DDG Service] Error during search:", err.response?.status || err.message || err);
        // Don't return null, return empty array for consistency
        return [];
    }
}

module.exports = {
    searchDuckDuckGoTop10: (query) => searchDuckDuckGoTopN(query, 10), // Keep original name compatibility
    searchDuckDuckGoTopN
};