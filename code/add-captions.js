import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// --- Extract dialogue from compilation MD ---

function extractDialogues(mdPath) {
  const md = fs.readFileSync(mdPath, 'utf-8');
  const clipSections = md.split(/^## Clip \d+:/m).slice(1);
  const dialogues = [];

  for (const section of clipSections) {
    const videoMatch = section.match(/### Video Prompt\s*```\s*([\s\S]*?)```/);
    if (!videoMatch) {
      dialogues.push(null);
      continue;
    }

    // Extract the quoted dialogue after "clearly speaking:"
    const prompt = videoMatch[1];
    const dialogueMatch = prompt.match(/clearly speaking:\s*"([^"]+)"/);
    if (dialogueMatch) {
      dialogues.push(dialogueMatch[1]);
    } else {
      // Fallback: try to find any quoted dialogue
      const quoteMatch = prompt.match(/"([^"]{10,})"/);
      dialogues.push(quoteMatch ? quoteMatch[1] : null);
    }
  }

  return dialogues;
}

// --- Get clip duration via ffprobe ---

function getClipDuration(clipPath) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${clipPath}"`,
    { encoding: 'utf-8' }
  );
  return parseFloat(out.trim());
}

// --- Format time for ASS (H:MM:SS.cc) ---

function assTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const sWhole = Math.floor(s);
  const cs = Math.round((s - sWhole) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sWhole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// --- Generate ASS subtitle content ---

function generateASS(dialogues, clipDurations, videoWidth, videoHeight) {
  // ASS uses a "PlayResX/PlayResY" coordinate system
  const playResX = videoWidth;
  const playResY = videoHeight;

  // TikTok style: bold, white, black outline, centered lower-third area
  // Font size relative to 1280 height → ~58px looks good
  const fontSize = 58;
  const outlineSize = 4;
  const shadowSize = 2;

  let ass = `[Script Info]
Title: TikTok Style Captions
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial Black,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${outlineSize},${shadowSize},2,40,40,320,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let offset = 0;

  for (let i = 0; i < dialogues.length; i++) {
    const dialogue = dialogues[i];
    const clipDur = clipDurations[i];

    if (!dialogue) {
      offset += clipDur;
      continue;
    }

    // The character acts first, then speaks — dialogue starts ~2s into clip
    const speechStart = offset + 1.8;
    const speechEnd = offset + clipDur - 0.3;
    const speechDuration = speechEnd - speechStart;

    // Split into word groups (2-3 words each) for TikTok-style reveal
    const words = dialogue.split(/\s+/);
    const groups = [];
    let j = 0;
    while (j < words.length) {
      // Group size: 2-3 words. Use 3 for short words, 2 for longer ones
      const remaining = words.length - j;
      let groupSize;
      if (remaining <= 3) {
        groupSize = remaining;
      } else {
        // Check average word length of next few words
        const nextWords = words.slice(j, j + 3).join(' ');
        groupSize = nextWords.length > 20 ? 2 : 3;
      }
      groups.push(words.slice(j, j + groupSize).join(' '));
      j += groupSize;
    }

    // Distribute groups evenly across speech time
    const groupDuration = speechDuration / groups.length;

    for (let g = 0; g < groups.length; g++) {
      const start = speechStart + g * groupDuration;
      const end = start + groupDuration;
      // Escape ASS special chars
      const text = groups[g].replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
      ass += `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${text}\n`;
    }

    offset += clipDur;
  }

  return ass;
}

// --- Burn captions into a video (importable) ---

export function burnCaptions({ mdPath, clipsDir, inputVideo, outputVideo }) {
  // 1. Extract dialogues
  const dialogues = extractDialogues(mdPath);
  console.log(`  Extracted ${dialogues.length} dialogues`);

  // 2. Get clip durations
  const clipFiles = fs.readdirSync(clipsDir)
    .filter(f => f.match(/^clip\d+/i) && f.endsWith('.mp4'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0]);
      const numB = parseInt(b.match(/\d+/)[0]);
      return numA - numB;
    });

  if (clipFiles.length !== dialogues.length) {
    console.warn(`  Warning: ${clipFiles.length} clips found but ${dialogues.length} dialogues extracted`);
  }

  const clipDurations = clipFiles.map(f => getClipDuration(path.join(clipsDir, f)));

  // 3. Get video dimensions
  const dimOut = execSync(
    `ffprobe -v error -show_entries stream=width,height -of csv=p=0 "${inputVideo}"`,
    { encoding: 'utf-8' }
  );
  const [width, height] = dimOut.trim().split('\n')[0].split(',').map(Number);

  // 4. Generate ASS file
  const assContent = generateASS(dialogues, clipDurations, width, height);
  const assPath = inputVideo.replace(/\.mp4$/, '-captions.ass');
  fs.writeFileSync(assPath, assContent);

  // 5. Burn subtitles into video
  const escapedAssPath = assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");

  execSync(
    `ffmpeg -y -i "${inputVideo}" -vf "ass='${escapedAssPath}'" -c:v libx264 -preset fast -crf 18 -c:a copy "${outputVideo}"`,
    { stdio: 'inherit' }
  );

  // Clean up ASS file
  fs.unlinkSync(assPath);

  console.log(`  Captioned video: ${outputVideo}`);
  return outputVideo;
}

export { extractDialogues, generateASS };

// --- CLI Main ---

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node code/add-captions.js <compilation.md> [--output <path>]');
    console.error('');
    console.error('Looks for clips and final video based on the MD filename.');
    process.exit(1);
  }

  const mdPath = path.resolve(args[0]);
  const baseName = path.basename(mdPath, '.md');

  let outputPath = null;
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputPath = path.resolve(args[outputIdx + 1]);
  }

  const videosDir = path.join(ROOT_DIR, 'videos');
  const clipsDir = path.join(videosDir, baseName);
  const finalVideo = path.join(videosDir, `${baseName}-final.mp4`);

  if (!fs.existsSync(finalVideo)) {
    console.error(`Final video not found: ${finalVideo}`);
    process.exit(1);
  }
  if (!fs.existsSync(clipsDir)) {
    console.error(`Clips directory not found: ${clipsDir}`);
    process.exit(1);
  }

  if (!outputPath) {
    outputPath = path.join(videosDir, `${baseName}-captioned.mp4`);
  }

  console.log(`\n=== Adding TikTok-Style Captions ===`);
  burnCaptions({ mdPath, clipsDir, inputVideo: finalVideo, outputVideo: outputPath });
  console.log(`\n=== Done! ===`);
}

// Only run CLI if invoked directly
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
