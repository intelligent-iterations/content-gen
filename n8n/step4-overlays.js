/**
 * Step 4: Text Overlays
 *
 * n8n Code Node compatible
 * Input: { slides[] with imagePath }
 * Output: { slides[] with finalImagePath }
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function stripEmojis(text) {
  return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
}

function createTextSvg(text, width, position = 'top') {
  const cleanText = stripEmojis(text);
  const fontSize = Math.min(72, Math.floor(width / (cleanText.length * 0.5)));
  const padding = 40;
  const lineHeight = fontSize * 1.3;

  // Word wrap
  const maxCharsPerLine = Math.floor((width - padding * 2) / (fontSize * 0.55));
  const words = cleanText.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  const textHeight = lines.length * lineHeight + padding * 2;
  const y = position === 'top' ? 200 : 1920 - textHeight - 200;

  const textElements = lines.map((line, i) => {
    const lineY = y + padding + (i + 1) * lineHeight;
    return `
      <text x="${width / 2}" y="${lineY}" text-anchor="middle"
            font-family="Arial Black, sans-serif" font-size="${fontSize}" font-weight="900"
            stroke="black" stroke-width="8" fill="white"
            paint-order="stroke fill">${line}</text>
    `;
  }).join('');

  return `
    <svg width="${width}" height="1920" xmlns="http://www.w3.org/2000/svg">
      ${textElements}
    </svg>
  `;
}

export async function addOverlays(input, outputDir) {
  const { slides } = input;
  if (!slides) throw new Error('slides required');

  fs.mkdirSync(outputDir, { recursive: true });

  const results = [];

  for (const slide of slides) {
    if (!slide.imagePath || !slide.text_overlay) {
      results.push(slide);
      continue;
    }

    const outputPath = path.join(outputDir, `slide_${slide.slide_number}.jpg`);

    // Create text overlay SVG
    const svg = createTextSvg(slide.text_overlay, 1080, slide.text_position || 'top');

    // Composite
    await sharp(slide.imagePath)
      .resize(1080, 1920, { fit: 'cover' })
      .composite([{
        input: Buffer.from(svg),
        top: 0,
        left: 0
      }])
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    results.push({
      ...slide,
      finalImagePath: outputPath
    });
  }

  return { slides: results };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputFile = process.argv[2];
  const outputDir = process.argv[3] || '/tmp/slideshow-final';

  if (!inputFile) {
    console.error('Usage: node step4-overlays.js <input.json> [outputDir]');
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

  addOverlays(input, outputDir)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
