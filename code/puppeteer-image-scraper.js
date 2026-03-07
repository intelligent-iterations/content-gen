/**
 * Puppeteer-based Image Scraper
 * Uses headless browser to get real product images from DuckDuckGo
 */

import puppeteer from 'puppeteer';

// Reuse browser instance across searches
let browserInstance = null;

/**
 * Get or create browser instance
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('  Launching Puppeteer browser...');
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
  }
  return browserInstance;
}

/**
 * Close browser when done
 */
export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Search DuckDuckGo Images and get real image URLs
 * @param {string} query - Search query
 * @param {number} limit - Max results to return
 * @returns {Promise<Array<{imageUrl: string, thumbnailUrl: string, title: string}>>}
 */
export async function searchImagesWithPuppeteer(query, limit = 5) {
  console.log(`  Puppeteer image search: "${query}"`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to DuckDuckGo Images
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for images to load
    await page.waitForSelector('.tile--img__img, .tile--img__media img', { timeout: 10000 }).catch(() => {
      console.log('  No image tiles found with primary selector, trying alternatives...');
    });

    // Give a bit more time for images to render
    await new Promise(r => setTimeout(r, 2000));

    // Extract image URLs from the page
    const images = await page.evaluate((maxResults) => {
      const results = [];

      // Try multiple selectors for DuckDuckGo image results
      const imgElements = document.querySelectorAll('.tile--img__img, .tile--img__media img, [data-id] img');

      for (const img of imgElements) {
        if (results.length >= maxResults) break;

        // Get the full-size image URL from data attributes or src
        let imageUrl = img.getAttribute('data-src') ||
                       img.getAttribute('src') ||
                       img.getAttribute('data-lazy-src');

        // Skip tiny images and base64/placeholder images
        if (!imageUrl || imageUrl.startsWith('data:') || imageUrl.includes('placeholder')) {
          continue;
        }

        // Try to get the parent link's href which often contains the full image
        const parentLink = img.closest('a');
        let fullImageUrl = null;
        if (parentLink) {
          const href = parentLink.getAttribute('href');
          if (href && href.includes('uddg=')) {
            // Extract actual URL from DuckDuckGo redirect
            const match = href.match(/uddg=([^&]+)/);
            if (match) {
              fullImageUrl = decodeURIComponent(match[1]);
            }
          }
        }

        results.push({
          imageUrl: fullImageUrl || imageUrl,
          thumbnailUrl: imageUrl,
          title: img.getAttribute('alt') || 'Product image'
        });
      }

      return results;
    }, limit);

    console.log(`  Found ${images.length} image URLs`);
    return images;

  } catch (error) {
    console.log(`  Puppeteer search error: ${error.message}`);
    return [];
  } finally {
    await page.close();
  }
}

/**
 * Search Google Images as fallback
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Promise<Array<{imageUrl: string, title: string}>>}
 */
export async function searchGoogleImages(query, limit = 5) {
  console.log(`  Puppeteer Google image search: "${query}"`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to Google Images
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for images
    await page.waitForSelector('img[data-src], img[src*="encrypted"]', { timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // Extract image URLs
    const images = await page.evaluate((maxResults) => {
      const results = [];
      const imgElements = document.querySelectorAll('img[data-src], img[src*="encrypted"], img[data-iurl]');

      for (const img of imgElements) {
        if (results.length >= maxResults) break;

        // Get full image URL from various attributes
        let imageUrl = img.getAttribute('data-iurl') ||
                       img.getAttribute('data-src') ||
                       img.getAttribute('src');

        // Skip tiny thumbnails, base64, and Google's own images
        if (!imageUrl ||
            imageUrl.startsWith('data:') ||
            imageUrl.includes('google.com/images') ||
            imageUrl.includes('gstatic.com')) {
          continue;
        }

        results.push({
          imageUrl: imageUrl,
          title: img.getAttribute('alt') || 'Image'
        });
      }

      return results;
    }, limit);

    console.log(`  Found ${images.length} Google image URLs`);
    return images;

  } catch (error) {
    console.log(`  Google search error: ${error.message}`);
    return [];
  } finally {
    await page.close();
  }
}

/**
 * Download image from URL
 * @param {string} imageUrl - URL to download
 * @returns {Promise<Buffer|null>}
 */
export async function downloadImage(imageUrl) {
  try {
    console.log(`  Downloading: ${imageUrl.substring(0, 60)}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*',
        'Referer': 'https://www.google.com/'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`  Download failed: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('image') && !contentType.includes('octet-stream')) {
      console.log(`  Not an image: ${contentType}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify it's a reasonable image size (at least 5KB, not too huge)
    if (buffer.length < 5000) {
      console.log(`  Image too small: ${buffer.length} bytes`);
      return null;
    }

    if (buffer.length > 10 * 1024 * 1024) {
      console.log(`  Image too large: ${Math.round(buffer.length / 1024 / 1024)}MB`);
      return null;
    }

    console.log(`  Downloaded ${Math.round(buffer.length / 1024)}KB`);
    return buffer;

  } catch (error) {
    console.log(`  Download error: ${error.message}`);
    return null;
  }
}

/**
 * Find and download a product image
 * @param {string} query - Product search query
 * @returns {Promise<{buffer: Buffer, source: string}|null>}
 */
export async function findProductImageWithPuppeteer(query) {
  // Try DuckDuckGo first
  let images = await searchImagesWithPuppeteer(query, 8);

  // Fallback to Google if DDG fails
  if (images.length === 0) {
    images = await searchGoogleImages(query, 8);
  }

  // Try to download each image until one works
  for (const img of images) {
    const buffer = await downloadImage(img.imageUrl);
    if (buffer) {
      return {
        buffer,
        source: img.imageUrl
      };
    }
  }

  console.log(`  Could not find usable image for: "${query}"`);
  return null;
}

// CLI test
if (process.argv[1]?.includes('puppeteer-image-scraper')) {
  const query = process.argv[2] || 'CeraVe moisturizer product';
  console.log(`Testing image search for: "${query}"`);

  findProductImageWithPuppeteer(query)
    .then(result => {
      if (result) {
        console.log(`\nSuccess! Downloaded ${result.buffer.length} bytes`);
        console.log(`Source: ${result.source}`);
      } else {
        console.log('\nNo image found');
      }
    })
    .catch(err => console.error('Error:', err))
    .finally(() => closeBrowser());
}
