/**
 * Auto-post AI video variants as Instagram Reels
 *
 * Posts 3 AI videos per run from AI_VIDEOS.md (Hook Variants table),
 * skipping already posted ones. Tracks posted videos in INSTAGRAM_POSTED_AI_VIDEOS.md.
 *
 * Usage:
 *   node code/auto-post-instagram-ai-video.js
 *   node code/auto-post-instagram-ai-video.js --dry-run
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

const POSTS_PER_RUN = 1;

// --- PATHS ---
const AI_VIDEOS_PATH = path.join(__dirname, '..', 'AI_VIDEOS.md');
const POSTED_PATH = path.join(__dirname, '..', 'INSTAGRAM_POSTED_AI_VIDEOS.md');

/**
 * Parse AI_VIDEOS.md Hook Variants table
 * Returns array of { number, video, hook, videoPath, captionPath }
 */
function parseAIVideos() {
  const content = fs.readFileSync(AI_VIDEOS_PATH, 'utf-8');
  const videos = [];

  // Match variant table rows: | 1.1 | Video | Hook | [watch](path) | caption |
  const rows = content.matchAll(/\|\s*([\d.]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*\[watch\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|/g);

  for (const match of rows) {
    const number = match[1].trim();
    const video = match[2].trim();
    const hook = match[3].trim();
    const videoPath = match[4].trim();
    const captionCell = match[5].trim();

    // Extract caption path if it exists
    let captionPath = null;
    const captionMatch = captionCell.match(/\[caption\]\(([^)]+)\)/);
    if (captionMatch) {
      captionPath = captionMatch[1];
    }

    videos.push({ number, video, hook, videoPath, captionPath });
  }

  return videos;
}

/**
 * Get already posted variant numbers from tracker
 */
function getPostedNumbers() {
  try {
    const content = fs.readFileSync(POSTED_PATH, 'utf-8');
    const numbers = [];

    const matches = content.matchAll(/\*\*Video #:\*\*\s*([\d.]+)/g);
    for (const match of matches) {
      numbers.push(match[1]);
    }

    return numbers;
  } catch (e) {
    return [];
  }
}

/**
 * Upload video to Firebase Storage and get signed URL
 */
async function uploadVideoToFirebase(localPath, remotePath) {
  const file = bucket.file(remotePath);

  await bucket.upload(localPath, {
    destination: remotePath,
    metadata: {
      contentType: 'video/mp4'
    }
  });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000 // 2 hours for video processing
  });

  return signedUrl;
}

/**
 * Wait for Instagram media container to finish processing
 */
async function waitForProcessing(containerId, maxWaitMs = 120000) {
  const startTime = Date.now();
  const pollInterval = 5000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await axios.get(`https://graph.facebook.com/v19.0/${containerId}`, {
        params: {
          fields: 'status_code',
          access_token: ACCESS_TOKEN
        }
      });

      const status = response.data.status_code;
      console.log(`  Processing status: ${status}`);

      if (status === 'FINISHED') {
        return true;
      }
      if (status === 'ERROR') {
        throw new Error('Instagram video processing failed');
      }
    } catch (e) {
      if (e.message === 'Instagram video processing failed') throw e;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Video processing timed out after ${maxWaitMs / 1000}s`);
}

/**
 * Add entry to posted tracker
 */
function addToPosted(video, postId, postUrl) {
  const date = new Date().toISOString().split('T')[0];

  let content = '';
  try {
    content = fs.readFileSync(POSTED_PATH, 'utf-8');
  } catch (e) {
    content = `# Instagram Posted AI Videos Tracker\n\n> Track AI video Reels posted to Instagram from AI_VIDEOS.md\n\n---\n`;
  }

  const entry = `
## ${date}

### #${video.number} - ${video.video} (hook: ${video.hook})
**Video #:** ${video.number}
**Posted:** ${date}
**Post ID:** ${postId}
**URL:** ${postUrl}

---
`;

  content += entry;
  fs.writeFileSync(POSTED_PATH, content);
}

/**
 * Post a single video to Instagram
 */
