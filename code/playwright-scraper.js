/**
 * Playwright-based Web Scraper
 * Scrapes ingredient pages and captures product images
 */

import { chromium } from 'playwright';

// Reuse browser instance
let browserInstance = null;

/**
 * Get or create browser instance
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('  Launching Playwright browser...');
    browserInstance = await chromium.launch({
      headless: true
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
 * Scrape an ingredient page (like incidecoder.com) and get:
 * - Full page content (ingredient list)
 * - Product image if available
 *
 * @param {string} url - URL to scrape
 * @returns {Promise<{content: string, productImage: Buffer|null, productName: string|null}>}
 */
export async function scrapeIngredientPage(url) {
  console.log(`  Playwright scraping: ${url}`);

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait a bit for dynamic content
    await page.waitForTimeout(1000);

    // Extract product name
    let productName = null;
    try {
      // INCIDecoder product name is usually in h1
      productName = await page.$eval('h1', el => el.textContent?.trim());
    } catch (e) {
      // Try other selectors
      try {
        productName = await page.$eval('.product-name, .product-title, [class*="product"] h1, [class*="product"] h2',
          el => el.textContent?.trim());
      } catch (e2) {
        // Ignore
      }
    }

    // Try to find and download product image
    let productImage = null;
    try {
      // INCIDecoder has product images in specific containers
      const imageSelectors = [
        '.product-image img',
        '.product-photo img',
        '[class*="product"] img',
        '.packshot img',
        'img[alt*="product"]',
        'img[src*="product"]',
        // INCIDecoder specific
        '.ilb-packshot img',
        '.ingredient-list-box img'
      ];

      for (const selector of imageSelectors) {
        try {
          const imgElement = await page.$(selector);
          if (imgElement) {
            const imgSrc = await imgElement.getAttribute('src');
            if (imgSrc && !imgSrc.includes('placeholder') && !imgSrc.startsWith('data:')) {
              // Make absolute URL if needed
              const absoluteUrl = imgSrc.startsWith('http') ? imgSrc : new URL(imgSrc, url).href;

              // Download the image
              const imgResponse = await page.request.get(absoluteUrl);
              if (imgResponse.ok()) {
                productImage = await imgResponse.body();
                console.log(`  Found product image (${Math.round(productImage.length / 1024)}KB)`);
                break;
              }
            }
          }
        } catch (e) {
          // Try next selector
        }
      }

      // If no specific product image, try to get the first large image on page
      if (!productImage) {
        const images = await page.$$('img');
        for (const img of images) {
          try {
            const src = await img.getAttribute('src');
            const width = await img.evaluate(el => el.naturalWidth);
            const height = await img.evaluate(el => el.naturalHeight);

            // Look for reasonably sized images (not icons)
            if (width > 150 && height > 150 && src && !src.includes('logo') && !src.includes('icon')) {
              const absoluteUrl = src.startsWith('http') ? src : new URL(src, url).href;
              const imgResponse = await page.request.get(absoluteUrl);
              if (imgResponse.ok()) {
                const imgBuffer = await imgResponse.body();
                if (imgBuffer.length > 10000) { // At least 10KB
                  productImage = imgBuffer;
                  console.log(`  Found large image (${Math.round(productImage.length / 1024)}KB)`);
                  break;
                }
              }
            }
          } catch (e) {
            // Continue
          }
        }
      }
    } catch (e) {
      console.log(`  Could not extract product image: ${e.message}`);
    }

    // Extract page content (text)
    const content = await page.evaluate(() => {
      // Remove scripts, styles, nav, header, footer
      const elementsToRemove = document.querySelectorAll('script, style, nav, header, footer, aside, iframe, noscript');
      elementsToRemove.forEach(el => el.remove());

      // Get main content
      const main = document.querySelector('main, article, .content, .product-page, #content') || document.body;
      return main.innerText.replace(/\s+/g, ' ').trim().slice(0, 8000);
    });

    console.log(`  Scraped ${content.length} chars, product: ${productName || 'unknown'}`);

    return {
      content,
      productImage,
      productName,
      url
    };

  } catch (error) {
    console.log(`  Scrape error: ${error.message}`);
    return {
      content: '',
      productImage: null,
      productName: null,
      url,
      error: error.message
    };
  } finally {
    await context.close();
  }
}

/**
 * Search for product images on Google/DuckDuckGo
 * @param {string} query - Product name to search for
 * @returns {Promise<Buffer|null>} - Product image buffer
 */
export async function searchProductImage(query) {
  console.log(`  Searching for product image: "${query}"`);

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Use DuckDuckGo image search
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query + ' product')}&iax=images&ia=images`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for images to load
    await page.waitForTimeout(2000);

    // Try to find image tiles
    const images = await page.$$('.tile--img__img, [data-testid="image-result"] img, .module--images img');

    for (const img of images.slice(0, 5)) {
      try {
        const src = await img.getAttribute('src') || await img.getAttribute('data-src');
        if (src && !src.startsWith('data:') && !src.includes('placeholder')) {
          // Get the full-size image URL
          let imgUrl = src;

          // Try to get higher res version
          const parent = await img.$('xpath=..');
          if (parent) {
            const href = await parent.getAttribute('href');
            if (href && href.includes('uddg=')) {
              const match = href.match(/uddg=([^&]+)/);
              if (match) {
                imgUrl = decodeURIComponent(match[1]);
              }
            }
          }

          // Download image
          const response = await page.request.get(imgUrl);
          if (response.ok()) {
            const buffer = await response.body();
            if (buffer.length > 5000) {
              console.log(`  Found search image (${Math.round(buffer.length / 1024)}KB)`);
              return buffer;
            }
          }
        }
      } catch (e) {
        // Continue to next image
      }
    }

    console.log('  No suitable product image found in search');
    return null;

  } catch (error) {
    console.log(`  Image search error: ${error.message}`);
    return null;
  } finally {
    await context.close();
  }
}

// CLI test
const isMain = process.argv[1]?.includes('playwright-scraper');
if (isMain) {
  const testUrl = process.argv[2] || 'https://incidecoder.com/products/glow-recipe-watermelon-glow-niacinamide-dew-drops';

  console.log(`Testing scrape: ${testUrl}\n`);

  scrapeIngredientPage(testUrl)
    .then(async result => {
      console.log('\n--- Result ---');
      console.log(`Product: ${result.productName}`);
      console.log(`Content length: ${result.content.length}`);
      console.log(`Has image: ${result.productImage ? 'Yes (' + result.productImage.length + ' bytes)' : 'No'}`);

      if (result.productImage) {
        const fs = await import('fs');
        fs.writeFileSync('test-product-image.jpg', result.productImage);
        console.log('Saved test-product-image.jpg');
      }
    })
    .catch(err => console.error('Error:', err))
    .finally(() => closeBrowser());
}
