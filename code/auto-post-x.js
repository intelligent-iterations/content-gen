/**
 * Auto-post to X (Twitter)
 *
 * Picks an Instagram-posted carousel that hasn't been posted to X yet
 * and posts it with a Grok-generated caption.
 *
 * Usage:
 *   node code/auto-post-x.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { postToX } from './post-to-x.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INSTAGRAM_POSTED_PATH = path.join(__dirname, '..', 'INSTAGRAM_POSTED_VIDEOS.md');
const X_POSTED_PATH = path.join(__dirname, '..', 'X_POSTED_VIDEOS.md');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

/**
 * Extract folder names from Instagram posted videos
 */
function getInstagramPostedFolders() {
  try {
    const content = fs.readFileSync(INSTAGRAM_POSTED_PATH, 'utf-8');
    const folders = [];

    const matches = content.matchAll(/\*?\*?Folder:?\*?\*?\s*`([^`]+)`/gi);
    for (const match of matches) {
      folders.push(match[1]);
    }

    return folders;
  } catch (e) {
    console.error('Error reading Instagram posted file:', e.message);
    return [];
  }
}

/**
 * Extract folder names from X posted videos
 */
function getXPostedFolders() {
  try {
    const content = fs.readFileSync(X_POSTED_PATH, 'utf-8');
    const folders = [];

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
 * Find Instagram posts that haven't been posted to X
 */
function getUnpostedFolders() {
  const instagramFolders = getInstagramPostedFolders();
  const xFolders = getXPostedFolders();

  console.log(`Instagram posts: ${instagramFolders.length}`);
  console.log(`X posts: ${xFolders.length}`);

  const unposted = instagramFolders.filter(folder => !xFolders.includes(folder)).reverse();

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

  if (!fs.existsSync(path.join(folderPath, 'metadata.json'))) {
    return false;
  }

  const files = fs.readdirSync(folderPath);
  const hasSlides = files.some(f => f.startsWith('slide_'));

  return hasSlides;
}

/**
 * Main auto-post function
 */
async function autoPostToX() {
  console.log('='.repeat(50));
  console.log('  X (Twitter) Auto-Poster');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(50));
  console.log();

  const unposted = getUnpostedFolders();

  if (unposted.length === 0) {
    console.log('No unposted Instagram carousels available!');
    console.log('Post more content to Instagram first.');
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

  // Post to X
  console.log('Posting to X...');
  const result = await postToX(selectedFolder);

  return {
    success: true,
    folder: selectedFolder,
    tweetId: result.tweetId,
    tweetUrl: result.tweetUrl
  };
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  autoPostToX()
    .then(result => {
      if (result.success) {
        console.log('\nAuto-post complete!');
        console.log(`URL: ${result.tweetUrl}`);
      } else {
        console.log(`\nNo post made: ${result.reason}`);
      }
    })
    .catch(err => {
      console.error('\nError:', err.message);
      process.exit(1);
    });
}

export { autoPostToX, getUnpostedFolders };
