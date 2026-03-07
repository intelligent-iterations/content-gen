/**
 * Regenerate posted videos with Grok image model for A/B testing
 *
 * Reads existing metadata from posted videos and regenerates only the AI images
 * using Grok, while preserving screenshots. Outputs to output/grok/<folder-name>/
 *
 * Usage:
 *   node code/regenerate-with-grok.js                    # Process all posted videos
 *   node code/regenerate-with-grok.js <folder-name>      # Process specific video
 *   node code/regenerate-with-grok.js --latest           # Process only the latest video
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { generateImage, downloadImage, IMAGE_MODELS } from './generate-image.js';
import { addTextOverlay } from './add-text-overlay.js';
import { createPreviewHTML } from './create-preview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const GROK_OUTPUT_DIR = path.join(OUTPUT_DIR, 'grok');
const RATE_LIMIT_WAIT = 5000; // 5 seconds between requests

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Get list of posted video folders from CURRENT_POSTED_VIDEOS.md
 */
function getPostedVideoFolders() {
  const mdPath = path.join(__dirname, '..', 'CURRENT_POSTED_VIDEOS.md');
  const content = fs.readFileSync(mdPath, 'utf-8');

  // Extract folder names from markdown
  const folderRegex = /\*\*Output folder:\*\* `output\/([^`]+)`/g;
  const folders = [];
  let match;

  while ((match = folderRegex.exec(content)) !== null) {
    folders.push(match[1]);
  }

  return folders;
}

/**
 * Check if a slide is a screenshot (not AI-generated)
 */
function isScreenshotSlide(slide, slideFiles, slideNumber) {
  // Screenshots are typically .png files
  const pngFile = slideFiles.find(f => f === `slide_${slideNumber}.png`);
  if (pngFile) return true;

  // Also check if it has no image_prompt (pure screenshot slides)
  if (!slide.image_prompt && slide.has_screenshot !== false) return true;

  return false;
}

/**
 * Regenerate a single video with Grok
 */
async function regenerateVideo(folderName, tokens) {
  const sourceDir = path.join(OUTPUT_DIR, folderName);
  const targetDir = path.join(GROK_OUTPUT_DIR, folderName);

  // Check source exists
  if (!fs.existsSync(sourceDir)) {
    console.error(`  Source folder not found: ${sourceDir}`);
    return false;
  }

  // Check for metadata
  const metadataPath = path.join(sourceDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error(`  No metadata.json found in ${folderName}`);
    return false;
  }

  // Load metadata
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  console.log(`  Topic: ${metadata.topic}`);
  console.log(`  Slides: ${metadata.slides.length}`);

  // Get list of existing slide files
  const slideFiles = fs.readdirSync(sourceDir).filter(f => f.startsWith('slide_'));

  // Create target directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Process each slide
  const processedSlides = [];

  for (const slide of metadata.slides) {
    const slideNum = slide.slide_number;
    console.log(`\n  Processing slide ${slideNum}...`);

    // Check if this is a screenshot slide
    const isScreenshot = isScreenshotSlide(slide, slideFiles, slideNum);

    if (isScreenshot) {
      // Copy screenshot as-is
      const srcFile = slideFiles.find(f => f.startsWith(`slide_${slideNum}.`));
      if (srcFile) {
        const srcPath = path.join(sourceDir, srcFile);
        const destPath = path.join(targetDir, srcFile);
        fs.copyFileSync(srcPath, destPath);
        console.log(`    Copied screenshot: ${srcFile}`);

        processedSlides.push({
          ...slide,
          processedImage: fs.readFileSync(srcPath),
          isScreenshot: true
        });
      }
    } else {
      // Regenerate AI image with Grok
      if (!slide.image_prompt) {
        console.log(`    No image_prompt, skipping...`);
        continue;
      }

      console.log(`    Generating with Grok: ${slide.image_prompt.substring(0, 50)}...`);

      try {
        const imageUrl = await generateImage(tokens, slide.image_prompt, { model: IMAGE_MODELS.grok });
        const imageBuffer = await downloadImage(imageUrl);

        // Apply text overlay if present
        let finalImage = imageBuffer;
        if (slide.text_overlay) {
          console.log(`    Adding text overlay: "${slide.text_overlay}"`);
          finalImage = await addTextOverlay(imageBuffer, slide.text_overlay, slide.text_position || 'top');
        }

        // Save slide
        const filename = `slide_${slideNum}.jpg`;
        fs.writeFileSync(path.join(targetDir, filename), finalImage);
        console.log(`    Saved: ${filename}`);

        processedSlides.push({
          ...slide,
          processedImage: finalImage,
          isScreenshot: false
        });

        // Rate limit
        console.log(`    Waiting ${RATE_LIMIT_WAIT / 1000}s before next image...`);
        await sleep(RATE_LIMIT_WAIT);

      } catch (error) {
        console.error(`    ERROR generating slide ${slideNum}: ${error.message}`);
        return false;
      }
    }
  }

  // Save updated metadata
  const newMetadata = {
    ...metadata,
    image_model: 'grok',
    regenerated_from: folderName,
    regenerated_at: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(targetDir, 'metadata.json'),
    JSON.stringify(newMetadata, null, 2)
  );
  console.log(`\n  Saved: metadata.json`);

  // Create preview HTML
  try {
    createPreviewHTML(targetDir, metadata, processedSlides);
    console.log(`  Saved: preview.html`);
  } catch (error) {
    console.log(`  Warning: Could not create preview - ${error.message}`);
  }

  return true;
}

/**
 * Main function
 */
async function main() {
  console.log('\n========================================');
  console.log('   Regenerate Videos with Grok');
  console.log('========================================\n');

  // Validate API key
  const xaiApiKey = process.env.XAI_API_KEY;
  if (!xaiApiKey) {
    console.error('ERROR: XAI_API_KEY not set in .env file');
    process.exit(1);
  }

  const tokens = {
    xaiApiKey,
    replicateToken: process.env.REPLICATE_API_TOKEN
  };

  // Parse arguments
  const args = process.argv.slice(2);
  let foldersToProcess = [];

  if (args.length === 0) {
    // Process all posted videos
    foldersToProcess = getPostedVideoFolders();
    console.log(`Found ${foldersToProcess.length} posted videos to process.\n`);
  } else if (args[0] === '--latest') {
    // Process only the latest
    const allFolders = getPostedVideoFolders();
    foldersToProcess = [allFolders[allFolders.length - 1]];
    console.log(`Processing latest video only.\n`);
  } else {
    // Process specific folder
    foldersToProcess = [args[0]];
    console.log(`Processing specific video: ${args[0]}\n`);
  }

  // Create grok output directory
  fs.mkdirSync(GROK_OUTPUT_DIR, { recursive: true });

  // Process each video
  let successCount = 0;
  let failCount = 0;

  for (const folder of foldersToProcess) {
    console.log(`\n----------------------------------------`);
    console.log(`Processing: ${folder}`);
    console.log(`----------------------------------------`);

    // Check if already processed
    const targetDir = path.join(GROK_OUTPUT_DIR, folder);
    if (fs.existsSync(targetDir)) {
      console.log(`  Already processed, skipping. Delete ${targetDir} to reprocess.`);
      continue;
    }

    const success = await regenerateVideo(folder, tokens);
    if (success) {
      successCount++;
      console.log(`\n  SUCCESS: ${folder}`);
    } else {
      failCount++;
      console.log(`\n  FAILED: ${folder}`);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('   COMPLETE');
  console.log('========================================');
  console.log(`Processed: ${successCount} success, ${failCount} failed`);
  console.log(`Output: ${GROK_OUTPUT_DIR}`);
  console.log();

  // Open preview for latest if successful
  if (successCount > 0 && foldersToProcess.length === 1) {
    const previewPath = path.join(GROK_OUTPUT_DIR, foldersToProcess[0], 'preview.html');
    if (fs.existsSync(previewPath)) {
      console.log(`Opening preview: ${previewPath}`);
      const { exec } = await import('child_process');
      exec(`open "${previewPath}"`);
    }
  }
}

main().catch(error => {
  console.error('\nFATAL ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
