// services/duckduckgoService.js
const axios = require('axios');
const cheerio = require('cheerio');
// const config = require('../config'); // For potential future configs like timeout

/**
 * Searches DuckDuckGo for the top N results (links).
 * @param {string} query - The search query.
 * @param {number} [numResults=10] - Number of results to attempt to fetch.
 * @returns {Promise<Array<string>>} An array of result URLs.
 */
async function searchDuckDuckGo(query, numResults = 10) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const results = [];
    console.log(`[DuckDuckGoService] Searching for: "${query}", expecting up to ${numResults} results.`);

    try {
        const { data } = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000 // 10 seconds timeout
        });

        const $ = cheerio.load(data);

        $('a.result__a').each((i, element) => {
            if (results.length < numResults) {
                const link = $(element).attr('href');
                if (link) {
                    // Decode DDG's redirect URL
                    const decodedLink = decodeURIComponent(link.substring(link.indexOf('http')));
                    results.push(decodedLink);
                }
            }
        });

        console.log(`[DuckDuckGoService] Found ${results.length} results.`);
        return results;
    } catch (error) {
        console.error('❌ [DuckDuckGoService] Error searching DuckDuckGo:', error.message);
        return []; // Return empty array on error
    }
}

module.exports = {
    searchDuckDuckGo, // Renamed from searchDuckDuckGoTop10 for broader use if desired
};
