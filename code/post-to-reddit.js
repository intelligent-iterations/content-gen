/**
 * Post gallery to Reddit (r/nontoxicpom)
 *
 * Usage:
 *   node code/post-to-reddit.js <folder-path>
 *   node code/post-to-reddit.js 2026-02-04T16-30-05_hidden-dangers-in-household-cl
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// --- REDDIT CONFIGURATION ---
const SUBREDDIT = 'nontoxicpom';
const REDDIT_POSTED_PATH = path.join(__dirname, '..', 'REDDIT_POSTED_VIDEOS.md');
const POM_APP_STORE_IMAGE = path.join(__dirname, '..', 'assets', 'pom-app-store.png');

/**
 * Authenticate with Reddit using script-type OAuth (password grant)
 */
async function getRedditAccessToken() {
  const auth = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString('base64');

  const res = await axios.post(
    'https://www.reddit.com/api/v1/access_token',
    new URLSearchParams({
      grant_type: 'password',
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PASSWORD,
    }).toString(),
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': process.env.REDDIT_USER_AGENT,
      },
    }
  );

  if (res.data.error) {
    throw new Error(`Reddit auth failed: ${res.data.error}`);
  }

  return res.data.access_token;
}

/**
 * Upload a single image to Reddit's media hosting (for gallery posts).
 * Returns the asset ID needed for gallery submission.
 */
async function uploadImageToReddit(token, imagePath) {
  const filename = path.basename(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  // Step 1: Request upload lease from Reddit
  const leaseRes = await axios.post(
    'https://oauth.reddit.com/api/media/asset.json',
    new URLSearchParams({
      filepath: filename,
      mimetype: mimeType,
    }).toString(),
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': process.env.REDDIT_USER_AGENT,
      },
    }
  );

  const { args, asset } = leaseRes.data;
  const uploadUrl = `https:${args.action}`;
  const assetId = asset.asset_id;

  // Step 2: Upload file to Reddit's media hosting
  const formData = new FormData();
  for (const field of args.fields) {
    formData.append(field.name, field.value);
  }
  formData.append('file', new Blob([fs.readFileSync(imagePath)], { type: mimeType }), filename);

  await axios.post(uploadUrl, formData, {
    headers: { 'User-Agent': process.env.REDDIT_USER_AGENT },
  });

  return { assetId };
}

/**
 * Crop a screenshot to just the "Ingredients" list and overlay
 * a short product name label (TikTok-style: white text, black outline).
 */
async function cropScreenshotToIngredients(screenshotPath, productName) {
  const cropTop = 560;
  const croppedHeight = 1920 - cropTop;
  const outputPath = screenshotPath.replace('.png', '_cropped.png');

  let pipeline = sharp(screenshotPath)
    .extract({ left: 0, top: cropTop, width: 1080, height: croppedHeight });

  if (productName) {
    const escaped = productName
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const textY = Math.round(croppedHeight * 0.66);
    // TikTok-style: bold white text with thick black stroke, no background bar
    const svg = `<svg width="1080" height="${croppedHeight}">
      <text x="540" y="${textY}" font-family="Proxima Nova, Helvetica Neue, Arial, sans-serif" font-size="52" font-weight="900" fill="white" stroke="black" stroke-width="5" paint-order="stroke" text-anchor="middle">${escaped}</text>
    </svg>`;
    pipeline = pipeline.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
  }

  await pipeline.toFile(outputPath);
  return outputPath;
}

/**
 * Extract a short product name from the nearest preceding product slide.
 * Returns just the brand/product like "Pop-Tarts", "Lucky Charms", "Olay".
 */
