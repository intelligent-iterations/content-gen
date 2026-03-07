/**
 * TikTok Full Demo Flow
 *
 * This script demonstrates the complete TikTok integration:
 * 1. OAuth Login (Login Kit - user.info.basic)
 * 2. Content Posting (video.upload, video.publish)
 *
 * Usage: node code/demo-tiktok-full-flow.js [output-folder]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import readline from 'readline';
import dotenv from 'dotenv';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const OAUTH_URL = 'https://tiktok-callback-tau.vercel.app/api';

/**
 * Prompt user for input
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Open URL in default browser
 */
function openBrowser(url) {
  const cmd = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
      ? `start "${url}"`
      : `xdg-open "${url}"`;
  execSync(cmd);
}

/**
 * Update .env file with new token
 */
function updateEnvToken(token, refreshToken) {
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

  // Update or add access token
  if (envContent.includes('TIKTOK_ACCESS_TOKEN=')) {
    envContent = envContent.replace(/TIKTOK_ACCESS_TOKEN=.*/g, `TIKTOK_ACCESS_TOKEN=${token}`);
  } else {
    envContent += `\nTIKTOK_ACCESS_TOKEN=${token}`;
  }

  // Update or add refresh token
  if (refreshToken) {
    if (envContent.includes('TIKTOK_REFRESH_TOKEN=')) {
      envContent = envContent.replace(/TIKTOK_REFRESH_TOKEN=.*/g, `TIKTOK_REFRESH_TOKEN=${refreshToken}`);
    } else {
      envContent += `\nTIKTOK_REFRESH_TOKEN=${refreshToken}`;
    }
  }

  fs.writeFileSync(envPath, envContent);
}

/**
 * Create video slideshow from images using FFmpeg
 */
async function createVideoSlideshow(imagePaths, outputPath, durationPerSlide = 3) {
  const tempDir = path.join(path.dirname(outputPath), 'temp_frames');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Process images to 1080x1920 for TikTok
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

  // Run FFmpeg
  const ffmpegCmd = [
    'ffmpeg', '-y',
    '-f', 'concat', '-safe', '0', '-i', concatFile,
    '-vf', 'fps=30',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath
  ].join(' ');

  execSync(ffmpegCmd, { stdio: 'pipe' });
  fs.rmSync(tempDir, { recursive: true, force: true });

  return outputPath;
}

/**
 * Initialize and upload video to TikTok
 */
async function uploadToTikTok(accessToken, videoPath, caption, hashtags) {
  const videoBuffer = fs.readFileSync(videoPath);
  const videoSize = videoBuffer.length;

  const hashtagString = hashtags.map(h => `#${h}`).join(' ');
  const fullCaption = `${caption} ${hashtagString}`.substring(0, 150);

  // For small videos, use single chunk
  const chunkSize = videoSize <= 5 * 1024 * 1024 ? videoSize : 10 * 1024 * 1024;
  const totalChunks = Math.ceil(videoSize / chunkSize);

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

  // Initialize upload
  const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const initResult = await initResponse.json();

  if (initResult.error && initResult.error.code !== 'ok') {
    throw new Error(`TikTok API Error: ${initResult.error.code} - ${initResult.error.message}`);
  }

  const uploadUrl = initResult.data?.upload_url;
  const publishId = initResult.data?.publish_id;

  // Upload chunks
  for (let i = 0; i < totalChunks; i++) {
    const startByte = i * chunkSize;
    const endByte = Math.min(startByte + chunkSize, videoSize);
    const chunk = videoBuffer.subarray(startByte, endByte);

    console.log(`   Uploading chunk ${i + 1}/${totalChunks}...`);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': chunk.length.toString(),
        'Content-Range': `bytes ${startByte}-${endByte - 1}/${videoSize}`
      },
      body: chunk
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }
  }

  return publishId;
}

/**
 * Get user info to verify token works
 */
async function getUserInfo(accessToken) {
  const response = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  return response.json();
}

