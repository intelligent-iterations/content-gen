import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const XAI_API_KEY = process.env.XAI_API_KEY;
const BASE_URL = 'https://api.x.ai/v1';

if (!XAI_API_KEY) {
  console.error('Missing XAI_API_KEY in .env');
  process.exit(1);
}

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${XAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  validateStatus: (status) => status === 200 || status === 202,
});

// Track whether we've hit a 429 recently — used for adaptive cooldown
export let lastHit429 = false;

// Retry wrapper for 429 (rate limit) and 5xx (server error) with exponential backoff
async function withRetry(fn, { maxRetries = 3, baseDelay = 10000, label = 'API call' } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      const isRetryable = status === 429 || (status >= 500 && status < 600);

      if (!isRetryable || attempt === maxRetries) throw err;

      if (status === 429) lastHit429 = true;

      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`  [retry] ${label} got ${status}, retrying in ${delay / 1000}s (${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Parse the compilation MD file into structured clips
export function parseCompilationMD(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const clips = [];

  // Split by clip headers (## Clip N:)
  const clipSections = content.split(/^## Clip \d+:/m).slice(1);

  for (const section of clipSections) {
    const clip = {};

    // Get clip name from first line
    const firstLine = section.split('\n')[0].trim();
    clip.name = firstLine.replace(/\s*--\s*(Wonder|Fear).*/, '').trim();
    clip.mood = firstLine.includes('Fear') ? 'fear' : 'wonder';

    // Extract image prompt
    const imageMatch = section.match(/### Image Prompt\s*```\s*([\s\S]*?)```/);
    clip.imagePrompt = imageMatch ? imageMatch[1].trim() : null;

    // Extract video prompt
    const videoMatch = section.match(/### Video Prompt\s*```\s*([\s\S]*?)```/);
    clip.videoPrompt = videoMatch ? videoMatch[1].trim() : null;

    if (clip.imagePrompt && clip.videoPrompt) {
      clips.push(clip);
    }
  }

  return clips;
}

// Step 1: Generate image from prompt
export async function generateImage(prompt, clipName) {
  console.log(`  [image] Generating image for ${clipName}...`);

  const res = await withRetry(
    () => api.post('/images/generations', {
      model: 'grok-imagine-image',
      prompt,
      n: 1,
      response_format: 'url',
      aspect_ratio: '9:16',
    }),
    { label: `image:${clipName}` }
  );

  const imageUrl = res.data.data[0].url;
  console.log(`  [image] Got image URL for ${clipName}`);
  return imageUrl;
}

// Step 2: Generate video from image + prompt
export async function generateVideo(imageUrl, prompt) {
  const res = await withRetry(
    () => api.post('/videos/generations', {
      model: 'grok-imagine-video',
      prompt,
      image: { url: imageUrl },
      duration: 6,
      aspect_ratio: '9:16',
      resolution: '720p',
    }),
    { label: 'video:generate' }
  );

  return res.data.request_id;
}

// Step 3: Poll for video completion
export async function pollForVideo(requestId, clipName, maxWaitMs = 600000) {
  const startTime = Date.now();
  let delay = 5000;

  while (Date.now() - startTime < maxWaitMs) {
    const res = await withRetry(
      () => api.get(`/videos/${requestId}`),
      { label: `poll:${clipName}` }
    );

    // Completed: status 200, URL at res.data.video.url
    const videoUrl = res.data?.video?.url;
    if (res.status === 200 && videoUrl) {
      return videoUrl;
    }

    // Check for failed status
    if (res.data?.status === 'failed' || res.data?.error) {
      throw new Error(`Video generation failed for ${clipName}: ${JSON.stringify(res.data?.error || res.data)}`);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`  [video] ${clipName} still processing... (${elapsed}s)`);

    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 15000);
  }

  throw new Error(`Timeout waiting for video: ${clipName}`);
}

// Download a file from URL
export async function downloadFile(url, outputPath) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(outputPath, Buffer.from(res.data));
}

// Generate a single clip (image → video → download)
export async function generateClip(clip, index, outputDir) {
  const clipNum = index + 1;
  const safeName = clip.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const videoPath = path.join(outputDir, `clip${clipNum}-${safeName}.mp4`);

  // Skip if already generated
  if (fs.existsSync(videoPath)) {
    console.log(`  [skip] Clip ${clipNum} (${clip.name}) already exists`);
    return videoPath;
  }

  console.log(`\n--- Clip ${clipNum}: ${clip.name} ---`);

  // Generate image
  const imageUrl = await generateImage(clip.imagePrompt, clip.name);

  // Generate video from image
  console.log(`  [video] Starting video generation for ${clip.name}...`);
  const requestId = await generateVideo(imageUrl, clip.videoPrompt);
  console.log(`  [video] Request ID: ${requestId}`);

  // Poll for completion
  const videoUrl = await pollForVideo(requestId, clip.name);
  console.log(`  [video] ${clip.name} complete!`);

  // Download to temp file, then trim to exactly 6s
  const tmpPath = videoPath + '.tmp.mp4';
  console.log(`  [download] Saving to ${videoPath}`);
  await downloadFile(videoUrl, tmpPath);

  // Trim to 6s and strip thumbnail stream
  execSync(
    `ffmpeg -i "${tmpPath}" -t 6 -map 0:v:0 -map 0:a:0 -c copy "${videoPath}" -y`,
    { stdio: 'pipe' }
  );
  fs.unlinkSync(tmpPath);

  return videoPath;
}

// Stitch clips together with ffmpeg
export function stitchClips(clipPaths, outputPath) {
  console.log('\n--- Stitching clips together ---');

  const listFile = path.join(path.dirname(outputPath), 'concat-list.txt');
  const listContent = clipPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(listFile, listContent);

  execSync(
    `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy -movflags +faststart "${outputPath}" -y`,
    { stdio: 'inherit' }
  );

  fs.unlinkSync(listFile);
  console.log(`\nFinal video: ${outputPath}`);
}

// Main
async function main() {
  const mdFile = process.argv[2];

  if (!mdFile) {
    console.error('Usage: node code/generate-video-compilation.js <path-to-compilation.md>');
    console.error('Example: node code/generate-video-compilation.js videos/skincare-benefits-hero-compilation.md');
    process.exit(1);
  }

  const mdPath = path.resolve(mdFile);
  if (!fs.existsSync(mdPath)) {
    console.error(`File not found: ${mdPath}`);
    process.exit(1);
  }

  // Parse the MD
  const clips = parseCompilationMD(mdPath);
  console.log(`Parsed ${clips.length} clips from ${path.basename(mdPath)}\n`);

  for (const clip of clips) {
    console.log(`  - ${clip.name} (${clip.mood})`);
  }

  // Create output directory
  const baseName = path.basename(mdPath, '.md');
  const outputDir = path.join(path.dirname(mdPath), baseName);
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate each clip
  const clipPaths = [];
  for (let i = 0; i < clips.length; i++) {
    try {
      const clipPath = await generateClip(clips[i], i, outputDir);
      clipPaths.push(clipPath);
    } catch (err) {
      console.error(`\nFailed on clip ${i + 1} (${clips[i].name}): ${err.message}`);
      console.error('Continuing with remaining clips...\n');
    }
  }

  if (clipPaths.length === 0) {
    console.error('No clips were generated.');
    process.exit(1);
  }

  // Stitch together
  const finalPath = path.join(path.dirname(mdPath), `${baseName}-final.mp4`);
  stitchClips(clipPaths, finalPath);

  console.log(`\nDone! ${clipPaths.length}/${clips.length} clips generated and stitched.`);
  console.log(`Output: ${finalPath}`);
}

// Only run main() when executed directly (not imported)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