function getProductNameForScreenshot(screenshotSlide, allSlides) {
  const screenshotNum = screenshotSlide.slide_number;
  for (let i = screenshotNum - 1; i >= 1; i--) {
    const prev = allSlides.find(s => s.slide_number === i);
    if (!prev?.has_screenshot) continue;

    // Try to extract short product name from image_prompt
    // Prompts look like: "closeup of Pop-Tarts box on kitchen counter"
    //   or "person holding Febreze air freshener in hand"
    if (prev.image_prompt) {
      const promptMatch = prev.image_prompt.match(
        /(?:closeup of|close-up of|photo of|image of|shot of|holding)\s+(.+?)(?:\s+(?:box|bottle|tube|jar|can|packet|package|bag|container|wrapper|air freshener|scented oil|cereal|cream|lotion|bar |on |in |with |,))/i
      );
      if (promptMatch) {
        let name = promptMatch[1].trim();
        if (name.length > 30) name = name.split(/\s+/).slice(0, 3).join(' ');
        if (name.length > 2) return name;
      }
    }

    // Fallback: extract from text_overlay
    if (prev.text_overlay) {
      let name = prev.text_overlay;
      // "What's really in Pop-Tarts Strawberry?" → "Pop-Tarts Strawberry"
      name = name.replace(/^(What'?s really in |What'?s really in your |And |Check |Is |Here'?s what'?s in |The truth about |Let'?s check )/i, '');
      // "Aveeno: what's really inside" → "Aveeno"
      if (name.includes(':')) name = name.split(':')[0];
      // "Just as bad" / "Let's check this one" → skip
      name = name.replace(/\?.*$/, '').replace(/[.!].*$/, '').trim();
      name = name.replace(/^(this one|this|it)$/i, '');
      if (name.length > 2 && name.length < 40) return name;
    }
  }
  return null;
}

/**
 * Select images for Reddit gallery:
 *   1. Screenshot(s) cropped to ingredients list, labeled with product name
 *   2. Product image ONLY if image_source is "web" (skip AI-generated)
 */
async function selectImages(folderPath) {
  let slides = [];
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(folderPath, 'metadata.json'), 'utf-8'));
    slides = meta.slides || [];
  } catch (e) {}

  const allFiles = fs.readdirSync(folderPath)
    .filter(f => f.startsWith('slide_') && (f.endsWith('.jpg') || f.endsWith('.png')) && !f.includes('_cropped'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide_(\d+)/)[1]);
      const numB = parseInt(b.match(/slide_(\d+)/)[1]);
      return numA - numB;
    });

  if (allFiles.length === 0) return [];

  const selected = [];

  // Find screenshot slides, crop them, and label with product name
  for (const file of allFiles) {
    const num = parseInt(file.match(/slide_(\d+)/)[1]);
    const slideMeta = slides.find(s => s.slide_number === num);

    if (file.endsWith('.png') && slideMeta?.screenshot_ingredients?.length > 0) {
      const productName = getProductNameForScreenshot(slideMeta, slides);
      const fullPath = path.join(folderPath, file);
      console.log(`  Cropping screenshot: ${file}${productName ? ` → "${productName}"` : ''}`);
      const croppedPath = await cropScreenshotToIngredients(fullPath, productName);
      selected.push(croppedPath);
    }
  }

  // Include web-sourced product images (skip AI-generated)
  for (const file of allFiles) {
    const num = parseInt(file.match(/slide_(\d+)/)[1]);
    const slideMeta = slides.find(s => s.slide_number === num);

    if (slideMeta?.image_source === 'web' && slideMeta?.has_screenshot) {
      selected.push(path.join(folderPath, file));
    }
  }

  // If no images found at all, fallback to first slide
  if (selected.length === 0) {
    console.log(`  No screenshots or web images found, using first slide as fallback`);
    selected.push(path.join(folderPath, allFiles[0]));
  }

  // Gallery needs 2+ images. If we only have 1, add pom App Store screenshot as second.
  if (selected.length === 1 && fs.existsSync(POM_APP_STORE_IMAGE)) {
    console.log(`  Adding pom App Store screenshot as second gallery image`);
    selected.push(POM_APP_STORE_IMAGE);
  }

  return selected;
}

