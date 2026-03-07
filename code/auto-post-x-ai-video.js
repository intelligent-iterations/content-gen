/**
 * Auto-post AI video variants to X (Twitter) as video tweets
 *
 * Posts 1 AI video per run from AI_VIDEOS.md Hook Variants table.
 * Runs 3x/day (8am, 12pm, 8pm).
 *
 * Usage:
 *   node code/auto-post-x-ai-video.js
 *   node code/auto-post-x-ai-video.js --dry-run
 */

import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const client = new TwitterApi({
  appKey: process.env.X_CONSUMER_KEY,
  appSecret: process.env.X_CONSUMER_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const AI_VIDEOS_PATH = path.join(__dirname, '..', 'AI_VIDEOS.md');
const POSTED_PATH = path.join(__dirname, '..', 'X_POSTED_AI_VIDEOS.md');

const BROAD_HASHTAGS = ['#health', '#wellness', '#healthyliving', '#selfcare', '#nutrition'];
const NICHE_HASHTAGS = ['#IngredientCheck', '#ToxicFree', '#CleanLiving', '#ReadTheLabel', '#ProductSafety'];

function parseAIVideos() {
  const content = fs.readFileSync(AI_VIDEOS_PATH, 'utf-8');
  const videos = [];
  const rows = content.matchAll(/\|\s*([\d.]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*\[watch\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|/g);
  for (const match of rows) {
    const number = match[1].trim();
    const video = match[2].trim();
    const hook = match[3].trim();
    const videoPath = match[4].trim();
    const captionCell = match[5].trim();
    let captionPath = null;
    const captionMatch = captionCell.match(/\[caption\]\(([^)]+)\)/);
    if (captionMatch) captionPath = captionMatch[1];
    videos.push({ number, video, hook, videoPath, captionPath });
  }
  return videos;
}

function getPostedNumbers() {
  try {
    const content = fs.readFileSync(POSTED_PATH, 'utf-8');
    return [...content.matchAll(/\*\*Video #:\*\*\s*([\d.]+)/g)].map(m => m[1]);
  } catch (e) {
    return [];
  }
}

function addToPosted(video, tweetId) {
  const date = new Date().toISOString().split('T')[0];
  let content = '';
  try { content = fs.readFileSync(POSTED_PATH, 'utf-8'); } catch (e) {
    content = `# X Posted AI Videos Tracker\n\n---\n`;
  }
  content += `\n## ${date}\n\n### #${video.number} - ${video.video} (hook: ${video.hook})\n**Video #:** ${video.number}\n**Posted:** ${date}\n**Tweet ID:** ${tweetId}\n**URL:** https://x.com/thepomapp/status/${tweetId}\n\n---\n`;
  fs.writeFileSync(POSTED_PATH, content);
}

async function generateTweetCaption(video) {
  const day = Math.floor(Date.now() / 86400000);
  const broad = BROAD_HASHTAGS[day % BROAD_HASHTAGS.length];
  const niche = NICHE_HASHTAGS[day % NICHE_HASHTAGS.length];

  // Load caption file for context
  let captionContext = '';
  if (video.captionPath) {
    const captionFilePath = path.join(__dirname, '..', video.captionPath);
    if (fs.existsSync(captionFilePath)) {
      captionContext = fs.readFileSync(captionFilePath, 'utf-8').trim();
    }
  }

  try {
    const res = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: 'grok-4-1-fast-non-reasoning',
      messages: [{ role: 'user', content: `You write tweets for @thepomapp — a product safety awareness account that exposes hidden toxic ingredients.

CONTENT:
Video topic: "${video.video}"
Hook ingredient: "${video.hook}"
Context: "${captionContext.substring(0, 400)}"

WRITE A TWEET for a video post. Follow these rules EXACTLY:

FORMAT (use line breaks between sections):
Line 1: Bold, shocking statement about the ingredient (max 80 chars)
Line 2: One surprising fact — weave ONE of these hashtags inline: ${broad} or ${niche}
Line 3: End with a short punchy question that provokes replies

RULES:
- TOTAL tweet must be under 220 characters (hard limit)
- Exactly 1 hashtag, placed INLINE mid-sentence (NEVER at start, NEVER grouped at end)
- No emojis, no links
- Be direct, confrontational — like exposing a scandal

Return ONLY the tweet text. Nothing else.` }],
      max_tokens: 200,
      temperature: 0.9,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    let tweet = res.data.choices?.[0]?.message?.content?.trim();
    if (tweet) {
      tweet = tweet.replace(/^["']|["']$/g, '');
      if (tweet.length > 280) tweet = tweet.substring(0, 277) + '...';
      return tweet;
    }
  } catch (e) {
    console.log(`  Grok caption failed: ${e.message}`);
  }

  return `${video.hook} is hiding in your products.\n\nWhat's really in your ${niche} routine?`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(50));
  console.log('  X AI Video Auto-Poster (1/run, 3x/day)');
  console.log('  ' + new Date().toISOString());
  if (dryRun) console.log('  ** DRY RUN **');
  console.log('='.repeat(50));
  console.log();

  const allVideos = parseAIVideos();
  const postedNumbers = getPostedNumbers();
  const unposted = allVideos.filter(v => !postedNumbers.includes(v.number));

  console.log(`Total: ${allVideos.length} | Posted: ${postedNumbers.length} | Unposted: ${unposted.length}`);

  if (unposted.length === 0) {
    console.log('\nNo unposted variants!');
    return;
  }

  const video = unposted[0];
  const videoFilePath = path.join(__dirname, '..', video.videoPath);
  console.log(`\nSelected: #${video.number} - ${video.video} (hook: ${video.hook})`);

  if (!fs.existsSync(videoFilePath)) {
    console.error(`File not found: ${video.videoPath}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[dry-run] Would post: ${video.videoPath}`);
    return;
  }

  // Generate tweet text
  console.log('Generating caption...');
  const tweetText = await generateTweetCaption(video);
  console.log(`  "${tweetText}" (${tweetText.length}/280)`);

  // Upload video to Twitter
  console.log('\nUploading video...');
  const mediaId = await client.v1.uploadMedia(videoFilePath, { mimeType: 'video/mp4' });
  console.log(`  Media ID: ${mediaId}`);

  // Post tweet
  console.log('Posting tweet...');
  const tweet = await client.v2.tweet({
    text: tweetText,
    media: { media_ids: [mediaId] },
  });

  const tweetId = tweet.data.id;
  const tweetUrl = `https://x.com/thepomapp/status/${tweetId}`;

  console.log(`\nSUCCESS! ${tweetUrl}`);
  addToPosted(video, tweetId);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
