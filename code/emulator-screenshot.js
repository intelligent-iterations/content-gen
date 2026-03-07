/**
 * Capture real screenshots from the pom app running on Android emulator
 * Uses real Firebase data via the Flutter app
 *
 * Uses integration test approach for reliable screenshot capture:
 * - Waits for UI elements to appear (no arbitrary timeouts)
 * - Waits for loading indicators to disappear
 * - Captures screenshots only when data is fully loaded
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Paths
const ADB_PATH = '~/Library/Android/sdk/platform-tools/adb';
const EMULATOR_PATH = '~/Library/Android/sdk/emulator/emulator';
const SCANY_PATH = '/Users/lucy/pom/scany';
const AVD_NAME = 'Medium_Phone';

// TikTok dimensions
const TIKTOK_WIDTH = 1080;
const TIKTOK_HEIGHT = 1920;

// Fixed App Check debug token (already registered in Firebase Console)
const FIXED_DEBUG_TOKEN = '61861922-CF2C-4133-BCE2-35017878925D';

/**
 * Set a fixed App Check debug token via adb.
 * This writes directly to the SharedPreferences file Firebase uses.
 * Must be called BEFORE the app starts.
 */
async function setFixedAppCheckToken() {
  const packageName = 'app.thepom.dev';
  const prefsFile = 'com.google.firebase.appcheck.debug.store.W0RFRkFVTFRd+MToxMDY0NDM1MjA5MjEzOmFuZHJvaWQ6YmIwZjEyYjlmZmU2ZDc2ZGZhM2Y5NA.xml';
  const deviceTempFile = '/data/local/tmp/appcheck.xml';
  const targetPath = `/data/data/${packageName}/shared_prefs/${prefsFile}`;

  const xmlContent = `<?xml version="1.0" encoding="utf-8" standalone="yes" ?>
<map>
    <string name="com.google.firebase.appcheck.debug.DEBUG_SECRET">${FIXED_DEBUG_TOKEN}</string>
</map>`;

  try {
    // Write XML to a local temp file
    const localTempFile = '/tmp/appcheck_token.xml';
    fs.writeFileSync(localTempFile, xmlContent);

    // Push to device
    await execAsync(`${ADB_PATH} push ${localTempFile} ${deviceTempFile}`);

    // Copy to app's shared_prefs using run-as
    await execAsync(`${ADB_PATH} shell "run-as ${packageName} cp ${deviceTempFile} ${targetPath}"`);

    console.log(`  ✓ Set fixed App Check token`);
    return true;
  } catch (error) {
    console.log(`  Note: Could not set fixed token (app may not be installed yet)`);
    return false;
  }
}

/**
 * Check if emulator is running
 */
async function isEmulatorRunning() {
  try {
    const { stdout } = await execAsync(`${ADB_PATH} devices`);
    return stdout.includes('emulator-5554') && stdout.includes('device');
  } catch {
    return false;
  }
}

/**
 * Start Android emulator
 */
async function startEmulator() {
  console.log('Starting Android emulator...');

  // Start emulator in background
  const emulator = spawn('sh', ['-c', `${EMULATOR_PATH} -avd ${AVD_NAME} -no-audio -no-boot-anim`], {
    detached: true,
    stdio: 'ignore'
  });
  emulator.unref();

  // Wait for emulator to be ready
  const maxWait = 60000; // 60 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    if (await isEmulatorRunning()) {
      console.log('Emulator is ready!');
      // Wait a bit more for system to fully boot
      await sleep(5000);
      return true;
    }
    await sleep(2000);
  }

  throw new Error('Emulator failed to start within 60 seconds');
}

/**
 * Check if pom app is currently in foreground
 */
async function isPomAppInForeground() {
  try {
    const { stdout } = await execAsync(`${ADB_PATH} shell "dumpsys window | grep mCurrentFocus"`);
    return stdout.includes('app.thepom.dev');
  } catch {
    return false;
  }
}

/**
 * Capture a single screenshot via adb and resize to TikTok dimensions
 */
