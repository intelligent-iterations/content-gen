/**
 * TikTok Content Posting API integration
 * Uploads photo slideshows to TikTok via Firebase Storage + media.thepom.app
 *
 * Note: TikTok only accepts JPG/WEBP (no PNG), so screenshots are converted to JPG
 */

import sharp from 'sharp';
import admin from 'firebase-admin';

const FIREBASE_BUCKET = 'intelligentiterations-2a947.appspot.com';
const MEDIA_BASE_URL = 'https://media.thepom.app';

// Initialize Firebase Admin (uses Application Default Credentials)
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: FIREBASE_BUCKET,
  });
}

/**
 * Upload an image to Firebase Storage and return a media.thepom.app URL
 * Files are stored at gs://BUCKET/tiktok/<filename>
 * Served via Cloud Function at https://media.thepom.app/<filename>
 */
export async function uploadToFirebaseStorage(imageBuffer, filename) {
  const bucket = admin.storage().bucket();
  const destination = `tiktok/${filename}`;
  const file = bucket.file(destination);

  const contentType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';

  await file.save(imageBuffer, {
    metadata: { contentType },
  });

  const publicUrl = `${MEDIA_BASE_URL}/${filename}`;
  console.log(`    Uploaded to Firebase Storage: ${publicUrl}`);
  return publicUrl;
}

/**
 * Upload all processed slides to Firebase Storage and get public URLs
 * TikTok only accepts JPG/WEBP, so PNG screenshots are converted to JPG
 */
export async function uploadAllImages(slides) {
  const urls = [];
  const timestamp = Date.now();

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const filename = `slide_${timestamp}_${i + 1}.jpg`;

    // Convert PNG screenshots to JPG (TikTok doesn't accept PNG)
    let imageBuffer = slide.processedImage;
    if (slide.slideType === 'screenshot') {
      console.log(`  Converting slide ${i + 1} from PNG to JPG...`);
      imageBuffer = await sharp(slide.processedImage)
        .jpeg({ quality: 92 })
        .toBuffer();
    }

    console.log(`  Uploading slide ${i + 1} to Firebase Storage...`);
    const url = await uploadToFirebaseStorage(imageBuffer, filename);
    urls.push(url);

    // Small delay between uploads
    await new Promise(r => setTimeout(r, 300));
  }

  return urls;
}

/**
 * Upload slide files from disk to Firebase Storage
 * Used by tiktok-posting-ui.js for folder-based uploads
 */
export async function uploadSlideFiles(slidePaths) {
  const urls = [];
  const timestamp = Date.now();

  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i];
    const fs = await import('fs');

    let imageBuffer = fs.readFileSync(slidePath);
    const filename = `slide_${timestamp}_${i + 1}.jpg`;

    // Convert PNG to JPG if needed (TikTok doesn't accept PNG)
    if (slidePath.endsWith('.png')) {
      console.log(`  Converting slide ${i + 1} from PNG to JPG...`);
      imageBuffer = await sharp(imageBuffer)
        .jpeg({ quality: 92 })
        .toBuffer();
    }

    console.log(`  Uploading slide ${i + 1} to Firebase Storage...`);
    const url = await uploadToFirebaseStorage(imageBuffer, filename);
    urls.push(url);

    await new Promise(r => setTimeout(r, 300));
  }

  return urls;
}

/**
 * Create a photo post on TikTok using PULL_FROM_URL
 */
export async function uploadToTikTokDrafts(accessToken, imageUrls, caption, hashtags = []) {
  // Build full caption with hashtags
  const hashtagString = hashtags.map(h => `#${h}`).join(' ');
  const fullCaption = `${caption}\n\n${hashtagString}`.substring(0, 2200); // TikTok limit

  console.log('Uploading to TikTok...');
  console.log(`  Images: ${imageUrls.length}`);
  console.log(`  Caption length: ${fullCaption.length} characters`);

  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
      post_info: {
        title: fullCaption.substring(0, 90), // title max 90 chars
        description: fullCaption.substring(0, 4000), // description max 4000 chars
        disable_comment: false,
        privacy_level: 'SELF_ONLY',
        auto_add_music: true
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_images: imageUrls,
        photo_cover_index: 0
      }
    })
  });

  const result = await response.json();

  if (result.error && result.error.code !== 'ok') {
    throw new Error(`TikTok API Error: ${result.error.code} - ${result.error.message}`);
  }

  console.log('Upload successful!');
  console.log(`Publish ID: ${result.data?.publish_id}`);

  return {
    publishId: result.data?.publish_id,
    status: 'uploaded_to_drafts'
  };
}

/**
 * Check the status of a published post
 */
export async function checkPostStatus(accessToken, publishId) {
  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      publish_id: publishId
    })
  });

  const result = await response.json();

  if (result.error && result.error.code !== 'ok') {
    throw new Error(`TikTok Status Error: ${result.error.code} - ${result.error.message}`);
  }

  return result.data;
}

/**
 * Get creator info (useful for debugging)
 */
export async function getCreatorInfo(accessToken) {
  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  const result = await response.json();
  return result.data;
}

// CLI usage
import { fileURLToPath } from 'url';
import path from 'path';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  import('dotenv').then(async (dotenv) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    dotenv.config({ path: path.join(__dirname, '..', '.env') });

    const accessToken = process.env.TIKTOK_ACCESS_TOKEN;

    if (!accessToken) {
      console.error('TIKTOK_ACCESS_TOKEN not set. Run: npm run oauth');
      process.exit(1);
    }

    try {
      console.log('Fetching creator info...');
      const info = await getCreatorInfo(accessToken);
      console.log('Creator Info:', JSON.stringify(info, null, 2));
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });
}