async function postOneVideo(video) {
  const videoFilePath = path.join(__dirname, '..', video.videoPath);
  if (!fs.existsSync(videoFilePath)) {
    console.error(`  File not found: ${video.videoPath}`);
    return null;
  }

  const fileSizeMB = (fs.statSync(videoFilePath).size / (1024 * 1024)).toFixed(1);
  console.log(`  File: ${video.videoPath} (${fileSizeMB} MB)`);

  // Load caption
  let caption = `${video.video} #pom #ingredients`;
  if (video.captionPath) {
    const captionFilePath = path.join(__dirname, '..', video.captionPath);
    if (fs.existsSync(captionFilePath)) {
      caption = fs.readFileSync(captionFilePath, 'utf-8').trim();
      console.log(`  Caption loaded (${caption.length} chars)`);
    }
  } else {
    console.log(`  No caption file, using default`);
  }

  // Upload to Firebase
  const remotePath = `instagram-reels/ai-video-${video.number}-${Date.now()}.mp4`;
  console.log('  Uploading to Firebase...');
  const videoUrl = await uploadVideoToFirebase(videoFilePath, remotePath);

  // Create Reels container
  console.log('  Creating Reels container...');
  const containerResponse = await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption: caption,
    share_to_feed: true,
    access_token: ACCESS_TOKEN
  });

  const containerId = containerResponse.data.id;
  console.log(`  Container ID: ${containerId}`);

  // Wait for processing
  console.log('  Processing...');
  await waitForProcessing(containerId);

  // Publish
  console.log('  Publishing...');
  const publishResponse = await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`, {
    creation_id: containerId,
    access_token: ACCESS_TOKEN
  });

  const postId = publishResponse.data.id;

  // Get permalink
  let postUrl = 'https://www.instagram.com/thepom.app/';
  try {
    const permalinkResponse = await axios.get(`https://graph.facebook.com/v19.0/${postId}`, {
      params: { fields: 'permalink', access_token: ACCESS_TOKEN }
    });
    postUrl = permalinkResponse.data.permalink || postUrl;
  } catch (e) { /* use default */ }

  addToPosted(video, postId, postUrl);
  return { postId, postUrl };
}

/**
 * Main auto-post function
 */
async function autoPostAIVideo() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(50));
  console.log('  Instagram AI Video Auto-Poster (1/run, 3x/day)');
  console.log('  ' + new Date().toISOString());
  if (dryRun) console.log('  ** DRY RUN **');
  console.log('='.repeat(50));
  console.log();

  // Parse variant videos
  const allVideos = parseAIVideos();
  console.log(`Total variants: ${allVideos.length}`);

  // Get already posted
  const postedNumbers = getPostedNumbers();
  console.log(`Already posted: ${postedNumbers.length} (${postedNumbers.join(', ') || 'none'})`);

  // Find unposted
  const unposted = allVideos.filter(v => !postedNumbers.includes(v.number));
  console.log(`Unposted: ${unposted.length}`);

  if (unposted.length === 0) {
    console.log('\nNo unposted variants available!');
    return { success: false, reason: 'no_unposted_content' };
  }

  // Pick up to POSTS_PER_RUN unposted (in table order = interleaved across topics)
  const batch = unposted.slice(0, POSTS_PER_RUN);
  console.log(`\nPosting ${batch.length} video(s) this run:\n`);

  const results = [];

  for (let i = 0; i < batch.length; i++) {
    const video = batch[i];
    console.log(`--- [${i + 1}/${batch.length}] #${video.number} - ${video.video} (hook: ${video.hook}) ---`);

    if (dryRun) {
      console.log(`  [dry-run] Would post: ${video.videoPath}\n`);
      results.push({ number: video.number, dryRun: true });
      continue;
    }

    try {
      const result = await postOneVideo(video);
      if (result) {
        console.log(`  Posted! ${result.postUrl}\n`);
        results.push({ number: video.number, ...result });
      }

      // 30s cooldown between posts to avoid IG rate limits
      if (i < batch.length - 1) {
        console.log('  [cooldown] 30s before next post...\n');
        await new Promise(r => setTimeout(r, 30000));
      }
    } catch (err) {
      console.error(`  FAILED: ${err.response?.data?.error?.message || err.message}`);
      if (err.response?.data?.error) {
        console.error(`  Details: ${JSON.stringify(err.response.data.error)}`);
      }
      console.log();
    }
  }

  console.log('='.repeat(50));
  console.log(`  Done! Posted ${results.length}/${batch.length}`);
  console.log('='.repeat(50));

  return { success: true, posted: results };
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  autoPostAIVideo()
    .then(result => {
      if (result.success) {
        console.log(`\nAuto-post complete! ${result.posted.length} video(s) posted.`);
      } else {
        console.log(`\nNo post made: ${result.reason}`);
      }
    })
    .catch(err => {
      console.error('\nError:', err.message);
      process.exit(1);
    });
}

export { autoPostAIVideo };
