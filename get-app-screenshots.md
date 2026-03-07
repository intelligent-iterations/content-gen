# Get App Screenshots

Capture ingredient results screenshots from the pom app for TikTok content.

**CRITICAL**: These screenshots use REAL Firebase production data. Never use fake/mock data for ingredient safety - people could be harmed.

## How It Works

The screenshot system:
1. Starts the Android emulator (if not running)
2. Sets the App Check debug token via ADB
3. Launches Flutter app with ingredient sets
4. Waits for Firebase data to load
5. Captures screenshots at TikTok dimensions (1080x1920)

## Quick Start (Node.js)

```javascript
import { captureScreenshotBatch } from './code/emulator-screenshot.js';

// Capture screenshots with REAL Firebase data
const screenshots = await captureScreenshotBatch([
  ['Fragrance', 'Phenoxyethanol', 'Water'],
  ['Niacinamide', 'Retinol', 'Vitamin C'],
  ['Palm Oil', 'TBHQ', 'Red 40']
]);

// Returns array of PNG buffers (1080x1920), one per ingredient set
```

## App Check Debug Token

The system uses a fixed App Check debug token registered in Firebase Console:
```
61861922-CF2C-4133-BCE2-35017878925D
```

This token is automatically set via ADB before each capture session. It's stored in:
- Node.js: `code/emulator-screenshot.js` (FIXED_DEBUG_TOKEN constant)
- Gradle: `android/gradle.properties` (for documentation)

## API Reference

### captureScreenshotBatch(ingredientSets)

Captures multiple screenshots in a single Flutter session.

```javascript
import { captureScreenshotBatch } from './code/emulator-screenshot.js';

const ingredientSets = [
  ['Fragrance', 'Phenoxyethanol'],  // Screenshot 1
  ['Niacinamide', 'Glycerin'],       // Screenshot 2
  ['Palm Oil', 'Red 40']             // Screenshot 3
];

const buffers = await captureScreenshotBatch(ingredientSets);
// buffers[0] = PNG buffer for screenshot 1
// buffers[1] = PNG buffer for screenshot 2
// etc.
```

### captureScreenshotBatchWithFallback(ingredientSets, timeout)

Same as above but with timeout and graceful failure handling.

```javascript
import { captureScreenshotBatchWithFallback } from './code/emulator-screenshot.js';

const buffers = await captureScreenshotBatchWithFallback(ingredientSets, 180000);
// Returns empty array on failure instead of throwing
```

### captureRealScreenshot(ingredients)

Captures a single screenshot (wrapper around batch).

```javascript
import { captureRealScreenshot } from './code/emulator-screenshot.js';

const buffer = await captureRealScreenshot(['Fragrance', 'Water']);
```

## Manual Testing

```bash
# Test the batch screenshot system
cd /Users/lucy/pom/video_gen
node code/emulator-screenshot.js

# Screenshots saved to: output/batch-test-1.png, batch-test-2.png
```

## How Data Flows

1. **Node.js** formats ingredients: `Fragrance,Phenoxyethanol|Niacinamide,Retinol`
2. **Flutter** receives via `--dart-define=SCREENSHOT_INGREDIENTS=...`
3. **Flutter** calls Firebase Functions (REAL production backend)
4. **Firebase** returns actual ingredient data from Firestore
5. **Flutter** renders the IngredientListView with real ratings/flags
6. **Node.js** captures via ADB screencap and resizes to 1080x1920

## Verification

The system uses REAL Firebase (confirmed by logs):
```
POM: EmulatorConfigService: Using live Firebase (debug: true)
POM: FirebaseFunctionsClient: URL: https://fetchIngredientsV4-wmu73svotq-uc.a.run.app
POM: FirebaseFunctionsClient: Function fetchIngredientsV4 responded with status 200
```

NOT using emulator (would show `http://10.0.2.2:5001/...`).

## Timing

The batch capture uses these timings:
- First screenshot: 25s wait for initial Firebase load
- Subsequent screenshots: 20s wait (Flutter auto-advances every 20s)

Total time for N screenshots ≈ 25 + (N-1)*20 seconds + Flutter startup time.

## Troubleshooting

### App Check 403 errors
Ensure the debug token `61861922-CF2C-4133-BCE2-35017878925D` is registered in:
Firebase Console → scany-dev → App Check → Apps → Android (app.thepom.dev) → Manage debug tokens

### Screenshots show loading spinners
Increase wait times in `emulator-screenshot.js` or check Firebase connectivity.

### Red screen instead of app
The app isn't in foreground when screenshot was taken. Check `isPomAppInForeground()` function.

## Files

- `code/emulator-screenshot.js` - Main screenshot capture module
- `scany/lib/entry/screenshot.dart` - Flutter screenshot entry point
- `scany/android/gradle.properties` - Documents the debug token
