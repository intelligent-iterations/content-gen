/**
 * Main slideshow generation script
 * Orchestrates the full pipeline: Grok -> Flux -> Text Overlay -> Preview
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { generateContent } from './generate-content.js';
import { generateAllImages, IMAGE_MODELS } from './generate-image.js';
import { processAllSlides } from './add-text-overlay.js';
import { createPreviewHTML } from './create-preview.js';

// Parse CLI args for image model selection
function parseImageModel() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    const lower = arg.toLowerCase();
    if (lower === 'grok' || lower === '--grok') {
      return IMAGE_MODELS.grok;
    }
    if (lower === 'replicate' || lower === '--replicate') {
      return IMAGE_MODELS.replicate;
    }
  }
  return IMAGE_MODELS.replicate; // default
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Configuration
const config = {
  xaiApiKey: process.env.XAI_API_KEY,
  replicateToken: process.env.REPLICATE_API_TOKEN,
  imageModel: parseImageModel()
};

/**
 * Validate configuration based on selected image model
 */
function validateConfig() {
  const missing = [];

  // Always need xAI key for content generation
  if (!config.xaiApiKey) missing.push('XAI_API_KEY');

  // Check image model specific requirements
  if (config.imageModel === IMAGE_MODELS.grok) {
    // Grok uses xAI key (already checked above)
  } else {
    // Replicate needs its own token
    if (!config.replicateToken) missing.push('REPLICATE_API_TOKEN');
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(v => console.error(`  - ${v}`));
    console.error('\nCheck your .env file');
    process.exit(1);
  }
}

/**
 * Save images and metadata locally
 * @param {Array} slides - Processed slides with images
 * @param {Object} content - Generated content metadata
 * @param {string} imageModel - Image model used ('replicate' or 'grok')
 */
function saveOutput(slides, content, imageModel) {
  const outputDir = path.join(__dirname, '..', 'output');

  // Create timestamped folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const folderName = `${timestamp}_${content.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
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
    image_model: imageModel, // Track for A/B testing
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
  const previewPath = createPreviewHTML(folder, content, slides);
  console.log(`  Saved: preview.html`);

  return folder;
}

/**
 * Main slideshow generation function
 */
async function generateSlideshow() {
  console.log('\n========================================');
  console.log('   TikTok Slideshow Generator');
  console.log('   thepom.app');
  console.log('========================================\n');

  validateConfig();

  const imageModel = config.imageModel;
  console.log(`Image model: ${imageModel.toUpperCase()}`);
  console.log();

  const startTime = Date.now();

  try {
    // Step 1: Generate content with Grok
    console.log('STEP 1: Generating content with Grok...');
    console.log('----------------------------------------');
    const content = await generateContent(config.xaiApiKey);
    console.log(`Topic: ${content.topic}`);
    console.log(`Hook: ${content.hook}`);
    console.log(`Slides: ${content.slides.length}`);
    console.log();

    // Step 2: Generate images
    const modelLabel = imageModel === IMAGE_MODELS.grok ? 'Grok' : 'Replicate (Seedream)';
    console.log(`STEP 2: Generating images with ${modelLabel}...`);
    console.log('----------------------------------------');
    const tokens = {
      replicateToken: config.replicateToken,
      xaiApiKey: config.xaiApiKey
    };
    const slidesWithImages = await generateAllImages(tokens, content.slides, { model: imageModel });
    console.log(`Generated ${slidesWithImages.length} images`);
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
    const outputFolder = saveOutput(processedSlides, content, imageModel);
    console.log(`\nOutput folder: ${outputFolder}`);
    console.log();

    // Done!
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('========================================');
    console.log('   COMPLETE!');
    console.log('========================================');
    console.log();
    console.log(`Topic: ${content.topic}`);
    console.log(`Slides: ${content.slides.length}`);
    console.log(`Image model: ${imageModel}`);
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
generateSlideshow();

export { generateSlideshow };
