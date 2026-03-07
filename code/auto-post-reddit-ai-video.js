/**
 * Auto-post AI video variants to Reddit as video posts
 *
 * Posts 1 AI video per run from AI_VIDEOS.md Hook Variants table.
 * Runs 3x/day (8am, 12pm, 8pm).
 *
 * Usage:
 *   node code/auto-post-reddit-ai-video.js
 *   node code/auto-post-reddit-ai-video.js --dry-run
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUBREDDIT = 'nontoxicpom';
const AI_VIDEOS_PATH = path.join(__dirname, '..', 'AI_VIDEOS.md');
const POSTED_PATH = path.join(__dirname, '..', 'REDDIT_POSTED_AI_VIDEOS.md');

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

function addToPosted(video, postId, postUrl) {
  const date = new Date().toISOString().split('T')[0];
  let content = '';
  try { content = fs.readFileSync(POSTED_PATH, 'utf-8'); } catch (e) {
    content = `# Reddit Posted AI Videos Tracker\n\n---\n`;
  }
  content += `\n## ${date}\n\n### #${video.number} - ${video.video} (hook: ${video.hook})\n**Video #:** ${video.number}\n**Posted:** ${date}\n**Post ID:** ${postId}\n**URL:** ${postUrl}\n\n---\n`;
  fs.writeFileSync(POSTED_PATH, content);
}

async function getRedditAccessToken() {
  const auth = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString('base64');

  const res = await axios.post(
    'https://www.reddit.com/api/v1/access_token',
    new URLSearchParams({
      grant_type: 'password',
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PASSWORD,
    }).toString(),
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': process.env.REDDIT_USER_AGENT,
      },
    }
  );

  if (res.data.error) throw new Error(`Reddit auth failed: ${res.data.error}`);
  return res.data.access_token;
}

async function uploadVideoToReddit(token, videoPath) {
  const filename = path.basename(videoPath);

  // Step 1: Request upload lease
  const leaseRes = await axios.post(
    'https://oauth.reddit.com/api/media/asset.json',
    new URLSearchParams({
      filepath: filename,
      mimetype: 'video/mp4',
    }).toString(),
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': process.env.REDDIT_USER_AGENT,
      },
    }
  );

  const { args, asset } = leaseRes.data;
  const uploadUrl = `https:${args.action}`;

  // Step 2: Upload video
  const formData = new FormData();
  for (const field of args.fields) {
    formData.append(field.name, field.value);
  }
  formData.append('file', new Blob([fs.readFileSync(videoPath)], { type: 'video/mp4' }), filename);

  await axios.post(uploadUrl, formData, {
    headers: { 'User-Agent': process.env.REDDIT_USER_AGENT },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return asset.asset_id;
}

async function generateRedditTitle(video) {
  try {
    const res = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: 'grok-4-1-fast-non-reasoning',
      messages: [{ role: 'user', content: `Write a Reddit post title for r/nontoxicpom about this AI-generated ingredient video.

Video topic: "${video.video}"
Lead ingredient: "${video.hook}"

Rules:
- Sound like a real Reddit user sharing something interesting
- Include the ingredient name for searchability
- Conversational tone ("just watched", "check this out", "pom scored")
- Max 200 characters
- No emojis, no ALL CAPS

Return ONLY the title.` }],
      max_tokens: 100,
      temperature: 0.85,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    let title = res.data.choices?.[0]?.message?.content?.trim();
    if (title) {
      title = title.replace(/^["']|["']$/g, '');
      // Reddit dislikes dashes in titles
      title = title.replace(/[\u2014\u2013\u2012\u2011\u2010-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      return title;
    }
  } catch (e) {
    console.log(`  Grok title failed: ${e.message}`);
  }
  return `${video.video}: what ${video.hook} actually does (pom ingredient video)`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(50));
  console.log('  Reddit AI Video Auto-Poster (1/run, 3x/day)');
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

  // Auth
  console.log('Authenticating...');
  const token = await getRedditAccessToken();

  // Generate title
  console.log('Generating title...');
  const title = await generateRedditTitle(video);
  console.log(`  "${title}"`);

  // Upload video
  console.log('Uploading video to Reddit...');
  const assetId = await uploadVideoToReddit(token, videoFilePath);
  console.log(`  Asset ID: ${assetId}`);

  // Submit video post
  console.log('Submitting video post...');
  const submitRes = await axios.post(
    'https://oauth.reddit.com/api/submit',
    new URLSearchParams({
      sr: SUBREDDIT,
      kind: 'video',
      title: title,
      url: `https://reddit-uploaded-video.s3-accelerate.amazonaws.com/${assetId}`,
      video_poster_url: '',
      api_type: 'json',
      resubmit: 'true',
      send_replies: 'true',
    }).toString(),
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': process.env.REDDIT_USER_AGENT,
      },
    }
  );

  const data = submitRes.data;
  let postUrl, postId;

  if (data.json?.data?.url) {
    postUrl = data.json.data.url;
    postId = data.json.data.id || data.json.data.name;
  } else if (data.json?.errors?.length > 0) {
    throw new Error(`Reddit submit failed: ${JSON.stringify(data.json.errors)}`);
  } else {
    console.log('  Raw response:', JSON.stringify(data).substring(0, 500));
    throw new Error('Unexpected Reddit response format');
  }

  console.log(`\nSUCCESS! ${postUrl}`);
  addToPosted(video, postId, postUrl);
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
