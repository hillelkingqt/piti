import { RecipeRequest, RecipeResponse } from '@/types/Recipe';
import { apiKeyManager } from './ApiKeyManager';

class GeminiService {
    private readonly baseUrl =
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp:generateContent';
    private readonly visionUrl =
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp:generateContent';

    // Helper to get the correct API URL and key
    private getApiConfig(hasImage: boolean = false) {
        const apiKey = apiKeyManager.getRandomApiKey();
        const url = hasImage ? this.visionUrl : this.baseUrl;
        return {
            url: `${url}?key=${apiKey}`,
            apiKey
        };
    }

    async generateRecipe(request: RecipeRequest): Promise<RecipeResponse> {
        try {
            const hasImage = !!request.imageBase64;
            const { url } = this.getApiConfig(hasImage);

            // Decide language instructions
            const isHebrew = request.language === 'he';
            const languagePrompt = isHebrew
                ? 'Please respond in Hebrew (RTL).'
                : 'Please respond in English (LTR).';

            // Build system prompt with additional instructions for JSON response
            let systemPrompt = `
You are a professional chef who specializes in creating recipes. You'll analyze the user's request and create a detailed recipe with ingredients and instructions.

${languagePrompt}

In addition, please respond ONLY with a complete, valid JSON object using this exact structure, with no additional text:
{
  "name": "Recipe Name",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["step 1", "step 2"],
  "isRecipe": true,
  "isRTL": <true_or_false>,
  "ingredientsLabel": <"מצרכים" or "Ingredients">,
  "instructionsLabel": <"אופן הכנה" or "Instructions">,
  "tags": ["tag1", "tag2"],
  "difficulty": "easy|medium|hard",
  "estimatedTime": "30 min",
  "calories": "300 calories per serving",
  "timeMarkers": [
    {
      "step": 1,
      "duration": 30,
      "description": "let the dough rise"
    }
  ],
  "prepTime": "15 minutes",
  "cookTime": "45 minutes",
  "totalTime": "1 hour",
  "servings": 4,
  "nutritionInfo": {
    "calories": "300 per serving",
    "protein": "15g",
    "carbs": "40g",
    "fat": "10g"
  },
  "seasonality": ["Spring", "Summer"],
  "cuisine": "Mediterranean",
  "quickReplies": [
    {
      "text": "Make it vegetarian",
      "action": "modify_vegetarian",
      "emoji": "🥬"
    }
  ],
  "content": "Brief description of the recipe"
}

Please do not include any additional explanation or text.
`.trim();

            // Add user preferences if available
            if (request.userPreferences) {
                const isHebrew = request.language === 'he';
                const languagePrompt = isHebrew
                    ? 'Please respond in Hebrew (RTL).'
                    : 'Please respond in English (LTR).';

                systemPrompt += `
Consider these user preferences:
- Dietary restrictions: ${request.userPreferences.dietaryRestrictions?.join(', ') || 'None'
                    }
- Allergies: ${request.userPreferences.allergies?.join(', ') || 'None'}
- Favorite ingredients: ${request.userPreferences.favoriteIngredients?.join(', ') || 'None'
                    }
- Disliked ingredients: ${request.userPreferences.dislikedIngredients?.join(', ') || 'None'
                    }
- Preferred cuisines: ${request.userPreferences.preferredCuisines?.join(', ') || 'None'
                    }
- Cooking skill level: ${request.userPreferences.cookingSkillLevel || 'intermediate'
                    }
- Health goals: ${request.userPreferences.healthGoals?.join(', ') || 'None'}
- Notes: ${request.userPreferences.notes || ''}`;
            }

            // Determine content parts based on whether an image is provided
            const contentParts = [];

            // Add system prompt
            contentParts.push({
                text: systemPrompt
            });

            // Add text prompt from the user
            if (request.prompt) {
                contentParts.push({
                    text: request.prompt
                });
            }

            // Add image if present
            if (hasImage && request.imageBase64) {
                // Remove the data URL prefix if present
                const base64Image = request.imageBase64.includes('base64,')
                    ? request.imageBase64.split('base64,')[1]
                    : request.imageBase64;

                contentParts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64Image
                    }
                });
            }

            // Create the request body for the API call
            const requestBody = {
                contents: [
                    {
                        role: 'user',
                        parts: contentParts
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.8,
                    topK: 40,
                    maxOutputTokens: 4096
                },
                safetySettings: [
                    {
                        category: 'HARM_CATEGORY_HARASSMENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    },
                    {
                        category: 'HARM_CATEGORY_HATE_SPEECH',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    },
                    {
                        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    },
                    {
                        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    }
                ]
            };

            console.log('Sending recipe request:', JSON.stringify(requestBody));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API error:', errorText);

                // If the error is due to an invalid API key, try with a different one
                if (response.status === 400 || response.status === 403) {
                    console.log('Trying with a different API key...');
                    const newApiKey = apiKeyManager.getNextApiKey();
                    console.log(`Switched to API key: ${newApiKey.substring(0, 5)}...`);

                    // Retry the request recursively
                    return this.generateRecipe(request);
                }

                throw new Error('Failed to generate recipe');
            }

            const data = await response.json();
            console.log('Gemini API response:', data);

            // Validate response structure
            if (
                !data.candidates ||
                data.candidates.length === 0 ||
                !data.candidates[0].content
            ) {
                throw new Error('Empty response from Gemini API');
            }

            const content = data.candidates[0].content.parts[0].text;

            // Force JSON extraction from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON object found in response');
            }

            let parsed;
            try {
                parsed = JSON.parse(jsonMatch[0]);
            } catch (e) {
                throw new Error('Failed to parse JSON from response');
            }

            // Determine if the recipe should be RTL based on content or language preference
            const isRTL =
                parsed.isRTL !== undefined
                    ? parsed.isRTL
                    : this.detectRTL(parsed.name || '') || request.language === 'he';

            // Build the recipe response object with defaults if needed
            const recipeResponse: RecipeResponse = {
                name: parsed.name || 'Untitled Recipe',
                ingredients: parsed.ingredients || [],
                instructions: parsed.instructions || [],
                isRecipe: parsed.isRecipe !== undefined ? parsed.isRecipe : true,
                isRTL: isRTL,
                ingredientsLabel:
                    parsed.ingredientsLabel || (isRTL ? 'מצרכים' : 'Ingredients'),
                instructionsLabel:
                    parsed.instructionsLabel || (isRTL ? 'אופן הכנה' : 'Instructions'),
                content: parsed.content || '',
                tags: parsed.tags || [],
                difficulty: parsed.difficulty || 'medium',
                estimatedTime: parsed.estimatedTime || '',
                calories: parsed.calories || '',
                timeMarkers: parsed.timeMarkers || [],
                prepTime: parsed.prepTime || '',
                cookTime: parsed.cookTime || '',
                totalTime: parsed.totalTime || '',
                servings: parsed.servings || 4,
                nutritionInfo: parsed.nutritionInfo || {},
                seasonality: parsed.seasonality || [],
                cuisine: parsed.cuisine || '',
                quickReplies: parsed.quickReplies || [],
                imageBase64: request.imageBase64
            };

            return recipeResponse;
        } catch (error: unknown) {
            // ESLint-friendly catch
            if (error instanceof Error) {
                console.error('Error in generateRecipe:', error);
                return {
                    name: 'Error Generating Recipe',
                    ingredients: [],
                    instructions: [],
                    content: `I'm sorry, I couldn't generate a recipe at this time. ${error.message}`,
                    isRecipe: false,
                    isRTL: false,
                    ingredientsLabel: 'Ingredients',
                    instructionsLabel: 'Instructions',
                    tags: [],
                    quickReplies: []
                };
            } else {
                console.error('Unknown error in generateRecipe:', error);
                return {
                    name: 'Error Generating Recipe',
                    ingredients: [],
                    instructions: [],
                    content: `I'm sorry, I couldn't generate a recipe at this time. Unknown error.`,
                    isRecipe: false,
                    isRTL: false,
                    ingredientsLabel: 'Ingredients',
                    instructionsLabel: 'Instructions',
                    tags: [],
                    quickReplies: []
                };
            }
        }
    }

    async editRecipe(
        currentRecipe: RecipeResponse,
        editRequest: string,
        language?: string
    ): Promise<RecipeResponse> {
        try {
            const { url } = this.getApiConfig();

            // Decide language instructions
            const isHebrew = language === 'he' || currentRecipe.isRTL;
            const languagePrompt = isHebrew
                ? 'Please respond in Hebrew (RTL).'
                : 'Please respond in English (LTR).';

            // Build the system prompt with instructions to return JSON only
            const systemPrompt = `
You are a professional chef who specializes in creating recipes. You'll update the given recipe based on the user's request.

${languagePrompt}

In addition, please respond ONLY with a complete, valid JSON object using the exact structure provided below, with no extra text:
{
  "name": "Recipe Name",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["step 1", "step 2"],
  "isRecipe": true,
  "isRTL": <true_or_false>,
  "ingredientsLabel": <"מצרכים" or "Ingredients">,
  "instructionsLabel": <"אופן הכנה" or "Instructions">,
  "tags": ["tag1", "tag2"],
  "difficulty": "easy|medium|hard",
  "estimatedTime": "30 min",
  "calories": "300 calories per serving",
  "timeMarkers": [
    {
      "step": 1,
      "duration": 30,
      "description": "let the dough rise"
    }
  ],
  "prepTime": "15 minutes",
  "cookTime": "45 minutes",
  "totalTime": "1 hour",
  "servings": 4,
  "nutritionInfo": {
    "calories": "300 per serving",
    "protein": "15g",
    "carbs": "40g",
    "fat": "10g"
  },
  "seasonality": ["Spring", "Summer"],
  "cuisine": "Mediterranean",
  "quickReplies": [
    {
      "text": "Make it vegetarian",
      "action": "modify_vegetarian",
      "emoji": "🥬"
    }
  ],
  "content": "Brief description of the updated recipe"
}

Please do not add any extra explanation or text.
`.trim();

            // Format the current recipe for the prompt
            const currentRecipeText = `
Recipe Name: ${currentRecipe.name}

Ingredients:
${currentRecipe.ingredients.map((ing) => `- ${ing}`).join('\n')}

Instructions:
${currentRecipe.instructions
                    .map((inst, idx) => `${idx + 1}. ${inst}`)
                    .join('\n')}
${currentRecipe.difficulty ? `\nDifficulty: ${currentRecipe.difficulty}` : ''}
${currentRecipe.estimatedTime ? `\nEstimated Time: ${currentRecipe.estimatedTime}` : ''}
${currentRecipe.servings ? `\nServings: ${currentRecipe.servings}` : ''}
${currentRecipe.calories ? `\nCalories: ${currentRecipe.calories}` : ''}
${currentRecipe.cuisine ? `\nCuisine: ${currentRecipe.cuisine}` : ''}
${currentRecipe.tags && currentRecipe.tags.length > 0
                    ? `\nTags: ${currentRecipe.tags.join(', ')}`
                    : ''
                }
      `;

            // Create the user prompt including the current recipe and edit request
            const userPrompt = `Here is the current recipe:\n${currentRecipeText}\n\nEDIT REQUEST: ${editRequest}\n\nPlease update the recipe based on this request and return the full updated recipe in the JSON format as specified.`;

            // Prepare the request body for the edit API call
            const requestBody = {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: systemPrompt },
                            { text: userPrompt }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.8,
                    topK: 40,
                    maxOutputTokens: 4096
                },
                safetySettings: [
                    {
                        category: 'HARM_CATEGORY_HARASSMENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    },
                    {
                        category: 'HARM_CATEGORY_HATE_SPEECH',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    },
                    {
                        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    },
                    {
                        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    }
                ]
            };

            console.log('Sending edit request:', JSON.stringify(requestBody));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API error:', errorText);

                // If the error is due to an invalid API key, try with a different one
                if (response.status === 400 || response.status === 403) {
                    console.log('Trying with a different API key...');
                    const newApiKey = apiKeyManager.getNextApiKey();
                    console.log(`Switched to API key: ${newApiKey.substring(0, 5)}...`);

                    // Retry the edit request recursively
                    return this.editRecipe(currentRecipe, editRequest, language);
                }

                throw new Error('Failed to edit recipe');
            }

            const data = await response.json();
            console.log('Gemini API response:', data);

            // Validate response structure for edit
            if (
                !data.candidates ||
                data.candidates.length === 0 ||
                !data.candidates[0].content
            ) {
                throw new Error('Empty response from Gemini API');
            }

            const content = data.candidates[0].content.parts[0].text;

            // Force JSON extraction from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON object found in response');
            }

            let parsed;
            try {
                parsed = JSON.parse(jsonMatch[0]);
            } catch (e) {
                throw new Error('Failed to parse JSON from response');
            }

            // Determine if the updated recipe should be RTL
            const isRTL =
                parsed.isRTL !== undefined
                    ? parsed.isRTL
                    : this.detectRTL(parsed.name || '') ||
                    language === 'he' ||
                    currentRecipe.isRTL;

            // Build the updated recipe response object
            const updatedRecipe: RecipeResponse = {
                name: parsed.name || currentRecipe.name,
                ingredients: parsed.ingredients || currentRecipe.ingredients,
                instructions: parsed.instructions || currentRecipe.instructions,
                isRecipe: parsed.isRecipe !== undefined ? parsed.isRecipe : true,
                isRTL: isRTL,
                ingredientsLabel:
                    parsed.ingredientsLabel || (isRTL ? 'מצרכים' : 'Ingredients'),
                instructionsLabel:
                    parsed.instructionsLabel || (isRTL ? 'אופן הכנה' : 'Instructions'),
                content: parsed.content || currentRecipe.content,
                difficulty: parsed.difficulty || currentRecipe.difficulty,
                estimatedTime: parsed.estimatedTime || currentRecipe.estimatedTime,
                servings: parsed.servings || currentRecipe.servings,
                calories: parsed.calories || currentRecipe.calories,
                cuisine: parsed.cuisine || currentRecipe.cuisine,
                tags: parsed.tags || currentRecipe.tags,
                prepTime: parsed.prepTime || currentRecipe.prepTime,
                cookTime: parsed.cookTime || currentRecipe.cookTime,
                totalTime: parsed.totalTime || currentRecipe.totalTime,
                nutritionInfo: parsed.nutritionInfo || currentRecipe.nutritionInfo,
                seasonality: parsed.seasonality || currentRecipe.seasonality,
                quickReplies: parsed.quickReplies || currentRecipe.quickReplies,
                imageBase64: currentRecipe.imageBase64
            };

            return updatedRecipe;
        } catch (error: unknown) {
            // ESLint-friendly catch
            if (error instanceof Error) {
                console.error('Error in editRecipe:', error);
                // Return the original recipe with an error message in case of failure
                return {
                    ...currentRecipe,
                    content: `Error editing recipe: ${error.message}`
                };
            } else {
                console.error('Unknown error in editRecipe:', error);
                return {
                    ...currentRecipe,
                    content: `Error editing recipe: Unknown error.`
                };
            }
        }
    }

    // Helper function to detect RTL text (Hebrew, Arabic, etc.)
    private detectRTL(text: string): boolean {
        // Hebrew and Arabic character ranges
        const rtlPattern =
            /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
        return rtlPattern.test(text);
    }

    // Helper function to parse difficulty level from text
    private parseDifficulty(difficultyText: string): 'easy' | 'medium' | 'hard' {
        const text = difficultyText.toLowerCase();

        if (
            text.includes('easy') ||
            text.includes('beginner') ||
            text.includes('simple') ||
            text.includes('קל')
        ) {
            return 'easy';
        } else if (
            text.includes('hard') ||
            text.includes('difficult') ||
            text.includes('advanced') ||
            text.includes('קשה')
        ) {
            return 'hard';
        } else {
            return 'medium';
        }
    }
} // End of GeminiService class

// Export a singleton instance of GeminiService
export const geminiService = new GeminiService();
