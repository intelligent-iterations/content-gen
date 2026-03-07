/**
 * Test all API integrations
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testAll() {
  console.log('========================================');
  console.log('   Testing All API Integrations');
  console.log('========================================\n');

  const results = {
    grok: false,
    flux: false,
    overlay: false,
    tiktok: false
  };

  // Test 1: Grok API
  console.log('1. Testing Grok API...');
  try {
    const { generateContent } = await import('./generate-content.js');
    const content = await generateContent(process.env.XAI_API_KEY);
    console.log(`   OK - Generated: "${content.topic}"`);
    results.grok = true;
  } catch (error) {
    console.log(`   FAILED: ${error.message}`);
  }
  console.log();

  // Test 2: Image Generation API (Replicate)
  console.log('2. Testing Replicate/Seedream API...');
  try {
    const { generateImage } = await import('./generate-image.js');
    const tokens = {
      replicateToken: process.env.REPLICATE_API_TOKEN,
      xaiApiKey: process.env.XAI_API_KEY
    };
    const url = await generateImage(
      tokens,
      '9:16 vertical, simple gradient background pink to purple, minimal, no text',
      { model: 'replicate' }
    );
    console.log(`   OK - Generated image`);
    results.flux = true;
  } catch (error) {
    console.log(`   FAILED: ${error.message}`);
  }
  console.log();

  // Test 3: Text Overlay
  console.log('3. Testing text overlay...');
  try {
    const sharp = await import('sharp');
    const { addTextOverlay } = await import('./add-text-overlay.js');

    const testImage = await sharp.default({
      create: { width: 1080, height: 1920, channels: 4, background: { r: 255, g: 200, b: 220, alpha: 1 } }
    }).png().toBuffer();

    await addTextOverlay(testImage, 'TEST TEXT', 'top');
    console.log('   OK - Overlay working');
    results.overlay = true;
  } catch (error) {
    console.log(`   FAILED: ${error.message}`);
  }
  console.log();

  // Test 4: TikTok API (just check if token exists)
  console.log('4. Checking TikTok configuration...');
  if (process.env.TIKTOK_ACCESS_TOKEN) {
    try {
      const { getCreatorInfo } = await import('./upload-to-tiktok.js');
      await getCreatorInfo(process.env.TIKTOK_ACCESS_TOKEN);
      console.log('   OK - TikTok token valid');
      results.tiktok = true;
    } catch (error) {
      console.log(`   WARNING: Token may be expired - ${error.message}`);
      console.log('   Run: npm run oauth');
    }
  } else {
    console.log('   SKIPPED - No TIKTOK_ACCESS_TOKEN set');
    console.log('   Run: npm run oauth');
  }
  console.log();

  // Summary
  console.log('========================================');
  console.log('   Results');
  console.log('========================================');
  console.log(`   Grok API:      ${results.grok ? 'PASS' : 'FAIL'}`);
  console.log(`   Flux API:      ${results.flux ? 'PASS' : 'FAIL'}`);
  console.log(`   Text Overlay:  ${results.overlay ? 'PASS' : 'FAIL'}`);
  console.log(`   TikTok API:    ${results.tiktok ? 'PASS' : 'SKIP/FAIL'}`);
  console.log();

  const allPassed = results.grok && results.flux && results.overlay;
  if (allPassed) {
    console.log('Core functionality working!');
    if (!results.tiktok) {
      console.log('Run "npm run oauth" to set up TikTok integration.');
    }
  } else {
    console.log('Some tests failed. Check your .env file.');
  }
}

testAll();