async function captureAndResize() {
  const { stdout } = await execAsync(`${ADB_PATH} exec-out screencap -p`, {
    encoding: 'buffer',
    maxBuffer: 10 * 1024 * 1024 // 10MB
  });

  // Resize to TikTok dimensions (9:16) - crop from top to preserve header
  const resized = await sharp(stdout)
    .resize(TIKTOK_WIDTH, TIKTOK_HEIGHT, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer();

  return resized;
}

/**
 * Send tap to advance to next screenshot set.
 * In manual mode, the Flutter app has a fullscreen invisible GestureDetector
 * overlay (Positioned.fill) that catches taps anywhere on screen.
 * The IngredientListView below has IgnorePointer so taps can't accidentally
 * scroll or open ingredient details.
 */
async function tapNextSet() {
  // Tap center of screen — the fullscreen overlay catches it regardless of position
  await execAsync(`${ADB_PATH} shell input tap 540 1200`);
}

/**
 * Check if ingredients are loaded on screen using uiautomator
 * Looks for ingredient names in the UI hierarchy and absence of loading spinners.
 * @param {string[]} ingredients - Ingredient names to look for
 * @returns {Promise<{loaded: boolean, hasSpinner: boolean, foundIngredients: string[]}>}
 */
async function checkScreenReady(ingredients) {
  try {
    // Dump UI hierarchy
    await execAsync(`${ADB_PATH} shell uiautomator dump /data/local/tmp/ui.xml`);
    const { stdout } = await execAsync(`${ADB_PATH} shell cat /data/local/tmp/ui.xml`);

    const xmlLower = stdout.toLowerCase();

    // Check for loading indicators
    const hasSpinner = xmlLower.includes('progressbar') || xmlLower.includes('circularprogressindicator');
    // Check for the full-page loading screen (PomProcess with animated text)
    const hasLoadingScreen = xmlLower.includes('searching for research') || xmlLower.includes('analyzing results');

    // Check which ingredients are visible on screen
    const foundIngredients = [];
    for (const ing of ingredients) {
      if (xmlLower.includes(ing.toLowerCase())) {
        foundIngredients.push(ing);
      }
    }

    // Check for "Ingredients" header which indicates the list view rendered
    const hasHeader = xmlLower.includes('ingredients');

    const loaded = hasHeader && foundIngredients.length > 0 && !hasLoadingScreen;

    return { loaded, hasSpinner, hasLoadingScreen, foundIngredients, hasHeader };
  } catch (e) {
    console.log(`    UI check failed: ${e.message}`);
    return { loaded: false, hasSpinner: false, hasLoadingScreen: false, foundIngredients: [], hasHeader: false };
  }
}

/**
 * Wait for ingredients to be visible on screen before capturing.
 * Polls the UI hierarchy until ingredients appear or timeout.
 * @param {string[]} ingredients - Ingredient names to wait for
 * @param {number} timeout - Max wait in ms (default 45s)
 * @param {number} pollInterval - How often to check in ms (default 3s)
 * @returns {Promise<boolean>} - true if ingredients loaded, false if timed out
 */
async function waitForIngredientsLoaded(ingredients, timeout = 45000, pollInterval = 3000) {
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < timeout) {
    const status = await checkScreenReady(ingredients);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Build status string for logging (only log when status changes)
    const statusStr = `header=${status.hasHeader} loading=${status.hasLoadingScreen} spinner=${status.hasSpinner} found=${status.foundIngredients.length}/${ingredients.length}`;
    if (statusStr !== lastStatus) {
      console.log(`    UI check (${elapsed}s): ${statusStr}`);
      if (status.foundIngredients.length > 0) {
        console.log(`    Found: ${status.foundIngredients.slice(0, 3).join(', ')}${status.foundIngredients.length > 3 ? '...' : ''}`);
      }
      lastStatus = statusStr;
    }

    if (status.loaded) {
      console.log(`    Ingredients loaded after ${elapsed}s`);
      // Extra 2s for any final rendering/animations
      await sleep(2000);
      return true;
    }

    await sleep(pollInterval);
  }

  console.log(`    WARNING: Timed out after ${Math.round(timeout / 1000)}s waiting for ingredients`);
  return false;
}

/**
 * Push product images to emulator for display in screenshot scan preview section.
 *
 * Pushes to /data/local/tmp/ which is world-readable on the emulator.
 * The paths are passed to the Flutter integration test via --dart-define,
 * so the app reads them at runtime without needing run-as or app-private storage.
 *
 * @param {Buffer[]} productImages - Array of product image buffers to display in scan preview
 * @returns {Promise<string[]>} - Array of paths on emulator where images were pushed
 */
