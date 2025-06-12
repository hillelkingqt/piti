// services/gradioService.js
// IMPORTANT: @gradio/client is an ES module, so it needs to be imported dynamically.
// We will use a global variable to store the dynamically imported client.
let GradioClientInstance;

/**
 * Dynamically imports and returns the Gradio client.
 * Caches the client instance after the first successful import.
 * @returns {Promise<object|null>} The Gradio Client class or null if import fails.
 */
async function getGradioClient() {
    if (GradioClientInstance) {
        return GradioClientInstance;
    }
    try {
        const GradioModule = await import('@gradio/client');
        GradioClientInstance = GradioModule.Client || GradioModule.default?.Client; // Handle different export styles
        if (!GradioClientInstance) {
            console.error("❌ GradioService: Could not find Client export in @gradio/client module.");
            return null;
        }
        console.log("[GradioService] Gradio client module loaded dynamically.");
        return GradioClientInstance;
    } catch (importErr) {
        console.error("❌ [GradioService] Failed to dynamically import @gradio/client:", importErr);
        return null;
    }
}

/**
 * Connects to a Gradio space and calls a specific API endpoint.
 * @param {string} spaceUrl - The URL of the Gradio space (e.g., "User/SpaceName").
 * @param {string} apiEndpoint - The API endpoint to call (e.g., "/predict", "/infer", "/text_to_video").
 * @param {Array<any>|object} payload - The payload for the API endpoint. For `predict`, this is typically an array of arguments.
 *                                     For specific named endpoints, it might be an object.
 * @param {number} [timeout=180000] - Timeout for the predict call in milliseconds (default 3 minutes).
 * @returns {Promise<object|null>} The result from the Gradio API or null on error.
 */
async function callGradioApi(spaceUrl, apiEndpoint, payload, timeout = 180000) {
    const Client = await getGradioClient();
    if (!Client) {
        return { success: false, error: "Gradio client not available.", data: null };
    }

    console.log(`[GradioService] Connecting to space: ${spaceUrl}, Endpoint: ${apiEndpoint}`);
    let gradioApp;
    try {
        gradioApp = await Client.connect(spaceUrl);
        console.log(`[GradioService] Connected. Predicting for endpoint: ${apiEndpoint}`);
    } catch (connectError) {
        console.error(`❌ [GradioService] Failed to connect to Gradio space ${spaceUrl}:`, connectError.message);
        return { success: false, error: `Failed to connect to Gradio space: ${connectError.message}`, data: null };
    }

    try {
        // The predict method typically takes the endpoint name and an array/object of parameters.
        // The structure of `payload` depends on what the Gradio endpoint expects.
        // If it's a simple function, payload is often an array of arguments.
        // If it's a named endpoint or complex API, it might be an object.
        const result = await gradioApp.predict(apiEndpoint, payload, { timeout });

        console.log(`[GradioService] Prediction successful for ${spaceUrl}${apiEndpoint}.`);
        // Gradio results often come in a `data` array.
        return { success: true, data: result.data, error: null };
    } catch (error) {
        console.error(`❌ [GradioService] Error during Gradio API call to ${spaceUrl}${apiEndpoint}:`, error.message);
        if (error.cause) console.error("  Cause:", error.cause);

        let errorMessage = `Gradio API error: ${error.message}`;
        if (error.message.toLowerCase().includes("queue full")) {
            errorMessage = "Gradio space queue is full. Try again later.";
        } else if (error.message.toLowerCase().includes("timeout")) {
            errorMessage = "Gradio API call timed out.";
        }
        return { success: false, error: errorMessage, data: null };
    }
}

module.exports = {
    callGradioApi,
    getGradioClient, // Exporting this in case direct client access is needed elsewhere
};
