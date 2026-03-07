/**
 * Test Grok API integration
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { generateContent } from './generate-content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testGrok() {
  console.log('Testing Grok API...\n');

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: XAI_API_KEY not set in .env file');
    process.exit(1);
  }

  console.log('API Key:', apiKey.substring(0, 10) + '...');
  console.log();

  try {
    const content = await generateContent(apiKey);

    console.log('\n========================================');
    console.log('SUCCESS! Generated Content:');
    console.log('========================================\n');

    console.log('Topic:', content.topic);
    console.log('Hook:', content.hook);
    console.log();

    console.log('Slides:');
    for (const slide of content.slides) {
      console.log(`  ${slide.slide_number}. "${slide.text_overlay}" (${slide.text_position})`);
    }
    console.log();

    console.log('Caption:');
    console.log(content.caption.substring(0, 200) + '...');
    console.log(`(${content.caption.length} characters)`);
    console.log();

    console.log('Hashtags:', content.hashtags.map(h => `#${h}`).join(' '));

    console.log('\n========================================');
    console.log('Grok API is working correctly!');
    console.log('========================================');

  } catch (error) {
    console.error('\nERROR:', error.message);
    process.exit(1);
  }
}

testGrok();
