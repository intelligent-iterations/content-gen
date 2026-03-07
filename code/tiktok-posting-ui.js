/**
 * TikTok Posting UI — Audit Compliance Server
 *
 * Supports two modes:
 *   Photo carousel: node code/tiktok-posting-ui.js <output-folder>
 *   Video:          node code/tiktok-posting-ui.js <video-file.mp4>
 *
 * → Opens http://localhost:3001
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { refreshAccessToken } from './tiktok-oauth.js';
import { uploadSlideFiles } from './upload-to-tiktok.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ---------------------------------------------------------------------------
// Detect mode: folder (photo carousel) or file (video)
// ---------------------------------------------------------------------------
const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage:');
  console.error('  Photo carousel: node code/tiktok-posting-ui.js <output-folder>');
  console.error('  Video:          node code/tiktok-posting-ui.js <video-file.mp4>');
  process.exit(1);
}

// Resolve path
let inputPath;
if (path.isAbsolute(fileArg)) {
  inputPath = fileArg;
} else if (fs.existsSync(path.resolve(fileArg))) {
  inputPath = path.resolve(fileArg);
} else if (fs.existsSync(path.join(__dirname, '..', 'output', fileArg))) {
  inputPath = path.join(__dirname, '..', 'output', fileArg);
} else if (fs.existsSync(path.join(__dirname, '..', 'videos', fileArg))) {
  inputPath = path.join(__dirname, '..', 'videos', fileArg);
} else {
  inputPath = path.resolve(fileArg);
}

if (!fs.existsSync(inputPath)) {
  console.error(`Not found: ${inputPath}`);
  process.exit(1);
}

const stat = fs.statSync(inputPath);
const isPhotoMode = stat.isDirectory();

// ---------------------------------------------------------------------------
// Photo mode: discover slides + load metadata
// ---------------------------------------------------------------------------
let slidePaths = [];
let metadata = null;
let captionText = '';

if (isPhotoMode) {
  // Find slide files in order
  const files = fs.readdirSync(inputPath).sort();
  slidePaths = files
    .filter(f => /^slide_\d+\.(jpg|jpeg|png|webp)$/i.test(f))
    .map(f => path.join(inputPath, f));

  if (slidePaths.length === 0) {
    console.error('No slide images found in folder (expected slide_1.jpg, slide_2.png, etc.)');
    process.exit(1);
  }

  // Load metadata if available
  const metaPath = path.join(inputPath, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    captionText = metadata.caption || '';
  }

  console.log(`Photo carousel mode: ${slidePaths.length} slides`);
  console.log(`Folder: ${path.basename(inputPath)}`);
  if (captionText) console.log(`Caption: ${captionText.substring(0, 60)}...`);
}

// ---------------------------------------------------------------------------
// Video mode: resolve video file
// ---------------------------------------------------------------------------
let videoPath = '';
let videoSize = 0;
let videoName = '';

if (!isPhotoMode) {
  videoPath = inputPath;
  if (!videoPath.endsWith('.mp4')) {
    console.error('Video file must be .mp4');
    process.exit(1);
  }
  videoSize = fs.statSync(videoPath).size;
  videoName = path.basename(videoPath, '.mp4');

  // Load caption if provided or auto-detect
  const captionArg = process.argv[3];
  if (captionArg && fs.existsSync(captionArg)) {
    captionText = fs.readFileSync(captionArg, 'utf-8').trim();
  } else {
    const captionPath = videoPath.replace(/-final\.mp4$/, '-caption.txt').replace(/\.mp4$/, '-caption.txt');
    if (fs.existsSync(captionPath)) {
      captionText = fs.readFileSync(captionPath, 'utf-8').trim();
    }
  }

  console.log(`Video mode: ${path.basename(videoPath)} (${(videoSize / 1024 / 1024).toFixed(1)} MB)`);
  if (captionText) console.log(`Caption: ${captionText.substring(0, 60)}...`);
}

const displayName = isPhotoMode ? path.basename(inputPath) : videoName;

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
let accessToken = process.env.TIKTOK_ACCESS_TOKEN;
const refreshToken = process.env.TIKTOK_REFRESH_TOKEN;

// ---------------------------------------------------------------------------
// Express
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// -- GET /api/slides/:index — serve slide image from disk (photo mode) ------
app.get('/api/slides/:index', (req, res) => {
  if (!isPhotoMode) return res.status(404).send('Not in photo mode');
  const idx = parseInt(req.params.index, 10);
  if (idx < 0 || idx >= slidePaths.length) return res.status(404).send('Slide not found');

  const slidePath = slidePaths[idx];
  const ext = path.extname(slidePath).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
  res.set('Content-Type', contentType);
  fs.createReadStream(slidePath).pipe(res);
});

// -- GET /api/video — serve video file from disk (video mode) ---------------
app.get('/api/video', (req, res) => {
  if (isPhotoMode) return res.status(404).send('Not in video mode');
  const stat = fs.statSync(videoPath);
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(videoPath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4' });
    fs.createReadStream(videoPath).pipe(res);
  }
});

// -- GET /api/creator-info — fetch TikTok creator info + auto refresh ------
app.get('/api/creator-info', async (req, res) => {
  try {
    let info = await fetchCreatorInfo(accessToken);

    if (info._unauthorized && refreshToken) {
      console.log('Access token expired, refreshing...');
      const tokenData = await refreshAccessToken(refreshToken);
      if (tokenData.access_token) {
        accessToken = tokenData.access_token;
        console.log('Token refreshed successfully');
        info = await fetchCreatorInfo(accessToken);
      }
    }

    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function fetchCreatorInfo(token) {
  const response = await fetch(
    'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (response.status === 401) return { _unauthorized: true };

  const result = await response.json();
  if (result.error && result.error.code !== 'ok') {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.data;
}

// -- POST /api/post — upload content to TikTok ------------------------------
app.post('/api/post', async (req, res) => {
  try {
    const {
      title, description, privacy_level,
      disable_comment, disable_duet, disable_stitch,
      brand_content_toggle, brand_organic_toggle,
    } = req.body;

    const postInfo = {
      title: title.substring(0, 90),
      description: description.substring(0, 4000),
      disable_comment: !!disable_comment,
      disable_duet: !!disable_duet,
      disable_stitch: !!disable_stitch,
      privacy_level,
    };

    if (brand_content_toggle) postInfo.brand_content_toggle = true;
    if (brand_organic_toggle) postInfo.brand_organic_toggle = true;

    if (isPhotoMode) {
      // --- PHOTO CAROUSEL: upload to Firebase Storage, then PULL_FROM_URL ---
      console.log('Uploading slides to Firebase Storage...');
      const imageUrls = await uploadSlideFiles(slidePaths);
      console.log(`Got ${imageUrls.length} public URLs`);

      postInfo.auto_add_music = true;

      const initBody = {
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
        post_info: postInfo,
        source_info: {
          source: 'PULL_FROM_URL',
          photo_images: imageUrls,
          photo_cover_index: 0,
        },
      };

      console.log('Posting photo carousel to TikTok...', JSON.stringify(initBody, null, 2));

      const initResponse = await fetch(
        'https://open.tiktokapis.com/v2/post/publish/content/init/',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(initBody),
        }
      );

      const initResult = await initResponse.json();
      console.log('Init response:', JSON.stringify(initResult, null, 2));

      if (initResult.error && initResult.error.code !== 'ok') {
        throw new Error(`${initResult.error.code}: ${initResult.error.message}`);
      }

      const publishId = initResult.data?.publish_id;
      console.log('Photo post initiated. Publish ID:', publishId);
      res.json({ publish_id: publishId });

    } else {
      // --- VIDEO: FILE_UPLOAD with chunked upload ---
      const videoBuffer = fs.readFileSync(videoPath);
      const totalSize = videoBuffer.length;
      const MAX_SINGLE = 64_000_000;
      const chunkSize = totalSize <= MAX_SINGLE ? totalSize : 10_000_000;
      const totalChunks = Math.ceil(totalSize / chunkSize);

      const initBody = {
        post_info: postInfo,
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: totalSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunks,
        },
      };

      console.log('Initializing TikTok video upload...', JSON.stringify(initBody, null, 2));

      const initResponse = await fetch(
        'https://open.tiktokapis.com/v2/post/publish/video/init/',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(initBody),
        }
      );

      const initResult = await initResponse.json();
      console.log('Init response:', JSON.stringify(initResult, null, 2));

      if (initResult.error && initResult.error.code !== 'ok') {
        throw new Error(`${initResult.error.code}: ${initResult.error.message}`);
      }

      const publishId = initResult.data?.publish_id;
      const uploadUrl = initResult.data?.upload_url;

      if (!uploadUrl) throw new Error('No upload URL returned from TikTok');

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, totalSize);
        const chunk = videoBuffer.subarray(start, end);

        console.log(`  Uploading chunk ${i + 1}/${totalChunks} (${(chunk.length / 1024 / 1024).toFixed(1)} MB)...`);

        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${start}-${end - 1}/${totalSize}`,
          },
          body: chunk,
        });

        if (!uploadRes.ok && uploadRes.status !== 201 && uploadRes.status !== 206) {
          const errText = await uploadRes.text();
          throw new Error(`Chunk ${i + 1} upload failed: ${uploadRes.status} ${errText}`);
        }

        console.log(`  Chunk ${i + 1} uploaded (status ${uploadRes.status})`);
      }

      console.log('All chunks uploaded. Publish ID:', publishId);
      res.json({ publish_id: publishId });
    }
  } catch (err) {
    console.error('Post error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -- GET /api/status/:publishId — poll post status -------------------------
app.get('/api/status/:publishId', async (req, res) => {
  try {
    const response = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publish_id: req.params.publishId }),
      }
    );

    const result = await response.json();
    if (result.error && result.error.code !== 'ok') {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- GET / — main posting UI -----------------------------------------------
app.get('/', (req, res) => {
  const escapedCaption = JSON.stringify(captionText)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  const escapedDisplayName = JSON.stringify(displayName)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  res.send(buildHTML(escapedCaption, escapedDisplayName));
});

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------
function buildHTML(captionJSON, displayNameJSON) {
  // Build the media preview section based on mode
  const mediaPreview = isPhotoMode
    ? buildCarouselPreview()
    : `<video id="phone-video" src="/api/video" controls loop muted playsinline></video>`;

  const slideCount = slidePaths.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Post to TikTok</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e1e1e1;
      min-height: 100vh;
    }

    .topbar {
      background: #161616;
      border-bottom: 1px solid #2a2a2a;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .topbar-logo {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, #25f4ee, #fe2c55);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 18px; color: #fff;
    }
    .topbar h1 { font-size: 16px; font-weight: 600; }
    .topbar .mode-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      background: ${isPhotoMode ? 'rgba(37,244,238,0.15)' : 'rgba(254,44,85,0.15)'};
      color: ${isPhotoMode ? '#25f4ee' : '#fe2c55'};
    }
    .topbar .folder-name { font-size: 12px; color: #888; margin-left: auto; }

    .creator-bar {
      background: #1a1a1a;
      border-bottom: 1px solid #2a2a2a;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }
    .creator-bar .avatar {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: #333;
      object-fit: cover;
    }
    .creator-bar .name { font-weight: 600; }
    .creator-bar .capacity { color: #888; margin-left: auto; }
    .creator-bar .loading { color: #888; }
    .creator-bar .error { color: #fe2c55; }

    .main {
      display: flex;
      max-width: 1200px;
      margin: 24px auto;
      gap: 32px;
      padding: 0 24px;
    }

    /* Phone mockup */
    .phone-col { flex: 0 0 290px; }
    .phone {
      width: 270px;
      height: 540px;
      background: #1a1a1a;
      border-radius: 40px;
      padding: 10px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      border: 2px solid #333;
      position: sticky;
      top: 24px;
    }
    .phone-screen {
      width: 250px;
      height: 520px;
      background: #000;
      border-radius: 32px;
      overflow: hidden;
      position: relative;
    }
    .phone-screen video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    .dynamic-island {
      position: absolute;
      top: 12px; left: 50%;
      transform: translateX(-50%);
      width: 90px; height: 28px;
      background: #000;
      border-radius: 20px;
      z-index: 20;
    }

    /* Carousel styles */
    .carousel-container {
      width: 100%; height: 100%;
      position: relative;
    }
    .carousel-container img {
      width: 100%; height: 100%;
      object-fit: contain;
      position: absolute;
      top: 0; left: 0;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .carousel-container img.active { opacity: 1; }
    .carousel-nav {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      z-index: 10;
    }
    .carousel-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: rgba(255,255,255,0.4);
      cursor: pointer;
      border: none;
      padding: 0;
    }
    .carousel-dot.active { background: #fff; }
    .carousel-arrows {
      position: absolute;
      top: 50%; left: 0; right: 0;
      transform: translateY(-50%);
      display: flex;
      justify-content: space-between;
      padding: 0 6px;
      z-index: 10;
    }
    .carousel-arrow {
      width: 30px; height: 30px;
      border-radius: 50%;
      background: rgba(0,0,0,0.4);
      color: #fff;
      border: none;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .carousel-arrow:hover { background: rgba(0,0,0,0.7); }
    .carousel-counter {
      position: absolute;
      top: 44px; right: 12px;
      background: rgba(0,0,0,0.5);
      color: #fff;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      z-index: 10;
    }

    /* Form column */
    .form-col { flex: 1; min-width: 0; }

    .section {
      background: #161616;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .section h2 {
      font-size: 14px; font-weight: 600;
      color: #888; margin-bottom: 14px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }

    label.field { display: block; margin-bottom: 14px; }
    label.field .label-text { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
    label.field .char-count { float: right; font-size: 11px; color: #666; }
    label.field .char-count.over { color: #fe2c55; }

    input[type="text"], textarea, select {
      width: 100%;
      background: #222;
      border: 1px solid #333;
      color: #e1e1e1;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, textarea:focus, select:focus { border-color: #25f4ee; }
    textarea { resize: vertical; min-height: 100px; }
    select { cursor: pointer; }
    select option { background: #222; color: #e1e1e1; }
    .required::after { content: ' *'; color: #fe2c55; }
    select:invalid { color: #888; }

    .toggle-row {
      display: flex; align-items: center;
      justify-content: space-between; padding: 8px 0;
    }
    .toggle-row .toggle-label { font-size: 14px; }
    .toggle-row .toggle-sublabel { font-size: 12px; color: #888; margin-top: 2px; }
    .switch { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .switch .slider {
      position: absolute; inset: 0;
      background: #333; border-radius: 24px;
      cursor: pointer; transition: background 0.2s;
    }
    .switch .slider::before {
      content: ''; position: absolute;
      width: 18px; height: 18px;
      left: 3px; bottom: 3px;
      background: #fff; border-radius: 50%;
      transition: transform 0.2s;
    }
    .switch input:checked + .slider { background: #25f4ee; }
    .switch input:checked + .slider::before { transform: translateX(20px); }
    .switch input:disabled + .slider { opacity: 0.4; cursor: not-allowed; }

    .checkbox-row { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; }
    .checkbox-row input[type="checkbox"] {
      width: 18px; height: 18px; margin-top: 2px;
      accent-color: #25f4ee; flex-shrink: 0;
    }
    .checkbox-row .cb-text { font-size: 13px; }
    .checkbox-row .cb-text .cb-sub { color: #888; display: block; font-size: 12px; margin-top: 2px; }

    .disclosure-preview {
      display: inline-block; background: #2a2a2a;
      color: #aaa; font-size: 12px;
      padding: 4px 10px; border-radius: 6px; margin-top: 8px;
    }
    .disclosure-preview.active { background: rgba(37,244,238,0.15); color: #25f4ee; }

    .legal-text {
      font-size: 12px; color: #888; line-height: 1.6;
      padding: 12px; background: #1a1a1a;
      border-radius: 8px; border: 1px solid #2a2a2a;
    }
    .legal-text a { color: #25f4ee; text-decoration: underline; }

    .post-btn {
      width: 100%; padding: 16px;
      font-size: 16px; font-weight: 700;
      border: none; border-radius: 12px;
      cursor: pointer; transition: all 0.2s;
      background: linear-gradient(135deg, #fe2c55, #ff6b6b);
      color: #fff;
    }
    .post-btn:disabled { background: #333; color: #666; cursor: not-allowed; }
    .post-btn:not(:disabled):hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(254,44,85,0.4);
    }

    .status-area {
      margin-top: 16px; padding: 16px;
      border-radius: 12px; display: none; font-size: 14px;
    }
    .status-area.visible { display: block; }
    .status-area.uploading { background: rgba(37,244,238,0.1); border: 1px solid rgba(37,244,238,0.3); color: #25f4ee; }
    .status-area.processing { background: rgba(255,152,0,0.1); border: 1px solid rgba(255,152,0,0.3); color: #ff9800; }
    .status-area.success { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); color: #22c55e; }
    .status-area.error { background: rgba(254,44,85,0.1); border: 1px solid rgba(254,44,85,0.3); color: #fe2c55; }

    .conflict-warning { font-size: 12px; color: #ff9800; margin-top: 6px; display: none; }
    .conflict-warning.visible { display: block; }
    .music-link { display: inline-block; margin-top: 6px; font-size: 12px; color: #25f4ee; }
  </style>
</head>
<body>

  <div class="topbar">
    <div class="topbar-logo">P</div>
    <h1>Post to TikTok</h1>
    <span class="mode-badge">${isPhotoMode ? 'PHOTO CAROUSEL' : 'VIDEO'}</span>
    <span class="folder-name" id="folder-name"></span>
  </div>

  <!-- Creator info bar (Point 1) -->
  <div class="creator-bar" id="creator-bar">
    <span class="loading">Loading creator info...</span>
  </div>

  <div class="main">
    <!-- Left: Phone preview (Point 5) -->
    <div class="phone-col">
      <div class="phone">
        <div class="phone-screen">
          ${mediaPreview}
          <div class="dynamic-island"></div>
        </div>
      </div>
    </div>

    <!-- Right: Posting form -->
    <div class="form-col">

      <!-- Point 2: Mandatory metadata -->
      <div class="section">
        <h2>Post Details</h2>

        <label class="field">
          <span class="label-text required">Title</span>
          <span class="char-count" id="title-count">0 / 90</span>
          <input type="text" id="title" maxlength="90" placeholder="Enter title...">
        </label>

        <label class="field">
          <span class="label-text required">Description</span>
          <span class="char-count" id="desc-count">0 / 4000</span>
          <textarea id="description" maxlength="4000" rows="6" placeholder="Enter description..."></textarea>
        </label>

        <label class="field">
          <span class="label-text required">Privacy Level</span>
          <select id="privacy" required>
            <option value="" disabled selected>Select privacy level...</option>
          </select>
        </label>

        <div class="toggle-row">
          <div>
            <div class="toggle-label">Allow Comments</div>
            <div class="toggle-sublabel" id="comment-sublabel"></div>
          </div>
          <label class="switch">
            <input type="checkbox" id="allow-comment">
            <span class="slider"></span>
          </label>
        </div>

        ${!isPhotoMode ? `
        <div class="toggle-row">
          <div><div class="toggle-label">Allow Duet</div></div>
          <label class="switch">
            <input type="checkbox" id="allow-duet">
            <span class="slider"></span>
          </label>
        </div>

        <div class="toggle-row">
          <div><div class="toggle-label">Allow Stitch</div></div>
          <label class="switch">
            <input type="checkbox" id="allow-stitch">
            <span class="slider"></span>
          </label>
        </div>
        ` : ''}

        <a class="music-link" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">
          Music Usage Confirmation
        </a>
      </div>

      <!-- Point 3: Commercial content disclosure -->
      <div class="section">
        <h2>Commercial Content Disclosure</h2>

        <div class="toggle-row">
          <div>
            <div class="toggle-label">Disclose commercial content</div>
            <div class="toggle-sublabel">Let others know this post promotes a brand, product, or service</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="commercial-toggle" onchange="updateDisclosure()">
            <span class="slider"></span>
          </label>
        </div>

        <div id="commercial-options" style="display:none; margin-top: 12px; padding-left: 4px;">
          <div class="checkbox-row">
            <input type="checkbox" id="brand-organic" onchange="updateDisclosure()">
            <div class="cb-text">
              Your Brand
              <span class="cb-sub">You are promoting yourself or your own business</span>
            </div>
          </div>

          <div class="checkbox-row">
            <input type="checkbox" id="brand-content" onchange="updateDisclosure()">
            <div class="cb-text">
              Branded Content
              <span class="cb-sub">You are promoting another brand or a third party</span>
            </div>
          </div>

          <div class="conflict-warning" id="conflict-warning">
            Branded content cannot be used with "Only me" privacy. Change privacy to enable.
          </div>

          <div id="disclosure-label"></div>
        </div>
      </div>

      <!-- Point 4: Compliance declarations -->
      <div class="section">
        <h2>Compliance</h2>
        <div class="legal-text" id="legal-text">
          By posting, you agree to TikTok's
          <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">Music Usage Confirmation</a>.
        </div>
      </div>

      <!-- Point 5: Post button + status -->
      <div class="section">
        <button class="post-btn" id="post-btn" disabled onclick="submitPost()">
          Post to TikTok
        </button>
        <div class="status-area" id="status-area"></div>
      </div>

    </div>
  </div>

  <script>
    const captionText = ${captionJSON};
    const displayName = ${displayNameJSON};
    const isPhotoMode = ${isPhotoMode};
    const slideCount = ${slideCount};

    document.getElementById('folder-name').textContent = displayName;

    // Pre-fill form
    const titleEl = document.getElementById('title');
    const descEl = document.getElementById('description');

    const firstLine = captionText.split('\\n')[0] || '';
    titleEl.value = firstLine.substring(0, 90);
    descEl.value = captionText;
    updateCharCount('title', 90);
    updateCharCount('description', 4000);

    titleEl.addEventListener('input', () => updateCharCount('title', 90));
    descEl.addEventListener('input', () => updateCharCount('description', 4000));

    function updateCharCount(id, max) {
      const el = document.getElementById(id);
      const counter = document.getElementById(id === 'title' ? 'title-count' : 'desc-count');
      const len = el.value.length;
      counter.textContent = len + ' / ' + max;
      counter.classList.toggle('over', len > max);
      validateForm();
    }

    // Carousel logic (photo mode)
    if (isPhotoMode && slideCount > 0) {
      let currentSlide = 0;
      const images = document.querySelectorAll('.carousel-container img');
      const dots = document.querySelectorAll('.carousel-dot');
      const counter = document.getElementById('carousel-counter');

      function showSlide(idx) {
        currentSlide = idx;
        images.forEach((img, i) => img.classList.toggle('active', i === idx));
        dots.forEach((dot, i) => dot.classList.toggle('active', i === idx));
        if (counter) counter.textContent = (idx + 1) + ' / ' + slideCount;
      }

      dots.forEach((dot, i) => dot.addEventListener('click', () => showSlide(i)));

      const prevBtn = document.getElementById('carousel-prev');
      const nextBtn = document.getElementById('carousel-next');
      if (prevBtn) prevBtn.addEventListener('click', () => showSlide((currentSlide - 1 + slideCount) % slideCount));
      if (nextBtn) nextBtn.addEventListener('click', () => showSlide((currentSlide + 1) % slideCount));

      showSlide(0);
    }

    // Auto-play video (video mode)
    if (!isPhotoMode) {
      const video = document.getElementById('phone-video');
      if (video) video.play().catch(() => {});
    }

    // Creator info (Point 1)
    async function loadCreatorInfo() {
      const bar = document.getElementById('creator-bar');
      try {
        const res = await fetch('/api/creator-info');
        const data = await res.json();

        if (data.error) {
          bar.innerHTML = '<span class="error">Error: ' + escapeHtml(data.error) + '</span>';
          return;
        }
        if (data._unauthorized) {
          bar.innerHTML = '<span class="error">Token expired and refresh failed. Run npm run oauth.</span>';
          return;
        }

        const avatarUrl = data.creator_avatar_url;
        const nickname = data.creator_nickname || 'TikTok Creator';
        const username = data.creator_username || '';

        let html = '';
        if (avatarUrl) {
          html += '<img class="avatar" src="' + escapeHtml(avatarUrl) + '" alt="avatar">';
        } else {
          html += '<div class="avatar" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;background:#fe2c55;">' + escapeHtml(nickname.charAt(0)) + '</div>';
        }
        html += '<div>';
        html += '<div class="name">' + escapeHtml(nickname) + '</div>';
        if (username) html += '<div style="font-size:11px;color:#888;">@' + escapeHtml(username) + '</div>';
        html += '</div>';

        if (data.max_video_post_per_day !== undefined) {
          html += '<span class="capacity">Daily posts remaining allowed</span>';
        }

        bar.innerHTML = html;

        // Populate privacy dropdown from API
        const privacyEl = document.getElementById('privacy');
        (data.privacy_level_options || []).forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          const labels = {
            'PUBLIC_TO_EVERYONE': 'Public',
            'MUTUAL_FOLLOW_FRIENDS': 'Friends',
            'FOLLOWER_OF_CREATOR': 'Followers',
            'SELF_ONLY': 'Only me',
          };
          option.textContent = labels[opt] || opt;
          privacyEl.appendChild(option);
        });

        privacyEl.addEventListener('change', () => {
          updateDisclosure();
          validateForm();
        });

        // Comment/Duet/Stitch toggles
        if (data.comment_disabled) {
          document.getElementById('allow-comment').disabled = true;
          document.getElementById('comment-sublabel').textContent = 'Comments disabled by creator settings';
        }
        if (!isPhotoMode) {
          if (data.duet_disabled) document.getElementById('allow-duet').disabled = true;
          if (data.stitch_disabled) document.getElementById('allow-stitch').disabled = true;
        }

      } catch (err) {
        bar.innerHTML = '<span class="error">Failed to load creator info: ' + escapeHtml(err.message) + '</span>';
      }
    }

    loadCreatorInfo();

    // Commercial content disclosure (Point 3)
    function updateDisclosure() {
      const toggle = document.getElementById('commercial-toggle');
      const optionsDiv = document.getElementById('commercial-options');
      const brandOrganic = document.getElementById('brand-organic');
      const brandContent = document.getElementById('brand-content');
      const conflictWarn = document.getElementById('conflict-warning');
      const labelDiv = document.getElementById('disclosure-label');
      const privacyVal = document.getElementById('privacy').value;

      optionsDiv.style.display = toggle.checked ? 'block' : 'none';

      if (privacyVal === 'SELF_ONLY') {
        brandContent.disabled = true;
        brandContent.checked = false;
        conflictWarn.classList.add('visible');
      } else {
        brandContent.disabled = false;
        conflictWarn.classList.remove('visible');
      }

      if (!toggle.checked) {
        labelDiv.innerHTML = '';
      } else if (brandOrganic.checked && brandContent.checked) {
        labelDiv.innerHTML = '<div class="disclosure-preview active">Paid partnership</div>';
      } else if (brandContent.checked) {
        labelDiv.innerHTML = '<div class="disclosure-preview active">Paid partnership</div>';
      } else if (brandOrganic.checked) {
        labelDiv.innerHTML = '<div class="disclosure-preview active">Promotional content</div>';
      } else {
        labelDiv.innerHTML = '<div class="disclosure-preview">Select at least one option above</div>';
      }

      updateLegalText();
      validateForm();
    }

    // Compliance text (Point 4)
    function updateLegalText() {
      const toggle = document.getElementById('commercial-toggle');
      const brandContent = document.getElementById('brand-content');
      const legalEl = document.getElementById('legal-text');

      const musicLink = '<a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">Music Usage Confirmation</a>';
      const brandedPolicy = '<a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener">Branded Content Policy</a>';

      if (toggle.checked && brandContent.checked) {
        legalEl.innerHTML = 'By posting, you agree to TikTok\\'s ' + brandedPolicy +
          ' and confirm compliance with the ' + musicLink +
          '. You represent that you have the authorization to post branded content.';
      } else {
        legalEl.innerHTML = 'By posting, you agree to TikTok\\'s ' + musicLink + '.';
      }
    }

    // Form validation (Point 5)
    function validateForm() {
      const btn = document.getElementById('post-btn');
      const title = document.getElementById('title').value.trim();
      const privacy = document.getElementById('privacy').value;
      const toggle = document.getElementById('commercial-toggle').checked;
      const brandOrganic = document.getElementById('brand-organic').checked;
      const brandContent = document.getElementById('brand-content').checked;

      let valid = true;
      if (!title) valid = false;
      if (!privacy) valid = false;
      if (toggle && !brandOrganic && !brandContent) valid = false;

      btn.disabled = !valid;
    }

    // Post submission (Point 5)
    let isPosting = false;

    async function submitPost() {
      if (isPosting) return;
      isPosting = true;

      const btn = document.getElementById('post-btn');
      btn.disabled = true;
      btn.textContent = isPhotoMode ? 'Uploading slides...' : 'Uploading...';

      showStatus('uploading', isPhotoMode
        ? 'Uploading slides to Firebase Storage, then posting to TikTok...'
        : 'Uploading video to TikTok...');

      try {
        const body = {
          title: document.getElementById('title').value,
          description: document.getElementById('description').value,
          privacy_level: document.getElementById('privacy').value,
          disable_comment: !document.getElementById('allow-comment').checked,
        };

        if (!isPhotoMode) {
          body.disable_duet = !document.getElementById('allow-duet').checked;
          body.disable_stitch = !document.getElementById('allow-stitch').checked;
        }

        const commercialOn = document.getElementById('commercial-toggle').checked;
        if (commercialOn) {
          if (document.getElementById('brand-organic').checked) body.brand_organic_toggle = true;
          if (document.getElementById('brand-content').checked) body.brand_content_toggle = true;
        }

        const res = await fetch('/api/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showStatus('processing', 'Your post is being processed. This may take a few minutes.');
        btn.textContent = 'Processing...';

        pollStatus(data.publish_id);

      } catch (err) {
        showStatus('error', 'Error: ' + err.message);
        btn.textContent = 'Post to TikTok';
        btn.disabled = false;
        isPosting = false;
      }
    }

    async function pollStatus(publishId) {
      const btn = document.getElementById('post-btn');
      let attempts = 0;
      const maxAttempts = 60;

      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch('/api/status/' + publishId);
          const data = await res.json();

          if (data.status === 'PUBLISH_COMPLETE') {
            clearInterval(interval);
            showStatus('success', 'Post published successfully!');
            btn.textContent = 'Published!';
            isPosting = false;
          } else if (data.status === 'FAILED' || data.fail_reason) {
            clearInterval(interval);
            showStatus('error', 'Post failed: ' + (data.fail_reason || 'Unknown error'));
            btn.textContent = 'Post to TikTok';
            btn.disabled = false;
            isPosting = false;
          } else {
            showStatus('processing', 'Your post is being processed. This may take a few minutes. (Check ' + attempts + ')');
          }
        } catch (err) {
          console.error('Poll error:', err);
        }

        if (attempts >= maxAttempts) {
          clearInterval(interval);
          showStatus('error', 'Timed out waiting for post to complete. Check TikTok app.');
          btn.textContent = 'Post to TikTok';
          btn.disabled = false;
          isPosting = false;
        }
      }, 5000);
    }

    function showStatus(type, message) {
      const el = document.getElementById('status-area');
      el.className = 'status-area visible ' + type;
      el.textContent = message;
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    validateForm();
  </script>
</body>
</html>`;
}

function buildCarouselPreview() {
  const images = slidePaths.map((_, i) =>
    `<img src="/api/slides/${i}" alt="Slide ${i + 1}" ${i === 0 ? 'class="active"' : ''}>`
  ).join('\n          ');

  const dots = slidePaths.map((_, i) =>
    `<button class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`
  ).join('');

  return `
          <div class="carousel-container">
            ${images}
            <div class="carousel-counter" id="carousel-counter">1 / ${slidePaths.length}</div>
            <div class="carousel-arrows">
              <button class="carousel-arrow" id="carousel-prev">&lt;</button>
              <button class="carousel-arrow" id="carousel-next">&gt;</button>
            </div>
            <div class="carousel-nav">${dots}</div>
          </div>`;
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\nTikTok Posting UI ready at: http://localhost:${PORT}`);
  console.log(`Mode: ${isPhotoMode ? 'Photo Carousel' : 'Video'}`);
  if (isPhotoMode) {
    console.log(`Slides: ${slidePaths.length}`);
  } else {
    console.log(`Video: ${path.basename(videoPath)}`);
  }
  console.log('');
});
