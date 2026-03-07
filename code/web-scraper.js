/**
 * DuckDuckGo Web Scraper for Content Research
 * Ported from pom_functions/functions/src/service/swaps/swap-scraper.ts
 */

import * as cheerio from 'cheerio';
import { findProductImageWithPuppeteer, closeBrowser as closePuppeteerBrowser } from './puppeteer-image-scraper.js';

/**
 * Extract the actual URL from DuckDuckGo's redirect wrapper
 */
export function extractUrl(ddgUrl) {
  if (!ddgUrl) return null;
  try {
    // Skip ads (they use y.js redirect)
    if (ddgUrl.includes('/y.js') || ddgUrl.includes('ad_provider')) {
      return null;
    }
    // DuckDuckGo wraps URLs in redirect: //duckduckgo.com/l/?uddg=<encoded_url>
    const match = ddgUrl.match(/uddg=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return ddgUrl;
  } catch {
    return ddgUrl;
  }
}

/**
 * Search DuckDuckGo for information
 * @param {string} query - Search query
 * @param {number} limit - Max results to return (default 10)
 * @returns {Promise<Array<{title: string, url: string, snippet: string}>>}
 */
export async function searchDuckDuckGo(query, limit = 10) {
  console.log(`  Searching DuckDuckGo: "${query}"`);

  try {
    const response = await fetch('https://duckduckgo.com/html/?' + new URLSearchParams({ q: query }), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed with status: ${response.status}`);
    }

    const data = await response.text();
    const $ = cheerio.load(data);
    const results = [];

    $('.result').each((_, elem) => {
      if (results.length >= limit) return false;

      const title = $(elem).find('.result__a').text().trim();
      const rawUrl = $(elem).find('.result__a').attr('href');
      const url = extractUrl(rawUrl);
      const snippet = $(elem).find('.result__snippet').text().trim();

      if (title && url) {
        results.push({ title, url, snippet });
      }
    });

    console.log(`  Found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('  DuckDuckGo search failed:', error.message);
    throw error;
  }
}

/**
 * Fetch and extract text content from a URL
 * @param {string} url - URL to scrape
 * @param {number} timeout - Timeout in ms (default 8000)
 * @returns {Promise<{content: string, blocked: boolean, error: string|null}>}
 */
export async function scrapePageContent(url, timeout = 8000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove scripts, styles, nav, header, footer
    $('script, style, nav, header, footer, aside, iframe').remove();

    // Get main content
    const bodyText = $('body').text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000); // Limit content length

    // Check for CAPTCHA/blocking
    const blockedPatterns = ['captcha', 'robot', 'blocked', 'access denied', 'verify you are human'];
    const isBlocked = blockedPatterns.some(pattern => bodyText.toLowerCase().includes(pattern));

    if (isBlocked) {
      return { content: '', blocked: true, error: null };
    }

    return { content: bodyText, blocked: false, error: null };
  } catch (error) {
    return { content: '', blocked: true, error: error.message };
  }
}

/**
 * Search and get summarized results
 * @param {string} query - Search query
 * @returns {Promise<string>} - Formatted search results
 */
export async function searchAndSummarize(query) {
  const results = await searchDuckDuckGo(query, 5);

  if (results.length === 0) {
    return `No results found for: "${query}"`;
  }

  let summary = `Search results for "${query}":\n\n`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    summary += `${i + 1}. ${r.title}\n`;
    summary += `   ${r.snippet}\n`;
    summary += `   URL: ${r.url}\n\n`;
  }

  return summary;
}

/**
 * Search DuckDuckGo for images
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Promise<Array<{title: string, imageUrl: string, sourceUrl: string}>>}
 */
export async function searchImages(query, limit = 5) {
  console.log(`  Searching images: "${query}"`);

  try {
    // Use DuckDuckGo image search
    const response = await fetch('https://duckduckgo.com/i.js?' + new URLSearchParams({
      q: query,
      o: 'json',
      p: '1',
      s: '0'
    }), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept': 'application/json',
        'Referer': 'https://duckduckgo.com/'
      }
    });

    if (!response.ok) {
      console.log(`  Image search failed, trying alternative...`);
      return await searchImagesAlternative(query, limit);
    }

    const data = await response.json();
    const results = [];

    if (data.results) {
      for (const item of data.results.slice(0, limit)) {
        if (item.image && item.thumbnail) {
          results.push({
            title: item.title || 'Image',
            imageUrl: item.image,
            thumbnailUrl: item.thumbnail,
            sourceUrl: item.url || item.source
          });
        }
      }
    }

    console.log(`  Found ${results.length} images`);
    return results;
  } catch (error) {
    console.log(`  Image search error: ${error.message}`);
    return await searchImagesAlternative(query, limit);
  }
}

/**
 * Alternative image search using regular search + page scraping
 */
async function searchImagesAlternative(query, limit = 5) {
  // Search for product pages that likely have images
  const searchResults = await searchDuckDuckGo(`${query} product image`, limit);
  const results = [];

  for (const result of searchResults) {
    // Look for common image hosting patterns in URLs
    if (result.url.includes('amazon.com') ||
        result.url.includes('sephora.com') ||
        result.url.includes('ulta.com') ||
        result.url.includes('target.com')) {
      results.push({
        title: result.title,
        imageUrl: null, // Will need to scrape
        sourceUrl: result.url,
        needsScraping: true
      });
    }
  }

  return results;
}

/**
 * Download an image from URL
 * @param {string} imageUrl - URL of image
 * @returns {Promise<Buffer|null>} - Image buffer or null on failure
 */
export async function downloadImageFromUrl(imageUrl) {
  try {
    console.log(`  Downloading image from: ${imageUrl.substring(0, 60)}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept': 'image/*'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`  Failed to download: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      console.log(`  Not an image: ${contentType}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`  Downloaded ${Math.round(arrayBuffer.byteLength / 1024)}KB`);
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.log(`  Download failed: ${error.message}`);
    return null;
  }
}

/**
 * Search for product images and return the best one
 * Uses Puppeteer for real browser-based image search
 * @param {string} query - Product search query
 * @returns {Promise<{buffer: Buffer, source: string}|null>}
 */
export async function findProductImage(query) {
  // Use Puppeteer-based search for reliable results
  return await findProductImageWithPuppeteer(query);
}

/**
 * Close the Puppeteer browser instance
 * Call this when done with all image searches
 */
export async function closeBrowser() {
  await closePuppeteerBrowser();
}
