/**
 * Step 2: Content Generation
 *
 * n8n Code Node compatible
 * Input: { researchContext: string, productImages: array }
 * Output: { topic, hook, slides[], caption, hashtags }
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

import {
  loadContentDirection,
  buildContentPrompt,
  CONTENT_SYSTEM_PROMPT,
  GROK_TEMPERATURE
} from '../code/prompts.js';

async function callGrok(apiKey, messages) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'grok-4-1-fast',
      messages,
      max_tokens: 4000,
      temperature: GROK_TEMPERATURE
    })
  });

  if (!response.ok) {
    throw new Error(`Grok API error: ${response.status}`);
  }
  return response.json();
}

export async function generateContent(input) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY not set');

  const { researchContext, productImages = [] } = input;
  if (!researchContext) throw new Error('researchContext required');

  const contentDirection = loadContentDirection();
  const contentPrompt = buildContentPrompt(contentDirection, researchContext, productImages);

  const messages = [
    { role: 'system', content: CONTENT_SYSTEM_PROMPT },
    { role: 'user', content: contentPrompt }
  ];

  const response = await callGrok(apiKey, messages);
  let content = response.choices[0].message.content;

  // Clean markdown code blocks if present
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  const parsed = JSON.parse(content);

  return {
    topic: parsed.topic,
    hook: parsed.hook,
    format_used: parsed.format_used,
    slides: parsed.slides,
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    productImages // pass through for next step
  };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Read input from stdin or file
  let input;
  if (process.argv[2]) {
    const fs = await import('fs');
    input = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
  } else {
    console.error('Usage: node step2-content.js <input.json>');
    process.exit(1);
  }

  generateContent(input)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
