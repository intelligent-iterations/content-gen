/**
 * Post carousel to X (Twitter)
 *
 * Usage:
 *   node code/post-to-x.js <folder-path>
 *   node code/post-to-x.js 2026-02-04T16-30-05_hidden-dangers-in-household-cl
 */

import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// --- X (TWITTER) CONFIGURATION ---
const client = new TwitterApi({
  appKey: process.env.X_CONSUMER_KEY,
  appSecret: process.env.X_CONSUMER_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

// --- TRACKER FILES ---
const POSTED_X_PATH = path.join(__dirname, '..', 'X_POSTED_VIDEOS.md');
const POSTED_INSTAGRAM_PATH = path.join(__dirname, '..', 'INSTAGRAM_POSTED_VIDEOS.md');

// --- HASHTAG POOLS (rotate to avoid repetition penalty) ---
const BROAD_HASHTAGS = ['#health', '#wellness', '#healthyliving', '#selfcare', '#healthylifestyle', '#wellbeing', '#nutrition'];
const NICHE_HASHTAGS = ['#HealthTips', '#CleanLiving', '#IngredientCheck', '#ToxicFree', '#WellnessTips', '#HolisticHealth', '#MindfulLiving', '#ProductSafety', '#ReadTheLabel', '#ChemicalFree'];

/**
 * Pick 1-2 hashtags: 1 broad + 1 niche, rotated based on day
 * Twitter algo penalizes >2 hashtags by 40%, so strict max of 2
 */
function pickHashtags() {
  const day = Math.floor(Date.now() / 86400000); // rotate daily
  const broad = BROAD_HASHTAGS[day % BROAD_HASHTAGS.length];
  const niche = NICHE_HASHTAGS[day % NICHE_HASHTAGS.length];
  return { broad, niche };
}

/**
 * Generate an algorithm-optimized tweet using Grok API
 *
 * Research-backed strategy:
 * - 71-100 chars ideal (17% higher engagement), max ~200 before hashtags
 * - 1-2 hashtags INLINE (not at end, never at start) — 55% more engagement
 * - End with a question — replies are 13.5x value of a like, reply chains 150x
 * - Use line breaks for readability
 * - No external links (zero median engagement for non-Premium)
 * - Bold/provocative tone that stops the scroll
 */
async function generateTweetCaption(metadata) {
  const { topic, hook, caption } = metadata;
  const { broad, niche } = pickHashtags();

  const prompt = `You write tweets for @thepomapp — a product safety awareness account that exposes hidden toxic ingredients.

CONTENT:
Topic: "${topic}"
Hook: "${hook}"
Context: "${caption?.substring(0, 400)}"

WRITE A TWEET. Follow these rules EXACTLY:

FORMAT (use line breaks between sections):
Line 1: Bold, shocking statement about the product/ingredient (max 80 chars)
Line 2: One surprising fact or stat woven naturally into the sentence — weave ONE of these hashtags into this line naturally as part of the sentence: ${broad} or ${niche}
Line 3: End with a short punchy question that provokes replies

RULES:
- TOTAL tweet must be under 220 characters (hard limit — count carefully)
- Exactly 1 hashtag, placed INLINE mid-sentence (NEVER at start of line, NEVER grouped at end)
- No emojis
- No links
- No "did you know" or "here's why"
- Be direct, confrontational, slightly unhinged — like exposing a scandal
- The question at the end should make people WANT to reply

Return ONLY the tweet text with line breaks. Nothing else.`;

  try {
    const res = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: 'grok-4-1-fast-non-reasoning',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.9,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    let tweet = res.data.choices?.[0]?.message?.content?.trim();
    if (!tweet) throw new Error('Empty response');

    // Strip any quotes Grok might wrap it in
    tweet = tweet.replace(/^["']|["']$/g, '');

    // Ensure we're under 280
    if (tweet.length > 280) {
      // Try to cut at last sentence before 280
      const cut = tweet.substring(0, 277);
      const lastBreak = Math.max(cut.lastIndexOf('?'), cut.lastIndexOf('.'), cut.lastIndexOf('!'));
      tweet = lastBreak > 150 ? tweet.substring(0, lastBreak + 1) : cut + '...';
    }

    return tweet;
  } catch (e) {
    console.log(`  Grok caption failed: ${e.message}`);
  }

  // Fallback: hook + hashtag + question
  return `${hook}\n\nWhat's hiding in your ${niche} routine?`;
}

/**
 * Select images for tweet (max 4)
 *
 * Priority order (these are what make the post valuable):
 * 1. App screenshot slides (.png) — the ingredient results from the pom app (MUST include)
 * 2. Product slides (has_screenshot: true in metadata) — show the actual product + ingredients
 * 3. Hook slide (slide 1) — attention-grabbing opener
 *
 * Drop: generic CTA slides ("double tap", "check your pantry") — no value for X
 * Prefer instagram/ cropped (4:5) when available, fall back to original 9:16
 */
function selectImages(folderPath) {
  const instagramFolder = path.join(folderPath, 'instagram');
  const useInstagram = fs.existsSync(instagramFolder);
  const imageFolder = useInstagram ? instagramFolder : folderPath;

  // Load metadata for slide info
  let slides = [];
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(folderPath, 'metadata.json'), 'utf-8'));
    slides = meta.slides || [];
  } catch (e) {}

  const allSlides = fs.readdirSync(imageFolder)
    .filter(f => f.startsWith('slide_') && (f.endsWith('.jpg') || f.endsWith('.png')))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide_(\d+)/)[1]);
      const numB = parseInt(b.match(/slide_(\d+)/)[1]);
      return numA - numB;
    });

  if (allSlides.length === 0) return [];
  if (allSlides.length <= 4) {
    return allSlides.map(f => path.join(imageFolder, f));
  }

  // Categorize slides
  const screenshots = []; // .png app ingredient screenshots
  const productSlides = []; // has_screenshot: true (product + ingredient overlay)
  let hookSlide = allSlides[0]; // slide 1

  for (const file of allSlides) {
    const num = parseInt(file.match(/slide_(\d+)/)[1]);
    const slideMeta = slides.find(s => s.slide_number === num);

    if (file.endsWith('.png') && slideMeta?.screenshot_ingredients?.length > 0) {
      screenshots.push(file);
    } else if (slideMeta?.has_screenshot) {
      productSlides.push(file);
    }
  }

  // Build selection: screenshots first, then product slides, then hook
  const selected = [];

  // Always include app screenshots (the ingredient results — this is the proof)
  for (const s of screenshots) {
    if (selected.length < 4) selected.push(s);
  }

  // Add product slides (shows the actual product being exposed)
  for (const s of productSlides) {
    if (selected.length < 4 && !selected.includes(s)) selected.push(s);
  }

  // Fill remaining with hook slide
  if (selected.length < 4 && !selected.includes(hookSlide)) {
    selected.push(hookSlide);
  }

  // If still under 4, add remaining slides by order (skip last/CTA slide)
  const remaining = allSlides.slice(1, -1).filter(f => !selected.includes(f));
  for (const f of remaining) {
    if (selected.length < 4) selected.push(f);
  }

  // Sort by original slide order
  selected.sort((a, b) => {
    const numA = parseInt(a.match(/slide_(\d+)/)?.[1] || '0');
    const numB = parseInt(b.match(/slide_(\d+)/)?.[1] || '0');
    return numA - numB;
  });

  return selected.map(f => path.join(imageFolder, f));
}

