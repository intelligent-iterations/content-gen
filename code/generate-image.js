/**
 * Image generation with support for multiple providers:
 * - Replicate (Seedream-4) - default
 * - Grok (grok-imagine-image) - xAI
 *
 * With retry logic for rate limiting
 */

const MAX_RETRIES = 10;
const RATE_LIMIT_WAIT = 5000; // 5 seconds between requests

// Supported image models
export const IMAGE_MODELS = {
  replicate: 'replicate',  // Seedream-4 via Replicate
  grok: 'grok'             // grok-imagine-image via xAI
};

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Generate image using Grok (xAI) API
 * @param {string} apiKey - xAI API key
 * @param {string} prompt - Text prompt for image generation
 * @param {Object} options - Additional options
 * @param {Buffer} options.referenceImage - Optional image buffer for img2img (editing)
 * @param {number} retryCount - Internal retry counter
 */
async function generateImageWithGrok(apiKey, prompt, options = {}, retryCount = 0) {
  const { referenceImage } = options;

  if (referenceImage) {
    console.log('Starting Grok IMAGE EDIT generation...');
  } else {
    console.log('Starting Grok text-to-image generation...');
  }

  // Build request body
  const body = {
    model: 'grok-2-image',
    prompt: prompt,
    n: 1,
    response_format: 'url'
  };

  // Add reference image for editing
  if (referenceImage) {
    const base64 = referenceImage.toString('base64');
    const mimeType = 'image/jpeg';
    body.image_url = `data:${mimeType};base64,${base64}`;
  }

  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify(body)
  });

  // Handle rate limiting with retry
  if (response.status === 429) {
    if (retryCount >= MAX_RETRIES) {
      throw new Error('Max retries exceeded for rate limiting (Grok)');
    }

    const retryData = await response.json().catch(() => ({}));
    const retryAfter = retryData.retry_after || 10;

    console.log(`  Rate limited (Grok). Waiting ${retryAfter}s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
    await sleep(retryAfter * 1000);

    return generateImageWithGrok(apiKey, prompt, options, retryCount + 1);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Grok returns data array with url property
  if (!data.data || !data.data[0] || !data.data[0].url) {
    throw new Error('Unexpected Grok response format: ' + JSON.stringify(data));
  }

  console.log('Grok image generation complete!');
  return data.data[0].url;
}

/**
 * Start a Seedream-4 image generation prediction with retry logic
 * @param {string} apiToken - Replicate API token
 * @param {string} prompt - Text prompt for image generation
 * @param {Object} options - Additional options
 * @param {Buffer} options.referenceImage - Optional image buffer for img2img
 * @param {number} retryCount - Internal retry counter
 */
export async function startImageGeneration(apiToken, prompt, options = {}, retryCount = 0) {
  const { referenceImage } = options;

  if (referenceImage) {
    console.log('Starting Seedream-4 IMAGE-TO-IMAGE generation...');
  } else {
    console.log('Starting Seedream-4 text-to-image generation...');
  }

  // Build input object
  const input = {
    prompt: prompt,
    aspect_ratio: '9:16',
    enhance_prompt: true
  };

  // Add reference image for img2img
  if (referenceImage) {
    // Convert buffer to base64 data URI
    const base64 = referenceImage.toString('base64');
    const mimeType = 'image/jpeg'; // Assume JPEG, could detect from buffer
    input.image_input = [`data:${mimeType};base64,${base64}`];
  }

  const response = await fetch('https://api.replicate.com/v1/models/bytedance/seedream-4/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input })
  });

  // Handle rate limiting with retry
  if (response.status === 429) {
    if (retryCount >= MAX_RETRIES) {
      throw new Error('Max retries exceeded for rate limiting');
    }

    const retryData = await response.json().catch(() => ({}));
    const retryAfter = retryData.retry_after || 10;

    console.log(`  Rate limited. Waiting ${retryAfter}s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
    await sleep(retryAfter * 1000);

    return startImageGeneration(apiToken, prompt, options, retryCount + 1);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Replicate API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Poll for prediction completion
 */
export async function waitForPrediction(apiToken, predictionId, maxAttempts = 120) {
  console.log(`Waiting for prediction ${predictionId}...`);

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Replicate status error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (data.status === 'succeeded') {
      console.log('Image generation complete!');
      // Seedream returns output as array or single URL
      const output = Array.isArray(data.output) ? data.output[0] : data.output;
      return output;
    }

    if (data.status === 'failed') {
      throw new Error(`Image generation failed: ${data.error}`);
    }

    // Wait 1 second before polling again
    await sleep(1000);
  }

  throw new Error('Image generation timed out');
}

/**
 * Generate an image and return the URL (with full retry logic)
 * @param {Object} tokens - API tokens { replicateToken, xaiApiKey }
 * @param {string} prompt - Text prompt for image generation
 * @param {Object} options - Additional options
 * @param {Buffer} options.referenceImage - Optional image buffer for img2img
 * @param {string} options.model - Image model to use ('replicate' or 'grok')
 */
export async function generateImage(tokens, prompt, options = {}) {
  const { model = IMAGE_MODELS.replicate, referenceImage } = options;

  // Force no-text suffix on every image prompt to prevent garbled AI text on products
  let cleanPrompt = prompt;
  const noTextSuffix = ', absolutely no text, no writing, no letters, no words, no labels, no fine print on any surface';
  if (!cleanPrompt.toLowerCase().includes('absolutely no text')) {
    cleanPrompt = cleanPrompt + noTextSuffix;
  }

  if (model === IMAGE_MODELS.grok) {
    // Use Grok (xAI) for image generation
    if (!tokens.xaiApiKey) {
      throw new Error('XAI_API_KEY required for Grok image generation');
    }
    return generateImageWithGrok(tokens.xaiApiKey, cleanPrompt, { referenceImage });
  } else {
    // Default: Use Replicate (Seedream-4)
    if (!tokens.replicateToken) {
      throw new Error('REPLICATE_API_TOKEN required for Replicate image generation');
    }
    const prediction = await startImageGeneration(tokens.replicateToken, cleanPrompt, { referenceImage });
    const imageUrl = await waitForPrediction(tokens.replicateToken, prediction.id);
    return imageUrl;
  }
}

/**
 * Download image from URL and return as buffer
 */
export async function downloadImage(imageUrl) {
  console.log('Downloading image...');
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate all images for a slideshow with rate limit handling
 * @param {Object} tokens - API tokens { replicateToken, xaiApiKey }
 * @param {Array} slides - Array of slide objects with image_prompt
 * @param {Object} options - Additional options
 * @param {string} options.model - Image model to use ('replicate' or 'grok')
 */
export async function generateAllImages(tokens, slides, options = {}) {
  const { model = IMAGE_MODELS.replicate } = options;
  const results = [];

  console.log(`Using image model: ${model.toUpperCase()}`);

  for (const slide of slides) {
    console.log(`\nGenerating image for slide ${slide.slide_number}...`);

    const imageUrl = await generateImage(tokens, slide.image_prompt, { model });
    const imageBuffer = await downloadImage(imageUrl);

    results.push({
      ...slide,
      imageUrl,
      imageBuffer
    });

    // Wait between requests to avoid rate limits
    console.log('  Waiting 5s before next image...');
    await sleep(RATE_LIMIT_WAIT);
  }

  return results;
}

// CLI usage
import { fileURLToPath } from 'url';
import path from 'path';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  import('dotenv').then(async (dotenv) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    dotenv.config({ path: path.join(__dirname, '..', '.env') });

    // Parse CLI args: node generate-image.js [grok|replicate]
    const modelArg = process.argv[2]?.toLowerCase();
    const model = modelArg === 'grok' ? IMAGE_MODELS.grok : IMAGE_MODELS.replicate;

    const tokens = {
      replicateToken: process.env.REPLICATE_API_TOKEN,
      xaiApiKey: process.env.XAI_API_KEY
    };

    const testPrompt = '9:16 vertical aspect ratio, aesthetic skincare products on a marble bathroom counter, soft morning light, pink and white tones, clean minimal composition, no text';

    console.log(`Testing image generation with model: ${model}`);

    try {
      const imageUrl = await generateImage(tokens, testPrompt, { model });
      console.log('\nGenerated image URL:', imageUrl);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });
}
