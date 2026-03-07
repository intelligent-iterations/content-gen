/**
 * Main slideshow generation script (v2)
 *
 * Workflow:
 * 1. IDEA - Grok picks topic
 * 2. RESEARCH - DuckDuckGo for facts + product images
 * 3. IMAGE SOURCING - Web images for products, AI for creative
 * 4. SCREENSHOT GENERATION - Real ingredients from research
 * 5. OVERLAYS - Text + screenshots
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { orchestrateContentGeneration } from './ai-orchestrator.js';
import { generateImage, downloadImage, IMAGE_MODELS } from './generate-image.js';
import { processAllSlides, addTextOverlay } from './add-text-overlay.js';
import { createPreviewHTML } from './create-preview.js';
import { getLogger, resetLogger } from './debug-logger.js';
// TikTok upload disabled pending audit approval
// import { uploadAllImages, uploadToTikTokDrafts } from './upload-to-tiktok.js';
// NOTE: We use REAL screenshots from the emulator, not the fake SVG generator
// import { generatePomScreenshot } from './generate-screenshot.js'; // DO NOT USE - fake data is dangerous
import { captureScreenshotBatchWithFallback } from './emulator-screenshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

// Configuration
const config = {
  xaiApiKey: process.env.XAI_API_KEY,
  replicateToken: process.env.REPLICATE_API_TOKEN,
  tiktokAccessToken: process.env.TIKTOK_ACCESS_TOKEN,
  imageModel: parseImageModel()
};

// Rate limit delay between Flux requests
const FLUX_DELAY = 10000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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

  console.log(`Image model: ${config.imageModel.toUpperCase()}`);
}

/**
 * Get image for a slide - supports both text2img and img2img
 * @param {Object} slide - Slide configuration
 * @param {Buffer} referenceImage - Optional product image for img2img
 */
async function getSlideImage(slide, referenceImage = null) {
  const prompt = slide.image_prompt || '9:16 vertical aspect ratio, aesthetic bathroom vanity with skincare products, soft natural lighting, clean minimal composition, pink and white tones, space at top for text overlay, no text in image';

  if (referenceImage) {
    // Image-to-image generation with product photo
    return await generateAIImage(prompt, { referenceImage });
  } else {
    // Text-to-image generation
    return await generateAIImage(prompt);
  }
}

/**
 * Generate AI image (supports both text2img and img2img)
 * @param {string} prompt - Text prompt
 * @param {Object} options - Options including referenceImage for img2img
 */
async function generateAIImage(prompt, options = {}) {
  const modelLabel = config.imageModel === IMAGE_MODELS.grok ? 'Grok' : 'Seedream-4';
  if (options.referenceImage) {
    console.log(`  Generating IMAGE-TO-IMAGE with ${modelLabel}...`);
  } else {
    console.log(`  Generating text-to-image with ${modelLabel}...`);
  }
  const tokens = {
    replicateToken: config.replicateToken,
    xaiApiKey: config.xaiApiKey
  };
  const imageUrl = await generateImage(tokens, prompt, { ...options, model: config.imageModel });
  const buffer = await downloadImage(imageUrl);
  return {
    buffer,
    source: options.referenceImage ? 'img2img' : 'ai',
    prompt,
    usedReferenceImage: !!options.referenceImage
  };
}

/**
 * Get images for all slides
 */
