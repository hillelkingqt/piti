// services/ApiKeyManager.js

class ApiKeyManager {
    /**
     * Creates an instance of ApiKeyManager.
     * @param {string[]} apiKeys - An array of API keys.
     */
    constructor(apiKeys = []) { // Default to empty array
        if (!Array.isArray(apiKeys)) {
            console.error("❌ ApiKeyManager: apiKeys parameter is not an array. Using fallback.");
            this.keys = ["DUMMY_KEY_INVALID_INPUT"];
        } else if (apiKeys.length === 0) {
            console.warn("⚠️ ApiKeyManager: No API keys provided during instantiation. Using fallback.");
            this.keys = ["DUMMY_KEY_NO_KEYS_PROVIDED"];
        } else {
            this.keys = apiKeys.filter(key => key && typeof key === 'string' && key.trim().length > 10);
            if (this.keys.length === 0) {
                console.error("❌ ApiKeyManager: All provided keys seem invalid or empty after filtering.");
                this.keys = ["DUMMY_KEY_ALL_KEYS_INVALID"];
            }
        }
        this.currentIndex = 0;
        console.log(`[ApiKeyManager] Initialized with ${this.keys.length} API key(s). First key starts with: ${this.keys[0]?.substring(0,10)}`);
    }

    /**
     * Gets the next API key in a round-robin fashion.
     * @returns {string} An API key.
     */
    getRandomApiKey() {
        if (this.keys.length === 0 || this.keys[0].startsWith("DUMMY_KEY")) {
            console.error("❌ [ApiKeyManager] No valid keys available to return!");
            // In a real application, this should ideally throw an error or be handled more gracefully.
            return "NO_VALID_API_KEYS_CONFIGURED";
        }
        const key = this.keys[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return key;
    }

    /**
     * Alias for getRandomApiKey as it already implements round-robin.
     * @returns {string} An API key.
     */
    getNextApiKey() {
        return this.getRandomApiKey();
    }

    /**
     * Adds a new API key to the collection if it's not already present.
     * @param {string} key - The API key to add.
     */
    addApiKey(key) {
        if (key && typeof key === 'string' && key.trim().length > 10 && !this.keys.includes(key) && !key.startsWith("DUMMY_KEY")) {
            // If the current keys array was a dummy, replace it with the new key
            if (this.keys.length === 1 && this.keys[0].startsWith("DUMMY_KEY")) {
                this.keys = [key];
            } else {
                this.keys.push(key);
            }
            console.log(`[ApiKeyManager] Added new API key. Total keys: ${this.keys.length}`);
        } else if (this.keys.includes(key)) {
            console.warn(`[ApiKeyManager] Attempted to add duplicate API key: ${key}`);
        } else {
            console.warn(`[ApiKeyManager] Attempted to add invalid API key: ${key}`);
        }
    }

    /**
     * Returns the count of currently loaded (valid) API keys.
     * @returns {number}
     */
    getKeyCount() {
        if (this.keys.length === 1 && this.keys[0].startsWith("DUMMY_KEY")) {
            return 0;
        }
        return this.keys.length;
    }
}

// The API keys will be passed during instantiation from the main bot setup,
// typically after loading them from config.js or environment variables.
// For now, this file only defines the class.
// The instantiation and export will be handled in a central service loader or the main bot file.

// Instantiate a default manager using keys from environment variables or config
// Environment variable GEMINI_API_KEYS can contain a comma-separated list
const config = require('../config');

const envKeys = process.env.GEMINI_API_KEYS
    ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean)
    : [];

const defaultKey = process.env.GEMINI_API_KEY || config.GEMINI_API_KEY_DEFAULT;
const initialKeys = [...envKeys];
if (defaultKey) initialKeys.push(defaultKey);

const apiKeyManager = new ApiKeyManager(initialKeys);

module.exports = { ApiKeyManager, apiKeyManager };
