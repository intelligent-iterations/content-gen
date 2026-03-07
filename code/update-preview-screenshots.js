#!/usr/bin/env node
/**
 * Update preview.html with recaptured screenshots
 * Replaces embedded base64 images for specific slides
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function updatePreviewScreenshots(outputFolder) {
  const previewPath = path.join(outputFolder, 'preview.html');

  if (!fs.existsSync(previewPath)) {
    console.error('preview.html not found:', previewPath);
    return false;
  }

  let html = fs.readFileSync(previewPath, 'utf8');

  // Find all PNG screenshots in the folder
  const pngFiles = fs.readdirSync(outputFolder)
    .filter(f => f.startsWith('slide_') && f.endsWith('.png'))
    .sort();

  console.log(`Found ${pngFiles.length} PNG screenshots to update`);

  for (const pngFile of pngFiles) {
    // Extract slide number from filename (e.g., slide_3.png -> 3)
    const match = pngFile.match(/slide_(\d+)\.png/);
    if (!match) continue;

    const slideNum = parseInt(match[1]);
    const pngPath = path.join(outputFolder, pngFile);
    const pngBuffer = fs.readFileSync(pngPath);
    const pngBase64 = pngBuffer.toString('base64');

    console.log(`  Updating slide ${slideNum}: ${pngFile} (${Math.round(pngBuffer.length / 1024)}KB)`);

    // Find the slide div and update its image
    // The slides are in order, so slide 3 is at index 2 (0-indexed)
    // Look for: data-slide="${slideNum}" ... src="data:image/...;base64,...">
    const slidePattern = new RegExp(
      `(<div class="slide" data-slide="${slideNum}">\\s*<img src="data:image\\/[^;]+;base64,)[^"]+(")`
    );

    if (slidePattern.test(html)) {
      html = html.replace(slidePattern, `$1${pngBase64}$2`);
      console.log(`    Updated in slides grid`);
    }

    // Also update in phone preview if this slide is currently shown
    // The phone image uses id="phone-image" and shows the first slide by default
    // We need to update the JavaScript imageSources array too
  }

  // Write updated HTML
  fs.writeFileSync(previewPath, html);
  console.log(`\nUpdated: ${previewPath}`);

  return true;
}

// CLI usage
const outputFolder = process.argv[2];

if (!outputFolder) {
  console.log('Usage: node update-preview-screenshots.js <output-folder>');
  console.log('Example: node update-preview-screenshots.js output/2026-02-01T03-54-35_hidden-dangers-in-popular-skin');
  process.exit(1);
}

const fullPath = path.isAbsolute(outputFolder)
  ? outputFolder
  : path.join(__dirname, '..', outputFolder);

updatePreviewScreenshots(fullPath)
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
