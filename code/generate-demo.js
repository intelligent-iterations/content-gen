/**
 * Demo slideshow generation - uses generated gradients instead of Flux
 * Use this to test the preview while waiting for Replicate credits
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sharp from 'sharp';

import { generateContent } from './generate-content.js';
import { processAllSlides } from './add-text-overlay.js';
import { createPreviewHTML } from './create-preview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Gradient colors for demo images
const GRADIENT_COLORS = [
  { from: [255, 182, 193], to: [255, 105, 180] }, // Pink
  { from: [173, 216, 230], to: [100, 149, 237] }, // Blue
  { from: [144, 238, 144], to: [34, 139, 34] },   // Green
  { from: [255, 218, 185], to: [255, 140, 0] },   // Orange
  { from: [230, 230, 250], to: [138, 43, 226] },  // Purple
  { from: [255, 255, 224], to: [255, 215, 0] },   // Yellow
  { from: [255, 192, 203], to: [219, 112, 147] }, // Rose
];

/**
 * Generate a gradient placeholder image
 */
async function generatePlaceholderImage(slideNumber) {
  const width = 1080;
  const height = 1920;
  const colors = GRADIENT_COLORS[(slideNumber - 1) % GRADIENT_COLORS.length];

  // Create gradient using raw pixel data
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y++) {
    const ratio = y / height;
    const r = Math.round(colors.from[0] + (colors.to[0] - colors.from[0]) * ratio);
    const g = Math.round(colors.from[1] + (colors.to[1] - colors.from[1]) * ratio);
    const b = Math.round(colors.from[2] + (colors.to[2] - colors.from[2]) * ratio);

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
    }
  }

  const image = await sharp(pixels, {
    raw: {
      width,
      height,
      channels
    }
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  return image;
}

/**
 * Generate placeholder images for all slides
 */
async function generatePlaceholderImages(slides) {
  const results = [];

  for (const slide of slides) {
    console.log(`Generating placeholder for slide ${slide.slide_number}...`);
    const imageBuffer = await generatePlaceholderImage(slide.slide_number);

    results.push({
      ...slide,
      imageBuffer
    });
  }

  return results;
}

/**
 * Save images and metadata locally
 */
function saveOutput(slides, content) {
  const outputDir = path.join(__dirname, '..', 'output');

  // Create timestamped folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const folderName = `${timestamp}_DEMO_${content.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 25)}`;
  const folder = path.join(outputDir, folderName);

  fs.mkdirSync(folder, { recursive: true });

  // Save each slide
  for (const slide of slides) {
    const filename = `slide_${slide.slide_number}.jpg`;
    fs.writeFileSync(path.join(folder, filename), slide.processedImage);
    console.log(`  Saved: ${filename}`);
  }

  // Save content metadata
  const metadata = {
    topic: content.topic,
    hook: content.hook,
    caption: content.caption,
    hashtags: content.hashtags,
    demo_mode: true,
    slides: slides.map(s => ({
      slide_number: s.slide_number,
      text_overlay: s.text_overlay,
      text_position: s.text_position,
      image_prompt: s.image_prompt
    })),
    generated_at: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(folder, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  console.log(`  Saved: metadata.json`);

  // Create HTML preview
  createPreviewHTML(folder, content, slides);
  console.log(`  Saved: preview.html`);

  return folder;
}

/**
 * Main demo generation function
 */
async function generateDemo() {
  console.log('\n========================================');
  console.log('   TikTok Slideshow Generator (DEMO)');
  console.log('   Using placeholder images');
  console.log('========================================\n');

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error('XAI_API_KEY not set in .env');
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    // Step 1: Generate content with Grok
    console.log('STEP 1: Generating content with Grok...');
    console.log('----------------------------------------');
    const content = await generateContent(apiKey);
    console.log(`Topic: ${content.topic}`);
    console.log(`Hook: ${content.hook}`);
    console.log(`Slides: ${content.slides.length}`);
    console.log();

    // Step 2: Generate placeholder images
    console.log('STEP 2: Generating placeholder images...');
    console.log('----------------------------------------');
    const slidesWithImages = await generatePlaceholderImages(content.slides);
    console.log(`Generated ${slidesWithImages.length} placeholder images`);
    console.log();

    // Step 3: Add text overlays
    console.log('STEP 3: Adding text overlays...');
    console.log('----------------------------------------');
    const processedSlides = await processAllSlides(slidesWithImages);
    console.log(`Processed ${processedSlides.length} slides`);
    console.log();

    // Step 4: Save output and create preview
    console.log('STEP 4: Saving output & creating preview...');
    console.log('----------------------------------------');
    const outputFolder = saveOutput(processedSlides, content);
    console.log(`\nOutput folder: ${outputFolder}`);
    console.log();

    // Done!
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('========================================');
    console.log('   DEMO COMPLETE!');
    console.log('========================================');
    console.log();
    console.log(`Topic: ${content.topic}`);
    console.log(`Slides: ${content.slides.length}`);
    console.log(`Time: ${elapsed}s`);
    console.log();
    console.log('Note: Using gradient placeholders instead of AI images.');
    console.log('Run "npm run generate" once Replicate credits are available.');
    console.log();
    console.log(`Preview: file://${outputFolder}/preview.html`);
    console.log();

    // Open preview in browser
    const { exec } = await import('child_process');
    exec(`open "${outputFolder}/preview.html"`);

    return { success: true, outputFolder, content };

  } catch (error) {
    console.error('\nERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
generateDemo();
