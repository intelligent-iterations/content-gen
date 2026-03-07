/**
 * Step 5: App Screenshots
 *
 * Captures pom app screenshots from Android emulator with real Firebase data.
 *
 * Product Images in Screenshots:
 * - Product images are displayed in the scan preview section of the app screenshot
 * - They are passed via the productImagePath parameter to the emulator-screenshot module
 * - The product image shows alongside the ingredient list in the pom app UI
 * - Source priority: imageBuffer > imagePath > slide image in output directory
 *
 * Input: { slides[] with has_screenshot, screenshot_ingredients }
 *        slides with screenshots should have imageBuffer or imagePath
 * Output: { slides[] with screenshotBuffer/screenshotPath added }
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { captureScreenshotBatchWithFallback } from '../code/emulator-screenshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function captureScreenshots(input, outputDir) {
  const { slides } = input;
  if (!slides) throw new Error('slides required');

  fs.mkdirSync(outputDir, { recursive: true });

  // Find slides needing screenshots
  const screenshotSlides = slides.filter(s => s.has_screenshot && s.screenshot_ingredients);

  if (screenshotSlides.length === 0) {
    console.log('No slides need screenshots');
    return { slides, screenshotsCaptured: 0 };
  }

  console.log(`Capturing ${screenshotSlides.length} screenshots from emulator...`);

  // Extract ingredient sets and product images
  const ingredientSets = [];
  const productImages = [];

  for (const slide of screenshotSlides) {
    // Extract ingredient names from the screenshot_ingredients array
    const ingredients = slide.screenshot_ingredients.map(i =>
      typeof i === 'string' ? i : i.name
    );
    ingredientSets.push(ingredients);
    console.log(`  Slide ${slide.slide_number}: ${ingredients.join(', ')}`);

    // Get product image for this slide to display in the app's scan preview section
    // The productImagePath parameter is passed to emulator-screenshot which displays it
    // alongside the ingredient list in the pom app screenshot
    // Priority: imageBuffer > imagePath > slide_image in output dir
    let productImage = null;

    if (slide.imageBuffer) {
      productImage = slide.imageBuffer;
      console.log(`    Using imageBuffer (${Math.round(productImage.length / 1024)}KB)`);
    } else if (slide.imagePath && fs.existsSync(slide.imagePath)) {
      productImage = fs.readFileSync(slide.imagePath);
      console.log(`    Using imagePath: ${slide.imagePath}`);
    } else {
      // Try to find slide image in output dir
      const slidePath = path.join(outputDir, `slide_${slide.slide_number}.jpg`);
      if (fs.existsSync(slidePath)) {
        productImage = fs.readFileSync(slidePath);
        console.log(`    Using slide image: slide_${slide.slide_number}.jpg`);
      } else {
        console.log(`    Warning: No product image available for slide ${slide.slide_number}`);
      }
    }

    productImages.push(productImage);
  }

  // Capture screenshots with product images
  const screenshots = await captureScreenshotBatchWithFallback(
    ingredientSets,
    productImages,
    420000 // 7 minute timeout
  );

  // Map screenshots back to slides
  const results = [];
  let screenshotIndex = 0;

  for (const slide of slides) {
    if (slide.has_screenshot && slide.screenshot_ingredients) {
      if (screenshotIndex < screenshots.length && screenshots[screenshotIndex]) {
        const screenshotPath = path.join(outputDir, `screenshot_${slide.slide_number}.png`);
        fs.writeFileSync(screenshotPath, screenshots[screenshotIndex]);

        results.push({
          ...slide,
          screenshotPath,
          screenshotBuffer: screenshots[screenshotIndex],
          screenshotStatus: 'captured'
        });
        console.log(`  Saved screenshot for slide ${slide.slide_number}`);
      } else {
        results.push({
          ...slide,
          screenshotStatus: 'failed'
        });
        console.log(`  Failed to capture screenshot for slide ${slide.slide_number}`);
      }
      screenshotIndex++;
    } else {
      results.push(slide);
    }
  }

  const capturedCount = screenshots.filter(s => s).length;
  console.log(`Captured ${capturedCount}/${screenshotSlides.length} screenshots`);

  return {
    slides: results,
    screenshotsCaptured: capturedCount,
    screenshotsNeeded: screenshotSlides.length
  };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputFile = process.argv[2];
  const outputDir = process.argv[3] || '/tmp/slideshow-screenshots';

  if (!inputFile) {
    console.error('Usage: node step5-screenshots.js <input.json> [outputDir]');
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

  captureScreenshots(input, outputDir)
    .then(result => {
      // Don't include buffers in JSON output
      const output = {
        ...result,
        slides: result.slides.map(s => {
          const { screenshotBuffer, imageBuffer, ...rest } = s;
          return rest;
        })
      };
      console.log(JSON.stringify(output, null, 2));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