async function pushProductImagesToEmulator(productImages) {
  if (!productImages || productImages.length === 0) return [];

  const emulatorPaths = [];

  for (let i = 0; i < productImages.length; i++) {
    const buffer = productImages[i];
    if (!buffer) {
      emulatorPaths.push('');
      continue;
    }

    // Write to temp file on host
    const tempPath = `/tmp/pom_product_${i}.jpg`;
    fs.writeFileSync(tempPath, buffer);

    // Push to /data/local/tmp/ (world-readable on emulator)
    const devicePath = `/data/local/tmp/pom_product_${i}.jpg`;
    await execAsync(`${ADB_PATH} push ${tempPath} ${devicePath}`);

    // Ensure readable by app
    await execAsync(`${ADB_PATH} shell chmod 644 ${devicePath}`).catch(() => {});

    emulatorPaths.push(devicePath);

    // Cleanup host temp file
    fs.unlinkSync(tempPath);
  }

  console.log(`  Pushed ${emulatorPaths.filter(p => p).length} product images to /data/local/tmp/`);
  return emulatorPaths;
}

/**
 * Run a single flutter drive to capture one screenshot set.
 * Returns 'ok' or 'skipped', plus the screenshot path.
 *
 * @param {string} ingredientsParam - URI-encoded ingredients for this set (comma-separated)
 * @param {string} productImagePath - Path on emulator for product image, or empty
 * @param {number} maxRetries - Max retry attempts
 * @returns {Promise<{result: string, screenshotPath: string|null}>}
 */
async function runSingleFlutterDrive(ingredients, productImagePath = '', maxRetries = 2) {
  // Write config JSON to emulator (runtime file, avoids dart-define caching)
  const config = {
    ingredients: [ingredients],
    product_images: productImagePath ? [productImagePath] : [],
  };
  const localConfigPath = '/tmp/pom_screenshot_config.json';
  const deviceConfigPath = '/data/local/tmp/pom_screenshot_config.json';
  fs.writeFileSync(localConfigPath, JSON.stringify(config));
  await execAsync(`${ADB_PATH} push ${localConfigPath} ${deviceConfigPath}`);

  const flutterCmd = `cd ${SCANY_PATH} && flutter drive ` +
    `--driver=test_driver/integration_test.dart ` +
    `--target=integration_test/tiktok_screenshot_test.dart ` +
    `--flavor dev ` +
    `-d emulator-5554`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`    Retry ${attempt}/${maxRetries}...`);
      // Force-stop app between retries to free memory
      await execAsync(`${ADB_PATH} shell am force-stop app.thepom.dev`).catch(() => {});
      await sleep(3000);
    }

    try {
      const { result, screenshotPath } = await new Promise((resolve, reject) => {
        const flutter = spawn('sh', ['-c', flutterCmd], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let result = null;

        flutter.stdout.on('data', (data) => {
          const text = data.toString();
          output += text;
          for (const line of text.split('\n')) {
            if (line.includes('📸')) {
              console.log('    ' + line.trim());
            }
            const resultsMatch = line.match(/RESULTS:\s*(.+)/);
            if (resultsMatch) {
              result = resultsMatch[1].trim();
            }
          }
        });

        flutter.stderr.on('data', (data) => {
          output += data.toString();
        });

        flutter.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`flutter drive exit code ${code}`));
            return;
          }

          // Find screenshot file
          const screenshotBaseDir = path.join(SCANY_PATH, 'integration_test', 'screenshots');
          let screenshotPath = null;

          try {
            const runs = fs.readdirSync(screenshotBaseDir)
              .filter(d => d.startsWith('run_'))
              .sort()
              .reverse();

            if (runs.length > 0) {
              const candidate = path.join(screenshotBaseDir, runs[0], 'tiktok_screenshot_1.png');
              if (fs.existsSync(candidate)) {
                screenshotPath = candidate;
              }
            }
          } catch (e) {
            const candidate = path.join(screenshotBaseDir, 'run_unknown', 'tiktok_screenshot_1.png');
            if (fs.existsSync(candidate)) {
              screenshotPath = candidate;
            }
          }

          resolve({ result: result || 'ok', screenshotPath });
        });
      });

      return { result, screenshotPath };
    } catch (e) {
      console.log(`    flutter drive failed: ${e.message}`);
      if (attempt === maxRetries) {
        return { result: 'failed', screenshotPath: null };
      }
    }
  }

  return { result: 'failed', screenshotPath: null };
}

