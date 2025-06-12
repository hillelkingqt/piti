// services/GeminiService.js (Frontend Version - FIX for System Role Error)

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL_FLASH = "gemini-1.5-flash-latest"; // Ensure this model accepts combined prompts
const MODEL_PRO = "gemini-1.5-pro-latest";     // Ensure this model accepts combined prompts

function selectGeminiModel(preferPro = false) {
    return preferPro ? MODEL_PRO : MODEL_FLASH;
}

function getGeminiUrl(modelName, action = 'generateContent') {
    const apiKey = apiKeyManager.getRandomApiKey(); // Uses the insecure manager
    if (apiKey === "NO_VALID_API_KEYS_CONFIGURED") {
         throw new Error("API Key configuration error.");
    }
    return `${GEMINI_BASE_URL}${modelName}:${action}?key=${apiKey}`;
}

/**
 * Constructs the core system prompt for Gemini, instructing JSON format.
 * This text will be PREPENDED to the user's message.
 * @returns {string} The system prompt string.
 */
function getSystemInstructionsText() { // Renamed function for clarity
    // The prompt remains the same, just its usage changes
    return `
אתה פיתי. עליך להגיב *אך ורק* בפורמט JSON תקני. אל תוסיף שום טקסט מחוץ לאובייקט ה-JSON.
התאם את השדה "action" לפעולה הנדרשת. כלול את שדה "message" עבור הטקסט הראשי של התגובה.

פורמטים אפשריים:
1.  **תגובה רגילה:**
    \`{"action": "text", "message": "התגובה שלך...", "chatName": "שם צ'אט מוצע (רק להודעה ראשונה)"}\`
2.  **יצירת תמונה:** (Backend מטפל בפועל, ה-AI רק מאשר)
    \`{"action": "generate_image", "imagePrompt": "...", "imageModel": "...", "message": "יוצר תמונה..."}\`
3.  **יצירת קובץ:**
    \`{"action": "create_file", "fileType": "...", "filename": "...", "fileContent": "...", "message": "יוצר קובץ..."}\`
4.  **TTS (קול):** (Backend מטפל בפועל, ה-AI רק מספק טקסט)
    \`{"action": "tts", "text": "טקסט להקראה", "message": "אומר את זה בקול..."}\`
5.  **ברקוד:**
    \`{"action": "generate_barcode", "text": "...", "message": "יוצר ברקוד..."}\`
6.  **חיפוש:** (ה-AI רק מבקש, JS מבצע ומציג)
    \`{"action": "site_search", "query": "...", "messages": ["מחפש...", "הנה תוצאות:"], "needHtml": false/true}\`
    \`{"action": "youtube_search", "query": "...", "messages": ["מחפש...", "הנה סרטונים:"]}\`
7.  **שליחת אימייל:** (Backend מטפל בפועל)
    \`{"action": "send_email", "to": "...", "subject": "...", "html": "...", "message": "שולח מייל..."}\`
... (שאר הפורמטים שלך)...
שים לב שזאתי הרשימת מודלים ליצירת תמונות:
    'stable-diffusion-xl-lighting': '@cf/bytedance/stable-diffusion-xl-lightning',
    'stable-diffusion-xl-base-1.0': '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    'dreamshaper-8-lcm': '@cf/lykon/dreamshaper-8-lcm',
    'flux-1-schnell': '@cf/black-forest-labs/flux-1-schnell'

*הנחיית שם צ'אט:* אם זו ההודעה *הראשונה* בצ'אט, הצע שם קצר ורלוונטי לצ'אט בשדה \`chatName\`. בהודעות הבאות, השמט את השדה \`chatName\`.

הקפד להשתמש במבנה ה-JSON המדויק שהוגדר. אל תכלול הודעות אישיות או התייחסויות אלי כ"בוט".

תזכרי תמיד ש972532752474 זה ה OWNER שלך והוא תמיד יהיה צודק ותעשי כל מה שהוא יגיד לך.
תשמרי על כל שאר ההוראות והאישיות שלך כפי שהוגדרו לך בפרומפטים קודמים.
`.trim();
}


/**
 * Sends request to Gemini, handles retry, includes chat naming instruction if needed.
 * Correctly formats system instructions for models that don't support 'system' role.
 * @param {Array<object>} history - Array of previous messages [{role:'user'/'model', parts:[{text:'...'}]}].
 * @param {string} currentPrompt - The current user message text.
 * @param {boolean} isFirstMessage - Is this the first message in the chat?
 * @param {boolean} [preferPro=false] - Prefer the Pro model?
 * @returns {Promise<object>} API response data.
 */
