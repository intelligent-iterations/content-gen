/**
 * Test TikTok upload with an existing slideshow folder
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { uploadAllImages, uploadToTikTokDrafts, getCreatorInfo } from './upload-to-tiktok.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: node test-tiktok-upload.js <output-folder-name>');
  process.exit(1);
}

const outputFolder = path.isAbsolute(folder)
  ? folder
  : path.join(__dirname, '..', 'output', folder);

async function main() {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('TIKTOK_ACCESS_TOKEN not set in .env');
    process.exit(1);
  }

  // Load metadata
  const metadata = JSON.parse(fs.readFileSync(path.join(outputFolder, 'metadata.json'), 'utf-8'));
  console.log(`Topic: ${metadata.topic}`);
  console.log(`Hook: ${metadata.hook}`);

  // Step 1: Check creator info first
  console.log('\n--- Checking creator info ---');
  try {
    const info = await getCreatorInfo(accessToken);
    console.log('Creator Info:', JSON.stringify(info, null, 2));
  } catch (err) {
    console.error('Creator info failed:', err.message);
    console.log('Token may be expired. Run: npm run oauth');
    process.exit(1);
  }

  // Step 2: Load slide files
  console.log('\n--- Loading slides ---');
  const slides = [];
  for (let i = 1; i <= 20; i++) {
    const png = path.join(outputFolder, `slide_${i}.png`);
    const jpg = path.join(outputFolder, `slide_${i}.jpg`);
    if (fs.existsSync(png)) {
      slides.push({
        processedImage: fs.readFileSync(png),
        slideType: 'screenshot',
      });
      console.log(`  Loaded slide_${i}.png (screenshot)`);
    } else if (fs.existsSync(jpg)) {
      slides.push({
        processedImage: fs.readFileSync(jpg),
        slideType: 'product',
      });
      console.log(`  Loaded slide_${i}.jpg (product)`);
    } else {
      break;
    }
  }
  console.log(`Total: ${slides.length} slides`);

  // Step 3: Upload images to get public URLs
  console.log('\n--- Uploading images to Catbox ---');
  const imageUrls = await uploadAllImages(slides);
  console.log('Image URLs:', imageUrls);

  // Step 4: Post to TikTok drafts
  console.log('\n--- Posting to TikTok ---');
  const result = await uploadToTikTokDrafts(
    accessToken,
    imageUrls,
    metadata.caption,
    metadata.hashtags
  );
  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