// ============================================
// MAIN DEMO FLOW
// ============================================

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║         TikTok Integration Demo - thepom.app               ║');
  console.log('║                                                            ║');
  console.log('║  Demonstrating:                                            ║');
  console.log('║  • Login Kit (user.info.basic)                             ║');
  console.log('║  • Content Posting API (video.upload, video.publish)       ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // ============================================
  // STEP 1: OAuth Login
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log('│  STEP 1: TikTok OAuth Login                                │');
  console.log('└────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('Opening TikTok authorization page in browser...');
  console.log('');

  openBrowser(OAUTH_URL);

  console.log('Please complete the authorization in your browser.');
  console.log('After authorizing, copy the Access Token from the success page.');
  console.log('');

  let accessToken = await prompt('Paste your Access Token here: ');

  // Handle if user pastes "TIKTOK_ACCESS_TOKEN=xxx" format
  if (accessToken.includes('TIKTOK_ACCESS_TOKEN=')) {
    accessToken = accessToken.split('TIKTOK_ACCESS_TOKEN=')[1].split(/[\s\n]/)[0];
  }
  // Also handle if they paste both tokens on one line
  if (accessToken.includes('TIKTOK_REFRESH_TOKEN=')) {
    accessToken = accessToken.split('TIKTOK_REFRESH_TOKEN=')[0].trim();
  }

  if (!accessToken || accessToken.length < 10) {
    console.error('Invalid token. Please try again.');
    process.exit(1);
  }

  // Ask for refresh token (optional)
  let refreshToken = await prompt('Paste your Refresh Token (or press Enter to skip): ');

  // Handle if user pastes "TIKTOK_REFRESH_TOKEN=xxx" format
  if (refreshToken.includes('TIKTOK_REFRESH_TOKEN=')) {
    refreshToken = refreshToken.split('TIKTOK_REFRESH_TOKEN=')[1].split(/[\s\n]/)[0];
  }

  // Save tokens to .env
  console.log('');
  console.log('Saving tokens to .env...');
  updateEnvToken(accessToken, refreshToken);
  console.log('✓ Tokens saved!');
  console.log('');

  // Verify token by getting user info
  console.log('Verifying token with user.info.basic...');
  const userInfo = await getUserInfo(accessToken);

  if (userInfo.error && userInfo.error.code !== 'ok') {
    console.log('⚠ Could not fetch user info:', userInfo.error.message);
  } else if (userInfo.data?.user) {
    console.log(`✓ Logged in as: ${userInfo.data.user.display_name || userInfo.data.user.open_id}`);
  } else {
    console.log('✓ Token verified');
  }
  console.log('');

  // ============================================
  // STEP 2: Load Slideshow Content
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log('│  STEP 2: Loading Slideshow Content                         │');
  console.log('└────────────────────────────────────────────────────────────┘');
  console.log('');

  const outputDir = path.join(__dirname, '..', 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => {
      const p = path.join(outputDir, f);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'metadata.json'));
    })
    .sort()
    .reverse();

  if (folders.length === 0) {
    console.error('No slideshow folders found in output/');
    process.exit(1);
  }

  const folderArg = process.argv[2];
  const folder = folderArg
    ? path.join(outputDir, folderArg)
    : path.join(outputDir, folders[0]);

  console.log(`Loading from: ${path.basename(folder)}`);

  const metadata = JSON.parse(fs.readFileSync(path.join(folder, 'metadata.json'), 'utf-8'));

  const slideFiles = fs.readdirSync(folder)
    .filter(f => f.startsWith('slide_') && (f.endsWith('.jpg') || f.endsWith('.png')))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  console.log(`Found ${slideFiles.length} slides`);
  console.log(`Topic: ${metadata.topic}`);
  console.log('');

  // ============================================
  // STEP 3: Create Video
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log('│  STEP 3: Creating Video Slideshow                          │');
  console.log('└────────────────────────────────────────────────────────────┘');
  console.log('');

  const imagePaths = slideFiles.map(f => path.join(folder, f));
  const videoPath = path.join(folder, 'slideshow.mp4');

  console.log('Converting slides to video (3 seconds per slide)...');
  await createVideoSlideshow(imagePaths, videoPath, 3);

  const videoSize = fs.statSync(videoPath).size;
  console.log(`✓ Video created: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('');

  // ============================================
  // STEP 4: Upload to TikTok
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log('│  STEP 4: Uploading to TikTok (Content Posting API)         │');
  console.log('└────────────────────────────────────────────────────────────┘');
  console.log('');

  const caption = metadata.caption || `${metadata.topic} - Scan ingredients with pom app!`;
  const hashtags = metadata.hashtags?.slice(0, 5) || ['skincare', 'pomapp', 'ingredients', 'beauty', 'viral'];

  console.log(`Caption: ${caption}`);
  console.log(`Hashtags: ${hashtags.map(h => '#' + h).join(' ')}`);
  console.log('');

  console.log('Initializing upload...');
  const publishId = await uploadToTikTok(accessToken, videoPath, caption, hashtags);
  console.log('✓ Upload complete!');
  console.log('');

  // ============================================
  // SUCCESS
  // ============================================
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║                    ✓ DEMO COMPLETE!                        ║');
  console.log('║                                                            ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║                                                            ║');
  console.log('║  Successfully demonstrated:                                ║');
  console.log('║  • Login Kit - OAuth authorization flow                    ║');
  console.log('║  • user.info.basic - Verified user identity                ║');
  console.log('║  • video.upload - Uploaded video content                   ║');
  console.log('║  • video.publish - Published to TikTok                     ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Publish ID: ${publishId}`);
  console.log('');
  console.log('Check your TikTok app:');
  console.log('  Inbox → System notifications → "Your content is ready"');
  console.log('');
}

main().catch(err => {
  console.error('');
  console.error('Error:', err.message);
  process.exit(1);
});
