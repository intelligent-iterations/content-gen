/**
 * AI Orchestrator with Tool Loop
 *
 * Workflow:
 * 1. IDEA - Grok picks a topic from content direction
 * 2. RESEARCH - DuckDuckGo searches to gather facts, ingredients, products
 * 3. IMAGE SOURCING - Web images for real products, AI for creative shots
 * 4. SCREENSHOT GENERATION - pom screenshots with real ingredients from research
 * 5. OVERLAYS - Text captions + screenshots on images
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { searchAndSummarize } from './web-scraper.js';
import { scrapeIngredientPage, closeBrowser } from './playwright-scraper.js';
import { searchIngredients, formatIngredientsForScreenshot, getIngredientsList } from './gemini-search.js';
import { getLogger } from './debug-logger.js';
import { findProductSwap } from './swap-integration.js';

// Import centralized prompts
import {
  MAX_PAGES_TO_READ,
  MAX_SEARCH_LOOPS,
  GROK_TEMPERATURE,
  MAX_CONTENT_ITERATIONS,
  loadContentDirection,
  RESEARCH_SYSTEM_PROMPT,
  buildResearchPrompt,
  CONTENT_SYSTEM_PROMPT,
  buildContentPrompt,
  buildQualityEvaluationPrompt,
  buildIterationPrompt,
  RESEARCH_TOOLS
} from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tools imported from prompts.js as RESEARCH_RESEARCH_TOOLS

// buildContentPrompt imported from prompts.js

/**
 * Execute a tool call
 */
