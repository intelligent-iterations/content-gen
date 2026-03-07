/**
 * Auto-post to Pinterest via Zendriver browser automation
 *
 * Posts 1 item per run (photo slideshow OR video) to Pinterest.
 * Uses Grok API for title/description generation, then Zendriver for upload.
 *
 * Usage:
 *   node code/auto-post-pinterest.js
 *   node code/auto-post-pinterest.js --dry-run
 *   node code/auto-post-pinterest.js --type=video
 *   node code/auto-post-pinterest.js --type=photo
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
const ZENDRIVER_SCRIPT = path.join(__dirname, '..', 'scripts', 'pinterest_video_upload.py');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const ITERATION3_DIR = path.join(__dirname, '..', 'output', 'iteration3');
const VIDEOS_DIR = path.join(__dirname, '..', 'videos');
const TRACKER_PATH = path.join(__dirname, '..', 'PINTEREST_POSTED_VIDEOS.md');

const BOARD_NAME = 'HEALTH INFO';


/**
 * Get already-posted folder/video names from tracker
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
function addToTracker(folder, topic, board, type) {
  const date = new Date().toISOString().split('T')[0];
  let content = '';
  try {
    content = fs.readFileSync(TRACKER_PATH, 'utf-8');
  } catch (e) {
    content = `# Pinterest Posted Videos Tracker\n\n> Track Pinterest posts from the pom video generator\n\n---\n`;
  }

  content += `\n## ${date}\n\n### ${topic}\n**Folder:** \`${folder}\`\n**Posted:** ${date}\n**Board:** ${board}\n**Type:** ${type}\n\n---\n`;
  fs.writeFileSync(TRACKER_PATH, content);
}

/**
 * Find unposted slideshow folders
 */
function findUnpostedSlideshows(posted) {
  const folders = [];

  for (const dir of [ITERATION3_DIR, OUTPUT_DIR]) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry === 'iteration3') continue;
        const fullPath = path.join(dir, entry);
        const metaPath = path.join(fullPath, 'metadata.json');
        try {
          if (fs.statSync(fullPath).isDirectory() && fs.existsSync(metaPath)) {
            const slides = fs.readdirSync(fullPath).filter(f => f.startsWith('slide_') && (f.endsWith('.jpg') || f.endsWith('.png')));
            if (slides.length > 0) {
              folders.push({ name: entry, path: fullPath, type: 'photo' });
            }
          }
        } catch (e) { /* skip */ }
      }
    } catch (e) { /* dir doesn't exist */ }
  }

  return folders
    .filter(f => !posted.includes(f.name))
    .sort((a, b) => b.name.localeCompare(a.name));
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
            type: 'video'
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
 * Select best slide image for a photo pin (prefer hook slide as JPG)
 */
