import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { extractDialogues, generateASS } from './add-captions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const VIDEOS_DIR = path.join(ROOT_DIR, 'videos');

function getClipDuration(clipPath) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${clipPath}"`,
    { encoding: 'utf-8' }
  );
  return parseFloat(out.trim());
}

function getVideoDimensions(videoPath) {
  const out = execSync(
    `ffprobe -v error -show_entries stream=width,height -of csv=p=0 "${videoPath}"`,
    { encoding: 'utf-8' }
  );
  const [width, height] = out.trim().split('\n')[0].split(',').map(Number);
  return { width, height };
}

function burnASS(assContent, inputVideo, outputVideo) {
  const assPath = outputVideo.replace(/\.mp4$/, '.ass');
  fs.writeFileSync(assPath, assContent);
  const escaped = assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");
  execSync(
    `ffmpeg -y -i "${inputVideo}" -vf "ass='${escaped}'" -c:v libx264 -preset fast -crf 18 -c:a copy "${outputVideo}"`,
    { stdio: 'pipe' }
  );
  fs.unlinkSync(assPath);
}

function findClipFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => /^clip\d+-.*\.mp4$/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^clip(\d+)/)[1]);
      const numB = parseInt(b.match(/^clip(\d+)/)[1]);
      return numA - numB;
    });
}

// For a variant like "hook-dmdm-hydantoin.mp4", figure out which clip is first
// then the rest follow in original order
function getVariantClipOrder(hookName, clipFiles) {
  // Find which clip index matches the hook name
  const hookIdx = clipFiles.findIndex(f => {
    const name = f.match(/^clip\d+-(.*?)\.mp4$/)[1];
    return name === hookName;
  });
  if (hookIdx === -1) return null;

  // Hook clip first, then rest in original order
  const order = [hookIdx];
  for (let i = 0; i < clipFiles.length; i++) {
    if (i !== hookIdx) order.push(i);
  }
  return order;
}

// --- Process a single video directory ---

function processVideo(baseName, clipsDir, mdPath, finalVideoPath) {
  if (!fs.existsSync(mdPath) || !fs.existsSync(finalVideoPath)) {
    console.log(`  SKIP (missing md or final): ${baseName}`);
    return { captioned: 0, variants: 0 };
  }

  const clipFiles = findClipFiles(clipsDir);
  if (clipFiles.length === 0) {
    console.log(`  SKIP (no clips): ${baseName}`);
    return { captioned: 0, variants: 0 };
  }

  // Extract dialogues and clip durations
  const dialogues = extractDialogues(mdPath);
  const clipDurations = clipFiles.map(f => getClipDuration(path.join(clipsDir, f)));
  const { width, height } = getVideoDimensions(finalVideoPath);

  let captionedCount = 0;
  let variantCount = 0;

  // 1. Caption the original final video
  const captionedPath = finalVideoPath.replace(/-final\.mp4$/, '-captioned.mp4');
  if (fs.existsSync(captionedPath)) {
    console.log(`  [skip] Original already captioned`);
  } else {
    console.log(`  [caption] Original...`);
    const assContent = generateASS(dialogues, clipDurations, width, height);
    burnASS(assContent, finalVideoPath, captionedPath);
    captionedCount++;
  }

  // 2. Caption each variant
  const variantsDir = path.join(clipsDir, 'variants');
  if (!fs.existsSync(variantsDir)) {
    return { captioned: captionedCount, variants: 0 };
  }

  const variantFiles = fs.readdirSync(variantsDir)
    .filter(f => f.startsWith('hook-') && f.endsWith('.mp4') && !f.includes('-captioned'));

  for (const variantFile of variantFiles) {
    const captionedVariant = variantFile.replace(/\.mp4$/, '-captioned.mp4');
    const captionedVariantPath = path.join(variantsDir, captionedVariant);

    if (fs.existsSync(captionedVariantPath)) {
      console.log(`  [skip] ${variantFile}`);
      continue;
    }

    // Parse hook name from filename: "hook-dmdm-hydantoin.mp4" → "dmdm-hydantoin"
    const hookName = variantFile.match(/^hook-(.*?)\.mp4$/)[1];
    const clipOrder = getVariantClipOrder(hookName, clipFiles);

    if (!clipOrder) {
      console.log(`  [error] Can't determine clip order for ${variantFile}`);
      continue;
    }

    // Reorder dialogues and durations to match variant
    const reorderedDialogues = clipOrder.map(i => dialogues[i]);
    const reorderedDurations = clipOrder.map(i => clipDurations[i]);

    const assContent = generateASS(reorderedDialogues, reorderedDurations, width, height);
    const variantPath = path.join(variantsDir, variantFile);

    console.log(`  [caption] ${variantFile}...`);
    burnASS(assContent, variantPath, captionedVariantPath);
    variantCount++;
  }

  return { captioned: captionedCount, variants: variantCount };
}

// --- Main ---

function main() {
  console.log('\n=== Captioning All AI Videos ===\n');

  // Newer videos: MD and final at top level, clips in subdirectory
  const newerVideos = [
    'cosmetics-heroes-powerful-ingredients-that-actuall-2026-02-10',
    'cosmetics-villains-the-most-common-preservatives-h-2026-02-09',
    'cosmetics-villains-toxic-ingredients-hiding-in-you-2026-02-10',
    'food-villains-bad-ingredients-hiding-on-your-groce-2026-02-10',
    'superfoods-that-heal-your-body-from-the-inside-out-2026-02-09',
  ];

  // Older videos: everything inside their directory
  const olderVideos = [
    'common-food-preservatives-and-what-they-do-to-your-2026-02-06',
    'dangerous-food-additives-hiding-in-your-everyday-m-2026-02-07',
    'skincare-ingredients-and-their-benefits-2026-02-06',
  ];

  let totalCaptioned = 0;
  let totalVariants = 0;

  for (const name of newerVideos) {
    console.log(`[${name}]`);
    const result = processVideo(
      name,
      path.join(VIDEOS_DIR, name),
      path.join(VIDEOS_DIR, `${name}.md`),
      path.join(VIDEOS_DIR, `${name}-final.mp4`)
    );
    totalCaptioned += result.captioned;
    totalVariants += result.variants;
  }

  for (const name of olderVideos) {
    console.log(`[${name}]`);
    const dir = path.join(VIDEOS_DIR, name);
    const result = processVideo(
      name,
      dir,
      path.join(dir, `${name}.md`),
      path.join(dir, `${name}-final.mp4`)
    );
    totalCaptioned += result.captioned;
    totalVariants += result.variants;
  }

  console.log(`\n=== Done ===`);
  console.log(`Originals captioned: ${totalCaptioned}`);
  console.log(`Variants captioned: ${totalVariants}`);
  console.log(`Total: ${totalCaptioned + totalVariants}`);
}

main();
