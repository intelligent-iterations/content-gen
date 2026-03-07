/**
 * Step 1: Research
 *
 * n8n Code Node compatible
 * Input: { category?: 'SKIN' | 'EATING' | 'INHALATION' }
 * Output: { researchContext: string, productImages: array }
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

import {
  CATEGORIES,
  loadContentDirection,
  buildResearchPrompt,
  RESEARCH_SYSTEM_PROMPT,
  RESEARCH_TOOLS,
  MAX_SEARCH_LOOPS,
  GROK_TEMPERATURE
} from '../code/prompts.js';
import { searchDuckDuckGo } from '../code/web-scraper.js';
import { scrapeWithPlaywright } from '../code/playwright-scraper.js';

async function callGrok(apiKey, messages, tools = null) {
  const body = {
    model: 'grok-4-1-fast',
    messages,
    max_tokens: 4000,
    temperature: GROK_TEMPERATURE
  };
  if (tools) body.tools = tools;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Grok API error: ${response.status}`);
  }
  return response.json();
}

export async function runResearch(input = {}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY not set');

  const category = input.category || CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const contentDirection = loadContentDirection();
  const researchPrompt = buildResearchPrompt(contentDirection, category);

  const messages = [
    { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
    { role: 'user', content: researchPrompt }
  ];

  const productImages = [];
  let pagesRead = 0;
  let researchComplete = false;
  let researchSummary = '';

  for (let i = 0; i < MAX_SEARCH_LOOPS && !researchComplete; i++) {
    const response = await callGrok(apiKey, messages, RESEARCH_TOOLS);
    const choice = response.choices[0];

    if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls) {
      const toolCalls = choice.message.tool_calls;
      messages.push(choice.message);

      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments);
        let result;

        switch (toolCall.function.name) {
          case 'web_search':
            const searchResults = await searchDuckDuckGo(args.query);
            result = JSON.stringify(searchResults.slice(0, 5));
            break;

          case 'read_webpage':
            if (pagesRead < 5) {
              const scraped = await scrapeWithPlaywright(args.url);
              pagesRead++;
              if (scraped.productImage) {
                productImages.push({
                  productName: scraped.productName || 'Unknown',
                  imageUrl: scraped.productImage,
                  sourceUrl: args.url
                });
              }
              result = scraped.text?.substring(0, 8000) || 'No content';
            } else {
              result = 'Page limit reached';
            }
            break;

          case 'finish_research':
            researchComplete = true;
            researchSummary = args.summary;
            result = 'Research complete';
            break;
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });
      }
    } else {
      researchComplete = true;
      researchSummary = choice.message.content;
    }
  }

  // Build context from conversation
  const researchContext = messages
    .filter(m => m.role === 'tool' || (m.role === 'assistant' && m.content))
    .map(m => m.content)
    .join('\n\n');

  return {
    category,
    researchContext: researchSummary + '\n\n' + researchContext,
    productImages,
    pagesRead
  };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const category = process.argv[2] || null;
  runResearch({ category })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