/**
 * Load already posted X videos
 */
function loadPostedXVideos() {
  try {
    if (fs.existsSync(POSTED_X_PATH)) {
      return fs.readFileSync(POSTED_X_PATH, 'utf-8');
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
  const posted = loadPostedXVideos();
  return posted.includes(folderName);
}

/**
 * Add entry to posted videos file
 */
function addToPostedVideos(folderName, metadata, tweetId, tweetText) {
  const date = new Date().toISOString().split('T')[0];

  let content = loadPostedXVideos();

  if (!content) {
    content = `# X (Twitter) Posted Videos Tracker

> Track X posts from the pom video generator

---

`;
  }

  const entry = `
## ${date}

### ${metadata.topic}
**Folder:** \`${folderName}\`
**Posted:** ${date}
**Tweet ID:** ${tweetId}
**URL:** https://x.com/thepomapp/status/${tweetId}

**Tweet:** ${tweetText}

**Images:** ${metadata.slides?.length || 'unknown'} slides

---
`;

  content += entry;
  fs.writeFileSync(POSTED_X_PATH, content);
  console.log(`  Added to ${POSTED_X_PATH}`);
}

/**
 * Get Instagram URL for a folder (to include in tweet)
 */
function getInstagramUrlForFolder(folderName) {
  try {
    const content = fs.readFileSync(POSTED_INSTAGRAM_PATH, 'utf-8');
    const folderIndex = content.indexOf(folderName);
    if (folderIndex === -1) return null;

    const sectionAfter = content.substring(folderIndex, folderIndex + 300);
    const urlMatch = sectionAfter.match(/\*\*URL:\*\*\s*(https:\/\/www\.instagram\.com\/p\/[^\s]+)/);
    if (urlMatch) return urlMatch[1];
  } catch (e) {
    // Fall through
  }
  return null;
}

/**
 * Post to X (Twitter)
 */
async function postToX(folderPath) {
  // Resolve folder path
  if (!path.isAbsolute(folderPath)) {
    if (folderPath.startsWith('output/')) {
      folderPath = path.join(__dirname, '..', folderPath);
    } else {
      folderPath = path.join(__dirname, '..', 'output', folderPath);
    }
  }

  console.log('='.repeat(50));
  console.log('  X (Twitter) Post');
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
  console.log();

  // Check if already posted
  if (isAlreadyPosted(folderName)) {
    console.error('This folder has already been posted to X!');
    console.error(`Check ${POSTED_X_PATH} for details.`);
    process.exit(1);
  }

  // Generate tweet caption
  console.log('Generating tweet caption...');
  let tweetText = await generateTweetCaption(metadata);
  console.log(`  Caption: ${tweetText}`);
  console.log(`  Length: ${tweetText.length}/280`);
  console.log();

  // Select images (max 4)
  const imagePaths = selectImages(folderPath);
  console.log(`Selected ${imagePaths.length} images`);

  if (imagePaths.length === 0) {
    console.error('No images found!');
    process.exit(1);
  }

  // Upload media
  console.log('\nUploading images...\n');
  const mediaIds = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];
    console.log(`  Uploading ${i + 1}/${imagePaths.length}: ${path.basename(imgPath)}`);

    const mediaId = await client.v1.uploadMedia(imgPath);
    mediaIds.push(mediaId);

    await new Promise(r => setTimeout(r, 500));
  }

  // Create tweet
  console.log('\nPosting tweet...\n');

  const tweetPayload = {
    text: tweetText,
    media: { media_ids: mediaIds },
  };

  const tweet = await client.v2.tweet(tweetPayload);
  const tweetId = tweet.data.id;
  const tweetUrl = `https://x.com/thepomapp/status/${tweetId}`;

  console.log('='.repeat(50));
  console.log('  SUCCESS!');
  console.log('='.repeat(50));
  console.log();
  console.log(`Tweet ID: ${tweetId}`);
  console.log(`URL: ${tweetUrl}`);
  console.log();

  // Add to tracker
  addToPostedVideos(folderName, metadata, tweetId, tweetText);

  return { tweetId, tweetUrl };
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const outputDir = path.join(__dirname, '..', 'output');
    const folders = fs.readdirSync(outputDir)
      .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
      .filter(f => !f.startsWith('.') && !f.startsWith('test') && !f.startsWith('integration'))
      .sort()
      .reverse();

    if (folders.length === 0) {
      console.error('No output folders found.');
      process.exit(1);
    }

    // Find next unposted folder (most recent first)
    const nextFolder = folders.find(f => !isAlreadyPosted(f));
    if (!nextFolder) {
      console.log('All folders have already been posted to X.');
      process.exit(0);
    }

    console.log('No folder specified, using next unposted (most recent first):');
    console.log(`  ${nextFolder}`);
    console.log();

    postToX(nextFolder);
  } else {
    postToX(args[0]);
  }
}

export { postToX, isAlreadyPosted, getInstagramUrlForFolder };
