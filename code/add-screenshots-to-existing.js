/**
 * Add missing screenshot slides to existing slideshow output folders.
 * Reads metadata.json, captures screenshots via emulator, inserts them,
 * and updates metadata + preview.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { captureScreenshotBatchWithFallback } from './emulator-screenshot.js';
import { createPreviewHTML } from './create-preview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Folders to fix (passed as args or hardcoded)
const folders = process.argv.slice(2);

if (folders.length === 0) {
  console.error('Usage: node add-screenshots-to-existing.js <folder1> <folder2> ...');
  process.exit(1);
}

async function addScreenshots() {
  // Collect all ingredient sets across all folders first, then batch capture
  const allJobs = [];

  for (const folder of folders) {
    const metaPath = path.join(folder, 'metadata.json');
    if (!fs.existsSync(metaPath)) {
      console.error(`No metadata.json in ${folder}, skipping`);
      continue;
    }

    const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    // Find slides that need screenshots
    for (const slide of metadata.slides) {
      if (slide.has_screenshot && slide.screenshot_ingredients?.length > 0) {
        // Check if screenshot already exists
        const screenshotSlideNum = slide.slide_number + 1;
        const screenshotPath = path.join(folder, `slide_${screenshotSlideNum}.png`);
        if (fs.existsSync(screenshotPath)) {
          console.log(`Screenshot already exists: ${screenshotPath}, skipping`);
          continue;
        }

        const ingredientNames = slide.screenshot_ingredients.map(i => i.name);

        // Try to use existing slide 2 image as product image for the screenshot
        const slideImagePath = path.join(folder, `slide_${slide.slide_number}.jpg`);
        const productImage = fs.existsSync(slideImagePath)
          ? fs.readFileSync(slideImagePath)
          : null;

        allJobs.push({
          folder,
          metadata,
          slideNumber: slide.slide_number,
          ingredients: ingredientNames,
          productImage
        });
      }
    }
  }

  if (allJobs.length === 0) {
    console.log('No screenshots needed!');
    return;
  }

  console.log(`\nCapturing ${allJobs.length} screenshots...\n`);

  // Capture all screenshots in one batch
  const ingredientSets = allJobs.map(j => j.ingredients);
  const productImages = allJobs.map(j => j.productImage);

  const screenshotBuffers = await captureScreenshotBatchWithFallback(
    ingredientSets,
    productImages,
    420000 // 7 min timeout
  );

  console.log(`\nCaptured ${screenshotBuffers.length}/${allJobs.length} screenshots\n`);

  // Now insert screenshots into each folder
  for (let i = 0; i < allJobs.length; i++) {
    const job = allJobs[i];
    const buffer = screenshotBuffers[i];

    if (!buffer) {
      console.error(`  No screenshot for ${path.basename(job.folder)} slide ${job.slideNumber}, skipping`);
      continue;
    }

    console.log(`\nInserting screenshot into ${path.basename(job.folder)}...`);

    // The screenshot goes after the slide with has_screenshot: true
    // Current layout: slide_1.jpg, slide_2.jpg, slide_3.jpg
    // Target layout:  slide_1.jpg, slide_2.jpg, slide_3.png (screenshot), slide_4.jpg (was slide_3)

    const insertAfter = job.slideNumber; // screenshot goes after this slide number
    const totalExistingSlides = job.metadata.slides.length;

    // Rename slides from the end to avoid conflicts
    for (let s = totalExistingSlides; s > insertAfter; s--) {
      const oldJpg = path.join(job.folder, `slide_${s}.jpg`);
      const oldPng = path.join(job.folder, `slide_${s}.png`);
      const newNum = s + 1;
      if (fs.existsSync(oldJpg)) {
        fs.renameSync(oldJpg, path.join(job.folder, `slide_${newNum}.jpg`));
        console.log(`  Renamed slide_${s}.jpg → slide_${newNum}.jpg`);
      }
      if (fs.existsSync(oldPng)) {
        fs.renameSync(oldPng, path.join(job.folder, `slide_${newNum}.png`));
        console.log(`  Renamed slide_${s}.png → slide_${newNum}.png`);
      }
    }

    // Write the screenshot
    const screenshotPath = path.join(job.folder, `slide_${insertAfter + 1}.png`);
    fs.writeFileSync(screenshotPath, buffer);
    console.log(`  Saved screenshot: slide_${insertAfter + 1}.png`);

    // Update metadata - insert screenshot slide
    const screenshotSlide = {
      slide_number: insertAfter + 1,
      image_source: 'screenshot',
      image_prompt: null,
      text_overlay: null,
      text_position: null,
      has_screenshot: false,
      screenshot_position: null,
      screenshot_ingredients: job.metadata.slides.find(s => s.slide_number === insertAfter)?.screenshot_ingredients || null
    };

    // Insert into slides array and renumber
    const insertIndex = job.metadata.slides.findIndex(s => s.slide_number === insertAfter) + 1;
    job.metadata.slides.splice(insertIndex, 0, screenshotSlide);

    // Renumber all slides
    job.metadata.slides.forEach((s, idx) => {
      s.slide_number = idx + 1;
    });

    // Save updated metadata
    fs.writeFileSync(
      path.join(job.folder, 'metadata.json'),
      JSON.stringify(job.metadata, null, 2)
    );
    console.log(`  Updated metadata.json`);

    // Rebuild preview HTML
    const content = {
      topic: job.metadata.topic,
      hook: job.metadata.hook,
      caption: job.metadata.caption,
      hashtags: job.metadata.hashtags,
      slides: job.metadata.slides
    };

    // Build slide data for preview
    const allSlides = job.metadata.slides.map(s => {
      const ext = s.image_source === 'screenshot' ? 'png' : 'jpg';
      const imgPath = path.join(job.folder, `slide_${s.slide_number}.${ext}`);
      return {
        ...s,
        slideType: s.image_source === 'screenshot' ? 'screenshot' : 'product',
        processedImage: fs.existsSync(imgPath) ? fs.readFileSync(imgPath) : null
      };
    });

    createPreviewHTML(job.folder, content, allSlides);
    console.log(`  Updated preview.html`);
  }

  console.log('\nDone!');
}

addScreenshots().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
