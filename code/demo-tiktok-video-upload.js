/**
 * Demo script: Upload slideshow as VIDEO to TikTok
 *
 * Usage: node code/demo-tiktok-video-upload.js [output-folder]
 *
 * This script:
 * 1. Loads existing slides from output folder
 * 2. Creates a video slideshow using FFmpeg
 * 3. Uploads to TikTok using FILE_UPLOAD (no URL verification needed)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;

/**
 * Create video slideshow from images using FFmpeg
 */
async function createVideoSlideshow(imagePaths, outputPath, durationPerSlide = 3) {
  console.log('   Creating video from slides...');

  // Create a temp directory for processed images
  const tempDir = path.join(path.dirname(outputPath), 'temp_frames');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Process images to ensure consistent size (1080x1920 for TikTok)
  const processedPaths = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const outputFrame = path.join(tempDir, `frame_${String(i).padStart(3, '0')}.jpg`);
    await sharp(imagePaths[i])
      .resize(1080, 1920, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
      .jpeg({ quality: 95 })
      .toFile(outputFrame);
    processedPaths.push(outputFrame);
  }

  // Create concat file for FFmpeg
  const concatFile = path.join(tempDir, 'concat.txt');
  const concatContent = processedPaths
    .map(p => `file '${p}'\nduration ${durationPerSlide}`)
    .join('\n');
  fs.writeFileSync(concatFile, concatContent + `\nfile '${processedPaths[processedPaths.length - 1]}'`);

  // Run FFmpeg to create video
  const ffmpegCmd = [
    'ffmpeg', '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-vf', 'fps=30',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath
  ].join(' ');

  execSync(ffmpegCmd, { stdio: 'pipe' });

  // Clean up temp files
  fs.rmSync(tempDir, { recursive: true, force: true });

  const stats = fs.statSync(outputPath);
  console.log(`   ✓ Video created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  return outputPath;
}

/**
 * Initialize TikTok video upload
 */
async function initTikTokVideoUpload(videoSize, caption, hashtags) {
  const hashtagString = hashtags.map(h => `#${h}`).join(' ');
  const fullCaption = `${caption} ${hashtagString}`.substring(0, 150);

  console.log('   Initializing TikTok video upload...');

  // For videos under 5MB, use video size as chunk size (single chunk)
  // For larger videos, use 10MB chunks (min 5MB, max 64MB)
  let chunkSize, totalChunks;
  if (videoSize <= 5 * 1024 * 1024) {
    // Small video - single chunk
    chunkSize = videoSize;
    totalChunks = 1;
  } else {
    // Larger video - use 10MB chunks
    chunkSize = 10 * 1024 * 1024;
    totalChunks = Math.ceil(videoSize / chunkSize);
  }

  const requestBody = {
    post_info: {
      description: fullCaption,
      privacy_level: 'SELF_ONLY'
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: videoSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunks
    },
    post_mode: 'DIRECT_POST',
    media_type: 'VIDEO'
  };

  console.log('   Request:', JSON.stringify(requestBody, null, 2));

  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TIKTOK_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const result = await response.json();
  console.log('   Response:', JSON.stringify(result, null, 2));

  if (result.error && result.error.code !== 'ok') {
    throw new Error(`TikTok API Error: ${result.error.code} - ${result.error.message}`);
  }

  return { result, chunkSize, totalChunks };
}

/**
 * Upload video chunk to TikTok
 */
async function uploadVideoChunk(uploadUrl, videoBuffer, chunkIndex, startByte, endByte, totalSize) {
  console.log(`   Uploading chunk ${chunkIndex + 1}... (${startByte}-${endByte}/${totalSize})`);

  const chunk = videoBuffer.subarray(startByte, endByte);

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': chunk.length.toString(),
      'Content-Range': `bytes ${startByte}-${endByte - 1}/${totalSize}`
    },
    body: chunk
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chunk upload failed: ${response.status} - ${text}`);
  }

  console.log(`   ✓ Chunk ${chunkIndex + 1} uploaded`);
  return true;
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  TikTok Video Slideshow Upload');
  console.log('  thepom.app');
  console.log('========================================');
  console.log('');

  if (!TIKTOK_ACCESS_TOKEN) {
    console.error('Error: TIKTOK_ACCESS_TOKEN not set in .env');
    process.exit(1);
  }

  // Find output folder
  const outputDir = path.join(__dirname, '..', 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
    .sort()
    .reverse();

  const folderArg = process.argv[2];
  const folder = folderArg
    ? path.join(outputDir, folderArg)
    : path.join(outputDir, folders[0]);

  console.log(`1. Loading slides from: ${path.basename(folder)}`);

  // Load metadata
  const metadataPath = path.join(folder, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error('Error: metadata.json not found');
    process.exit(1);
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

  // Find all slide images
  const slideFiles = fs.readdirSync(folder)
    .filter(f => f.startsWith('slide_') && (f.endsWith('.jpg') || f.endsWith('.png')))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0]);
      const numB = parseInt(b.match(/\d+/)[0]);
      return numA - numB;
    });

  console.log(`   Found ${slideFiles.length} slides`);
  console.log(`   Topic: ${metadata.topic}`);
  console.log('');

  // Create video from slides
  console.log('2. Creating video slideshow...');
  const imagePaths = slideFiles.map(f => path.join(folder, f));
  const videoPath = path.join(folder, 'slideshow.mp4');
  await createVideoSlideshow(imagePaths, videoPath, 3);

  // Read video file
  const videoBuffer = fs.readFileSync(videoPath);
  const videoSize = videoBuffer.length;
  console.log(`   Video size: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('');

  // Initialize TikTok upload
  console.log('3. Uploading to TikTok...');
  const caption = metadata.caption || `${metadata.topic} - Scan ingredients with pom app!`;
  const hashtags = metadata.hashtags?.slice(0, 5) || ['skincare', 'pomapp', 'ingredients', 'beauty', 'viral'];

  const { result: initResult, chunkSize, totalChunks } = await initTikTokVideoUpload(videoSize, caption, hashtags);

  const uploadUrl = initResult.data?.upload_url;
  if (!uploadUrl) {
    throw new Error('No upload URL returned from TikTok');
  }

  // Upload video in chunks
  console.log(`\n   Uploading ${totalChunks} chunk(s)...`);
  for (let i = 0; i < totalChunks; i++) {
    const startByte = i * chunkSize;
    const endByte = Math.min(startByte + chunkSize, videoSize);
    await uploadVideoChunk(uploadUrl, videoBuffer, i, startByte, endByte, videoSize);
  }

  console.log('');
  console.log('========================================');
  console.log('  ✓ Upload Complete!');
  console.log('========================================');
  console.log('');
  console.log(`Publish ID: ${initResult.data?.publish_id}`);
  console.log('');
  console.log('Check your TikTok app:');
  console.log('  Inbox → System notifications → "Your content is ready"');
  console.log('');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