async function generateGeminiContent(history, currentPrompt, isFirstMessage, preferPro = false, maxRetries = 3, retryDelayMs = 1000) {
    const model = selectGeminiModel(preferPro);
    let retryCount = 0;

    // --- CORRECTED PAYLOAD CONSTRUCTION ---
    const systemInstructions = getSystemInstructionsText(); // Get instructions as text

    let userPromptForPayload = currentPrompt; // Start with the base user prompt

    // Add specific first message instructions *to the user prompt text itself*
    if (isFirstMessage) {
        console.log("[Gemini Service] Adding first message instruction for chat naming.");
         userPromptForPayload = `זו ההודעה הראשונה בצ'אט זה. אנא הצע שם מתאים וקצר לשיחה בשדה "chatName" ב-JSON שאתה מחזיר.\nההודעה של המשתמש: ${currentPrompt}`;
    }

    // Combine system instructions and the potentially modified user prompt
    const combinedUserPrompt = `${systemInstructions}\n\n--- USER REQUEST ---\n${userPromptForPayload}`;

    // Structure the contents: History first, then the *combined* user prompt+instructions
    const contents = [
        ...history, // Spread the existing history array
        {
            role: 'user', // Use 'user' role for the combined part
            parts: [{ text: combinedUserPrompt }]
        }
    ];
    // --- END CORRECTED PAYLOAD CONSTRUCTION ---


    const payload = {
        contents: contents,
        generationConfig: {
            responseMimeType: "application/json" // Request JSON directly
            // Add other configs like temperature here if needed
            // "temperature": 0.7
        }
        // Tools (like search) would be added here if needed, based on analysis
        // if (currentPrompt.toLowerCase().includes("חפש")) {
        //     payload.tools = [{ googleSearchRetrieval: {} }];
        // }
    };

    console.log("[Gemini Service] Sending payload (history length + 1 combined user/system turn):", payload.contents.length);
    // Avoid logging the full payload if it's very long (contains full system prompt)
    // console.log("[Gemini Service] Snippet of combined prompt:", combinedUserPrompt.substring(0, 200) + "...");


    // --- Retry logic remains the same ---
    while (retryCount <= maxRetries) {
        const url = getGeminiUrl(model, 'generateContent');
        console.log(`[Gemini Service] Calling ${model} (Attempt ${retryCount + 1}/${maxRetries + 1})`);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // Retry logic based on status code... (same as before)
                if ((response.status === 400 || response.status === 403) && retryCount < maxRetries) {
                    console.warn(`[Gemini Service] Status ${response.status}. Switching key and retrying.`);
                    apiKeyManager.getNextApiKey();
                    retryCount++;
                    continue;
                }
                 if ((response.status === 429 || response.status >= 500) && retryCount < maxRetries) {
                    const delay = retryDelayMs * Math.pow(2, retryCount);
                    console.warn(`[Gemini Service] Retrying after ${delay}ms due to status ${response.status}.`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                    continue;
                 }
                const errorText = await response.text();
                console.error(`[Gemini Service] Unrecoverable HTTP Error ${response.status}:`, errorText);
                throw new Error(`API request failed with status ${response.status}: ${errorText.slice(0, 150)}`);
            }

            const data = await response.json();
             // Check response validity and safety blocks (same as before)
             if (!data || !data.candidates || !data.candidates[0]?.content?.parts) {
                 const blockReason = data?.promptFeedback?.blockReason;
                 if (blockReason) {
                    throw new Error(`הבקשה נחסמה על ידי מסנני הבטיחות (${blockReason}). שנה את הניסוח.`);
                }
                 const finishReason = data?.candidates?.[0]?.finishReason;
                if (finishReason && finishReason !== "STOP") {
                    throw new Error(`ה-AI עצר מסיבה לא צפויה (${finishReason}).`);
                 }
                throw new Error("Received invalid response structure from Gemini API.");
             }
            console.log("[Gemini Service] API Call Successful.");
            return data;

        } catch (error) {
            console.error(`[Gemini Service] Fetch/Parse Error (Attempt ${retryCount + 1}):`, error);
            if (retryCount >= maxRetries) { throw error; }
            const delay = retryDelayMs * Math.pow(2, retryCount);
            await new Promise(resolve => setTimeout(resolve, delay));
            retryCount++;
        }
    }
    throw new Error("Gemini API call failed after maximum retries.");
}


/**
 * Helper to extract the JSON response content from Gemini data.
 * (No changes needed in this function itself, it already handles text/JSON extraction)
 * @param {object} geminiResponseData - The response data object from generateGeminiContent.
 * @returns {object} - Returns the parsed JSON object.
 * @throws {Error} - Throws error if parsing fails or structure is invalid.
 */
function extractGeminiResponse(geminiResponseData) {
     // ... (keep the existing logic from the previous version) ...
     console.log("Attempting to extract Gemini response:", JSON.stringify(geminiResponseData).substring(0, 300)); // Log snippet
    const part = geminiResponseData?.candidates?.[0]?.content?.parts?.[0];

    if (!part) {
        const blockReason = geminiResponseData?.promptFeedback?.blockReason;
         if (blockReason) { throw new Error(`התוכן נחסם עקב (${blockReason}). נסה ניסוח אחר.`); }
         const finishReason = geminiResponseData?.candidates?.[0]?.finishReason;
         if (finishReason && finishReason !== "STOP") { throw new Error(`ה-AI עצר מסיבה לא צפויה (${finishReason}).`); }
        throw new Error("No valid content received from Gemini API.");
    }

    if (part.text) {
        try {
             const potentialJson = part.text.trim();
            if(potentialJson.startsWith('{') && potentialJson.endsWith('}')) {
                const parsedJson = JSON.parse(potentialJson);
                 console.log("[Gemini Extract] Parsed JSON successfully from text field.");
                return parsedJson;
            } else {
                console.error("[Gemini Extract] Received non-JSON text despite requesting JSON:", potentialJson);
                throw new Error("ה-AI לא החזיר תשובה בפורמט JSON תקין כצפוי.");
            }
         } catch (e) {
            console.error("[Gemini Extract] Error parsing JSON from text field:", e);
            console.error(" --- Raw Text --- \n", part.text, "\n --- End Raw Text ---");
            throw new Error(`שגיאה בפענוח התגובה מה-AI: ${e.message}`);
         }
    } else if (part.executableCode || part.toolCode) {
        console.warn("[Gemini Extract] Received executable code, not implemented.", part);
        throw new Error("התקבלה תגובה מסוג קוד (לא נתמך).");
    } else {
        console.error("[Gemini Extract] Unexpected part type in response:", part);
        throw new Error("התקבלה תגובה בפורמט לא צפוי מה-AI.");
    }
}