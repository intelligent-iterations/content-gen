/**
 * Demo script: Upload existing slideshow to TikTok drafts
 *
 * Usage: node code/demo-tiktok-upload.js [output-folder]
 *
 * This script demonstrates the TikTok Content Posting API integration:
 * 1. Loads existing slides from output folder
 * 2. Initializes TikTok photo post with FILE_UPLOAD method
 * 3. Uploads images directly to TikTok's servers
 * 4. Posts to TikTok with caption and hashtags
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;

/**
 * Upload image to Litterbox (temporary file hosting, 72 hour retention)
 */
async function uploadToLitterbox(imageBuffer, filename) {
  console.log(`   Uploading ${filename}...`);

  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '72h');
  formData.append('fileToUpload', new Blob([imageBuffer], { type: 'image/jpeg' }), filename);

  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    // Fallback to catbox if litterbox fails
    console.log(`   Litterbox failed (${response.status}), trying catbox...`);
    return uploadToCatbox(imageBuffer, filename);
  }

  const url = await response.text();
  console.log(`   ✓ ${url.trim()}`);
  return url.trim();
}

/**
 * Upload image to Catbox.moe (free image hosting)
 */
async function uploadToCatbox(imageBuffer, filename) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', new Blob([imageBuffer], { type: 'image/jpeg' }), filename);

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Catbox upload failed: ${response.status}`);
  }

  const url = await response.text();
  console.log(`   ✓ ${url.trim()}`);
  return url.trim();
}

/**
 * Post to TikTok Content Posting API with PULL_FROM_URL
 */
async function postToTikTok(imageUrls, caption, hashtags) {
  const hashtagString = hashtags.map(h => `#${h}`).join(' ');
  const fullCaption = `${caption} ${hashtagString}`.substring(0, 150);

  console.log('\n3. Posting to TikTok...');
  console.log(`   Caption: ${caption}`);
  console.log(`   Hashtags: ${hashtagString}`);
  console.log(`   Images: ${imageUrls.length}`);

  const requestBody = {
    post_info: {
      description: fullCaption,
      privacy_level: 'SELF_ONLY'
    },
    source_info: {
      source: 'PULL_FROM_URL',
      photo_images: imageUrls,
      photo_cover_index: 0
    },
    post_mode: 'DIRECT_POST',
    media_type: 'PHOTO'
  };

  console.log('   Request:', JSON.stringify(requestBody, null, 2));

  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TIKTOK_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const result = await response.json();
  console.log('   Response:', JSON.stringify(result, null, 2));

  if (result.error && result.error.code !== 'ok') {
    throw new Error(`TikTok API Error: ${result.error.code} - ${result.error.message}`);
  }

  return result;
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  TikTok Slideshow Upload Demo');
  console.log('  thepom.app');
  console.log('========================================');
  console.log('');

  // Check for access token
  if (!TIKTOK_ACCESS_TOKEN) {
    console.error('Error: TIKTOK_ACCESS_TOKEN not set in .env');
    process.exit(1);
  }

  // Find output folder
  const outputDir = path.join(__dirname, '..', 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
    .sort()
    .reverse();

  const folderArg = process.argv[2];
  const folder = folderArg
    ? path.join(outputDir, folderArg)
    : path.join(outputDir, folders[0]);

  console.log(`1. Loading slides from: ${path.basename(folder)}`);

  // Load metadata
  const metadataPath = path.join(folder, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error('Error: metadata.json not found');
    process.exit(1);
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

  // Find all slide images
  const slideFiles = fs.readdirSync(folder)
    .filter(f => f.startsWith('slide_') && (f.endsWith('.jpg') || f.endsWith('.png')))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0]);
      const numB = parseInt(b.match(/\d+/)[0]);
      return numA - numB;
    });

  console.log(`   Found ${slideFiles.length} slides`);
  console.log(`   Topic: ${metadata.topic}`);

  // Limit to 35 images max for TikTok
  const limitedSlides = slideFiles.slice(0, 35);
  console.log(`   Using: ${limitedSlides.length} slides`);
  console.log('');

  // Upload all images
  console.log('2. Uploading images...');
  const imageUrls = [];

  for (const slideFile of limitedSlides) {
    const slidePath = path.join(folder, slideFile);
    let imageBuffer = fs.readFileSync(slidePath);

    // Convert PNG to JPG if needed (TikTok only accepts JPG/WEBP)
    if (slideFile.endsWith('.png')) {
      imageBuffer = await sharp(imageBuffer)
        .jpeg({ quality: 92 })
        .toBuffer();
    }

    const url = await uploadToLitterbox(imageBuffer, slideFile.replace('.png', '.jpg'));
    imageUrls.push(url);

    // Small delay between uploads to avoid rate limiting
    await new Promise(r => setTimeout(r, 800));
  }

  // Post to TikTok
  const caption = metadata.caption || `${metadata.topic} - Scan ingredients with pom app!`;
  const hashtags = metadata.hashtags?.slice(0, 5) || ['skincare', 'pomapp', 'ingredients', 'beauty', 'viral'];

  const result = await postToTikTok(imageUrls, caption, hashtags);

  console.log('');
  console.log('========================================');
  console.log('  ✓ Upload Complete!');
  console.log('========================================');
  console.log('');
  console.log(`Publish ID: ${result.data?.publish_id}`);
  console.log('');
  console.log('Check your TikTok app:');
  console.log('  Inbox → System notifications → "Your content is ready"');
  console.log('');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
