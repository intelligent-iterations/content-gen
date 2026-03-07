/**
 * Demo slideshow generation script (v2 with AI orchestrator)
 * Uses gradient placeholders instead of Flux to avoid API costs
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { orchestrateContentGeneration } from './ai-orchestrator.js';
import { processAllSlides } from './add-text-overlay.js';
import { createPreviewHTML } from './create-preview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Configuration
const config = {
  xaiApiKey: process.env.XAI_API_KEY
};

// Gradient colors for demo images
const GRADIENT_COLORS = [
  { r: 147, g: 51, b: 234 },   // Purple
  { r: 59, g: 130, b: 246 },   // Blue
  { r: 16, g: 185, b: 129 },   // Green
  { r: 245, g: 158, b: 11 },   // Orange
  { r: 239, g: 68, b: 68 },    // Red
  { r: 236, g: 72, b: 153 },   // Pink
  { r: 99, g: 102, b: 241 }    // Indigo
];

/**
 * Validate configuration
 */
function validateConfig() {
  if (!config.xaiApiKey) {
    console.error('Missing XAI_API_KEY in .env file');
    process.exit(1);
  }
}

/**
 * Generate a gradient placeholder image
 */
async function generateGradientImage(slideNumber) {
  const color = GRADIENT_COLORS[(slideNumber - 1) % GRADIENT_COLORS.length];

  // Create a gradient-like image with some variation
  const darkerColor = {
    r: Math.max(0, color.r - 50),
    g: Math.max(0, color.g - 50),
    b: Math.max(0, color.b - 50)
  };

  // Create base image
  const image = await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 4,
      background: color
    }
  })
  .png()
  .toBuffer();

  return image;
}

/**
 * Generate all placeholder images
 */
async function generateAllPlaceholders(slides) {
  const results = [];

  for (const slide of slides) {
    console.log(`Generating placeholder for slide ${slide.slide_number}...`);
    const imageBuffer = await generateGradientImage(slide.slide_number);

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

  // Create timestamped folder with DEMO prefix
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const folderName = `${timestamp}_DEMO-V2_${content.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 25)}`;
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
    slides: slides.map(s => ({
      slide_number: s.slide_number,
      text_overlay: s.text_overlay,
      text_position: s.text_position,
      image_prompt: s.image_prompt,
      has_screenshot: s.has_screenshot || false,
      screenshot_position: s.screenshot_position || null
    })),
    research_context: content.research_context || null,
    generated_at: new Date().toISOString(),
    demo_mode: true
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
 * Main demo slideshow generation function (v2)
 */
async function generateDemoV2() {
  console.log('\n========================================');
  console.log('   TikTok Slideshow Generator v2');
  console.log('   DEMO MODE (Gradient Placeholders)');
  console.log('   thepom.app');
  console.log('========================================\n');

  validateConfig();

  const startTime = Date.now();

  try {
    // Step 1: AI Orchestration (Research + Content Generation)
    console.log('STEP 1: AI Research & Content Generation...');
    console.log('----------------------------------------');
    const content = await orchestrateContentGeneration(config.xaiApiKey);
    console.log(`\nTopic: ${content.topic}`);
    console.log(`Hook: ${content.hook}`);
    console.log(`Slides: ${content.slides.length}`);

    // Count screenshots
    const screenshotSlides = content.slides.filter(s => s.has_screenshot).length;
    console.log(`Slides with pom screenshots: ${screenshotSlides}`);
    console.log();

    // Step 2: Generate gradient placeholders
    console.log('STEP 2: Generating placeholder images...');
    console.log('----------------------------------------');
    const slidesWithImages = await generateAllPlaceholders(content.slides);
    console.log(`Generated ${slidesWithImages.length} placeholder images`);
    console.log();

    // Step 3: Add text overlays and screenshots
    console.log('STEP 3: Adding text overlays & screenshots...');
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
    console.log('   COMPLETE! (DEMO MODE)');
    console.log('========================================');
    console.log();
    console.log(`Topic: ${content.topic}`);
    console.log(`Slides: ${content.slides.length}`);
    console.log(`Screenshots: ${screenshotSlides}`);
    console.log(`Time: ${elapsed}s`);
    console.log();
    console.log(`Preview: file://${outputFolder}/preview.html`);
    console.log();

    // Open preview in browser
    const { exec } = await import('child_process');
    exec(`open "${outputFolder}/preview.html"`);

    return {
      success: true,
      outputFolder,
      content,
      slides: processedSlides
    };

  } catch (error) {
    console.error('\nERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
generateDemoV2();

export { generateDemoV2 };
