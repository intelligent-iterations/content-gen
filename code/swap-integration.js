/**
 * Swap Integration for Video Gen Pipeline
 *
 * Finds healthier product alternatives using Grok for query generation
 * and DuckDuckGo for product search. Lightweight re-implementation of
 * the pom swap pipeline optimized for the video gen workflow.
 */

import { searchDuckDuckGo } from './web-scraper.js';

/**
 * Use Grok to generate a search query for finding a cleaner alternative
 */
async function generateSwapQuery(apiKey, productName, flaggedIngredients) {
  const flagList = flaggedIngredients
    .map(i => `- ${i.name}: ${i.flagType}`)
    .join('\n');

  const prompt = `Product: ${productName}

Flagged ingredients:
${flagList}

Generate a simple Google search query to find a CLEANER alternative product in the same category.
Focus on avoiding the worst flagged ingredients.

Rules:
- Use natural shopping keywords like "natural [product type] no [bad ingredient] buy"
- Always end with "buy" to bias toward product pages (not articles/recipes)
- Keep it to 5-8 words
- Output ONLY the search query, nothing else`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-4-1-fast',
      messages: [
        { role: 'system', content: 'Output only the search query. No explanation.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
}

/**
 * Score and filter results — adapted from pom-functions swap logic.
 * Penalizes articles, listicles, recipes, blogs, and non-product pages.
 */
function scoreAndFilterResults(results) {
  const blocked = ['pinterest', 'facebook', 'instagram', 'tiktok', 'youtube', 'reddit', 'twitter'];
  const articlePatterns = /\b(best\s+\d+|top\s+\d+|\d+\s+best|how\s+to|recipe|homemade|diy|guide|review|vs\.?|compared)\b/i;
  const blogUrlPatterns = /\/(blog|article|post|news|story|recipes?|how-to)\//i;

  return results
    .filter(r => !blocked.some(b => r.url.toLowerCase().includes(b)))
    .map(r => {
      let score = 100;
      const title = r.title || '';
      const url = r.url || '';
      const desc = r.description || '';

      // Penalize articles/listicles/recipes in title
      if (articlePatterns.test(title)) score -= 50;
      if (articlePatterns.test(desc)) score -= 20;

      // Penalize blog/article URLs
      if (blogUrlPatterns.test(url)) score -= 40;

      // Penalize homepages (no meaningful path)
      const path = new URL(url).pathname;
      if (path === '/' || path === '') score -= 40;

      // Penalize shallow URLs (likely category pages, not product pages)
      const segments = path.split('/').filter(Boolean);
      if (segments.length <= 1) score -= 20;

      return { ...r, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Use Grok to pick the best swap product from search results
 */
async function pickBestSwap(apiKey, productName, flaggedIngredients, candidates) {
  const flagList = flaggedIngredients.slice(0, 10).map(i => `${i.name} (${i.flagType})`).join(', ');
  const candidateList = candidates.map((c, i) =>
    `${i + 1}. "${c.title}" — ${c.description || 'No description'}`
  ).join('\n');

  const prompt = `I need to find a healthier SWAP product for "${productName}".

Bad ingredients to avoid: ${flagList}

Here are search results. Pick the BEST single product as a swap:
${candidateList}

Rules:
- Pick an ACTUAL PRODUCT with a brand name (not a recipe, article, or listicle)
- It must be in the SAME category (if bad product is a granola bar, swap must be a granola bar)
- It must be available in US grocery stores
- Prefer well-known brands people can actually find (KIND, Annie's, Siggi's, etc.)
- It must avoid most of the flagged ingredients above
- If no result is a real product, say "none"

Respond with ONLY a JSON object:
{"pick": <number 1-${candidates.length} or 0 if none>, "product_name": "<clean product name>", "reason": "<one sentence>"}`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-4-1-fast',
      messages: [
        { role: 'system', content: 'You are a product swap expert. Respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`Grok API error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data.choices[0].message.content.trim();

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch (e) {
    return { pick: 0, product_name: '', reason: 'Failed to parse response' };
  }
}

/**
 * Find a product swap — given a "bad" product and its flagged ingredients,
 * searches for cleaner alternatives.
 *
 * @param {string} apiKey - xAI API key
 * @param {string} productName - Name of the product to find a swap for
 * @param {Array} flaggedIngredients - Array of { name, flagType } objects
 * @returns {Object} - { success, swapProduct, searchQuery, allResults }
 */
export async function findProductSwap(apiKey, productName, flaggedIngredients) {
  console.log(`\n  Finding swap for: ${productName}`);

  try {
    // Step 1: Generate search query
    const searchQuery = await generateSwapQuery(apiKey, productName, flaggedIngredients);
    console.log(`    Search query: "${searchQuery}"`);

    // Step 2: Search DuckDuckGo
    const rawResults = await searchDuckDuckGo(searchQuery, 12);
    console.log(`    Found ${rawResults.length} results`);

    if (rawResults.length === 0) {
      return { success: false, reason: 'No search results' };
    }

    // Step 3: Score, filter, and rank candidates (adapted from pom-functions)
    const scored = scoreAndFilterResults(rawResults);
    // Only keep candidates scoring > 0 (heavily penalized = likely articles/recipes)
    const candidates = scored.filter(r => r.score > 0).slice(0, 8);
    console.log(`    ${scored.length} results after filtering, ${candidates.length} viable candidates`);
    candidates.slice(0, 4).forEach((c, i) =>
      console.log(`      ${i + 1}. [score=${c.score}] ${c.title.slice(0, 60)}`)
    );

    if (candidates.length === 0) {
      return { success: false, reason: 'No suitable product pages found (all were articles/recipes)' };
    }

    // Step 4: Let AI pick the best actual product from scored candidates
    console.log(`    Asking AI to pick best swap from ${candidates.length} candidates...`);
    const aiPick = await pickBestSwap(apiKey, productName, flaggedIngredients, candidates);

    if (aiPick.pick === 0 || !aiPick.product_name) {
      // AI couldn't find a real product — DON'T blindly fall back to first result
      // Only fall back if top candidate scored high (likely a real product page)
      const topCandidate = candidates[0];
      if (topCandidate.score >= 80) {
        const fallbackName = topCandidate.title.split('|')[0].split(' - ')[0].trim();
        console.log(`    AI found no real product — high-score fallback: "${fallbackName}" (score=${topCandidate.score})`);
        return {
          success: true,
          swapProduct: { name: fallbackName, url: topCandidate.url, description: topCandidate.description || '' },
          searchQuery,
          allResults: candidates.slice(0, 5).map(r => ({
            name: r.title.split('|')[0].split(' - ')[0].trim(),
            url: r.url
          }))
        };
      }
      console.log(`    AI found no real product and top candidate scored low (${topCandidate.score}) — swap failed`);
      return { success: false, reason: 'No real product found in search results', searchQuery };
    }

    const pickedResult = candidates[aiPick.pick - 1] || candidates[0];
    console.log(`    AI picked: "${aiPick.product_name}" (reason: ${aiPick.reason})`);

    return {
      success: true,
      swapProduct: {
        name: aiPick.product_name,
        url: pickedResult.url,
        description: pickedResult.description || ''
      },
      searchQuery,
      allResults: candidates.slice(0, 5).map(r => ({
        name: r.title.split('|')[0].split(' - ')[0].trim(),
        url: r.url
      }))
    };
  } catch (error) {
    console.error(`    Swap search failed: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

/**
 * Find swaps for multiple products in batch
 * @param {string} apiKey - xAI API key
 * @param {Array} products - Array of { name, ingredients } where ingredients has { name, flagType }
 * @returns {Array} - Array of swap results
 */
export async function findSwapsForProducts(apiKey, products) {
  const results = [];

  for (const product of products) {
    const flagged = product.ingredients.filter(i =>
      i.flagType === 'warning' || i.flagType === 'caution'
    );

    if (flagged.length === 0) {
      results.push({
        originalProduct: product.name,
        success: false,
        reason: 'No flagged ingredients'
      });
      continue;
    }

    const swapResult = await findProductSwap(apiKey, product.name, flagged);
    results.push({
      originalProduct: product.name,
      ...swapResult
    });

    // Small delay between searches
    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}
