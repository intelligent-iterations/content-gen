/**
 * Post carousel to Instagram using Firebase Storage for image hosting
 *
 * Usage:
 *   node code/post-to-instagram.js <folder-path>
 *   node code/post-to-instagram.js 2026-02-04T16-30-05_hidden-dangers-in-household-cl
 */

import axios from 'axios';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- FIREBASE CONFIGURATION ---
const serviceAccountPath = '/Users/lucy/pom/mcp-pom-functions/pom-service-accounts/dev.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

// Initialize Firebase only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'scany-dev.appspot.com'
  });
}

const bucket = admin.storage().bucket();

// --- INSTAGRAM CONFIGURATION ---
const IG_USER_ID = '17841467650044681';
const ACCESS_TOKEN = 'EAASDg0n1GZC0BQo3UjlXZBQiUFhxaFm9iRlapa083m9xZBGBzFDPCZCmtEF8XYlkT3pbwmkmdHv5HcBksMbWD7ZBcS6BjBnfGtVBt0K60APzLPKnU8NdZCZBLT3RLFC82ECV9HNaDXJlLUFfu9avjCOWU5PEsGwUtbGh48LJXAVJ910i3tUyxcwGFQZC3j0F';

// --- POSTED VIDEOS TRACKING ---
const POSTED_INSTAGRAM_PATH = path.join(__dirname, '..', 'INSTAGRAM_POSTED_VIDEOS.md');

/**
 * Load already posted Instagram videos
 */
function loadPostedInstagramVideos() {
  try {
    if (fs.existsSync(POSTED_INSTAGRAM_PATH)) {
      return fs.readFileSync(POSTED_INSTAGRAM_PATH, 'utf-8');
    }
  } catch (e) {
    // File doesn't exist yet
  }
  return '';
}

/**
 * Check if a folder has already been posted
 */
function isAlreadyPosted(folderName) {
  const posted = loadPostedInstagramVideos();
  return posted.includes(folderName);
}

/**
 * Add entry to posted videos file
 */
function addToPostedVideos(folderName, metadata, postId, postUrl) {
  const date = new Date().toISOString().split('T')[0];

  let content = loadPostedInstagramVideos();

  // Initialize file if empty
  if (!content) {
    content = `# Instagram Posted Videos Tracker

> Track Instagram carousel posts from the pom video generator

---

`;
  }

  // Add new entry
  const entry = `
## ${date}

### ${metadata.topic}
**Folder:** \`${folderName}\`
**Posted:** ${date}
**Post ID:** ${postId}
**URL:** ${postUrl}

**Caption preview:** ${metadata.caption?.substring(0, 100)}...

**Slides:** ${metadata.slides?.length || 'unknown'}

---
`;

  content += entry;
  fs.writeFileSync(POSTED_INSTAGRAM_PATH, content);
  console.log(`  Added to ${POSTED_INSTAGRAM_PATH}`);
}

/**
 * Upload image to Firebase Storage and get signed URL
 */
async function uploadAndGetSignedUrl(localPath, remotePath) {
  const file = bucket.file(remotePath);

  // Upload the file
  await bucket.upload(localPath, {
    destination: remotePath,
    metadata: {
      contentType: localPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
    }
  });

  // Generate signed URL valid for 1 hour
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000
  });

  return signedUrl;
}

/**
 * Post carousel to Instagram
 */
