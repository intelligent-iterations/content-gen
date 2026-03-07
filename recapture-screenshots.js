#!/usr/bin/env node
/**
 * Re-capture screenshots for iteration 3 slideshow outputs.
 * Processes each folder sequentially using the integration test.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const ADB = `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const SCANY_DIR = '/Users/lucy/pom/scany';
const SCREENSHOT_DIR = `${SCANY_DIR}/integration_test/screenshots/run_unknown`;

// Folders with screenshot slides to process, most recent first
const FOLDERS = [
  '/Users/lucy/pom/video_gen/output/iteration3/2026-02-10T16-44-01_3-kid-snack-swaps',
  '/Users/lucy/pom/video_gen/output/iteration3/2026-02-10T16-34-25_3-breakfast-snack-swaps',
  '/Users/lucy/pom/video_gen/output/iteration3/2026-02-10T16-14-07_3-popular-snack-swaps',
  '/Users/lucy/pom/video_gen/output/iteration3/2026-02-10T15-52-08_3-everyday-grocery-swaps',
];

function cleanScreenshotDir() {
  if (existsSync(SCREENSHOT_DIR)) {
    const files = readdirSync(SCREENSHOT_DIR);
    for (const f of files) {
      unlinkSync(path.join(SCREENSHOT_DIR, f));
    }
  } else {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

function pushImageToEmulator(localPath, index) {
  const tmpPath = `/data/local/tmp/pom_product_${index}.jpg`;
  execSync(`${ADB} push "${localPath}" ${tmpPath}`, { stdio: 'pipe' });
  return tmpPath;
}

function copyImageToAppCache(index) {
  const tmpPath = `/data/local/tmp/pom_product_${index}.jpg`;
  const cachePath = `/data/data/app.thepom.dev/cache/pom_screenshots/product_${index}.jpg`;
  try {
    execSync(`${ADB} shell "run-as app.thepom.dev mkdir -p /data/data/app.thepom.dev/cache/pom_screenshots"`, { stdio: 'pipe' });
    execSync(`${ADB} shell "run-as app.thepom.dev cp ${tmpPath} ${cachePath}"`, { stdio: 'pipe' });
    return cachePath;
  } catch (e) {
    // If run-as fails, just use /data/local/tmp/ path
    console.log(`  Note: Could not copy to app cache, using /data/local/tmp/ path`);
    return tmpPath;
  }
}

function processFolder(folderPath) {
  const folderName = path.basename(folderPath);
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Processing: ${folderName}`);
  console.log(`${'='.repeat(80)}`);

  const metadataPath = path.join(folderPath, 'metadata.json');
  if (!existsSync(metadataPath)) {
    console.log('  No metadata.json found, skipping.');
    return;
  }

  const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
  const slides = metadata.slides;

  // Find screenshot slides and their preceding product slides
  const screenshotSlides = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.slide_type === 'screenshot' && slide.screenshot_ingredients) {
      const prevSlide = slides[i - 1];
      const productImageFile = `slide_${prevSlide.slide_number}.jpg`;
      const productImagePath = path.join(folderPath, productImageFile);

      screenshotSlides.push({
        slideNumber: slide.slide_number,
        ingredients: slide.screenshot_ingredients,
        productImagePath: existsSync(productImagePath) ? productImagePath : null,
        productImageFile,
        outputFile: `slide_${slide.slide_number}.png`,
      });
    }
  }

  if (screenshotSlides.length === 0) {
    console.log('  No screenshot slides found, skipping.');
    return;
  }

  console.log(`  Found ${screenshotSlides.length} screenshot slides: ${screenshotSlides.map(s => s.slideNumber).join(', ')}`);

  // Process each screenshot slide one at a time (one flutter drive per set)
  // This avoids memory issues and dart-define caching problems
  let copied = 0;
  for (let i = 0; i < screenshotSlides.length; i++) {
    const ss = screenshotSlides[i];
    const destFile = path.join(folderPath, ss.outputFile);

    console.log(`  Set ${i + 1}/${screenshotSlides.length}: slide_${ss.slideNumber} (${ss.ingredients.slice(0, 2).map(x => x.name).join(', ')}...)`);

    // Push product image for this set
    let productImagePath = '';
    if (ss.productImagePath) {
      console.log(`    Pushing product image: ${ss.productImageFile}`);
      productImagePath = pushImageToEmulator(ss.productImagePath, 0);
    }

    // Write JSON config file (runtime, avoids dart-define caching)
    const config = {
      ingredients: [ss.ingredients.map(ing => ing.name)],
      product_images: productImagePath ? [productImagePath] : [],
    };
    const localConfigPath = '/tmp/pom_screenshot_config.json';
    const deviceConfigPath = '/data/local/tmp/pom_screenshot_config.json';
    writeFileSync(localConfigPath, JSON.stringify(config));
    execSync(`${ADB} push ${localConfigPath} ${deviceConfigPath}`, { stdio: 'pipe' });

    // Clean previous screenshots
    cleanScreenshotDir();

    // Force-stop app between sets to free memory (skip first)
    if (i > 0) {
      try { execSync(`${ADB} shell am force-stop app.thepom.dev`, { stdio: 'pipe' }); } catch (e) {}
      // Wait for cleanup
      execSync('sleep 3');
    }

    // Run integration test (no dart-defines needed — config is in JSON file)
    const flutterCmd = `cd ${SCANY_DIR} && flutter drive --driver=test_driver/integration_test.dart --target=integration_test/tiktok_screenshot_test.dart --flavor dev -d emulator-5554`;

    let testOutput = '';
    try {
      testOutput = execSync(flutterCmd, {
        timeout: 300000,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
      });
      console.log('    Integration test completed.');
    } catch (err) {
      testOutput = (err.stdout || '') + (err.stderr || '');
      console.log('    Integration test finished (may have warnings).');
    }

    // Check for screenshot
    const srcFile = path.join(SCREENSHOT_DIR, 'tiktok_screenshot_1.png');
    if (existsSync(srcFile)) {
      try {
        execSync(`sips -z 1920 1080 "${srcFile}"`, { stdio: 'pipe' });
      } catch (e) {
        console.log(`    Warning: resize failed`);
      }
      copyFileSync(srcFile, destFile);
      console.log(`    ✓ Captured -> ${ss.outputFile}`);
      copied++;
    } else {
      console.log(`    ✗ Screenshot not found (skipped)`);
    }
  }

  console.log(`  Folder complete: ${copied}/${screenshotSlides.length} screenshots replaced.`);
}

// Main
console.log('Re-capturing screenshots for iteration 3 slideshows');
console.log(`Processing ${FOLDERS.length} folders sequentially...\n`);

for (const folder of FOLDERS) {
  processFolder(folder);
}

console.log('\n\nDone! All folders processed.');