/**
 * Generate Reddit title via Grok API (keyword-rich, informational)
 */
async function generateRedditTitle(metadata) {
  const { topic, hook, caption } = metadata;

  // Gather product and ingredient names for keyword richness
  const products = [];
  const ingredients = [];
  for (const slide of metadata.slides || []) {
    if (slide.product_name) products.push(slide.product_name);
    if (slide.screenshot_ingredients) {
      ingredients.push(...slide.screenshot_ingredients);
    }
  }

  const prompt = `You write Reddit post titles optimized for Reddit SEARCH. People search Reddit for product safety info — your title must contain the exact words they'd type.

CONTENT:
Topic: "${topic}"
Hook: "${hook}"
Products: ${products.join(', ') || 'various'}
Key ingredients: ${ingredients.slice(0, 5).join(', ') || 'various harmful ingredients'}
Context: "${caption?.substring(0, 300)}"

WRITE A REDDIT POST TITLE. Follow these rules EXACTLY:

- STUFF IT WITH SEARCHABLE KEYWORDS: full product name, brand name, specific ingredient names, category words (e.g. "protein bar", "laundry detergent", "kids snacks", "moisturizer")
- Think about what someone would Google/Reddit-search: "is [product] safe", "[product] ingredients", "[ingredient] health risks", "[product] toxic"
- Sound like a real person, not a headline — first person works great
- Examples of keyword-rich titles:
  "Is Tide laundry detergent safe? I scanned the ingredients - Fragrance, Methylisothiazolinone, and 1,4-Dioxane flagged"
  "Pop-Tarts ingredients are worse than I thought - Red 40, Yellow 6, TBHQ still in kids snacks"
  "La Mer Crème de la Mer ingredient analysis - Fragrance, Mineral Oil, Alcohol Denat in a $300 moisturizer"
  "Quest Protein Bar ingredient breakdown - Sucralose and Acesulfame K in a 'healthy' protein bar"
- Max 200 characters (use them — longer keyword-rich titles rank better in Reddit search)
- No emojis, no ALL CAPS words (except ingredient names that are normally capitalized)

Return ONLY the title text. Nothing else.`;

  try {
    const res = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: 'grok-4-1-fast-non-reasoning',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.8,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    let title = res.data.choices?.[0]?.message?.content?.trim();
    if (!title) throw new Error('Empty response');

    // Strip quotes
    title = title.replace(/^["']|["']$/g, '');

    // Ensure under 300 chars (Reddit limit)
    if (title.length > 300) {
      title = title.substring(0, 297) + '...';
    }

    return title;
  } catch (e) {
    console.log(`  Grok title failed: ${e.message}`);
  }

  // Fallback
  return `${hook} - ingredient analysis with thepom.app`;
}

/**
 * Generate Reddit body via Grok API (keyword-dense, informational)
 */
async function generateRedditBody(metadata) {
  const { topic, hook, caption } = metadata;

  const products = [];
  const ingredients = [];
  for (const slide of metadata.slides || []) {
    if (slide.product_name) products.push(slide.product_name);
    if (slide.screenshot_ingredients) {
      ingredients.push(...slide.screenshot_ingredients);
    }
  }

  const prompt = `You write Reddit post comments that read like a real person deep-diving into product ingredients. This is the body text for a post on r/nontoxicpom.

CONTENT:
Topic: "${topic}"
Hook: "${hook}"
Products: ${products.join(', ') || 'various'}
ALL flagged ingredients: ${ingredients.join(', ') || 'various harmful ingredients'}
Context: "${caption?.substring(0, 600)}"

WRITE THE POST BODY. Follow these rules EXACTLY:

CONTENT REQUIREMENTS:
- Go through EACH flagged ingredient by name and explain what it is and why it's concerning (health risks, studies, bans in other countries, etc.)
- Repeat the full product name(s) and brand name(s) multiple times naturally — this helps Reddit search
- Mention the product category (e.g. "protein bar", "laundry detergent", "kids cereal", "moisturizer") at least once
- Include phrases people would search: "is [product] safe", "[ingredient] side effects", "[ingredient] health risks", "toxic ingredients in [category]"
- Mention you used "pom" to scan the product — just call it "pom", nothing else (not "the Pom app", not "Pom (thepom.app)", just "pom")
- End with a question that invites discussion

TONE:
- Write like an actual Reddit user who went down a rabbit hole researching ingredients
- Conversational but informative — like explaining to a friend
- Use phrases like "honestly", "turns out", "I didn't realize", "what gets me is"
- Slightly frustrated/surprised energy — you're sharing something that bothers you
- NOT corporate, NOT overly formal, NOT listicle-style

FORMAT:
- 3-5 paragraphs of flowing text
- No bullet points, no markdown headers, no numbered lists
- No emojis
- Around 800-1200 characters total

Return ONLY the body text. Nothing else.`;

  try {
    const res = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: 'grok-4-1-fast-non-reasoning',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.85,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    let body = res.data.choices?.[0]?.message?.content?.trim();
    if (!body) throw new Error('Empty response');

    // Strip quotes
    body = body.replace(/^["']|["']$/g, '');

    return body;
  } catch (e) {
    console.log(`  Grok body failed: ${e.message}`);
  }

  // Fallback
  return `So I scanned ${products[0] || 'a popular product'} with pom and honestly the results were worse than I expected. Found ${ingredients.slice(0, 3).join(', ')} — all flagged for potential health concerns.\n\nCheck the images for the full ingredient breakdown. Has anyone else looked into what's actually in this stuff?`;
}

/**
 * Load already posted Reddit entries
 */
function loadPostedRedditVideos() {
  try {
    if (fs.existsSync(REDDIT_POSTED_PATH)) {
      return fs.readFileSync(REDDIT_POSTED_PATH, 'utf-8');
    }
  } catch (e) {}
  return '';
}

/**
 * Check if a folder has already been posted
 */
function isAlreadyPosted(folderName) {
  const posted = loadPostedRedditVideos();
  return posted.includes(folderName);
}

/**
 * Add entry to posted videos file
 */
function addToPostedVideos(folderName, metadata, postId, postUrl, title, imageCount) {
  const date = new Date().toISOString().split('T')[0];

  let content = loadPostedRedditVideos();

  if (!content) {
    content = `# Reddit Posted Videos Tracker

> Track Reddit posts to r/nontoxicpom from the pom video generator

---
`;
  }

  const entry = `
## ${date}

### ${metadata.topic}
**Folder:** \`${folderName}\`
**Posted:** ${date}
**Post ID:** ${postId}
**URL:** ${postUrl}
**Title:** ${title}
**Images:** ${imageCount}

---
`;

  content += entry;
  fs.writeFileSync(REDDIT_POSTED_PATH, content);
  console.log(`  Added to ${REDDIT_POSTED_PATH}`);
}

/**
 * Post gallery to Reddit r/nontoxicpom
 */
async function postToReddit(folderPath) {
  // Resolve folder path
  if (!path.isAbsolute(folderPath)) {
    if (folderPath.startsWith('output/')) {
      folderPath = path.join(__dirname, '..', folderPath);
    } else {
      folderPath = path.join(__dirname, '..', 'output', folderPath);
    }
  }

  console.log('='.repeat(50));
  console.log('  Reddit Gallery Post (r/nontoxicpom)');
  console.log('='.repeat(50));
  console.log();

  // Load metadata
  const metadataPath = path.join(folderPath, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`No metadata.json found in ${folderPath}`);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  const folderName = path.basename(folderPath);

  console.log(`Topic: ${metadata.topic}`);
  console.log(`Folder: ${folderName}`);
  console.log();

  // Check if already posted
  if (isAlreadyPosted(folderName)) {
    throw new Error(`Already posted to Reddit: ${folderName}`);
  }

  // Authenticate with Reddit
  console.log('Authenticating with Reddit...');
  const token = await getRedditAccessToken();
  console.log('  Authenticated!\n');

  // Generate title and body, strip all dashes
  console.log('Generating Reddit title...');
  let title = await generateRedditTitle(metadata);
  title = title.replace(/[\u2014\u2013\u2012\u2011\u2010-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  console.log(`  Title: ${title}`);
  console.log();

  console.log('Generating Reddit body...');
  let body = await generateRedditBody(metadata);
  body = body.replace(/[\u2014\u2013\u2012\u2011\u2010-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  console.log(`  Body: ${body}`);
  console.log();

  // Select images (screenshots cropped to ingredients, skip AI product images)
  const imagePaths = await selectImages(folderPath);
  console.log(`Selected ${imagePaths.length} images`);

  if (imagePaths.length === 0) {
    throw new Error('No images found for gallery');
  }

  // Upload all images to Reddit
  console.log('\nUploading images to Reddit...\n');
  const uploadedAssets = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];
    console.log(`  Uploading ${i + 1}/${imagePaths.length}: ${path.basename(imgPath)}`);
    const asset = await uploadImageToReddit(token, imgPath);
    uploadedAssets.push(asset);
    console.log(`    Asset ID: ${asset.assetId}`);
    await new Promise(r => setTimeout(r, 500));
  }

  // Always submit as gallery (selectImages guarantees 2+ images)
  console.log('\nSubmitting gallery post...\n');
  const galleryItems = uploadedAssets.map((asset) => ({
    media_id: asset.assetId,
    caption: '',
    outbound_url: '',
  }));

  const submitRes = await axios.post(
    'https://oauth.reddit.com/api/submit_gallery_post.json',
    {
      sr: SUBREDDIT,
      title: title,
      text: body,
      items: galleryItems,
      api_type: 'json',
      resubmit: true,
      send_replies: true,
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': process.env.REDDIT_USER_AGENT,
      },
    }
  );

  // Parse response
  const submitData = submitRes.data;
  let postUrl, postId, postFullname;

  if (submitData.json?.data?.url) {
    postUrl = submitData.json.data.url;
    postId = submitData.json.data.id || submitData.json.data.name;
    postFullname = submitData.json.data.name || postId;
  } else if (submitData.json?.errors?.length > 0) {
    throw new Error(`Reddit submit failed: ${JSON.stringify(submitData.json.errors)}`);
  } else {
    console.log('  Raw response:', JSON.stringify(submitData).substring(0, 500));
    throw new Error('Unexpected Reddit response format');
  }

  console.log('='.repeat(50));
  console.log('  SUCCESS!');
  console.log('='.repeat(50));
  console.log();
  console.log(`Post ID: ${postId}`);
  console.log(`URL: ${postUrl}`);
  console.log();

  // Add to tracker
  addToPostedVideos(folderName, metadata, postId, postUrl, title, imagePaths.length);

  return { postId, postUrl };
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const outputDir = path.join(__dirname, '..', 'output');
    const folders = fs.readdirSync(outputDir)
      .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
      .filter(f => !f.startsWith('.') && !f.startsWith('test') && !f.startsWith('integration'))
      .sort()
      .reverse();

    if (folders.length === 0) {
      console.error('No output folders found.');
      process.exit(1);
    }

    // Find next unposted folder (most recent first)
    const nextFolder = folders.find(f => !isAlreadyPosted(f));
    if (!nextFolder) {
      console.log('All folders have already been posted to Reddit.');
      process.exit(0);
    }

    console.log('No folder specified, using next unposted (most recent first):');
    console.log(`  ${nextFolder}`);
    console.log();

    postToReddit(nextFolder);
  } else {
    postToReddit(args[0]);
  }
}

export { postToReddit, isAlreadyPosted };