async function executeTool(toolName, args, state) {
  switch (toolName) {
    case 'get_trending_topics':
      // Search for trending controversies in the category
      const trendingQueries = {
        SKIN: 'TikTok skincare scandal OR controversy OR exposed OR viral ingredient 2025 2026',
        EATING: 'TikTok food scandal OR banned ingredient OR exposed OR viral 2025 2026',
        INHALATION: 'TikTok air freshener OR candle toxic OR cleaning product danger viral 2025 2026'
      };
      console.log(`  Finding trending topics for ${args.category}...`);
      const trendingResult = await searchAndSummarize(trendingQueries[args.category] || trendingQueries.EATING);
      return JSON.stringify({
        status: 'success',
        category: args.category,
        trending_topics: trendingResult,
        guidance: 'Pick a topic from these trending controversies. Do NOT pick a random topic - ride the wave of existing viral momentum.'
      });

    case 'web_search':
      return await searchAndSummarize(args.query);

    case 'get_ingredients_list':
      console.log(`  Getting ingredients for: ${args.product_name}`);
      try {
        const geminiApiKey = process.env.GEMINI_API_KEY;
        const logger = getLogger();

        if (!geminiApiKey) {
          return JSON.stringify({
            status: 'error',
            message: 'GEMINI_API_KEY not configured'
          });
        }

        // Step 1: Search (raw, unstructured)
        const searchResult = await searchIngredients(geminiApiKey, args.product_name);

        // Log Gemini search input/output
        logger.logStep(`Gemini Search: ${args.product_name}`, 'gemini-search', {
          prompt: searchResult.prompt,
          productName: args.product_name
        }, {
          raw: searchResult.raw,
          thinking: searchResult.thinking,
          sources: searchResult.sources,
          responseLength: searchResult.raw.length
        }, { phase: 'ingredients' });

        // Step 2: Format for screenshot (separate AI call)
        const formatted = await formatIngredientsForScreenshot(
          geminiApiKey,
          searchResult.raw,
          args.product_name
        );

        // Log formatting input/output
        logger.logStep(`Gemini Format: ${args.product_name}`, 'gemini-format', {
          prompt: formatted.formattingPrompt,
          rawInput: searchResult.raw.substring(0, 500) + '...'
        }, {
          response: formatted.formattingResponse,
          ingredients: formatted.ingredients
        }, { phase: 'ingredients' });

        // Store ingredients in state for verification
        if (!state.ingredientLists) state.ingredientLists = {};
        state.ingredientLists[args.product_name] = {
          ingredients: formatted.ingredients,
          raw: searchResult.raw,
          sources: searchResult.sources
        };

        return JSON.stringify({
          status: 'success',
          product_name: args.product_name,
          ingredients: formatted.ingredients.map(i => i.name),
          ingredients_with_flags: formatted.ingredients,
          ingredient_count: formatted.ingredients.length,
          source: searchResult.sources[0] || 'Gemini Search',
          has_thinking: !!searchResult.thinking
        });
      } catch (error) {
        return JSON.stringify({
          status: 'error',
          message: `Failed to get ingredients: ${error.message}`
        });
      }

    case 'read_webpage':
      // Check if we've hit the limit
      if (state.pagesRead >= MAX_PAGES_TO_READ) {
        return JSON.stringify({
          status: 'limit_reached',
          message: `You have already read ${MAX_PAGES_TO_READ} pages. Please use the information you have gathered to proceed.`
        });
      }

      console.log(`  Reading webpage with Playwright: ${args.url}`);
      const pageResult = await scrapeIngredientPage(args.url);
      state.pagesRead++;

      if (pageResult.error) {
        return JSON.stringify({
          status: 'failed',
          message: `Could not read page: ${pageResult.error}`,
          pagesRemaining: MAX_PAGES_TO_READ - state.pagesRead
        });
      }

      // Store captured product image for later use
      if (pageResult.productImage) {
        state.productImages.push({
          url: args.url,
          productName: pageResult.productName || 'Unknown Product',
          imageBuffer: pageResult.productImage
        });
        console.log(`  Captured product image: ${pageResult.productName || 'Unknown'}`);
      }

      return JSON.stringify({
        status: 'success',
        url: args.url,
        productName: pageResult.productName,
        hasProductImage: !!pageResult.productImage,
        content: pageResult.content,
        pagesRemaining: MAX_PAGES_TO_READ - state.pagesRead
      });

    case 'find_product_swap':
      console.log(`  Finding swap for: ${args.product_name}`);
      try {
        const xaiApiKey = process.env.XAI_API_KEY;
        if (!xaiApiKey) {
          return JSON.stringify({ status: 'error', message: 'XAI_API_KEY not configured' });
        }

        const swapResult = await findProductSwap(
          xaiApiKey,
          args.product_name,
          args.flagged_ingredients || []
        );

        // Store swap results in state for content generation
        if (!state.swapResults) state.swapResults = {};
        state.swapResults[args.product_name] = swapResult;

        if (swapResult.success) {
          state.researchContext += `\n\n### SWAP FOUND for ${args.product_name}\nSwap: ${swapResult.swapProduct.name}\nURL: ${swapResult.swapProduct.url}\nSearch query used: "${swapResult.searchQuery}"`;
          console.log(`    Swap found: ${swapResult.swapProduct.name}`);
        } else {
          console.log(`    No swap found: ${swapResult.reason}`);
        }

        return JSON.stringify({
          status: swapResult.success ? 'success' : 'no_swap_found',
          product_name: args.product_name,
          swap_product: swapResult.swapProduct || null,
          search_query: swapResult.searchQuery || null,
          all_results: swapResult.allResults || [],
          reason: swapResult.reason || null
        });
      } catch (error) {
        return JSON.stringify({
          status: 'error',
          message: `Swap search failed: ${error.message}`
        });
      }

    case 'finish_research':
      return JSON.stringify({
        status: 'ready',
        message: 'Research complete. Proceeding to content generation.',
        summary: args.summary
      });

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

/**
 * Call Grok API with tools
 */
async function callGrokWithTools(apiKey, messages, tools = null) {
  const body = {
    model: 'grok-4-1-fast',
    messages,
    max_tokens: 4000,
    temperature: GROK_TEMPERATURE
  };

  if (tools) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  // Retry with exponential backoff for 503/429 (transient API errors)
  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      return await response.json();
    }

    const error = await response.text();

    if ((response.status === 503 || response.status === 429) && attempt < MAX_RETRIES) {
      const delay = Math.min(10000 * Math.pow(2, attempt - 1), 120000); // 10s, 20s, 40s, 80s, max 120s
      console.log(`  Grok ${response.status} (attempt ${attempt}/${MAX_RETRIES}) — retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }
}

/**
 * Run the research loop with tool calls
 */
async function runResearchLoop(apiKey, contentDirection) {
  const logger = getLogger();
  console.log('Starting research loop (max %d iterations)...', MAX_SEARCH_LOOPS);

  const systemPrompt = 'You are a viral TikTok content strategist. Use the provided tools to research topics thoroughly. IMPORTANT: Search snippets only show previews - you MUST use read_webpage on URLs like incidecoder.com or skinsort.com to get COMPLETE ingredient lists. Do not rely on snippet previews alone.';
  const userPrompt = buildResearchPrompt(contentDirection);

  // Log the initial prompts
  logger.logStep('Research System Prompt', 'grok-prompt', systemPrompt, null, { phase: 'research' });
  logger.logStep('Research User Prompt', 'grok-prompt', userPrompt, null, { phase: 'research', includesContentDirection: true });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  // State to track research progress
  const state = {
    researchContext: '',
    pagesRead: 0,
    productImages: []  // Store captured product images from scraped pages
  };

  let loopCount = 0;
  let researchComplete = false;

  while (loopCount < MAX_SEARCH_LOOPS && !researchComplete) {
    loopCount++;
    console.log(`\nResearch iteration ${loopCount}/${MAX_SEARCH_LOOPS}`);

    // Capture input messages before calling Grok
    const inputMessages = messages.map(m => ({
      role: m.role,
      content: m.content?.substring?.(0, 2000) || m.content, // Truncate long content for readability
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls?.map(tc => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      }))
    }));

    const response = await callGrokWithTools(apiKey, messages, RESEARCH_TOOLS);
    const choice = response.choices[0];
    const message = choice.message;

    // Log Grok's response WITH the input messages
    logger.logStep(`Grok Response (iteration ${loopCount})`, 'grok-response', {
      messages: inputMessages,
      messageCount: messages.length
    }, {
      content: message.content,
      tool_calls: message.tool_calls?.map(tc => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      })),
      finish_reason: choice.finish_reason
    }, { iteration: loopCount });

    // Add assistant message to history
    messages.push(message);

    // Check if there are tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`  Tool: ${toolName}`);
        if (toolArgs.query) {
          console.log(`  Query: "${toolArgs.query}"`);
        }

        // Log tool call
        logger.logStep(`Tool Call: ${toolName}`, 'tool-call', toolArgs, null, { iteration: loopCount });

        // Execute the tool
        const toolResult = await executeTool(toolName, toolArgs, state);

        // Log tool result with enhanced info for read_webpage
        const category = toolName === 'web_search' ? 'web-search' :
                        toolName === 'read_webpage' ? 'web-search' : 'tool-result';

        // For read_webpage, include the captured product image preview if available
        let logOutput = toolResult;
        if (toolName === 'read_webpage') {
          try {
            const parsed = JSON.parse(toolResult);
            // Check if we just captured a product image
            const capturedImage = state.productImages[state.productImages.length - 1];
            if (capturedImage && capturedImage.url === toolArgs.url && capturedImage.imageBuffer) {
              // Add image preview to the log output
              const imageBase64 = capturedImage.imageBuffer.toString('base64');
              logOutput = {
                ...parsed,
                imagePreview: `data:image/jpeg;base64,${imageBase64}`,
                _note: 'Product image was captured and is available for image-to-image generation'
              };
            } else {
              logOutput = parsed;
            }
          } catch (e) {
            // Keep as string if parse fails
          }
        }

        logger.logStep(`Tool Result: ${toolName}`, category, toolArgs, logOutput, { iteration: loopCount });

        // Add tool result to messages
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult
        });

        // Collect research context
        if (toolName === 'web_search') {
          state.researchContext += `\n\n### Search: ${toolArgs.query}\n${toolResult}`;
        }

        // Collect ingredient lists (from Gemini grounded search)
        if (toolName === 'get_ingredients_list') {
          try {
            const ingredientData = JSON.parse(toolResult);
            if (ingredientData.status === 'success') {
              state.researchContext += `\n\n### VERIFIED INGREDIENTS: ${ingredientData.product_name}\nSource: ${ingredientData.source}\nComplete ingredient list (${ingredientData.ingredient_count} ingredients):\n${ingredientData.ingredients.join(', ')}`;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        // Collect webpage content for research context
        if (toolName === 'read_webpage') {
          try {
            const pageData = JSON.parse(toolResult);
            if (pageData.status === 'success') {
              state.researchContext += `\n\n### Webpage: ${toolArgs.url}\n${pageData.content}`;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        // Check if research is complete
        if (toolName === 'finish_research') {
          researchComplete = true;
          console.log('  Research complete!');
          if (toolArgs.summary) {
            state.researchContext += `\n\n### Research Summary\n${toolArgs.summary}`;
          }
        }
      }
    } else if (choice.finish_reason === 'stop') {
      if (message.content) {
        state.researchContext += `\n\nAssistant notes: ${message.content}`;
      }
      researchComplete = true;
    }
  }

  if (!researchComplete) {
    console.log('Reached max iterations, proceeding with available research');
  }

  console.log(`\nResearch complete after ${loopCount} iterations`);
  console.log(`Pages read: ${state.pagesRead}`);
  console.log(`Product images captured: ${state.productImages.length}`);

  // Log research summary
  logger.logStep('Research Phase Complete', 'tool-result', null, {
    totalIterations: loopCount,
    pagesRead: state.pagesRead,
    productImagesCaptured: state.productImages.length,
    productNames: state.productImages.map(p => p.productName),
    researchContextLength: state.researchContext.length
  });

  // Close Playwright browser
  await closeBrowser();

  return state;
}

/**
 * Validate controversy potential of research before content generation (TODO 7)
 * Returns { score, pass, suggestion } - if score < 7, suggests more controversial angle
 */
async function validateControversy(apiKey, researchContext, logger) {
  console.log('\n  Validating controversy potential...');

  const validationPrompt = `Based on this research, rate the VIRAL POTENTIAL (1-10):

${researchContext.substring(0, 4000)}

## Scoring Criteria:
- Is there a clear VILLAIN (brand, ingredient, industry)?
- Is there OUTRAGE potential (banned elsewhere, harming kids, companies lying)?
- Is there a TRENDING hook (recent news, viral callouts)?
- Will people COMMENT with strong opinions?

## Score Guide:
- 10: "BANNED in Europe, fed to American kids daily" (outrage + fear + villain)
- 8: "Major brand caught lying about 'natural' claims" (betrayal + villain)
- 6: "This common ingredient is linked to health issues" (concern)
- 4: "Some experts have concerns about..." (mild interest)
- 2: "Here's what's in this product" (neutral/informational)

## Response Format (JSON only):
{
  "score": <1-10>,
  "pass": <true if score >= 7>,
  "current_angle": "<brief description of the angle in the research>",
  "suggestion": "<if score < 7, suggest a MORE CONTROVERSIAL angle using the same research data>"
}`;

  const messages = [
    { role: 'system', content: 'You are a viral content strategist. Rate controversy potential strictly. Respond with valid JSON only.' },
    { role: 'user', content: validationPrompt }
  ];

  try {
    const response = await callGrokWithTools(apiKey, messages);
    const rawResponse = response.choices[0].message.content;

    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawResponse.trim();
    const validation = JSON.parse(jsonStr);

    logger.logStep('Controversy Validation', 'controversy-check', {
      researchLength: researchContext.length
    }, validation, { phase: 'controversy-validation' });

    console.log(`  Controversy score: ${validation.score}/10 (${validation.pass ? 'PASS' : 'NEEDS STRONGER ANGLE'})`);
    if (!validation.pass && validation.suggestion) {
      console.log(`  Suggestion: ${validation.suggestion}`);
    }

    return validation;
  } catch (e) {
    logger.logStep('Controversy Validation Error', 'controversy-check', null, { error: e.message });
    // If parsing fails, assume pass to avoid blocking
    return { score: 7, pass: true, suggestion: null };
  }
}

/**
 * Evaluate content quality and return pass/fail with feedback
 */
async function evaluateContentQuality(apiKey, content, logger) {
  console.log('  Evaluating content quality...');

  const evalPrompt = buildQualityEvaluationPrompt(content);
  const messages = [
    { role: 'system', content: 'You are a strict content quality evaluator. Respond with valid JSON only.' },
    { role: 'user', content: evalPrompt }
  ];

  const response = await callGrokWithTools(apiKey, messages);
  const rawResponse = response.choices[0].message.content;

  // Parse evaluation response
  try {
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawResponse.trim();
    const evaluation = JSON.parse(jsonStr);

    logger.logStep('Quality Evaluation', 'quality-check', { content_topic: content.topic }, evaluation, { phase: 'quality-evaluation' });

    return evaluation;
  } catch (e) {
    logger.logStep('Quality Evaluation Parse Error', 'quality-check', rawResponse, { error: e.message });
    // If parsing fails, assume pass to avoid blocking
    return { pass: true, total_score: 50, specific_feedback: 'Evaluation parsing failed', weakest_areas: [] };
  }
}

/**
 * Generate carousel content based on research (with quality iteration loop)
 */
async function generateCarouselContent(apiKey, contentDirection, researchState) {
  const logger = getLogger();
  console.log('\nGenerating carousel content...');

  const systemPrompt = 'You are a viral TikTok content strategist. Always respond with valid JSON only, no markdown code blocks. Use REAL ingredient names from your research for screenshots. If product images were captured, you can use them for image-to-image generation.';
  const baseUserPrompt = buildContentPrompt(contentDirection, researchState.researchContext, researchState.productImages, researchState.ingredientLists || {});

  // Log the content generation prompts
  logger.logStep('Content Generation System Prompt', 'grok-prompt', systemPrompt, null, { phase: 'content-generation' });
  logger.logStep('Content Generation User Prompt', 'grok-prompt', baseUserPrompt, null, { phase: 'content-generation' });

  // Also log the research context that was passed to Grok
  logger.logStep('Research Context Passed to Grok', 'content-generation', researchState.researchContext, null, { phase: 'content-generation' });

  let content = null;
  let qualityFeedback = null;
  let iteration = 0;

  while (iteration < MAX_CONTENT_ITERATIONS) {
    iteration++;
    console.log(`\n  Content generation attempt ${iteration}/${MAX_CONTENT_ITERATIONS}`);

    // Build prompt - include feedback if this is a retry
    let userPrompt = baseUserPrompt;
    if (qualityFeedback && !qualityFeedback.pass) {
      userPrompt = buildIterationPrompt(baseUserPrompt, content, qualityFeedback);
      logger.logStep(`Iteration ${iteration} Prompt (with feedback)`, 'grok-prompt', userPrompt.substring(0, 1000) + '...', null, { phase: 'content-generation', iteration });
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await callGrokWithTools(apiKey, messages);
    const rawContent = response.choices[0].message.content;

    // Log raw response WITH input messages
    logger.logStep(`Grok Raw Content Response (iteration ${iteration})`, 'grok-response', {
      systemPrompt: systemPrompt,
      userPrompt: userPrompt.substring(0, 3000) + '... [truncated]',
      researchContextLength: researchState.researchContext.length,
      iteration
    }, rawContent, { phase: 'content-generation' });

    // Parse JSON from response
    try {
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
      content = JSON.parse(jsonStr);
    } catch (e) {
      logger.logStep('JSON Parse Error', 'content-generation', rawContent, { error: e.message, iteration });
      console.error('Failed to parse Grok response:', rawContent);
      throw new Error('Failed to parse JSON from Grok response');
    }

    // Log parsed content
    logger.logStep(`Parsed Carousel Content (iteration ${iteration})`, 'content-generation', null, content, { phase: 'content-generation', iteration });

    console.log(`  Generated: "${content.topic}" (${content.slides.length} slides)`);

    // Evaluate quality (skip on last iteration - use whatever we got)
    if (iteration < MAX_CONTENT_ITERATIONS) {
      qualityFeedback = await evaluateContentQuality(apiKey, content, logger);

      console.log(`  Quality score: ${qualityFeedback.total_score}/100 (${qualityFeedback.pass ? 'PASS' : 'FAIL'})`);
      console.log(`  Slide count: ${content.slides.length}`);
      console.log(`  Swaps: ${qualityFeedback.scores?.swap_coverage || 'N/A'}/10`);
      console.log(`  Image realism: ${qualityFeedback.scores?.image_realism || 'N/A'}/10`);
      console.log(`  Hook: ${qualityFeedback.scores?.hook_power || 'N/A'}/10`);

      if (qualityFeedback.auto_fail_reason) {
        console.log(`  AUTO-FAIL: ${qualityFeedback.auto_fail_reason}`);
      }

      if (qualityFeedback.pass) {
        console.log('  Content passed quality check!');
        break;
      } else {
        console.log(`  Weak areas: ${qualityFeedback.weakest_areas.join(', ')}`);
        console.log(`  Feedback: ${qualityFeedback.specific_feedback}`);
      }
    }
  }

  if (iteration === MAX_CONTENT_ITERATIONS && qualityFeedback && !qualityFeedback.pass) {
    console.log(`  Max iterations reached. Using best effort content (score: ${qualityFeedback.total_score}/100)`);
    if (qualityFeedback.auto_fail_reason) {
      console.log(`  WARNING: Content did not meet hard requirements: ${qualityFeedback.auto_fail_reason}`);
    }
  }

  // Final logging
  console.log(`\nFinal content for: ${content.topic}`);
  console.log(`Slides: ${content.slides.length}, Iterations: ${iteration}`);

  // Count image sources
  const webImages = content.slides.filter(s => s.image_source === 'web').length;
  const aiImages = content.slides.filter(s => s.image_source === 'ai').length;
  const screenshots = content.slides.filter(s => s.has_screenshot).length;

  console.log(`Web images: ${webImages}, AI images: ${aiImages}, Screenshots: ${screenshots}`);

  // Ensure scores exist on product slides (Grok sometimes omits them)
  // Fallback: extract from caption which always has "Product — XX/100" in order
  const productSlides = content.slides.filter(
    s => s.slide_type === 'bad_product' || s.slide_type === 'swap_product'
  );
  const slidesNeedingScores = productSlides.filter(s => s.score === undefined || s.score === null);
  if (slidesNeedingScores.length > 0 && content.caption) {
    console.log(`\n  ${slidesNeedingScores.length}/${productSlides.length} product slides missing scores — extracting from caption...`);
    // Extract all "XX/100" scores from caption in order (matches slide order)
    const scoreMatches = [...content.caption.matchAll(/(\d+)\/100/g)];
    const captionScores = scoreMatches.map(m => parseInt(m[1], 10));
    // Assign positionally: caption scores appear in same order as product slides
    for (let i = 0; i < productSlides.length; i++) {
      if ((productSlides[i].score === undefined || productSlides[i].score === null) && captionScores[i] !== undefined) {
        productSlides[i].score = captionScores[i];
        console.log(`    Extracted score for "${productSlides[i].product_name}": ${captionScores[i]}/100`);
      }
    }
    const stillMissing = productSlides.filter(s => s.score === undefined || s.score === null);
    if (stillMissing.length > 0) {
      console.warn(`    ${stillMissing.length} slides still missing scores after caption extraction`);
    }
  }

  // CRITICAL: Replace Grok's partial ingredient lists with FULL researched ingredients
  console.log('\n  Checking for ingredient lists to inject...');
  console.log(`    researchState.ingredientLists exists: ${!!researchState.ingredientLists}`);

  if (researchState.ingredientLists) {
    const productNames = Object.keys(researchState.ingredientLists);
    console.log(`    Products researched: ${productNames.length}`);
    productNames.forEach(p => console.log(`      - ${p} (${researchState.ingredientLists[p].ingredients?.length || 0} ingredients)`));
  }

  if (researchState.ingredientLists && Object.keys(researchState.ingredientLists).length > 0) {
    console.log('\n  Injecting full ingredient lists from research...');

    for (const slide of content.slides) {
      if (slide.has_screenshot && slide.screenshot_ingredients) {
        console.log(`    Slide ${slide.slide_number} product: "${slide.product_name || ''}"`);

        let matchedData = null;
        let matchMethod = 'none';

        // PRIMARY: Direct key lookup via ingredient_list_key (set by Grok from prompt)
        if (slide.ingredient_list_key && researchState.ingredientLists[slide.ingredient_list_key]) {
          const data = researchState.ingredientLists[slide.ingredient_list_key];
          if (data.ingredients && data.ingredients.length > 0) {
            matchedData = data;
            matchMethod = 'key';
            console.log(`      ✓ KEY MATCH: "${slide.ingredient_list_key}" → ${data.ingredients.length} ingredients`);
          }
        }

        // FALLBACK: Jaccard similarity if Grok didn't set the key or key didn't match
        if (!matchedData) {
          if (slide.ingredient_list_key) {
            console.log(`      ⚠ Key "${slide.ingredient_list_key}" not found in research — falling back to fuzzy match`);
          } else {
            console.log(`      ⚠ No ingredient_list_key set — falling back to fuzzy match`);
          }

          const slideProductName = (slide.product_name || '').toLowerCase().trim();
          const slideText = (slide.text_overlay || '').toLowerCase().trim();
          const searchText = `${slideText} ${slideProductName}`;
          let bestScore = 0;

          for (const [productName, data] of Object.entries(researchState.ingredientLists)) {
            if (!data.ingredients || data.ingredients.length === 0) continue;
            const productLower = productName.toLowerCase().trim();

            // Jaccard similarity (intersection / union) — symmetric scoring
            const productWords = new Set(productLower.split(/\s+/).filter(w => w.length > 3));
            const slideWords = new Set(searchText.split(/\s+/).filter(w => w.length > 3));
            if (productWords.size === 0 || slideWords.size === 0) continue;

            const intersection = [...productWords].filter(w => slideWords.has(w)).length;
            const union = new Set([...productWords, ...slideWords]).size;
            const jaccardScore = intersection / union;

            console.log(`      vs "${productName}" — jaccard: ${intersection}/${union} = ${jaccardScore.toFixed(2)}`);

            if (jaccardScore > bestScore && jaccardScore >= 0.3) {
              matchedData = data;
              bestScore = jaccardScore;
              matchMethod = `jaccard(${jaccardScore.toFixed(2)})`;
            }
          }
        }

        if (matchedData) {
          const oldCount = slide.screenshot_ingredients.length;
          slide.screenshot_ingredients = matchedData.ingredients;
          console.log(`      ✓ INJECTED (${matchMethod}): ${oldCount} → ${matchedData.ingredients.length} ingredients`);
        } else {
          console.log(`      ✗ No match — keeping AI's original ingredients`);
        }
      }
    }
  } else {
    console.log('    WARNING: No ingredient lists found in research state!');
  }

  // Attach metadata
  content._researchContext = researchState.researchContext;
  content._productImages = researchState.productImages;
  content._ingredientLists = researchState.ingredientLists;
  content._swapResults = researchState.swapResults || {};
  content._qualityIterations = iteration;
  content._finalQualityScore = qualityFeedback?.total_score || null;
  content._controversyScore = researchState.controversyValidation?.score || null;

  // A/B Hook Testing metadata (TODO 8)
  // Detect which hook formula was used based on the hook text
  const hookText = content.hook || content.slides?.[0]?.text_overlay || '';
  content._hookMetadata = {
    hook_text: hookText,
    hook_formula_detected: detectHookFormula(hookText),
    format_used: content.format_used || 'unknown',
    // These will be filled in manually after posting:
    completion_rate: null,
    save_rate: null,
    comment_count: null,
    like_count: null
  };

  return content;
}

/**
 * Detect which viral hook formula was used — Iteration 3
 */
function detectHookFormula(hookText) {
  const text = hookText.toLowerCase();

  // ASSUMPTION_CHALLENGE patterns
  if (text.includes('you think') || text.includes('you grab') || text.includes('everyone thinks') || text.includes('you believe')) {
    return 'ASSUMPTION_CHALLENGE';
  }

  // SCORE_REVEAL patterns
  if (text.includes('scored') || text.includes('score') || text.includes('/100') || text.includes('out of 100')) {
    return 'SCORE_REVEAL';
  }

  // SWAP_QUESTION patterns
  if (text.includes('instead') || text.includes('swap') || text.includes('better') || text.includes('alternative')) {
    return 'SWAP_QUESTION';
  }

  // CURIOSITY_PULL patterns
  if (text.includes('how does') || text.includes('what about') || text.includes('is it') || text.includes('actually good')) {
    return 'CURIOSITY_PULL';
  }

  // Legacy detection (flag if old patterns slip through)
  if (text.includes('banned')) {
    return 'LEGACY_BANNED_WARNING';
  }

  return 'UNKNOWN';
}

/**
 * Main orchestration function
 * Runs research loop then generates content
 */
export async function orchestrateContentGeneration(apiKey) {
  const logger = getLogger();
  const contentDirection = loadContentDirection();

  // Phase 1: Research (includes finding product images)
  console.log('\n========================================');
  console.log('   PHASE 1: Research & Image Discovery');
  console.log('========================================\n');

  const researchState = await runResearchLoop(apiKey, contentDirection);

  // Phase 1.5: Controversy Validation (TODO 7)
  console.log('\n========================================');
  console.log('   PHASE 1.5: Controversy Validation');
  console.log('========================================\n');

  const controversyCheck = await validateControversy(apiKey, researchState.researchContext, logger);

  // If controversy is low, append the suggestion to research context
  if (!controversyCheck.pass && controversyCheck.suggestion) {
    console.log('\n  Enhancing research context with stronger angle...');
    researchState.researchContext += `\n\n### CONTROVERSY ENHANCEMENT REQUIRED\nThe current angle scored ${controversyCheck.score}/10 for viral potential.\nSuggested stronger angle: ${controversyCheck.suggestion}\n\nYou MUST use this more controversial angle in your content. The current angle is too mild.`;
  }

  // Store controversy validation for metadata
  researchState.controversyValidation = controversyCheck;

  // Phase 2: Content Generation
  console.log('\n========================================');
  console.log('   PHASE 2: Content Generation');
  console.log('========================================\n');

  const content = await generateCarouselContent(apiKey, contentDirection, researchState);

  return content;
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  import('dotenv').then(async (dotenv) => {
    dotenv.config({ path: path.join(__dirname, '..', '.env') });

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      console.error('XAI_API_KEY not set in .env');
      process.exit(1);
    }

    try {
      const content = await orchestrateContentGeneration(apiKey);
      console.log('\n--- Generated Content ---\n');
      console.log(JSON.stringify(content, null, 2));
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });
}