async function postToInstagram(folderPath) {
  // Resolve folder path
  if (!path.isAbsolute(folderPath)) {
    if (folderPath.startsWith('output/')) {
      folderPath = path.join(__dirname, '..', folderPath);
    } else {
      folderPath = path.join(__dirname, '..', 'output', folderPath);
    }
  }

  // Check for instagram subfolder
  const instagramFolder = path.join(folderPath, 'instagram');
  const useInstagramFolder = fs.existsSync(instagramFolder);
  const imageFolder = useInstagramFolder ? instagramFolder : folderPath;

  console.log('='.repeat(50));
  console.log('  Instagram Carousel Poster');
  console.log('='.repeat(50));
  console.log();

  // Load metadata
  const metadataPath = path.join(folderPath, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error(`No metadata.json found in ${folderPath}`);
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  const folderName = path.basename(folderPath);

  console.log(`Topic: ${metadata.topic}`);
  console.log(`Folder: ${folderName}`);
  console.log(`Using: ${useInstagramFolder ? 'instagram/ (4:5 cropped)' : 'original (9:16)'}`);
  console.log();

  // Check if already posted
  if (isAlreadyPosted(folderName)) {
    console.error(`This folder has already been posted to Instagram!`);
    console.error(`Check ${POSTED_INSTAGRAM_PATH} for details.`);
    process.exit(1);
  }

  // Find all slide images
  const slideFiles = fs.readdirSync(imageFolder)
    .filter(f => f.startsWith('slide_') && (f.endsWith('.jpg') || f.endsWith('.png')))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide_(\d+)/)[1]);
      const numB = parseInt(b.match(/slide_(\d+)/)[1]);
      return numA - numB;
    });

  if (slideFiles.length === 0) {
    console.error('No slide images found!');
    process.exit(1);
  }

  console.log(`Found ${slideFiles.length} slides`);

  // Build caption (Instagram limit is 2200 characters)
  const hashtags = '\n\n' + metadata.hashtags.map(h => `#${h}`).join(' ');
  const maxCaptionLength = 2200 - hashtags.length;
  let captionText = metadata.caption || '';

  // Truncate caption if needed, try to end at a sentence
  if (captionText.length > maxCaptionLength) {
    captionText = captionText.substring(0, maxCaptionLength - 3);
    // Try to end at last complete sentence
    const lastPeriod = captionText.lastIndexOf('.');
    const lastQuestion = captionText.lastIndexOf('?');
    const lastExclaim = captionText.lastIndexOf('!');
    const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);
    if (lastSentence > maxCaptionLength * 0.7) {
      captionText = captionText.substring(0, lastSentence + 1);
    } else {
      captionText += '...';
    }
  }

  const caption = captionText + hashtags;

  try {
    console.log('\n🚀 Starting Carousel Upload...\n');
    const itemIds = [];

    // Step 1: Upload images to Firebase and create Instagram item containers
    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = slideFiles[i];
      const localPath = path.join(imageFolder, slideFile);
      const remotePath = `instagram-posts/${folderName}/${slideFile}`;

      console.log(`📤 Uploading slide ${i + 1}/${slideFiles.length}: ${slideFile}`);

      // Upload to Firebase and get signed URL
      const publicUrl = await uploadAndGetSignedUrl(localPath, remotePath);

      console.log(`📦 Creating item container...`);
      const response = await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media`, {
        image_url: publicUrl,
        is_carousel_item: true,
        access_token: ACCESS_TOKEN
      });

      itemIds.push(response.data.id);
      console.log(`   ✓ Container ID: ${response.data.id}`);
    }

    // Step 2: Create carousel container
    console.log('\n🔗 Creating carousel container...');
    const carouselResponse = await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media`, {
      media_type: 'CAROUSEL',
      caption: caption,
      children: itemIds.join(','),
      access_token: ACCESS_TOKEN
    });

    const carouselContainerId = carouselResponse.data.id;
    console.log(`   ✓ Carousel ID: ${carouselContainerId}`);

    // Step 3: Wait for processing
    console.log('\n⏳ Waiting 10 seconds for Instagram to process...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Step 4: Publish
    console.log('\n✅ Publishing to feed...');
    const publishResponse = await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`, {
      creation_id: carouselContainerId,
      access_token: ACCESS_TOKEN
    });

    const postId = publishResponse.data.id;

    // Get the permalink
    let postUrl = `https://www.instagram.com/thepom.app/`;
    try {
      const permalinkResponse = await axios.get(`https://graph.facebook.com/v19.0/${postId}`, {
        params: {
          fields: 'permalink',
          access_token: ACCESS_TOKEN
        }
      });
      postUrl = permalinkResponse.data.permalink || postUrl;
    } catch (e) {
      // Use default URL if permalink fetch fails
    }

    console.log('\n' + '='.repeat(50));
    console.log('  🎉 SUCCESS!');
    console.log('='.repeat(50));
    console.log();
    console.log(`Post ID: ${postId}`);
    console.log(`URL: ${postUrl}`);
    console.log();

    // Add to posted videos tracker
    addToPostedVideos(folderName, metadata, postId, postUrl);

    return { postId, postUrl };

  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    if (error.response?.data?.error) {
      console.error('Details:', JSON.stringify(error.response.data.error, null, 2));
    }
    process.exit(1);
  }
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Get most recent folder with instagram/ subfolder
    const outputDir = path.join(__dirname, '..', 'output');
    const folders = fs.readdirSync(outputDir)
      .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
      .filter(f => !f.startsWith('.') && !f.startsWith('test') && !f.startsWith('integration'))
      .filter(f => fs.existsSync(path.join(outputDir, f, 'instagram')))
      .sort()
      .reverse();

    if (folders.length === 0) {
      console.error('No folders with instagram/ subfolder found.');
      console.error('Run: node code/crop-for-instagram.js <folder>');
      process.exit(1);
    }

    // Find next unposted folder (most recent first)
    const nextFolder = folders.find(f => !isAlreadyPosted(path.basename(f)));
    if (!nextFolder) {
      console.log('All folders have already been posted to Instagram.');
      process.exit(0);
    }

    console.log('No folder specified, using next unposted (most recent first):');
    console.log(`  ${nextFolder}`);
    console.log();

    postToInstagram(nextFolder);
  } else {
    postToInstagram(args[0]);
  }
}

export { postToInstagram };