/**
 * Capture multiple screenshots using Flutter integration test.
 *
 * Runs one flutter drive per ingredient set to avoid emulator memory crashes.
 * Each run captures a single screenshot, with retry on failure.
 *
 * @param {Array<string[]>} ingredientSets - Array of ingredient arrays
 * @param {Buffer[]} productImages - Optional array of product image buffers for scan preview
 * @returns {Promise<Buffer[]>} - Array of screenshot buffers (null = skipped)
 */
export async function captureScreenshotBatch(ingredientSets, productImages = []) {
  console.log(`Capturing ${ingredientSets.length} screenshots (one flutter drive per set)...`);

  // Check if emulator is running
  if (!await isEmulatorRunning()) {
    await startEmulator();
  }

  // Push product images to /data/local/tmp/ on emulator (world-readable)
  let productImagePaths = [];
  if (productImages.length > 0) {
    productImagePaths = await pushProductImagesToEmulator(productImages);
  }

  // Note: App Check debug token is set inside the Dart integration test itself

  const screenshots = [];

  for (let i = 0; i < ingredientSets.length; i++) {
    const ingredients = ingredientSets[i];
    const productImagePath = i < productImagePaths.length ? productImagePaths[i] : '';

    console.log(`  Set ${i + 1}/${ingredientSets.length}: ${ingredients.slice(0, 3).join(', ')}${ingredients.length > 3 ? '...' : ''}`);

    // Force-stop between sets to free memory (skip first — app isn't running yet)
    if (i > 0) {
      await execAsync(`${ADB_PATH} shell am force-stop app.thepom.dev`).catch(() => {});
      await sleep(3000);
    }

    const { result, screenshotPath } = await runSingleFlutterDrive(ingredients, productImagePath);

    if (result === 'skipped') {
      console.log(`  Set ${i + 1}: skipped (not in Firebase)`);
      screenshots.push(null);
    } else if (result === 'failed' || !screenshotPath) {
      console.log(`  Set ${i + 1}: FAILED — no screenshot captured`);
      screenshots.push(null);
    } else {
      // Read and resize to TikTok dimensions
      const buffer = await sharp(screenshotPath)
        .resize(TIKTOK_WIDTH, TIKTOK_HEIGHT, { fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
      screenshots.push(buffer);
      console.log(`  Set ${i + 1}: ✓ captured (${Math.round(buffer.length / 1024)}KB)`);
    }
  }

  const captured = screenshots.filter(s => s !== null).length;
  console.log(`  Captured ${captured}/${ingredientSets.length} screenshots with REAL Firebase data`);
  return screenshots;
}

/**
 * Capture a single screenshot (wrapper around batch for single set)
 * @param {string[]} ingredients - Array of ingredient names
 * @returns {Promise<Buffer>} - Screenshot as PNG buffer
 */
export async function captureRealScreenshot(ingredients) {
  const results = await captureScreenshotBatch([ingredients]);
  return results[0];
}

/**
 * Capture screenshot with timeout and fallback
 * @param {string[]} ingredients - Array of ingredient names
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Buffer|null>} - Screenshot buffer or null on failure
 */
export async function captureScreenshotWithFallback(ingredients, timeout = 120000) {
  try {
    const result = await Promise.race([
      captureRealScreenshot(ingredients),
      sleep(timeout).then(() => { throw new Error('Screenshot timeout'); })
    ]);
    return result;
  } catch (error) {
    console.error(`  Failed to capture real screenshot: ${error.message}`);
    console.log('  Will skip screenshot slide (fake data is dangerous)');
    return null;
  }
}

/**
 * Capture batch with timeout and fallback
 * @param {Array<string[]>} ingredientSets - Array of ingredient arrays
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Buffer[]>} - Array of screenshot buffers (may be partial on failure)
 */
export async function captureScreenshotBatchWithFallback(ingredientSets, productImages = [], timeout = 180000) {
  try {
    const results = await Promise.race([
      captureScreenshotBatch(ingredientSets, productImages),
      sleep(timeout).then(() => { throw new Error('Batch screenshot timeout'); })
    ]);
    return results;
  } catch (error) {
    console.error(`  Failed to capture batch screenshots: ${error.message}`);
    console.log('  Will skip screenshot slides (fake data is dangerous)');
    return [];
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Capture screenshots using Flutter integration test (RECOMMENDED)
 * This approach waits for UI elements to appear instead of arbitrary timeouts.
 * Much more reliable than the timing-based approach.
 * @param {Array<string[]>} ingredientSets - Array of ingredient arrays
 * @returns {Promise<Buffer[]>} - Array of screenshot buffers
 */
export async function captureScreenshotsWithIntegrationTest(ingredientSets) {
  console.log(`Capturing ${ingredientSets.length} screenshots using integration test...`);

  // Check if emulator is running
  if (!await isEmulatorRunning()) {
    await startEmulator();
  }

  // Set fixed App Check debug token
  await setFixedAppCheckToken();

  // URI-encode each ingredient to handle commas, slashes, and special chars
  const ingredientsParam = ingredientSets
    .map(set => set.map(ing => encodeURIComponent(ing)).join(','))
    .join('|');

  console.log(`  Sets: ${ingredientSets.length}`);

  // Create output directory for screenshots
  const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output', 'integration_screenshots');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Run integration test
  const flutterCmd = `cd ${SCANY_PATH} && flutter drive ` +
    `--driver=test_driver/integration_test.dart ` +
    `--target=integration_test/tiktok_screenshot_test.dart ` +
    `--flavor dev ` +
    `-d emulator-5554 ` +
    `--dart-define='SCREENSHOT_INGREDIENTS=${ingredientsParam}'`;

  console.log('  Running integration test...');

  return new Promise((resolve, reject) => {
    const flutter = spawn('sh', ['-c', flutterCmd], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let screenshotPaths = [];

    flutter.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;

      // Log progress
      if (text.includes('📸')) {
        console.log('  ' + text.trim());
      }

      // Capture screenshot paths from output
      const match = text.match(/Screenshot saved: ([\w_]+)/);
      if (match) {
        screenshotPaths.push(match[1]);
      }
    });

    flutter.stderr.on('data', (data) => {
      output += data.toString();
    });

    flutter.on('close', async (code) => {
      if (code !== 0) {
        console.error('  Integration test failed');
        console.error('  Output:', output.slice(-1000));
        reject(new Error('Integration test failed'));
        return;
      }

      console.log(`  Integration test completed`);

      // Find and load the screenshots from Flutter's output directory
      // Integration test screenshots are saved in integration_test/screenshots/run_unknown/
      const screenshotDir = path.join(SCANY_PATH, 'integration_test', 'screenshots', 'run_unknown');

      try {
        const buffers = [];
        for (let i = 0; i < ingredientSets.length; i++) {
          const screenshotPath = path.join(screenshotDir, `tiktok_screenshot_${i + 1}.png`);
          if (fs.existsSync(screenshotPath)) {
            // Read and resize to TikTok dimensions
            const buffer = await sharp(screenshotPath)
              .resize(TIKTOK_WIDTH, TIKTOK_HEIGHT, { fit: 'cover', position: 'top' })
              .png()
              .toBuffer();
            buffers.push(buffer);
            console.log(`  Loaded screenshot ${i + 1}`);
          } else {
            console.log(`  Warning: Screenshot ${i + 1} not found at ${screenshotPath}`);
          }
        }

        console.log(`  Captured ${buffers.length} screenshots with REAL Firebase data!`);
        resolve(buffers);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// CLI test
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Test batch mode with 2 different ingredient sets
  const testSets = [
    ['Fragrance', 'Phenoxyethanol', 'Water'],
    ['Niacinamide', 'Glycerin', 'Retinol', 'Vitamin C']
  ];

  const useIntegrationTest = process.argv.includes('--integration');

  if (useIntegrationTest) {
    console.log('Testing with integration test approach...');
    captureScreenshotsWithIntegrationTest(testSets).then(buffers => {
      const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output');
      buffers.forEach((buffer, i) => {
        const outputPath = path.join(outputDir, `integration-test-${i + 1}.png`);
        fs.writeFileSync(outputPath, buffer);
        console.log(`Saved: ${outputPath}`);
      });
      console.log(`\nIntegration test complete! Captured ${buffers.length} screenshots.`);
    }).catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
  } else {
    console.log('Testing with timing-based approach (use --integration for integration test)...');
    captureScreenshotBatch(testSets).then(buffers => {
      const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output');
      buffers.forEach((buffer, i) => {
        const outputPath = path.join(outputDir, `batch-test-${i + 1}.png`);
        fs.writeFileSync(outputPath, buffer);
        console.log(`Saved: ${outputPath}`);
      });
      console.log(`\nBatch test complete! Captured ${buffers.length} screenshots.`);
    }).catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
  }
}
