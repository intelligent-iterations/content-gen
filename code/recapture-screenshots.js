/**
 * Re-capture screenshots for an existing slideshow output folder.
 *
 * Uses the slide images as product images for the screenshot scan preview section.
 * This allows users to see the featured product/image while viewing ingredient
 * information in the pom app screenshot.
 *
 * Usage: node recapture-screenshots.js <output-folder-path>
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { captureScreenshotBatchWithFallback } from './emulator-screenshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function recaptureScreenshots(outputDir) {
  // Read metadata
  const metadataPath = path.join(outputDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`metadata.json not found in ${outputDir}`);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  console.log(`Topic: ${metadata.topic}`);

  // Find slides needing screenshots
  const screenshotSlides = metadata.slides.filter(
    s => s.has_screenshot && s.screenshot_ingredients
  );

  if (screenshotSlides.length === 0) {
    console.log('No slides need screenshots');
    return;
  }

  console.log(`Found ${screenshotSlides.length} slides needing screenshots:`);

  // Extract ingredient sets and load product images
  const ingredientSets = [];
  const productImages = [];

  for (const slide of screenshotSlides) {
    // Extract ingredient names
    const ingredients = slide.screenshot_ingredients.map(i => i.name);
    ingredientSets.push(ingredients);
    console.log(`  Slide ${slide.slide_number}: ${ingredients.join(', ')}`);

    // Load the slide image as product image to display in the screenshot scan preview section
    // The product image is passed via the productImagePath parameter and shown alongside
    // the ingredient list in the pom app's screenshot
    const slidePath = path.join(outputDir, `slide_${slide.slide_number}.jpg`);
    if (fs.existsSync(slidePath)) {
      const imageBuffer = fs.readFileSync(slidePath);
      productImages.push(imageBuffer);
      console.log(`    Product image: slide_${slide.slide_number}.jpg (${Math.round(imageBuffer.length / 1024)}KB)`);
    } else {
      console.log(`    Warning: slide_${slide.slide_number}.jpg not found`);
      productImages.push(null);
    }
  }

  // Capture screenshots
  console.log('\nCapturing screenshots with product images...');
  const screenshots = await captureScreenshotBatchWithFallback(
    ingredientSets,
    productImages,
    420000 // 7 minute timeout
  );

  if (screenshots.length === 0) {
    console.error('Failed to capture any screenshots');
    return;
  }

  // Save screenshots back to output folder
  console.log(`\nSaving ${screenshots.length} screenshots...`);
  for (let i = 0; i < screenshots.length; i++) {
    const slide = screenshotSlides[i];
    const screenshotPath = path.join(outputDir, `slide_${slide.slide_number}.png`);
    fs.writeFileSync(screenshotPath, screenshots[i]);
    console.log(`  Saved: slide_${slide.slide_number}.png`);
  }

  console.log('\nDone! Screenshot slides have been recaptured with product images.');
}

// CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputDir = process.argv[2];

  if (!outputDir) {
    console.error('Usage: node recapture-screenshots.js <output-folder-path>');
    console.error('Example: node recapture-screenshots.js ../output/2026-02-01T03-54-35_hidden-dangers-in-popular-skin');
    process.exit(1);
  }

  const fullPath = path.resolve(outputDir);

  recaptureScreenshots(fullPath)
    .then(() => {
      console.log('\nRecapture complete!');
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

export { recaptureScreenshots };