async function getAllSlideImages(slides, productImages = []) {
  const logger = getLogger();
  const results = [];
  let needsDelay = false;

  for (const slide of slides) {
    // Check if this slide wants to use a captured product image
    const useProductImage = slide.use_product_image;
    let productImageRef = null;

    if (useProductImage && productImages[useProductImage - 1]) {
      productImageRef = productImages[useProductImage - 1];

      // Check if prompt is just showing product plainly - if so, use original image
      const promptLower = (slide.image_prompt || '').toLowerCase();
      const isPlainProductShot = promptLower.includes('product shot') ||
                                  promptLower.includes('product image') ||
                                  promptLower.includes('simple product') ||
                                  promptLower.includes('product on white') ||
                                  promptLower.includes('product only') ||
                                  (promptLower.includes('product') && !promptLower.includes('person') && !promptLower.includes('woman') && !promptLower.includes('hand') && !promptLower.includes('bathroom') && !promptLower.includes('shelf') && !promptLower.includes('store'));

      if (isPlainProductShot) {
        console.log(`\nSlide ${slide.slide_number}: using ORIGINAL product image "${productImageRef.productName}" (no AI needed)`);
        // Use original image directly
        results.push({
          ...slide,
          imageBuffer: productImageRef.imageBuffer,
          imageSource: 'product_image'
        });

        logger.logStep(`Using Original Product Image: Slide ${slide.slide_number}`, 'image-generation', {
          slide_number: slide.slide_number,
          product_name: productImageRef.productName,
          reason: 'Prompt requests plain product shot - using original captured image'
        }, {
          imagePreview: `data:image/jpeg;base64,${productImageRef.imageBuffer.toString('base64')}`
        });

        continue; // Skip AI generation
      }

      console.log(`\nSlide ${slide.slide_number}: using product image "${productImageRef.productName}" for IMG2IMG`);
    } else {
      console.log(`\nSlide ${slide.slide_number}: generating AI image`);
    }

    // CTA slides: generate a clean gradient programmatically (skip AI entirely)
    // This avoids content filter issues — a gradient doesn't need AI
    if (slide.slide_type === 'cta') {
      console.log(`  CTA slide — generating gradient background (no AI needed)`);
      const sharp = (await import('sharp')).default;
      // Create a warm gradient using SVG
      const svgGradient = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f5f0e8"/>
            <stop offset="50%" stop-color="#ede4d3"/>
            <stop offset="100%" stop-color="#e8dcc8"/>
          </linearGradient>
        </defs>
        <rect width="1080" height="1920" fill="url(#bg)"/>
      </svg>`;
      const ctaBuffer = await sharp(Buffer.from(svgGradient)).jpeg({ quality: 92 }).toBuffer();
      results.push({
        ...slide,
        imageBuffer: ctaBuffer,
        imageSource: 'gradient'
      });
      logger.logStep(`CTA Gradient: Slide ${slide.slide_number}`, 'image-generation', {
        slide_number: slide.slide_number,
        reason: 'CTA slides use programmatic gradient to avoid content filter'
      }, null);
      continue;
    }

    // Log image request (include reference image if img2img)
    const referenceImagePreview = productImageRef?.imageBuffer
      ? `data:image/jpeg;base64,${productImageRef.imageBuffer.toString('base64')}`
      : null;

    logger.logStep(`Image Request: Slide ${slide.slide_number}`, 'image-generation', {
      slide_number: slide.slide_number,
      image_prompt: slide.image_prompt,
      use_product_image: useProductImage || null,
      product_image_name: productImageRef?.productName || null,
      generation_mode: productImageRef ? 'img2img' : 'text2img',
      referenceImagePreview: referenceImagePreview
    }, null);

    // Add delay between AI requests
    if (needsDelay) {
      console.log(`  Waiting ${FLUX_DELAY / 1000}s before Seedream request...`);
      await sleep(FLUX_DELAY);
    }

    // Generate image - use img2img if product image available, otherwise text2img
    const referenceBuffer = productImageRef?.imageBuffer || null;
    let imageData;
    try {
      imageData = await getSlideImage(slide, referenceBuffer);
    } catch (imgErr) {
      // If image generation fails (e.g. content filter), create a plain fallback
      console.warn(`  Image generation failed for slide ${slide.slide_number}: ${imgErr.message}`);
      console.warn('  Using plain color fallback');
      const sharp = (await import('sharp')).default;
      const fallbackBuffer = await sharp({
        create: { width: 1080, height: 1920, channels: 3, background: { r: 245, g: 245, b: 240 } }
      }).jpeg({ quality: 92 }).toBuffer();
      imageData = { buffer: fallbackBuffer, source: 'fallback', prompt: slide.image_prompt, usedReferenceImage: false };
    }

    // Convert buffer to base64 for debug report preview
    const imageBase64 = imageData.buffer.toString('base64');

    // Log image result with preview
    logger.logStep(`Image Generated: Slide ${slide.slide_number}`, 'image-generation', {
      prompt: slide.image_prompt || 'fallback prompt',
      generation_mode: imageData.usedReferenceImage ? 'img2img' : 'text2img',
      product_reference: productImageRef?.productName || null
    }, {
      source: imageData.source,
      bufferSize: imageData.buffer?.length || 0,
      usedImg2Img: imageData.usedReferenceImage || false,
      imagePreview: `data:image/jpeg;base64,${imageBase64}`
    });

    results.push({
      ...slide,
      imageBuffer: imageData.buffer,
      imageSource: 'ai'
    });

    needsDelay = true;
  }

  return results;
}

/**
 * Generate screenshot slides as separate full 9:16 slides
 * Expands slides with has_screenshot:true into product slide + screenshot slide
 *
 * IMPORTANT: Screenshots MUST use real Firebase data via the emulator.
 * Fake/mock data is dangerous for ingredient safety apps - people could be harmed.
 *
 * Uses batch mode to capture all screenshots in a single app session for efficiency.
 */
async function expandWithScreenshotSlides(processedSlides, useEmulator = true, capturedProductImages = []) {
  const logger = getLogger();

  // First, collect all slides that need screenshots
  const slidesNeedingScreenshots = processedSlides.filter(
    slide => slide.has_screenshot && slide.screenshot_ingredients?.length > 0
  );

  console.log(`Found ${slidesNeedingScreenshots.length} slides needing screenshots`);

  // Capture all screenshots in batch (single app session)
  let screenshotBuffers = [];
  if (useEmulator && slidesNeedingScreenshots.length > 0) {
    console.log('  Capturing REAL screenshots from emulator in BATCH mode...');

    // Extract ingredient sets for batch capture
    const ingredientSets = slidesNeedingScreenshots.map(slide =>
      slide.screenshot_ingredients.map(i => i.name)
    );

    // For product images in pom screenshots: prefer REAL captured product images over AI-generated ones
    // Real images have actual branding and look much better in the app screenshot
    const productImages = slidesNeedingScreenshots.map(slide => {
      // If this slide used a captured product image (use_product_image), use the original
      if (slide.use_product_image && capturedProductImages[slide.use_product_image - 1]) {
        const original = capturedProductImages[slide.use_product_image - 1];
        console.log(`  Using REAL product image for screenshot: "${original.productName}"`);
        return original.imageBuffer;
      }
      // Also check if ANY slide in the carousel used a real product image (likely slide 1)
      // and use that for the screenshot since it's the same product
      if (capturedProductImages.length > 0 && capturedProductImages[0]?.imageBuffer) {
        console.log(`  Using REAL product image from slide 1 for screenshot: "${capturedProductImages[0].productName}"`);
        return capturedProductImages[0].imageBuffer;
      }
      // Fallback to the slide's own image
      return slide.imageBuffer || null;
    });

    // Timeout: 600s (10 min) = build (3 min) + install (30s) + screenshots (18s + 20s each, up to 8 for multi-product)
    screenshotBuffers = await captureScreenshotBatchWithFallback(ingredientSets, productImages, 600000);

    console.log(`  Captured ${screenshotBuffers.length}/${slidesNeedingScreenshots.length} screenshots`);
  }

  // Map screenshot buffers back to their source slides
  let screenshotIndex = 0;
  const screenshotMap = new Map(); // slide index → buffer
  for (let i = 0; i < processedSlides.length; i++) {
    const slide = processedSlides[i];
    if (slide.has_screenshot && slide.screenshot_ingredients?.length > 0) {
      screenshotMap.set(i, screenshotBuffers[screenshotIndex] || null);
      screenshotIndex++;
    }
  }

  // Identify product pairs (bad_product + swap_product) and validate completeness
  // Pattern: hook, (bad, swap)*, cta — screenshots are inserted after each product
  const pairs = [];
  let currentBad = null;
  for (let i = 0; i < processedSlides.length; i++) {
    const slide = processedSlides[i];
    if (slide.slide_type === 'bad_product') {
      currentBad = i;
    } else if (slide.slide_type === 'swap_product' && currentBad !== null) {
      pairs.push({ badIndex: currentBad, swapIndex: i });
      currentBad = null;
    }
  }

  // Log which pairs have both screenshots and which are dropped
  for (const pair of pairs) {
    const badBuffer = screenshotMap.get(pair.badIndex);
    const swapBuffer = screenshotMap.get(pair.swapIndex);
    const badName = processedSlides[pair.badIndex].product_name || 'unknown';
    const swapName = processedSlides[pair.swapIndex].product_name || 'unknown';

    if (badBuffer && swapBuffer) {
      console.log(`  ✓ Pair complete: "${badName}" → "${swapName}"`);
    } else {
      const missing = [];
      if (!badBuffer) missing.push(badName);
      if (!swapBuffer) missing.push(swapName);
      console.warn(`  ⚠️  Dropping pair "${badName}" → "${swapName}" (missing screenshots for: ${missing.join(', ')})`);
    }
  }

  // Sort valid pairs by swap score (highest first) so best swaps lead
  const validPairs = pairs.filter(pair => {
    return screenshotMap.get(pair.badIndex) && screenshotMap.get(pair.swapIndex);
  });
  validPairs.sort((a, b) => {
    const scoreA = processedSlides[a.swapIndex].score || 0;
    const scoreB = processedSlides[b.swapIndex].score || 0;
    return scoreB - scoreA; // highest swap score first
  });
  // Hard cap at 3 pairs maximum
  if (validPairs.length > 3) {
    console.log(`  Capping from ${validPairs.length} to 3 pairs`);
    validPairs.length = 3;
  }
  if (validPairs.length > 1) {
    console.log(`  Ordered pairs by swap score: ${validPairs.map(p => processedSlides[p.swapIndex].product_name + ' (' + (processedSlides[p.swapIndex].score || '?') + ')').join(' > ')}`);
  }

  // Build expanded slide list: hook + sorted valid pairs (with screenshots) + cta
  const expandedSlides = [];
  let slideNumber = 1;

  // Add hook slide first
  const hookSlide = processedSlides.find(s => s.slide_type === 'hook');
  if (hookSlide) {
    expandedSlides.push({ ...hookSlide, slide_number: slideNumber, slideType: 'product' });
    slideNumber++;
  }

  // Helper to add a product slide + its screenshot
  const addProductWithScreenshot = async (slideIndex) => {
    const slide = processedSlides[slideIndex];
    expandedSlides.push({ ...slide, slide_number: slideNumber, slideType: 'product' });
    slideNumber++;

    const screenshotBuffer = screenshotMap.get(slideIndex);
    if (screenshotBuffer) {
      const score = slide.score;
      let finalScreenshot = screenshotBuffer;
      if (score !== undefined && score !== null) {
        const scoreText = `scored ${score}/100`;
        try {
          finalScreenshot = await addTextOverlay(screenshotBuffer, scoreText, 'screenshot-score');
          console.log(`    Added score overlay: "${scoreText}"`);
        } catch (e) {
          console.warn(`    Score overlay failed: ${e.message} — using screenshot without score`);
        }
      }

      const screenshotBase64 = finalScreenshot.toString('base64');
      logger.logStep(`Screenshot Slide Generated`, 'screenshot', {
        ingredients: slide.screenshot_ingredients,
        ingredient_count: slide.screenshot_ingredients.length,
        score: score || null,
        source: 'emulator (real Firebase data)'
      }, {
        imagePreview: `data:image/png;base64,${screenshotBase64}`
      });

      expandedSlides.push({
        slide_number: slideNumber,
        slideType: 'screenshot',
        text_overlay: score ? `scored ${score}/100` : null,
        processedImage: finalScreenshot,
        imageSource: 'screenshot',
        screenshot_ingredients: slide.screenshot_ingredients
      });
      slideNumber++;
    }
  };

  // Add sorted pairs: bad_product + screenshot, then swap_product + screenshot
  for (const pair of validPairs) {
    await addProductWithScreenshot(pair.badIndex);
    await addProductWithScreenshot(pair.swapIndex);
  }

  // Add CTA slide last
  const ctaSlide = processedSlides.find(s => s.slide_type === 'cta');
  if (ctaSlide) {
    expandedSlides.push({ ...ctaSlide, slide_number: slideNumber, slideType: 'product' });
    slideNumber++;
  }

  const pairCount = validPairs.length;
  console.log(`  Final: ${pairCount} complete pairs, ${expandedSlides.length} total slides`);
  if (pairCount < pairs.length) {
    console.warn(`  ⚠️  Dropped ${pairs.length - pairCount} pairs with missing screenshots`);
  }

  return expandedSlides;
}

/**
 * Save images and metadata locally
 */
function saveOutput(slides, content) {
  const outputDir = process.env.OUTPUT_DIR
    ? path.resolve(process.env.OUTPUT_DIR)
    : path.join(__dirname, '..', 'output', 'iteration3');

  // Create timestamped folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const folderName = `${timestamp}_${content.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
  const folder = path.join(outputDir, folderName);

  fs.mkdirSync(folder, { recursive: true });

  // Save each slide (png for screenshots, jpg for product images)
  for (const slide of slides) {
    const ext = slide.slideType === 'screenshot' ? 'png' : 'jpg';
    const filename = `slide_${slide.slide_number}.${ext}`;
    fs.writeFileSync(path.join(folder, filename), slide.processedImage);
    console.log(`  Saved: ${filename} (${slide.imageSource || slide.slideType})`);
  }

  // Save content metadata
  const metadata = {
    topic: content.topic,
    hook: content.hook,
    caption: content.caption,
    hashtags: content.hashtags,
    slides: slides.map(s => ({
      slide_number: s.slide_number,
      slide_type: s.slide_type || s.slideType || null,
      product_name: s.product_name || null,
      image_source: s.image_source,
      image_prompt: s.image_prompt,
      web_image_query: s.web_image_query,
      text_overlay: s.text_overlay,
      text_position: s.text_position,
      score: s.score || null,
      has_screenshot: s.has_screenshot || false,
      screenshot_position: s.screenshot_position || null,
      screenshot_ingredients: s.screenshot_ingredients || null
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
 * Main slideshow generation function
 */
async function generateSlideshowV2() {
  console.log('\n========================================');
  console.log('   TikTok Slideshow Generator v2');
  console.log('   thepom.app');
  console.log('========================================\n');

  validateConfig();

  // Reset the debug logger for this run
  const logger = resetLogger();

  const startTime = Date.now();

  try {
    // Step 1: AI Orchestration (Research + Content Generation)
    console.log('STEP 1: Research & Content Generation...');
    console.log('----------------------------------------');
    logger.logStep('Pipeline Started', 'save', { timestamp: new Date().toISOString() }, null);

    const content = await orchestrateContentGeneration(config.xaiApiKey);

    // Enforce 5 hashtag limit (TikTok maximum)
    if (content.hashtags && content.hashtags.length > 5) {
      console.log(`  Trimming hashtags from ${content.hashtags.length} to 5 (TikTok limit)`);
      content.hashtags = content.hashtags.slice(0, 5);
    }
    // Ensure pomapp hashtag is included
    if (content.hashtags && !content.hashtags.some(h => h.toLowerCase() === 'pomapp')) {
      content.hashtags[content.hashtags.length - 1] = 'pomapp';
    }

    console.log(`\nTopic: ${content.topic}`);
    console.log(`Hook: ${content.hook}`);
    console.log(`Slides: ${content.slides.length}`);

    const webSlides = content.slides.filter(s => s.image_source === 'web').length;
    const aiSlides = content.slides.filter(s => s.image_source === 'ai').length;
    const screenshotSlides = content.slides.filter(s => s.has_screenshot).length;

    console.log(`Web images: ${webSlides}, AI images: ${aiSlides}`);
    console.log(`Slides with screenshots: ${screenshotSlides}`);
    console.log();

    // Step 2: Generate all images
    console.log('STEP 2: Generating images...');
    console.log('----------------------------------------');
    const slidesWithImages = await getAllSlideImages(content.slides, content._productImages || []);
    console.log(`\nGot ${slidesWithImages.length} images`);
    console.log();

    // Step 3: Add text overlays
    console.log('STEP 3: Adding text overlays...');
    console.log('----------------------------------------');
    const slidesWithText = await processAllSlides(slidesWithImages);
    console.log(`Added text overlays to ${slidesWithText.length} slides`);
    console.log();

    // Step 4: Generate screenshot slides (separate full slides)
    console.log('STEP 4: Generating screenshot slides...');
    console.log('----------------------------------------');

    // Use emulator by default for real Firebase data (set USE_EMULATOR=false to skip screenshots)
    const useEmulator = process.env.USE_EMULATOR !== 'false';
    if (useEmulator) {
      console.log('Will capture REAL screenshots from emulator (using Firebase data)');
    } else {
      console.log('⚠️  Emulator disabled - screenshot slides will be skipped');
    }

    const finalSlides = await expandWithScreenshotSlides(slidesWithText, useEmulator, content._productImages || []);

    // Log final slide sequence
    for (const slide of finalSlides) {
      const imageBase64 = slide.processedImage.toString('base64');
      const mimeType = slide.slideType === 'screenshot' ? 'png' : 'jpeg';
      logger.logStep(`Final Slide ${slide.slide_number} (${slide.slideType || 'product'})`, 'screenshot', {
        text_overlay: slide.text_overlay,
        slideType: slide.slideType,
        ingredient_count: slide.screenshot_ingredients?.length || 0
      }, {
        imagePreview: `data:image/${mimeType};base64,${imageBase64}`
      });
    }

    console.log(`Total slides: ${finalSlides.length} (${slidesWithText.length} product + ${finalSlides.length - slidesWithText.length} screenshot)`);
    console.log();

    // Step 5: Save output
    console.log('STEP 5: Saving output...');
    console.log('----------------------------------------');
    const outputFolder = saveOutput(finalSlides, content);

    // Save debug report
    logger.logStep('Output Saved', 'save', null, { outputFolder });
    logger.saveJSON(outputFolder);
    const debugHtmlPath = logger.saveHTML(outputFolder);
    console.log(`  Saved: debug-log.json`);
    console.log(`  Saved: debug-report.html`);

    console.log(`\nOutput folder: ${outputFolder}`);
    console.log();

    // TikTok upload disabled pending audit approval
    // Preview HTML with copy/download buttons is the final output
    console.log('STEP 6: TikTok upload disabled (pending audit)');
    console.log('  Use preview.html to copy caption and download images');
    console.log();

    // Done!
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('========================================');
    console.log('   COMPLETE!');
    console.log('========================================');
    console.log();
    console.log(`Topic: ${content.topic}`);
    console.log(`Slides: ${content.slides.length} (${webSlides} web, ${aiSlides} AI)`);
    console.log(`Screenshots: ${screenshotSlides}`);
    console.log(`Time: ${elapsed}s`);
    console.log();
    console.log(`Preview: file://${outputFolder}/preview.html`);
    console.log(`Debug Report: file://${debugHtmlPath}`);
    console.log();

    // Open both preview and debug report
    const { exec } = await import('child_process');
    exec(`open "${outputFolder}/preview.html"`);
    exec(`open "${debugHtmlPath}"`);

    return {
      success: true,
      outputFolder,
      content,
      slides: finalSlides
    };

  } catch (error) {
    console.error('\nERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
generateSlideshowV2();

export { generateSlideshowV2 };
