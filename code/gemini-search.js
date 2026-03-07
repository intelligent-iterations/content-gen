/**
 * Gemini 2.5 Flash with Search Grounding
 * Returns RAW unstructured output - formatting is done separately
 */

import { GoogleGenAI } from '@google/genai';

// Initialize Gemini client
let geminiClient = null;

function getGeminiClient(apiKey) {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

/**
 * Search for product ingredients using Gemini with grounding (RAW output)
 * Returns unstructured response - use formatIngredientsResponse() to structure it
 * @param {string} apiKey - Gemini API key
 * @param {string} productName - Full product name (e.g., "Neutrogena Hydro Boost Water Gel")
 * @returns {Promise<{raw: string, thinking: string|null, sources: string[], productName: string, prompt: string}>}
 */
export async function searchIngredients(apiKey, productName) {
  console.log(`  Searching ingredients for: "${productName}"`);

  const client = getGeminiClient(apiKey);

  // Get the current year for the prompt
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  // Simple, open-ended prompt - let Gemini think freely
  const prompt = `What is the full ingredients list of ${productName} as of ${currentYear}?`;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
        // Enable thinking/reasoning
        thinkingConfig: {
          thinkingBudget: 2048
        }
      }
    });

    const text = response.text || '';

    // Extract thinking content if available
    let thinkingContent = null;
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.thought) {
          thinkingContent = part.text;
        }
      }
    }

    // Extract grounding sources
    let sources = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      sources = response.candidates[0].groundingMetadata.groundingChunks
        .map(chunk => chunk.web?.uri)
        .filter(Boolean);
    }

    console.log(`  Got response (${text.length} chars, ${sources.length} sources)`);
    if (thinkingContent) {
      console.log(`  (Model used thinking: ${thinkingContent.length} chars)`);
    }

    // Return RAW unstructured response
    return {
      raw: text,
      thinking: thinkingContent,
      sources,
      productName,
      prompt
    };
  } catch (error) {
    console.error(`  Gemini search error: ${error.message}`);
    throw error;
  }
}

/**
 * Format raw ingredients response into structured JSON for screenshot calls
 * Uses a separate AI call to parse the unstructured response
 * @param {string} apiKey - Gemini API key
 * @param {string} rawResponse - Raw text from searchIngredients()
 * @param {string} productName - Product name for context
 * @returns {Promise<{ingredients: Array<{name: string, flagType: string}>, source: string}>}
 */
export async function formatIngredientsForScreenshot(apiKey, rawResponse, productName) {
  console.log(`  Formatting ingredients for: "${productName}"`);

  const client = getGeminiClient(apiKey);

  const prompt = `Parse the following ingredient search results and extract the COMPLETE ingredients list.

Product: ${productName}

Search Results:
${rawResponse}

Return a JSON array with ALL ingredients from the product. For each ingredient, assign a flagType based on these rules:
- "warning" = Known problematic ingredients:
  FOOD: High Fructose Corn Syrup, Artificial Colors (Red 40, Yellow 5, Yellow 6, Blue 1, etc.), BHA, BHT, TBHQ, Sodium Nitrite, Sodium Nitrate, Potassium Bromate, Azodicarbonamide, Brominated Vegetable Oil, Propylparaben, Butylparaben, Partially Hydrogenated Oils (trans fats), Artificial Sweeteners (Aspartame, Sucralose, Acesulfame Potassium)
  SKINCARE: Fragrance, Parfum, Essential Oils, Formaldehyde releasers, Benzisothiazolinone
- "caution" = Potentially concerning:
  FOOD: Natural Flavors, Natural Flavor, Carrageenan, Sodium Benzoate, Potassium Sorbate, Soy Lecithin, Canola Oil, Vegetable Oil, Corn Syrup, Maltodextrin, Dextrose, Caramel Color, Cellulose Gum, Xanthan Gum, Mono and Diglycerides, DATEM, Calcium Sulfate, Vegetable Concentrate for Color
  SKINCARE: Parabens, Sulfates, Synthetic dyes (CI numbers), Preservatives like Phenoxyethanol, Silicones like Cyclopentasiloxane/Dimethicone
- "info" = Neutral/beneficial: Water, Glycerin, Vitamins, Minerals, whole grains, fruits, organic ingredients, salt, etc.

IMPORTANT: Include ALL ingredients in order as they appear on the product packaging. Do not skip any.
Put warning ingredients first, then caution, then info.

Return ONLY valid JSON like this, no explanation:
[
  {"name": "Fragrance", "flagType": "warning"},
  {"name": "Phenoxyethanol", "flagType": "caution"},
  {"name": "Glycerin", "flagType": "info"}
]`;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash', // Use faster model for formatting
      contents: prompt,
      config: {
        temperature: 0.1 // Low temp for consistent formatting
      }
    });

    const text = response.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const ingredients = JSON.parse(jsonMatch[0]);

    console.log(`  Formatted ${ingredients.length} ingredients`);

    return {
      ingredients,
      formattingPrompt: prompt,
      formattingResponse: text
    };
  } catch (error) {
    console.error(`  Formatting error: ${error.message}`);
    throw error;
  }
}

