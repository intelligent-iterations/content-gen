/**
 * Auto-post to YouTube Shorts via Playwright browser automation
 *
 * Posts 1 video per run to YouTube as a Short.
 * Uses Grok API for title/description generation, then Playwright for upload.
 * Auth via exported browser cookies (no OAuth/API key needed).
 *
 * Usage:
 *   node code/auto-post-youtube.js
 *   node code/auto-post-youtube.js --dry-run
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const XAI_API_KEY = process.env.XAI_API_KEY;
const PYTHON_PATH = path.join(__dirname, '..', '.venv', 'bin', 'python3');
const UPLOAD_SCRIPT = path.join(__dirname, '..', 'scripts', 'youtube_upload.py');

const VIDEOS_DIR = path.join(__dirname, '..', 'videos');
const TRACKER_PATH = path.join(__dirname, '..', 'YOUTUBE_POSTED_VIDEOS.md');

/**
 * Get already-posted video names from tracker
 */
function getPostedItems() {
  try {
    const content = fs.readFileSync(TRACKER_PATH, 'utf-8');
    return [...content.matchAll(/\*\*Folder:\*\*\s*`([^`]+)`/g)].map(m => m[1]);
  } catch (e) {
    return [];
  }
}

/**
 * Add entry to posted tracker
 */
function addToTracker(folder, topic, url) {
  const date = new Date().toISOString().split('T')[0];
  let content = '';
  try {
    content = fs.readFileSync(TRACKER_PATH, 'utf-8');
  } catch (e) {
    content = `# YouTube Shorts Posted Tracker\n\n> Track YouTube Shorts uploads from the pom video generator\n\n---\n`;
  }

  content += `\n## ${date}\n\n### ${topic}\n**Folder:** \`${folder}\`\n**Posted:** ${date}\n**URL:** ${url}\n\n---\n`;
  fs.writeFileSync(TRACKER_PATH, content);
}

/**
 * Find unposted videos
 */
