#!/usr/bin/env node
/**
 * Quick Prompt Iteration Script
 *
 * Runs ONLY research + content generation (no image gen, no screenshots, no upload)
 * Use this to quickly iterate on prompts in prompts.js
 *
 * Usage: node code/iterate-prompts.js
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { orchestrateContentGeneration } from './ai-orchestrator.js';
import { GROK_TEMPERATURE } from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error('XAI_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('========================================');
  console.log('   Prompt Iteration Mode');
  console.log(`   Temperature: ${GROK_TEMPERATURE}`);
  console.log('========================================\n');

  const startTime = Date.now();

  try {
    const content = await orchestrateContentGeneration(apiKey);

    // Remove internal fields for cleaner output
    delete content._researchContext;
    delete content._productImages;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n========================================');
    console.log('   GENERATED CONTENT');
    console.log('========================================\n');

    console.log(`Topic: ${content.topic}`);
    console.log(`Hook: ${content.hook}`);
    console.log(`Slides: ${content.slides.length}`);
    console.log(`Time: ${elapsed}s\n`);

    console.log('--- SLIDES ---\n');
    for (const slide of content.slides) {
      console.log(`Slide ${slide.slide_number}:`);
      console.log(`  Text: "${slide.text_overlay}"`);
      console.log(`  Image: ${slide.image_source}${slide.use_product_image ? ` (product #${slide.use_product_image})` : ''}`);
      if (slide.has_screenshot) {
        console.log(`  Screenshot: YES (${slide.screenshot_ingredients?.length || 0} ingredients)`);
      }
      console.log('');
    }

    console.log('--- CAPTION ---\n');
    console.log(content.caption);
    console.log('');

    console.log('--- HASHTAGS ---');
    console.log(content.hashtags.map(h => `#${h}`).join(' '));
    console.log('');

    // Save to temp file for reference
    const outputPath = path.join(__dirname, '..', 'output', 'latest-iteration.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(content, null, 2));
    console.log(`\nSaved to: ${outputPath}`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
