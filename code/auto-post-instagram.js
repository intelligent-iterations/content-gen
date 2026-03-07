/**
 * Auto-post to Instagram
 *
 * Picks a TikTok carousel that hasn't been posted to Instagram yet,
 * crops it, and posts it.
 *
 * Usage:
 *   node code/auto-post-instagram.js
 *
 * For n8n, run as HTTP endpoint or via Execute Command node
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processSlideshow } from './crop-for-instagram.js';
import { postToInstagram } from './post-to-instagram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TIKTOK_POSTED_PATH = path.join(__dirname, '..', 'CURRENT_POSTED_VIDEOS.md');
const INSTAGRAM_POSTED_PATH = path.join(__dirname, '..', 'INSTAGRAM_POSTED_VIDEOS.md');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

/**
 * Extract folder names from TikTok posted videos
 */
function getTikTokPostedFolders() {
  try {
    const content = fs.readFileSync(TIKTOK_POSTED_PATH, 'utf-8');
    const folders = [];

    // Match "Output folder: `output/folder-name`" or "**Output folder:** `output/folder-name`"
    const matches = content.matchAll(/\*?\*?Output folder:?\*?\*?\s*`(?:output\/)?([^`]+)`/gi);
    for (const match of matches) {
      folders.push(match[1]);
    }

    return folders;
  } catch (e) {
    console.error('Error reading TikTok posted file:', e.message);
    return [];
  }
}

/**
 * Extract folder names from Instagram posted videos
 */
function getInstagramPostedFolders() {
  try {
    const content = fs.readFileSync(INSTAGRAM_POSTED_PATH, 'utf-8');
    const folders = [];

    // Match "Folder: `folder-name`" or "**Folder:** `folder-name`"
    const matches = content.matchAll(/\*?\*?Folder:?\*?\*?\s*`([^`]+)`/gi);
    for (const match of matches) {
      folders.push(match[1]);
    }

    return folders;
  } catch (e) {
    // File might not exist yet
    return [];
  }
}

/**
 * Find TikTok posts that haven't been posted to Instagram
 */
function getUnpostedFolders() {
  const tiktokFolders = getTikTokPostedFolders();
  const instagramFolders = getInstagramPostedFolders();

  console.log(`TikTok posts: ${tiktokFolders.length}`);
  console.log(`Instagram posts: ${instagramFolders.length}`);

  // Filter out already posted, reverse so newest (last appended) posts first
  const unposted = tiktokFolders.filter(folder => !instagramFolders.includes(folder)).reverse();

  console.log(`Unposted: ${unposted.length}`);

  return unposted;
}

/**
 * Check if a folder exists and has slides
 */
function isValidFolder(folderName) {
  const folderPath = path.join(OUTPUT_DIR, folderName);

  if (!fs.existsSync(folderPath)) {
    return false;
  }

  // Check for metadata.json
  if (!fs.existsSync(path.join(folderPath, 'metadata.json'))) {
    return false;
  }

  // Check for at least one slide
  const files = fs.readdirSync(folderPath);
  const hasSlides = files.some(f => f.startsWith('slide_'));

  return hasSlides;
}

/**
 * Main auto-post function
 */
async function autoPostToInstagram() {
  console.log('='.repeat(50));
  console.log('  Instagram Auto-Poster');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(50));
  console.log();

  // Get unposted folders
  const unposted = getUnpostedFolders();

  if (unposted.length === 0) {
    console.log('No unposted TikTok carousels available!');
    console.log('Generate more content or wait for new TikTok posts.');
    return { success: false, reason: 'no_unposted_content' };
  }

  // Find first valid folder
  let selectedFolder = null;
  for (const folder of unposted) {
    if (isValidFolder(folder)) {
      selectedFolder = folder;
      break;
    } else {
      console.log(`Skipping invalid folder: ${folder}`);
    }
  }

  if (!selectedFolder) {
    console.log('No valid folders found!');
    return { success: false, reason: 'no_valid_folders' };
  }

  console.log(`Selected: ${selectedFolder}`);
  console.log();

  const folderPath = path.join(OUTPUT_DIR, selectedFolder);

  // Check if already cropped for Instagram
  const instagramFolder = path.join(folderPath, 'instagram');
  if (!fs.existsSync(instagramFolder)) {
    console.log('Cropping for Instagram...');
    await processSlideshow(folderPath);
    console.log();
  } else {
    console.log('Already cropped for Instagram');
  }

  // Post to Instagram
  console.log('Posting to Instagram...');
  const result = await postToInstagram(selectedFolder);

  return {
    success: true,
    folder: selectedFolder,
    postId: result.postId,
    postUrl: result.postUrl
  };
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  autoPostToInstagram()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Auto-post complete!');
        console.log(`URL: ${result.postUrl}`);
      } else {
        console.log(`\n⚠️ No post made: ${result.reason}`);
      }
    })
    .catch(err => {
      console.error('\n❌ Error:', err.message);
      process.exit(1);
    });
}

export { autoPostToInstagram, getUnpostedFolders };