function selectBestSlide(folderPath) {
  const slides = fs.readdirSync(folderPath)
    .filter(f => f.startsWith('slide_') && (f.endsWith('.jpg') || f.endsWith('.png')))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide_(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide_(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  // Prefer slide_1.jpg (the hook slide)
  const hookSlide = slides.find(f => f.includes('slide_1') && f.endsWith('.jpg'));
  return path.join(folderPath, hookSlide || slides[0]);
}

/**
 * Call Grok API for Pinterest metadata
 */
async function generateMetadata(topic, caption) {
  const res = await axios.post('https://api.x.ai/v1/chat/completions', {
    model: 'grok-3-mini',
    messages: [
      {
        role: 'system',
        content: `You are a Pinterest content strategist for thepom.app, an ingredient scanner app. Given a topic and caption, return a JSON object with: title (max 100 chars, engaging), description (max 500 chars, include relevant hashtags for Pinterest discovery). Return ONLY valid JSON, no markdown.`
      },
      {
        role: 'user',
        content: `Topic: ${topic}. Caption preview: ${(caption || '').substring(0, 300)}. Generate Pinterest metadata.`
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
 * Run Zendriver upload script
 */
function runZendriver(filePath, title, description, board) {
  return new Promise((resolve, reject) => {
    const args = [
      ZENDRIVER_SCRIPT,
      '--file', filePath,
      '--title', title,
      '--description', description,
      '--board', board
    ];

    console.log(`  Running: ${PYTHON_PATH} ${ZENDRIVER_SCRIPT}`);
    console.log(`  File: ${filePath}`);

    execFile(PYTHON_PATH, args, {
      cwd: path.join(__dirname, '..'),
      timeout: 120000,
      env: { ...process.env }
    }, (error, stdout, stderr) => {
      if (stderr) console.log(`  stderr: ${stderr}`);
      if (error) {
        reject(new Error(`Zendriver failed: ${error.message}\n${stderr}`));
        return;
      }

      // Parse last JSON line from stdout (script may output multiple lines)
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
  const typeFilter = process.argv.find(a => a.startsWith('--type='))?.split('=')[1];

  console.log('='.repeat(50));
  console.log('  Pinterest Auto-Poster (Zendriver)');
  console.log('  ' + new Date().toISOString());
  if (dryRun) console.log('  ** DRY RUN **');
  if (typeFilter) console.log(`  Filter: ${typeFilter} only`);
  console.log('='.repeat(50));
  console.log();

  const posted = getPostedItems();

  // Find content to post
  let item = null;
  let filePath = null;
  let topic = '';
  let caption = '';

  if (typeFilter !== 'video') {
    const slideshows = findUnpostedSlideshows(posted);
    if (slideshows.length > 0) {
      const selected = slideshows[0];
      const metadata = JSON.parse(fs.readFileSync(path.join(selected.path, 'metadata.json'), 'utf-8'));
      item = selected;
      filePath = selectBestSlide(selected.path);
      topic = metadata.topic || selected.name;
      caption = metadata.caption || '';
      console.log(`Found unposted slideshow: ${selected.name}`);
    }
  }

  if (!item && typeFilter !== 'photo') {
    const videos = findUnpostedVideos(posted);
    if (videos.length > 0) {
      item = videos[0];
      filePath = item.videoFile;
      topic = item.name.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-/g, ' ');
      caption = item.caption;
      console.log(`Found unposted video: ${item.name}`);
    }
  }

  if (!item) {
    console.log('No unposted content found!');
    return { success: false, reason: 'no_content' };
  }

  console.log(`  Type: ${item.type}`);
  console.log(`  Topic: ${topic}`);
  console.log(`  File: ${filePath}`);
  console.log();

  // Generate metadata via Grok
  console.log('Generating Pinterest metadata via Grok...');
  let grokMeta;
  try {
    grokMeta = await generateMetadata(topic, caption);
    console.log(`  Title: ${grokMeta.title}`);
    console.log(`  Description: ${grokMeta.description?.substring(0, 80)}...`);
  } catch (e) {
    console.log(`  Grok failed, using fallback: ${e.message}`);
    grokMeta = {
      title: topic.substring(0, 100),
      description: (caption || topic).substring(0, 500)
    };
  }

  const board = BOARD_NAME;
  console.log(`  Board: ${board}`);
  console.log();

  if (dryRun) {
    console.log('[dry-run] Would upload:');
    console.log(`  File: ${filePath}`);
    console.log(`  Title: ${grokMeta.title}`);
    console.log(`  Board: ${board}`);
    return { success: true, dryRun: true };
  }

  // Upload via Zendriver
  console.log('Uploading via Zendriver...');
  const result = await runZendriver(filePath, grokMeta.title, grokMeta.description, board);

  if (result.status === 'success') {
    console.log('\nSUCCESS!');
    addToTracker(item.name, topic, board, item.type);
    console.log(`Tracked in ${TRACKER_PATH}`);
  } else {
    console.log('\nUpload result:', JSON.stringify(result));
  }

  return { success: result.status === 'success', folder: item.name, board, type: item.type };
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
