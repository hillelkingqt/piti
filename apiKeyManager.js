// services/ApiKeyManager.js (Frontend Version)

class ApiKeyManager {
    /**
     * Creates an instance of ApiKeyManager.
     * @param {string[]} apiKeys - An array of API keys.
     */
    constructor(apiKeys) {
        if (!apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
            console.error("❌ ApiKeyManager: No API keys provided or keys is not an array.");
            this.keys = ["DUMMY_KEY_NO_KEYS_PROVIDED"]; // Placeholder
        } else {
            // Basic filtering for valid-looking keys (adapt if needed)
            this.keys = apiKeys.filter(key => key && typeof key === 'string' && key.startsWith('AIza') && key.trim().length > 10);
            if (this.keys.length === 0) {
                console.error("❌ ApiKeyManager: All provided keys seem invalid.");
                this.keys = ["DUMMY_KEY_ALL_KEYS_INVALID"];
            }
        }
        this.currentIndex = 0;
        console.log(`[ApiKeyManager] Initialized with ${this.keys.length} valid API key(s).`);
    }

    /**
     * Gets the next API key in a round-robin fashion.
     * IMPORTANT: In a real-world public web app, keys should NOT be exposed here.
     * Use a backend proxy to handle API calls securely.
     * @returns {string} An API key.
     */
    getRandomApiKey() {
        if (this.keys.length === 0 || this.keys[0].startsWith("DUMMY_KEY")) {
            console.error("❌ [ApiKeyManager] No valid keys available!");
            alert("שגיאה קריטית: מפתחות ה-API אינם מוגדרים כראוי בצד הלקוח."); // Alert user
            return "NO_VALID_API_KEYS_CONFIGURED";
        }
        // Simple round-robin
        const key = this.keys[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        // console.log(`[ApiKeyManager] Using key index: ${this.currentIndex}`); // Optional debug log
        return key;
    }

    getNextApiKey() {
        // In this simple implementation, getRandomApiKey already rotates
        return this.getRandomApiKey();
    }
}

// --- Define API Keys (Hardcoded - VERY INSECURE FOR PUBLIC WEB) ---
// !!! REPLACE THESE WITH YOUR ACTUAL KEYS !!!
// Ideally, remove keys from frontend entirely and use a backend proxy.
const PITHI_API_KEYS = [
    'AIzaSyC1E7-eJZ4JY1oLQ9r6d9p5ocxS4KO_-40',
    'AIzaSyCuRud_9maOdEh4L00ripxgBLoImqoqY_E',
    'AIzaSyCqQDiGTA-wX4Aggm-xxWATqTjO7tvW8W8',
    'AIzaSyAAtKEbdQzllGB9Gf72FzaNY-HLGrk8K5Y',
    'AIzaSyC2aSeeFnNFdIndQSo9CNSv11CiMqo66sM',
    'AIzaSyD5YKvEiSeUPy3HhHjKmvkhB-f6kr1mtKo',
    'AIzaSyA4TppVdydykoU7bCPGr-IeyAbhCJZQDBM',
    'AIzaSyA2KjqBCn4oT8s5s6WUB1VOVfVO_eI4rXA',
    'AIzaSyBvAVYQtaN00UYO1T5dhqcs1a49nOuFyMg',
    'AIzaSyC6sjR-2NCamBDnk6d5ZLA5JbF-Mcr24Uk',
    'AIzaSyDT_kWAnT5FQv0-TPOpI-knC_tTUco5CoA'
    // Add more keys if you have them
];

// Instantiate and export the manager
const apiKeyManager = new ApiKeyManager(PITHI_API_KEYS);

// Note: We are not exporting the class itself, just the instantiated manager.