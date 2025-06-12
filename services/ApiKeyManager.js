// services/ApiKeyManager.js

class ApiKeyManager {
    /**
     * Creates an instance of ApiKeyManager.
     * @param {string[]} apiKeys - An array of API keys.
     */
    constructor(apiKeys) {
        if (!apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
            console.error("❌ FATAL: No API keys provided to ApiKeyManager or keys is not an array.");
            this.keys = ["DUMMY_KEY_NO_KEYS_PROVIDED"]; // Provide a dummy to avoid crashing later code
        } else {
            // Filter out any potential placeholders or invalid keys (simple check)
            this.keys = apiKeys.filter(key => key && typeof key === 'string' && key.startsWith('AIza') && key.trim().length > 10);
            if (this.keys.length === 0) {
                console.error("❌ FATAL: All provided API keys seem to be placeholders or invalid based on basic checks.");
                this.keys = ["DUMMY_KEY_ALL_KEYS_INVALID"];
            }
        }
        this.currentIndex = 0;
        console.log(`[ApiKeyManager] Initialized with ${this.keys.length} valid API key(s).`);
    }

    /**
     * Gets the next API key in a round-robin fashion.
     * @returns {string} An API key.
     */
    getRandomApiKey() {
        if (this.keys.length === 0 || this.keys[0].startsWith("DUMMY_KEY")) {
            console.error("❌ [ApiKeyManager] No valid keys available to return!");
            return "NO_VALID_API_KEYS_CONFIGURED"; // Return an indicator string
        }
        // Simple round-robin
        const key = this.keys[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        // console.log(`[ApiKeyManager] Providing key index: ${this.currentIndex}`); // Debug log
        return key;
    }

    // You could add more methods here, like:
    // reportKeyFailure(key) { /* Logic to temporarily disable a key */ }
    // getKeysStatus() { /* Logic to report which keys are active/disabled */ }
}

// --- Load API Keys ---
// It's STRONGLY recommended to use environment variables (e.g., process.env.GEMINI_API_KEYS)
// Example: GEMINI_API_KEYS="key1,key2,key3"
// Then split it: process.env.GEMINI_API_KEYS?.split(',').map(k => k.trim()).filter(k => k) || []
const geminiApiKeysFromEnv = process.env.GEMINI_API_KEYS?.split(',').map(k => k.trim()).filter(k => k) || [];

// Fallback to hardcoded keys ONLY if environment variable is not set
// !!! USING THE KEYS YOU PROVIDED !!!
const hardcodedApiKeys = [
    'AIzaSyC1E7-eJZ4JY1oLQ9r6d9p5ocxS4KO_-40',
    'AIzaSyCuRud_9maOdEh4L00ripxgBLoImqoqY_E',
    'AIzaSyCqQDiGTA-wX4Aggm-xxWATqTjO7tvW8W8',
    'AIzaSyAAtKEbdQzllGB9Gf72FzaNY-HLGrk8K5Y',
    'AIzaSyC2aSeeFnNFdIndQSo9CNSv11CiMqo66sM'
];

// Use environment keys if available, otherwise fall back to hardcoded (with a warning)
let finalApiKeys = geminiApiKeysFromEnv;
if (finalApiKeys.length === 0) {
    console.log("ℹ️ GEMINI_API_KEYS environment variable not set or empty. Using hardcoded keys from ApiKeyManager.js.");
    finalApiKeys = hardcodedApiKeys;
} else {
    console.log(`✅ Loaded ${finalApiKeys.length} API keys from environment variable.`);
}

// Instantiate the manager
const apiKeyManager = new ApiKeyManager(finalApiKeys);

// Export the single instance
module.exports = {
    apiKeyManager
};