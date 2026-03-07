/**
 * Test image generation (Replicate or Grok)
 * Usage: node test-flux.js [grok|replicate]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { generateImage, downloadImage, IMAGE_MODELS } from './generate-image.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testImageGeneration() {
  // Parse CLI args
  const modelArg = process.argv[2]?.toLowerCase();
  const model = modelArg === 'grok' ? IMAGE_MODELS.grok : IMAGE_MODELS.replicate;

  const modelLabel = model === IMAGE_MODELS.grok ? 'Grok' : 'Replicate/Seedream';
  console.log(`Testing ${modelLabel} image generation...\n`);

  const tokens = {
    replicateToken: process.env.REPLICATE_API_TOKEN,
    xaiApiKey: process.env.XAI_API_KEY
  };

  // Validate required tokens
  if (model === IMAGE_MODELS.grok) {
    if (!tokens.xaiApiKey) {
      console.error('ERROR: XAI_API_KEY not set in .env file');
      process.exit(1);
    }
    console.log('API Key:', tokens.xaiApiKey.substring(0, 10) + '...');
  } else {
    if (!tokens.replicateToken) {
      console.error('ERROR: REPLICATE_API_TOKEN not set in .env file');
      process.exit(1);
    }
    console.log('API Token:', tokens.replicateToken.substring(0, 10) + '...');
  }
  console.log();

  const testPrompt = '9:16 vertical aspect ratio, clean minimal gradient background transitioning from soft pink to light purple, abstract floating molecular structures and chemical bonds, wellness and health aesthetic, ethereal glow, no text, ample space at top third for text overlay';

  console.log('Test prompt:');
  console.log(testPrompt);
  console.log();

  try {
    console.log('Generating image...');
    const imageUrl = await generateImage(tokens, testPrompt, { model });

    console.log('\nImage URL:', imageUrl);

    // Download and save
    console.log('\nDownloading image...');
    const imageBuffer = await downloadImage(imageUrl);

    const outputPath = path.join(__dirname, '..', 'output', `test-${model}.jpg`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, imageBuffer);

    console.log(`Saved to: ${outputPath}`);

    console.log('\n========================================');
    console.log(`${modelLabel} API is working correctly!`);
    console.log('========================================');

  } catch (error) {
    console.error('\nERROR:', error.message);
    process.exit(1);
  }
}

testImageGeneration();
