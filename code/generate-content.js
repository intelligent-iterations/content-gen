/**
 * Grok API integration for generating TikTok slideshow content
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load content direction from markdown file
 */
export function loadContentDirection() {
  const contentPath = path.join(__dirname, '..', 'content-direction.md');
  return fs.readFileSync(contentPath, 'utf-8');
}

/**
 * Build the prompt for Grok
 */
export function buildPrompt(contentDirection) {
  return `
You are creating educational TikTok slideshows for pom, an ingredient scanner app for skincare, food, and household products.

## Content Principles
${contentDirection}

## Your Task
Create a TikTok photo slideshow (5-7 slides) that TEACHES something specific about ingredients.

Pick a fresh angle. Consider:
- Deep-diving on one specific ingredient (and where it shows up)
- Explaining a health concern and what ingredients trigger it
- Comparing two product categories
- Busting a specific myth with facts
- Hidden ingredients in everyday products (candles, "clean" snacks, air fresheners)
- Cross-category: same ingredient in skincare AND food AND home products

## CRITICAL: Image Prompts
Text is overlaid AFTER image generation. Image prompts must:
- Describe ONLY visuals (no text, words, or numbers in the image)
- Leave clean space in upper 40% for text overlay
- Be specific about the scene, lighting, objects

## Output Format
Return ONLY valid JSON:

{
  "topic": "Specific topic title",
  "hook": "The curiosity-building hook for slide 1",
  "slides": [
    {
      "slide_number": 1,
      "image_prompt": "9:16 vertical, [detailed visual description, NO TEXT]. [specific scene, lighting, objects]",
      "text_overlay": "Informative text, max 10 words. Be specific, not vague.",
      "text_position": "top"
    }
  ],
  "caption": "Detailed caption that expands on the slideshow. Explain the why, add context, be conversational. 1000-1500 characters.",
  "hashtags": ["relevant", "tags", "no-hash-symbol"]
}

## Curiosity Gap Structure
Build each slideshow as a curiosity journey:

- **Slide 1 (Open the gap)**: Tease without revealing. Create a question in their mind.
  - Bad: "Fragrance is bad for you" (no gap, already answered)
  - Good: "The ingredient hiding in 'unscented' products" (gap opened)

- **Slides 2-3 (Widen the gap)**: Partial reveals that raise more questions
  - "It's FDA approved... but that doesn't mean what you think"
  - "Dermatologists recommend it. Here's what they don't mention."

- **Slides 4-6 (Fill the gap)**: Deliver specifics - ingredient names, effects, who's affected
  - "Phenoxyethanol: preservative linked to eczema flares"
  - "Found in 73% of 'sensitive skin' products"

- **Final slide (Close the gap)**: Satisfying conclusion + soft CTA
  - Summarize the key takeaway
  - "Scan before you buy" or similar

## Text Guidelines
- Max 10 words per slide
- Be specific, not vague
- Name actual ingredients when filling the gap
- Don't reveal everything on slide 1

## Text Position
- "top" - default, safest placement
- "center" - for emphasis on key facts
- "bottom-safe" - for conclusions/CTAs

Generate a slideshow now. Be specific and educational.
`;
}

/**
 * Call Grok API to generate slideshow content
 */
export async function generateContent(apiKey) {
  const contentDirection = loadContentDirection();
  const prompt = buildPrompt(contentDirection);

  console.log('Calling Grok API...');

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-4-1-fast',
      messages: [
        {
          role: 'system',
          content: 'You are a viral TikTok content strategist. Always respond with valid JSON only, no markdown code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.8
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const rawContent = data.choices[0].message.content;

  // Parse JSON from response (handle potential markdown code blocks)
  let content;
  try {
    // Try to extract JSON from markdown code block if present
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
    content = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse Grok response:', rawContent);
    throw new Error('Failed to parse JSON from Grok response');
  }

  console.log(`Generated content for: ${content.topic}`);
  console.log(`Slides: ${content.slides.length}`);

  return content;
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  import('dotenv').then(dotenv => {
    dotenv.config({ path: path.join(__dirname, '..', '.env') });

    generateContent(process.env.XAI_API_KEY)
      .then(content => {
        console.log('\n--- Generated Content ---\n');
        console.log(JSON.stringify(content, null, 2));
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  });
}