/**
 * Legacy function - combines search + format for backwards compatibility
 */
export async function getIngredientsList(apiKey, productName) {
  // Search (raw)
  const searchResult = await searchIngredients(apiKey, productName);

  // Format for screenshot
  const formatted = await formatIngredientsForScreenshot(
    apiKey,
    searchResult.raw,
    productName
  );

  return {
    ingredients: formatted.ingredients.map(i => i.name),
    ingredientsWithFlags: formatted.ingredients,
    source: searchResult.sources[0] || 'Gemini Search',
    allSources: searchResult.sources,
    productName,
    raw: searchResult.raw,
    thinking: searchResult.thinking,
    prompt: searchResult.prompt,
    formattingPrompt: formatted.formattingPrompt,
    formattingResponse: formatted.formattingResponse,
    isReformulated: searchResult.raw.toLowerCase().includes('reformulat') ||
                    searchResult.raw.toLowerCase().includes('new formula')
  };
}

/**
 * Get ingredients for multiple products in batch
 * @param {string} apiKey - Gemini API key
 * @param {string[]} productNames - Array of product names
 * @returns {Promise<Map<string, {ingredients: string[], source: string}>>}
 */
export async function getIngredientsListBatch(apiKey, productNames) {
  const results = new Map();

  for (const productName of productNames) {
    try {
      const result = await getIngredientsList(apiKey, productName);
      results.set(productName, result);
    } catch (error) {
      console.error(`  Failed to get ingredients for ${productName}: ${error.message}`);
      results.set(productName, { ingredients: [], source: 'error', error: error.message });
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

// CLI test
import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apiKey = process.env.GEMINI_API_KEY;
  const productName = process.argv[2] || 'Neutrogena Hydro Boost Water Gel';
  const rawOnly = process.argv.includes('--raw-only');

  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable required');
    process.exit(1);
  }

  console.log(`Testing Gemini search for: ${productName}\n`);

  if (rawOnly) {
    // Just show raw search results (no formatting)
    searchIngredients(apiKey, productName)
      .then(result => {
        console.log('\n=== INPUT (Prompt) ===');
        console.log(result.prompt);

        if (result.thinking) {
          console.log('\n=== THINKING ===');
          console.log(result.thinking);
        }

        console.log('\n=== OUTPUT (Raw Response) ===');
        console.log(result.raw);

        if (result.sources.length > 0) {
          console.log('\n=== SOURCES ===');
          result.sources.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
        }
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  } else {
    // Full pipeline with formatting
    getIngredientsList(apiKey, productName)
      .then(result => {
        console.log('\n=== SEARCH INPUT ===');
        console.log(result.prompt);

        if (result.thinking) {
          console.log('\n=== THINKING ===');
          console.log(result.thinking);
        }

        console.log('\n=== SEARCH OUTPUT (Raw) ===');
        console.log(result.raw);

        console.log('\n=== FORMATTING INPUT ===');
        console.log(result.formattingPrompt);

        console.log('\n=== FORMATTING OUTPUT ===');
        console.log(result.formattingResponse);

        console.log('\n=== FINAL RESULT ===');
        console.log(`Product: ${result.productName}`);
        console.log(`Source: ${result.source}`);
        console.log(`Reformulated: ${result.isReformulated}`);
        console.log(`\nIngredients (${result.ingredientsWithFlags?.length || 0}):`);
        (result.ingredientsWithFlags || []).forEach((ing, i) => {
          const flag = ing.flagType === 'warning' ? '⚠️' :
                       ing.flagType === 'caution' ? '⚡' : 'ℹ️';
          console.log(`  ${i + 1}. ${flag} ${ing.name}`);
        });

        if (result.allSources?.length > 0) {
          console.log('\n=== SOURCES ===');
          result.allSources.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
        }
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  }
}
