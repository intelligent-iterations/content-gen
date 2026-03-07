/**
 * Step 3: Image Generation
 *
 * n8n Code Node compatible
 * Input: { slides[], productImages[] }
 * Output: { slides[] with imagePath added }
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Replicate from 'replicate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

async function generateWithSeedream(prompt) {
  const output = await replicate.run(
    'bytedance/seedream-3.0:3d0e94d7ada0e73af19364b736d0b023d1f4dc9468fde518cf7be6e9942b57b8',
    {
      input: {
        prompt,
        aspect_ratio: '9:16',
        num_outputs: 1,
        output_format: 'jpg',
        output_quality: 90
      }
    }
  );
  return output[0]; // URL
}

async function downloadImage(url, outputPath) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  return outputPath;
}

export async function generateImages(input, outputDir) {
  const { slides, productImages = [] } = input;
  if (!slides) throw new Error('slides required');

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  const results = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const outputPath = path.join(outputDir, `slide_${i + 1}_base.jpg`);

    // Check if using captured product image
    if (slide.use_product_image && productImages[slide.use_product_image - 1]) {
      const productImg = productImages[slide.use_product_image - 1];
      // Download product image
      await downloadImage(productImg.imageUrl, outputPath);
      results.push({
        ...slide,
        imagePath: outputPath,
        imageSource: 'product_image'
      });
    } else if (slide.image_source === 'ai' && slide.image_prompt) {
      // Generate with Seedream
      console.log(`Generating image ${i + 1}/${slides.length}...`);
      const imageUrl = await generateWithSeedream(slide.image_prompt);
      await downloadImage(imageUrl, outputPath);
      results.push({
        ...slide,
        imagePath: outputPath,
        imageSource: 'ai_generated'
      });

      // Rate limit
      if (i < slides.length - 1) {
        await new Promise(r => setTimeout(r, 10000));
      }
    } else {
      results.push(slide);
    }
  }

  return { slides: results };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputFile = process.argv[2];
  const outputDir = process.argv[3] || '/tmp/slideshow-images';

  if (!inputFile) {
    console.error('Usage: node step3-images.js <input.json> [outputDir]');
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

  generateImages(input, outputDir)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
