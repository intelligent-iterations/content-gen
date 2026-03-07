/**
 * Auto-post to Reddit (r/nontoxicpom)
 *
 * Picks a TikTok carousel that hasn't been posted to Reddit yet
 * and posts it as a gallery post.
 *
 * Usage:
 *   node code/auto-post-reddit.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { postToReddit } from './post-to-reddit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TIKTOK_POSTED_PATH = path.join(__dirname, '..', 'CURRENT_POSTED_VIDEOS.md');
const REDDIT_POSTED_PATH = path.join(__dirname, '..', 'REDDIT_POSTED_VIDEOS.md');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

/**
 * Extract folder names from TikTok posted videos
 */
function getTikTokPostedFolders() {
  try {
    const content = fs.readFileSync(TIKTOK_POSTED_PATH, 'utf-8');
    const folders = [];

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
 * Extract folder names from Reddit posted videos
 */
function getRedditPostedFolders() {
  try {
    const content = fs.readFileSync(REDDIT_POSTED_PATH, 'utf-8');
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
 * Find TikTok posts that haven't been posted to Reddit
 */
function getUnpostedFolders() {
  const tiktokFolders = getTikTokPostedFolders();
  const redditFolders = getRedditPostedFolders();

  console.log(`TikTok posts: ${tiktokFolders.length}`);
  console.log(`Reddit posts: ${redditFolders.length}`);

  const unposted = tiktokFolders.filter(folder => !redditFolders.includes(folder)).reverse();

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
async function autoPostToReddit() {
  console.log('='.repeat(50));
  console.log('  Reddit Auto-Poster (r/nontoxicpom)');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(50));
  console.log();

  const unposted = getUnpostedFolders();

  if (unposted.length === 0) {
    console.log('No unposted TikTok carousels available!');
    console.log('Generate more content or wait for new TikTok posts.');
    return { success: false, reason: 'no_unposted_content' };
  }

  // Try each valid folder until one succeeds
  for (const folder of unposted) {
    if (!isValidFolder(folder)) {
      console.log(`Skipping invalid folder: ${folder}`);
      continue;
    }

    console.log(`Selected: ${folder}`);
    console.log();

    try {
      console.log('Posting to Reddit...');
      const result = await postToReddit(folder);

      return {
        success: true,
        folder: folder,
        postId: result.postId,
        postUrl: result.postUrl,
      };
    } catch (err) {
      console.log(`\nFailed to post ${folder}: ${err.message}`);
      console.log('Skipping to next folder...\n');
    }
  }

  console.log('No folders could be posted!');
  return { success: false, reason: 'all_folders_failed' };
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  autoPostToReddit()
    .then(result => {
      if (result.success) {
        console.log('\nAuto-post complete!');
        console.log(`URL: ${result.postUrl}`);
      } else {
        console.log(`\nNo post made: ${result.reason}`);
      }
    })
    .catch(err => {
      console.error('\nError:', err.message);
      process.exit(1);
    });
}

export { autoPostToReddit, getUnpostedFolders };
