/**
 * Step 6: Generate Preview HTML
 *
 * n8n Code Node compatible
 * Input: { slides[], topic, caption, hashtags, outputDir }
 * Output: { previewPath, previewUrl, topic }
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function generatePreview(input) {
  const { slides, topic, caption, hashtags, outputDir } = input;
  if (!slides || !outputDir) throw new Error('slides and outputDir required');

  const previewPath = path.join(outputDir, 'preview.html');

  // Read all slide images and convert to base64
  const slideData = slides.map((slide, i) => {
    const imagePath = slide.finalImagePath || slide.imagePath;
    if (imagePath && fs.existsSync(imagePath)) {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64 = imageBuffer.toString('base64');
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return {
        ...slide,
        base64: `data:${mimeType};base64,${base64}`
      };
    }
    return slide;
  });

  const hashtagsHTML = hashtags.map(h => `<span class="hashtag">#${h}</span>`).join(' ');
  const fullCaption = `${caption}\n\n${hashtags.map(h => `#${h}`).join(' ')}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ready to Post: ${topic}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
      color: #fff;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      text-align: center;
      margin-bottom: 30px;
      padding: 30px;
      background: linear-gradient(135deg, #fe2c55, #25f4ee);
      border-radius: 20px;
    }
    header h1 { font-size: 28px; margin-bottom: 8px; }
    header p { opacity: 0.9; }
    .ready-badge {
      display: inline-block;
      background: #22c55e;
      color: #fff;
      padding: 8px 20px;
      border-radius: 20px;
      font-weight: bold;
      margin-top: 12px;
    }
    .main-content { display: flex; gap: 30px; flex-wrap: wrap; }
    .slides-panel { flex: 1; min-width: 300px; }
    .slides-panel h2 { margin-bottom: 16px; color: #888; }
    .slides-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px;
    }
    .slide {
      aspect-ratio: 9/16;
      border-radius: 12px;
      overflow: hidden;
      position: relative;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .slide:hover { transform: scale(1.05); }
    .slide img { width: 100%; height: 100%; object-fit: cover; }
    .slide-num {
      position: absolute;
      top: 8px;
      left: 8px;
      background: #fe2c55;
      color: #fff;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }
    .caption-panel {
      flex: 1;
      min-width: 300px;
      background: #161616;
      border-radius: 20px;
      padding: 24px;
    }
    .caption-panel h2 { margin-bottom: 16px; color: #888; }
    .caption-text {
      background: #0a0a0a;
      border-radius: 12px;
      padding: 16px;
      white-space: pre-wrap;
      line-height: 1.6;
      font-size: 14px;
      max-height: 300px;
      overflow-y: auto;
      margin-bottom: 16px;
    }
    .hashtags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
    .hashtag {
      background: rgba(37, 244, 238, 0.1);
      color: #25f4ee;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
    }
    .action-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
    .action-btn {
      padding: 16px 28px;
      border: none;
      border-radius: 14px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .copy-btn {
      background: linear-gradient(135deg, #25f4ee, #00d4aa);
      color: #000;
      flex: 1;
    }
    .download-btn {
      background: linear-gradient(135deg, #fe2c55, #ff6b6b);
      color: #fff;
      flex: 1;
    }
    .action-btn:hover { transform: translateY(-2px); }
    .action-btn.success { background: #22c55e !important; color: #fff !important; }
    .stats {
      display: flex;
      gap: 20px;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #333;
    }
    .stat { text-align: center; flex: 1; }
    .stat-value { font-size: 28px; font-weight: bold; color: #fe2c55; }
    .stat-label { font-size: 12px; color: #888; margin-top: 4px; }
    .preview-modal {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.9);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .preview-modal.active { display: flex; }
    .preview-modal img {
      max-height: 90vh;
      max-width: 90vw;
      border-radius: 20px;
    }
    .preview-modal .close {
      position: absolute;
      top: 20px;
      right: 20px;
      font-size: 32px;
      cursor: pointer;
      color: #fff;
    }
    footer { text-align: center; padding: 40px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${topic}</h1>
      <p>TikTok Carousel Ready to Post</p>
      <div class="ready-badge">✓ Ready to Post</div>
    </header>

    <div class="main-content">
      <div class="slides-panel">
        <h2>Slides (${slideData.length})</h2>
        <div class="slides-grid">
          ${slideData.map((slide, i) => `
            <div class="slide" onclick="openPreview(${i})">
              <img src="${slide.base64}" alt="Slide ${i + 1}">
              <div class="slide-num">${i + 1}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="caption-panel">
        <h2>Caption</h2>
        <div class="caption-text" id="caption-text">${fullCaption}</div>
        <div class="hashtags">${hashtagsHTML}</div>

        <div class="action-buttons">
          <button class="action-btn copy-btn" onclick="copyCaption()">
            📋 Copy Caption
          </button>
          <button class="action-btn download-btn" onclick="downloadAll()">
            ⬇️ Download Images
          </button>
        </div>

        <div class="stats">
          <div class="stat">
            <div class="stat-value">${slideData.length}</div>
            <div class="stat-label">Slides</div>
          </div>
          <div class="stat">
            <div class="stat-value">${caption.length}</div>
            <div class="stat-label">Characters</div>
          </div>
          <div class="stat">
            <div class="stat-value">${hashtags.length}</div>
            <div class="stat-label">Hashtags</div>
          </div>
        </div>
      </div>
    </div>

    <footer>Generated by pom TikTok Automation</footer>
  </div>

  <div class="preview-modal" id="modal" onclick="closePreview()">
    <span class="close">&times;</span>
    <img id="modal-img" src="" alt="Preview">
  </div>

  <script>
    const images = ${JSON.stringify(slideData.map(s => s.base64))};

    function copyCaption() {
      const text = document.getElementById('caption-text').innerText;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.innerHTML = '✅ Copied!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.innerHTML = '📋 Copy Caption';
          btn.classList.remove('success');
        }, 2000);
      });
    }

    function downloadAll() {
      const btn = document.querySelector('.download-btn');
      btn.innerHTML = '⏳ Downloading...';
      images.forEach((src, i) => {
        const link = document.createElement('a');
        link.href = src;
        link.download = 'slide_' + (i + 1) + '.jpg';
        document.body.appendChild(link);
        setTimeout(() => {
          link.click();
          document.body.removeChild(link);
        }, i * 200);
      });
      setTimeout(() => {
        btn.innerHTML = '✅ Downloaded!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.innerHTML = '⬇️ Download Images';
          btn.classList.remove('success');
        }, 2000);
      }, images.length * 200 + 500);
    }

    function openPreview(index) {
      document.getElementById('modal-img').src = images[index];
      document.getElementById('modal').classList.add('active');
    }

    function closePreview() {
      document.getElementById('modal').classList.remove('active');
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePreview();
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(previewPath, html);

  // Try to open in browser
  try {
    if (process.platform === 'darwin') {
      await execAsync(`open "${previewPath}"`);
    } else if (process.platform === 'linux') {
      await execAsync(`xdg-open "${previewPath}"`);
    }
  } catch (e) {
    // Ignore if can't open browser
  }

  return {
    topic,
    previewPath,
    previewUrl: `file://${previewPath}`,
    slidesCount: slides.length,
    captionLength: caption.length
  };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputFile = process.argv[2];

  if (!inputFile) {
    console.error('Usage: node step6-preview.js <input.json>');
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

  generatePreview(input)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