function findUnpostedVideos(posted) {
  const videos = [];

  try {
    const entries = fs.readdirSync(VIDEOS_DIR);
    for (const entry of entries) {
      const fullPath = path.join(VIDEOS_DIR, entry);
      try {
        if (!fs.statSync(fullPath).isDirectory()) continue;
        const files = fs.readdirSync(fullPath);
        const captioned = files.find(f => f.endsWith('-captioned.mp4'));
        const final_ = files.find(f => f.endsWith('-final.mp4'));
        const videoFile = captioned || final_;
        if (videoFile) {
          const captionFile = files.find(f => f.endsWith('-caption.txt'));
          let caption = '';
          if (captionFile) {
            caption = fs.readFileSync(path.join(fullPath, captionFile), 'utf-8').trim();
          }
          videos.push({
            name: entry,
            path: fullPath,
            videoFile: path.join(fullPath, videoFile),
            caption,
          });
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* dir doesn't exist */ }

  return videos
    .filter(v => !posted.includes(v.name))
    .sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Call Grok API for YouTube Shorts metadata
 */
async function generateMetadata(topic, caption) {
  const res = await axios.post('https://api.x.ai/v1/chat/completions', {
    model: 'grok-3-mini',
    messages: [
      {
        role: 'system',
        content: `You are a YouTube Shorts content strategist for thepom.app, an ingredient scanner app. Given a topic and caption, return a JSON object with: title (max 100 chars, engaging, include #Shorts), description (max 500 chars, include "Download The Pom app to scan your products" and relevant hashtags). Return ONLY valid JSON, no markdown.`
      },
      {
        role: 'user',
        content: `Topic: ${topic}. Caption preview: ${(caption || '').substring(0, 300)}. Generate YouTube Shorts metadata.`
      }
    ],
    max_tokens: 300
  }, {
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const content = res.data.choices[0].message.content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
  return JSON.parse(jsonStr);
}

/**
 * Run Playwright upload script
 */
function runUploadScript(filePath, title, description) {
  return new Promise((resolve, reject) => {
    const args = [
      UPLOAD_SCRIPT,
      '--file', filePath,
      '--title', title,
      '--description', description,
    ];

    console.log(`  Running: ${PYTHON_PATH} ${UPLOAD_SCRIPT}`);
    console.log(`  File: ${filePath}`);

    execFile(PYTHON_PATH, args, {
      cwd: path.join(__dirname, '..'),
      timeout: 300000, // 5 min — video uploads take longer
      env: { ...process.env }
    }, (error, stdout, stderr) => {
      if (stderr) console.log(`  stderr: ${stderr}`);
      if (error) {
        reject(new Error(`Upload failed: ${error.message}\n${stderr}`));
        return;
      }

      // Parse last JSON line from stdout
      const lines = stdout.trim().split('\n').filter(l => l.startsWith('{'));
      const lastLine = lines[lines.length - 1];
      try {
        const result = JSON.parse(lastLine);
        resolve(result);
      } catch (e) {
        console.log(`  stdout: ${stdout}`);
        resolve({ status: 'unknown', stdout });
      }
    });
  });
}

/**
 * Main
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(50));
  console.log('  YouTube Shorts Auto-Poster (Playwright)');
  console.log('  ' + new Date().toISOString());
  if (dryRun) console.log('  ** DRY RUN **');
  console.log('='.repeat(50));
  console.log();

  // Check cookies exist
  const cookiesPath = path.join(__dirname, '..', 'youtube_cookies.json');
  if (!fs.existsSync(cookiesPath)) {
    console.log('youtube_cookies.json not found!');
    console.log('Export cookies from Cookie-Editor extension on studio.youtube.com');
    return { success: false, reason: 'no_cookies' };
  }

  const posted = getPostedItems();
  const videos = findUnpostedVideos(posted);

  if (videos.length === 0) {
    console.log('No unposted videos found!');
    return { success: false, reason: 'no_content' };
  }

  const item = videos[0];
  const topic = item.name.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-/g, ' ');

  console.log(`Found unposted video: ${item.name}`);
  console.log(`  Topic: ${topic}`);
  console.log(`  File: ${item.videoFile}`);
  console.log();

  // Generate metadata via Grok
  console.log('Generating YouTube metadata via Grok...');
  let grokMeta;
  try {
    grokMeta = await generateMetadata(topic, item.caption);
    console.log(`  Title: ${grokMeta.title}`);
    console.log(`  Description: ${grokMeta.description?.substring(0, 80)}...`);
  } catch (e) {
    console.log(`  Grok failed, using fallback: ${e.message}`);
    grokMeta = {
      title: `${topic.substring(0, 90)} #Shorts`,
      description: `${(item.caption || topic).substring(0, 450)}\n\nDownload The Pom app to scan your products`
    };
  }
  console.log();

  if (dryRun) {
    console.log('[dry-run] Would upload:');
    console.log(`  File: ${item.videoFile}`);
    console.log(`  Title: ${grokMeta.title}`);
    console.log(`  Description: ${grokMeta.description?.substring(0, 100)}...`);
    return { success: true, dryRun: true };
  }

  // Upload via Playwright
  console.log('Uploading via Playwright...');
  const result = await runUploadScript(item.videoFile, grokMeta.title, grokMeta.description);

  if (result.status === 'success') {
    console.log('\nSUCCESS!');
    addToTracker(item.name, topic, result.url || 'check YouTube Studio');
    console.log(`Tracked in ${TRACKER_PATH}`);
  } else {
    console.log('\nUpload result:', JSON.stringify(result));
  }

  return { success: result.status === 'success', folder: item.name };
}

main()
  .then(result => {
    if (result.success) {
      console.log('\nDone!');
    } else {
      console.log(`\nNo post made: ${result.reason || 'upload failed'}`);
    }
  })
  .catch(err => {
    console.error('\nError:', err.message);
    process.exit(1);
  });
