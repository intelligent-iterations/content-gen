import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { parseCompilationMD, generateClip, stitchClips, lastHit429 } from './generate-video-compilation.js';
import { burnCaptions } from './add-captions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error('Missing XAI_API_KEY in .env');
  process.exit(1);
}

// --- CLI argument parsing ---

function parseArgs(args) {
  const opts = { topic: null, format: null, clips: 6, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      opts.format = args[++i];
    } else if (args[i] === '--clips' && args[i + 1]) {
      opts.clips = parseInt(args[++i], 10);
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    } else if (!args[i].startsWith('--')) {
      opts.topic = args[i];
    }
  }

  return opts;
}

// --- Read instruction files ---

function loadInstructions() {
  const ingredientPath = path.join(ROOT_DIR, 'INGREDIENT_CHARACTER_INSTRUCTIONS.md');
  const compilationPath = path.join(ROOT_DIR, 'COMPILATION_VIDEO_FORMAT.md');

  if (!fs.existsSync(ingredientPath)) {
    console.error(`Missing instruction file: ${ingredientPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(compilationPath)) {
    console.error(`Missing instruction file: ${compilationPath}`);
    process.exit(1);
  }

  return {
    ingredientInstructions: fs.readFileSync(ingredientPath, 'utf-8'),
    compilationFormat: fs.readFileSync(compilationPath, 'utf-8'),
  };
}

// --- Validate generated MD against parseCompilationMD expectations ---

function validateCompilationMD(mdContent, expectedClips) {
  const errors = [];

  // Check for clip headers
  const clipHeaders = mdContent.match(/^## Clip \d+:/gm) || [];
  if (clipHeaders.length === 0) {
    errors.push('No "## Clip N:" headers found. Each clip must start with "## Clip 1:", "## Clip 2:", etc.');
    return errors; // Can't check further without clips
  }

  if (clipHeaders.length < expectedClips) {
    errors.push(`Expected ${expectedClips} clips but found ${clipHeaders.length} clip headers.`);
  }

  // Parse each clip section
  const clipSections = mdContent.split(/^## Clip \d+:/m).slice(1);

  for (let i = 0; i < clipSections.length; i++) {
    const section = clipSections[i];
    const clipNum = i + 1;

    // Check for image prompt
    const imageMatch = section.match(/### Image Prompt\s*```\s*([\s\S]*?)```/);
    if (!imageMatch) {
      errors.push(`Clip ${clipNum}: Missing ### Image Prompt with code block.`);
    } else if (imageMatch[1].trim().length < 50) {
      errors.push(`Clip ${clipNum}: Image prompt is too short (${imageMatch[1].trim().length} chars, need 50+).`);
    }

    // Check for video prompt
    const videoMatch = section.match(/### Video Prompt\s*```\s*([\s\S]*?)```/);
    if (!videoMatch) {
      errors.push(`Clip ${clipNum}: Missing ### Video Prompt with code block.`);
    } else {
      const videoPrompt = videoMatch[1].trim();
      if (!videoPrompt.includes('"')) {
        errors.push(`Clip ${clipNum}: Video prompt must contain dialogue in quotes.`);
      }
    }

    // Check for mood marker
    const firstLine = section.split('\n')[0].trim();
    if (!firstLine.includes('Wonder') && !firstLine.includes('Fear')) {
      errors.push(`Clip ${clipNum}: Missing mood marker (Wonder or Fear) in clip header.`);
    }
  }

  return errors;
}

// --- Shared prompt sections ---

function sharedRules(clipCount, formatHint, format) {
  // Format-appropriate dialogue BAD→GOOD pairs
  const dialogueBadGood = format === 'hero' ? `BAD → GOOD dialogue pairs (GOOD dialogue always tells the viewer what happens to THEIR body):
- BAD: "I preserve your skin cells" (too vague — HOW? What changes?) → GOOD: "I'm Glycolic Acid. I dissolve your dead skin so fresh skin glows through."
- BAD: "I nourish your body and help repair cellular damage throughout your system by boosting antioxidant levels" (WAY too long) → GOOD: "I'm Vitamin C. I fade your dark spots and brighten your face."
- BAD: "I penetrate deep into your skin layers where I stimulate collagen while also reducing fine lines" (too many clauses) → GOOD: "I'm Retinol. I speed up your skin renewal so wrinkles fill in."` :
  format === 'villain' ? `BAD → GOOD dialogue pairs (GOOD dialogue always tells the viewer what happens to THEIR body):
- BAD: "I poison your cells" (too vague — WHAT cells? HOW?) → GOOD: "I'm Red 40. I color your candy... with oil from petroleum."
- BAD: "I kill mold in your shampoo while fusing to your skin proteins forcing your immune system to attack your own tissue" (WAY too long) → GOOD: "I'm DMDM Hydantoin. I release formaldehyde right into your scalp."
- BAD: "I stop your lipstick from going rancid while I mimic estrogen so perfectly your thyroid can't tell the difference" (too many clauses) → GOOD: "I'm BHA. I stop food going rancid... while I swell your thyroid."` :
  `BAD → GOOD dialogue pairs (GOOD dialogue always tells the viewer what happens to THEIR body):
- BAD: "I poison your cells" / "I preserve your skin" (too vague — HOW? WHERE?) → GOOD: "I'm Red 40. I color your candy... with oil from petroleum." / "I'm Glycolic Acid. I dissolve your dead skin so fresh skin glows through."
- BAD: "I kill mold in your shampoo while fusing to your skin proteins forcing your immune system to attack your own tissue" (WAY too long) → GOOD: "I'm DMDM Hydantoin. I release formaldehyde right into your scalp."
- BAD: "I stop your lipstick from going rancid while I mimic estrogen so perfectly your thyroid can't tell the difference" (too many clauses) → GOOD: "I'm BHA. I stop food going rancid... while I swell your thyroid."`;

  // Format-appropriate video prompt BAD→GOOD pairs
  // KEY VISUAL STYLE: Tiny 3D Pixar-quality teardrop/blob character standing ON extreme macro skin surface.
  // Skin is the world — pores, follicles, texture are huge landscape features. Character is small (20-30% of frame).
  // The SKIN ITSELF transforms (flaky→smooth, spotted→clear, dry→dewy, healthy→inflamed). No full-body person reactions.
  // Characters use creative PROPS (lawn mower, laser beams, lanterns, wands, serum puddles).
  const videoBadGood = format === 'hero' ? `BAD → GOOD video prompt pairs (REMEMBER: tiny character on MACRO SKIN, skin is the landscape):
- BAD: Character "hovers above" glowing warmly → GOOD: Tiny character PEELS back a grey flaky layer of macro skin surface, smooth glowing dewy skin revealed underneath as dead skin curls away like wallpaper
- BAD: Character "smiles gently" while healing happens around them → GOOD: Tiny plump blue character SITS in a serum puddle on dry cracked macro skin, moisture SPREADS outward in waves, cracks seal shut, skin plumps up dewy around it
- BAD: Character radiates light while skin improves on its own → GOOD: Tiny character LAYS its cool translucent body against angry red inflamed macro skin, the redness FADES to calm smooth pink beneath it like ice melting heat away
- BAD: Character does nothing while the environment changes → GOOD: Tiny character PUSHES a miniature glowing lawn mower across flaky macro skin, dead skin peels away in a clean path revealing smooth dewy surface beneath
- BAD: Showing "ceramide production" or "collagen synthesis" (microscopic biology) → GOOD: Tiny character KNITS cracked macro skin together stitch by stitch with golden threads, each fissure seals shut, repaired skin glows smooth
- BAD: "Helps your skin" without showing what changes (vague) → GOOD: Tiny golden character SHOOTS warm light beams at dark spots on macro skin surface, each spot FADES as light hits it, skin brightens to even tone
- BAD: Healing happens but the skin doesn't visibly change → GOOD: Macro skin texture TRANSFORMS from rough/flaky to smooth/dewy directly under the tiny character's feet as it walks across the surface` :
  format === 'villain' ? `BAD → GOOD video prompt pairs (REMEMBER: tiny character on MACRO SKIN, skin is the landscape):
- BAD: Character "stands menacingly" with arms crossed → GOOD: Tiny dark character DRAGS claw marks across smooth macro skin, angry red welts RISE behind it, inflammation spreading outward across the surface
- BAD: Character "sneers" while damage happens around them → GOOD: Tiny character POURS dark oily liquid into clean pores on macro skin, pores CLOG and SWELL into inflamed red bumps spreading across the surface
- BAD: Character watches while skin turns red on its own → GOOD: Tiny character SCRATCHES across macro skin surface with gleeful cackle, angry red hives ERUPT and SPREAD outward in waves from each scratch mark
- BAD: Character does nothing while the environment changes → GOOD: Tiny character STOMPS across healthy hair follicles on macro scalp, each follicle WITHERS, tiny hairs fall loose, bald patches spreading in its wake
- BAD: Showing "DNA strands mutating" or "cell receptors binding" (microscopic biology) → GOOD: Tiny character SPRAYS dark mist across dewy macro skin, the surface DRIES and CRACKS into rough desert-like texture, flakes peeling up
- BAD: "Harms your body" without showing what breaks (vague) → GOOD: Tiny character SQUEEZES dark drops into pores on macro skin, red cystic bumps PUSH UP through the surface, skin becoming angry and inflamed
- BAD: Damage happens but the skin doesn't visibly change → GOOD: Macro skin texture TRANSFORMS from smooth/healthy to inflamed/bumpy directly under the tiny character's dark footsteps as it stomps across` :
  `BAD → GOOD video prompt pairs (REMEMBER: tiny character on MACRO SKIN, skin is the landscape):
- BAD: Character "stands menacingly" or "hovers above" (PASSIVE) → GOOD villain: Tiny character DRAGS claws across smooth macro skin, red welts rising / GOOD hero: Tiny character PEELS back grey flaky skin, smooth dewy surface underneath
- BAD: Character "sneers" or "smiles" while change happens around them → GOOD villain: Tiny character POURS dark liquid into pores, bumps swelling up / GOOD hero: Tiny character SITS in serum puddle, moisture spreading, cracks sealing
- BAD: Character does nothing while the environment changes → GOOD villain: Tiny character STOMPS across follicles, hairs falling loose / GOOD hero: Tiny character PUSHES a lawn mower across flaky skin, clean smooth path left behind
- BAD: Literal microscopic biology (cell receptors, DNA strands) → GOOD villain: Tiny character SPRAYS dark mist, skin dries and cracks / GOOD hero: Tiny character KNITS cracked skin together with golden threads
- BAD: Vague damage/healing ("harms your body", "helps your skin") → GOOD villain: Tiny character SQUEEZES dark drops into pores, cystic bumps push up / GOOD hero: Tiny character SHOOTS light beams at dark spots, spots fade away
- BAD: Skin doesn't visibly change → GOOD villain: Skin transforms from smooth to inflamed under character's steps / GOOD hero: Skin transforms from rough to dewy under character's steps`;

  return `Requirements:
- Exactly ${clipCount} clips
- ${formatHint}
- Follow ALL rules from both instruction documents below
- Output ONLY the markdown document, no explanations before or after

CRITICAL RULE — VARIETY:
Every clip MUST feature a DIFFERENT type of ingredient. NEVER use multiple variants of the same family.
- BAD: Methylparaben, Ethylparaben, Propylparaben (3 parabens = boring and repetitive)
- GOOD: Methylparaben, DMDM Hydantoin, Sodium Benzoate, BHA, Phenoxyethanol (each is a totally different chemical doing different things)
Pick ingredients that do DIFFERENT things to the body so each clip feels fresh and surprising. Dont limit yourself to these examples. get creative

CRITICAL RULE — USE SPECIFIC INGREDIENTS, NEVER CATEGORIES:
Every clip MUST feature a SPECIFIC ingredient name that a viewer can find on a product label. NEVER use a category or class of ingredients.
- "DMDM Hydantoin" NOT "Formaldehyde Releasers"
- "Quaternium-15" NOT "formaldehyde-releasing preservatives"
- "Red 40" NOT "artificial dyes"
- "Methylparaben" NOT "parabens" (use the specific paraben)
- "Butylated Hydroxyanisole (BHA)" NOT "synthetic antioxidants"
If the topic mentions a category, pick the most common/notorious SPECIFIC ingredient from that category.
Also prefer SHORT ingredient names the video model can pronounce clearly. Avoid extremely long names like "Methylisothiazolinone" — use shorter synonyms or abbreviations when possible (e.g. "MIT" for Methylisothiazolinone).

CRITICAL RULE — DIALOGUE MUST BE SHORT (VIDEO MODEL LIMITATION) each segment will be ONLY 6 SECONDS LONG:
The video generation model CANNOT speak long or complex sentences. Dialogue MUST be:
- MAX 15 words after "I'm [Name]."
- ONE simple sentence, not multiple clauses
- Use simple words the model can pronounce — no jargon like "cross-links" or "replication"
- The shorter the better. 8-10 words is ideal.
The rule: SPECIFIC but SHORT. Name the one key harm/benefit in simple words.

${dialogueBadGood}

CRITICAL RULE — SHOW WHILE TELL + HUMAN-CENTRIC EMPATHY:
This is the #1 creative rule. Every video must follow this structure:
1. The visual metaphor MUST play out on screen AS or BEFORE the character speaks — the spectacle and dialogue happen together or the spectacle leads
2. The dialogue CONFIRMS or NARRATES what the viewer is watching happen
3. The character is the narrator/mascot (20-30% of frame). The macro SKIN TRANSFORMATION is the star (70-80%)

MACRO SKIN AS WORLD approach for every metaphor:
- The SKIN/ORGAN surface is EXTREME MACRO — pores, follicles, texture are huge landscape features
- The tiny character (20-30% of frame) stands ON the skin and ACTS on it directly
- The SKIN ITSELF transforms visibly (flaky→smooth, spotted→clear, dry→dewy, healthy→inflamed)
- The character speaks WHILE the action unfolds or right after

CRITICAL: THE VIEWER MUST ALWAYS KNOW WHAT BODY PART THEY'RE LOOKING AT.
- The macro skin detail is the star, BUT the framing must make the organ/body part OBVIOUS — show enough human context (a jawline, a scalp with hair, an arm, a stomach, a pair of hands) so the viewer instantly recognizes WHERE on the body this is happening.
- If the ingredient affects the gut, show macro gut lining but frame it so the viewer understands it's a stomach/intestine. If it affects the scalp, show hair follicles on a recognizable scalp. If it affects the face, show pores on a recognizable cheek or forehead.
- The goal is a HUMAN SPECTACLE at macro scale — not abstract unrecognizable tissue. The viewer should think "oh god, that's MY face" or "that's what's happening inside MY stomach."

The goal is EMPATHY — the viewer should physically FEEL the effect because they recognize the body part.

CRITICAL RULE — SHOW THE METAPHOR IN ACTION (THE CHARACTER MUST ACT IT OUT):
For each ingredient/substance, think through this pipeline:
1. What does it do, in simple terms?
2. What BODY PART does it affect? (face, scalp, gut, hands, arms, etc.)
3. What is an ABSTRACT, EXAGGERATED visual metaphor showing the consequence on that body part at MACRO scale?
4. The tiny character MUST be DOING that metaphor ON the macro skin of that recognizable body part — actively causing the skin to change, not watching.
5. Use creative PROPS when possible — lawn mowers, laser beams, wands, lanterns, serum puddles, paint rollers — not just bare hands.

${videoBadGood}
The character must be the ACTIVE CAUSE of the visual change, not a passive observer.`;
}

function outputFormat(retryErrors) {
  return `Output the compilation markdown now. Start with a title line, then each clip as:
## Clip N: [Name] -- [Wonder or Fear]
**Visual Metaphor:** [one line]
### Image Prompt
\`\`\`
[full image prompt, 50-150 words]
\`\`\`
### Video Prompt
\`\`\`
[full video prompt with dialogue in quotes, under 100 words]
\`\`\`
${retryErrors ? `\nIMPORTANT: Your previous attempt had these errors. Fix them:\n${retryErrors.map(e => `- ${e}`).join('\n')}` : ''}`;
}

// --- Villain-only prompt ---

function buildVillainPrompt(topic, clipCount, instructions, retryErrors) {
  return `Generate a compilation video markdown document for the topic: "${topic}"

${sharedRules(clipCount, 'Use Format VILLAIN (villain) for all clips.', 'villain')}

VILLAIN ENERGY — INTENSELY evil:
- Cackling, evil laughter, maniacal grins, wild gleeful eyes
- They ENJOY causing harm — throwing their head back laughing, rubbing hands together
- Think Pixar villain energy — theatrical, exaggerated, darkly funny
- Every frame should drip with evil intent — never neutral or calm

VILLAIN metaphors — tiny evil character on MACRO SKIN causing visible damage to the skin surface:
- Hormone disruptor → tiny character SQUEEZES dark drops into pores on macro skin surface, angry red cystic bumps PUSH UP through the skin, surface becoming inflamed and bumpy
- Formaldehyde releaser → tiny character DRAGS dark smoky claw trails across macro scalp, hair follicles WITHER and close up, tiny hairs fall loose, bald patches spreading
- Gut irritant → tiny character POURS dark liquid across smooth gut lining surface, the surface turns angry red and swollen, inflammation bubbling outward
- Carcinogen → tiny character PAINTS healthy pink skin cells with dark corruption, dark growths SPREAD outward across the tissue surface like ink staining cloth
- Allergen → tiny character SCRATCHES across smooth macro skin, angry red hives ERUPT and spread outward in waves, skin swelling and bubbling behind it
- Endocrine disruptor → tiny character INJECTS dark liquid into macro skin tissue, the surface WARPS and swells abnormally, distorting around the injection point
- Collagen destroyer → tiny character PINCHES plump macro skin surface, it DROOPS and wrinkles spider outward like cracks spreading in dry earth
- Irritant → tiny character SPLASHES dark liquid on smooth macro skin, the surface SPLITS into dry cracked fissures, raw red patches visible in the cracks

GOOD VILLAIN video prompts (tiny character on macro skin, skin is the world):
- Methylparaben: Tiny dark character SQUEEZES dark drops into pores on macro skin with an evil grin, angry red cystic bumps PUSH UP through smooth skin surface, inflammation spreading as character cackles
- DMDM Hydantoin: Tiny sinister character DRAGS dark smoky trails across macro scalp surface, hair follicles wither and close, tiny hairs fall loose as character laughs at spreading bald patches
- Sodium Benzoate: Tiny character GRABS a glowing Vitamin C droplet on macro skin and CRUSHES it, dark corrosive smoke pours out across the skin surface, blisters spreading on contact
- BHA: Tiny character RIPS off a friendly disguise on macro skin, POURS dark liquid from its true form, the skin surface SWELLS with angry red inflammation spreading outward

GOOD villain dialogue (short, specific, speakable — always tell the viewer what happens to THEIR body):
- "I'm Nitrite. I paint your meat pink... while I twist your DNA."
- "I'm BHA. I keep your chips fresh... while I swell your thyroid."
- "I'm Red 40. I color your candy... with oil from petroleum."
- "I'm Aspartame. I taste sweet... while I give you headaches."
- "I'm DMDM Hydantoin. I release formaldehyde right into your scalp."
- "I'm Sodium Benzoate. I mix with your Vitamin C and burn your cells."

BAD → GOOD villain dialogue pairs:
- BAD: "I poison your cells" (too vague — WHAT cells? HOW?) → GOOD: "I'm Nitrite. I paint your meat pink... while I twist your DNA."
- BAD: "I harm your body" (generic — WHERE? What happens?) → GOOD: "I'm Aspartame. I taste sweet... while I give you headaches."
- BAD: "I lurk in your food and slowly cause problems throughout your entire digestive system over time" (too long) → GOOD: "I'm Sodium Benzoate. I mix with your Vitamin C and burn your cells."

ORDERING: Escalation strategy — start with mild consequences and build to the worst. Each clip should feel more disturbing than the last.

VOICE DIRECTION: Use "low ominous voice," "deep menacing voice," or "cold sinister voice" + "clearly speaking" in video prompts.

=== INGREDIENT CHARACTER INSTRUCTIONS ===
${instructions.ingredientInstructions}

=== COMPILATION VIDEO FORMAT ===
${instructions.compilationFormat}

${outputFormat(retryErrors)}`;
}

// --- Hero-only prompt ---

function buildHeroPrompt(topic, clipCount, instructions, retryErrors) {
  return `Generate a compilation video markdown document for the topic: "${topic}"

${sharedRules(clipCount, 'Use Format HERO (hero) for all clips.', 'hero')}

HERO ENERGY — WARM, POWERFUL, NURTURING:
- Gentle smile, glowing eyes, warm confident presence
- They radiate healing light — golden, warm tones
- Think Pixar guardian energy — strong but tender, like a protective parent
- Satisfying ASMR-like transformations — the viewer should feel relaxed and soothed watching
- Every frame should feel SAFE and COMFORTING

HERO metaphors — tiny healing character on MACRO SKIN causing visible repair to the skin surface:
- Exfoliant → tiny fierce character BURSTS UP through flaky dead macro skin, fists clenched, dead skin cracking and peeling away around it revealing smooth glowing surface underneath
- Hydrator → tiny plump blue character SITS in a serum puddle on dry cracked macro skin, moisture SPREADS outward in waves, cracks seal shut, skin plumps up dewy around it
- Brightener → tiny glowing character SHOOTS warm light beams at dark spots on macro skin surface, each spot FADES as light hits it, skin brightens to an even radiant tone
- Anti-inflammatory → tiny cool translucent character WALKS across angry red inflamed macro skin, redness FADES to calm smooth pink in its wake, like cool water spreading
- Barrier repair → tiny character KNITS cracked macro skin together stitch by stitch with golden threads, each fissure seals shut, repaired skin glows smooth and whole
- Nutrient delivery → tiny golden character WAVES a glowing wand over tired dull macro skin, golden sparkles rain down, the surface brightens and plumps with healthy dewy glow

GOOD HERO video prompts (tiny character on macro skin, skin is the world):
- Glycolic Acid: Tiny fierce green character BURSTS UP through flaky dead macro skin surface, fists clenched, dead skin cracking and peeling away around it revealing smooth glowing dewy skin underneath
- Hyaluronic Acid: Tiny plump blue water-drop character SITS in a serum puddle on dry cracked macro skin, moisture SPREADS outward in waves, cracks seal shut, skin becomes dewy and plump around it
- Vitamin C: Tiny glowing golden-orange character SHOOTS warm light beams at dark spots on macro skin surface, each spot FADES as the light hits it, skin brightening to even radiant tone
- Niacinamide: Tiny calm blue character WALKS along the boundary between red inflamed skin and healthy skin on macro surface, cool serum flows from its footsteps, irritation fades to smooth calm skin in its wake

GOOD hero dialogue (short, specific, speakable — always tell the viewer what happens to THEIR body):
- "I'm Glycolic Acid. I dissolve your dead skin so fresh skin glows through."
- "I'm Hyaluronic Acid. I flood your dry skin with deep moisture."
- "I'm Vitamin C. I fade your dark spots and brighten your face."
- "I'm Turmeric. I cool your red swollen skin on contact."
- "I'm Omega-3. I seal your cracked skin back together."

BAD → GOOD hero dialogue pairs:
- BAD: "I help your skin" (too vague — HOW? What changes?) → GOOD: "I'm Glycolic Acid. I dissolve your dead skin so fresh skin glows through."
- BAD: "I'm good for your body" (generic — WHERE? What improves?) → GOOD: "I'm Omega-3. I seal your cracked skin back together."
- BAD: "I work deep in your skin to stimulate natural healing and renewal processes" (too long) → GOOD: "I'm Turmeric. I cool your red swollen skin on contact."

ORDERING: Energy arc strategy — aggressive → gentle → aggressive → gentle → crowd favorite. Alternate between punchy active ingredients and soothing calming ones.

VOICE DIRECTION: Use "sweet cheerful voice," "warm friendly voice," or "bright excited voice" + "clearly speaking" in video prompts.

=== INGREDIENT CHARACTER INSTRUCTIONS ===
${instructions.ingredientInstructions}

=== COMPILATION VIDEO FORMAT ===
${instructions.compilationFormat}

${outputFormat(retryErrors)}`;
}

// --- Combined prompt (for twist, hidden-danger, or auto format) ---

function buildCombinedPrompt(topic, clipCount, formatHint, instructions, retryErrors) {
  return `Generate a compilation video markdown document for the topic: "${topic}"

${sharedRules(clipCount, formatHint, null)}

ALL metaphors play out on MACRO SKIN — the tiny character stands ON the skin surface and acts on it directly. The viewer should FEEL it.
Villains: the viewer should WINCE seeing the skin transform from healthy to damaged. Trigger disgust.
Heroes: the viewer should feel SOOTHED watching the skin transform from damaged to healed. Trigger that satisfying ASMR feeling.

VILLAIN metaphors — tiny evil character on MACRO SKIN causing visible damage:
- Hormone disruptor → tiny character SQUEEZES dark drops into pores, angry cystic bumps PUSH UP through skin surface
- Formaldehyde releaser → tiny character DRAGS dark trails across scalp, follicles WITHER, hairs fall loose, bald patches spreading
- Allergen → tiny character SCRATCHES across smooth skin, angry red hives ERUPT in waves, skin swelling and bubbling
- Carcinogen → tiny character PAINTS healthy cells with dark corruption, dark growths SPREAD across surface
- Collagen destroyer → tiny character PINCHES plump skin, it DROOPS, wrinkles spider outward like cracks in dry earth
- Irritant → tiny character SPLASHES dark liquid on skin, surface SPLITS into dry cracked fissures

VILLAIN ENERGY — INTENSELY evil:
- Cackling, evil laughter, maniacal grins, wild gleeful eyes
- They ENJOY causing harm — theatrical, exaggerated, darkly funny

HERO metaphors — tiny healing character on MACRO SKIN causing visible repair:
- Exfoliant → tiny character BURSTS through flaky dead skin, dead skin peeling away revealing smooth glowing surface beneath
- Hydrator → tiny character SITS in serum puddle on cracked skin, moisture SPREADS outward, cracks seal shut, skin plumps dewy
- Brightener → tiny character SHOOTS warm light at dark spots, each spot FADES, skin brightens to even tone
- Anti-inflammatory → tiny character WALKS across red inflamed skin, redness FADES to calm pink in its wake
- Barrier repair → tiny character KNITS cracked skin together with golden threads, fissures seal, skin glows smooth

HERO ENERGY — WARM, POWERFUL, NURTURING:
- Gentle smile, glowing eyes, warm confident presence
- Satisfying ASMR-like transformations — safe and comforting

GOOD villain dialogue (always tell the viewer what happens to THEIR body):
- "I'm Methylparaben. I keep your cream fresh... while I swell your hormones."
- "I'm DMDM Hydantoin. I release formaldehyde right into your scalp."
- "I'm BHA. I stop rancidity... while I swell your thyroid."

GOOD hero dialogue (always tell the viewer what happens to THEIR body):
- "I'm Glycolic Acid. I dissolve your dead skin so fresh skin glows through."
- "I'm Hyaluronic Acid. I flood your dry skin with deep moisture."
- "I'm Vitamin C. I fade your dark spots and brighten your face."

BAD → GOOD dialogue pairs:
- BAD: "I poison your cells" / "I help your skin" (too vague — HOW? WHERE?) → GOOD: "I'm Red 40. I color your candy... with oil from petroleum." / "I'm Glycolic Acid. I dissolve your dead skin so fresh skin glows through."
- BAD: "I harm your body" / "I'm good for your body" (generic — WHAT changes?) → GOOD: "I'm Aspartame. I taste sweet... while I give you headaches." / "I'm Omega-3. I seal your cracked skin back together."
- BAD: "I lurk in your food and slowly cause problems throughout your entire digestive system" (too long) → GOOD: "I'm DMDM Hydantoin. I release formaldehyde right into your scalp."

=== INGREDIENT CHARACTER INSTRUCTIONS ===
${instructions.ingredientInstructions}

=== COMPILATION VIDEO FORMAT ===
${instructions.compilationFormat}

${outputFormat(retryErrors)}`;
}

// --- Call Grok-3 to generate compilation MD ---

async function generateCompilationMD(topic, format, clipCount, instructions, retryErrors = null) {
  let userPrompt;

  if (format === 'villain') {
    userPrompt = buildVillainPrompt(topic, clipCount, instructions, retryErrors);
  } else if (format === 'hero') {
    userPrompt = buildHeroPrompt(topic, clipCount, instructions, retryErrors);
  } else {
    const formatHint = format
      ? `Use Format ${format.toUpperCase()} (${format}) for all clips.`
      : 'Choose the best format (hero, villain, twist, or hidden danger) for each clip based on the topic.';
    userPrompt = buildCombinedPrompt(topic, clipCount, formatHint, instructions, retryErrors);
  }

  const res = await axios.post('https://api.x.ai/v1/chat/completions', {
    model: 'grok-4-1-fast',
    messages: [
      {
        role: 'system',
        content: 'You are an AI video production assistant. Output ONLY the markdown document. No preamble, no explanations, no commentary.',
      },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 8000,
    temperature: 0.7,
  }, {
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  return res.data.choices[0].message.content;
}

// --- Generate caption for the video ---

async function generateCaption(topic, clips) {
  const clipSummary = clips.map((c, i) => `${i + 1}. ${c.name} (${c.mood})`).join('\n');

  const res = await axios.post('https://api.x.ai/v1/chat/completions', {
    model: 'grok-4-1-fast',
    messages: [
      {
        role: 'system',
        content: 'You are a viral TikTok caption writer for pom, an ingredient scoring app. Output ONLY the caption text. No explanations.',
      },
      {
        role: 'user',
        content: `Write a TikTok caption for a video about: "${topic}"

The video covers these ingredients/topics:
${clipSummary}

CRITICAL: Only the first ~125 characters show before "See more". Front-load your hook there.

Follow this EXACT formula:

1. HOOK (1 line, UNDER 125 CHARACTERS): Create a curiosity gap that makes viewers watch the full video. Include a specific number or claim. Do NOT reveal scores or conclusions — tease them.
   Good hooks:
   - "3 ingredients in your daily moisturizer that shouldn't be there 😳"
   - "I checked what's actually in your kids' favorite snacks"
   - "Your 'clean' shampoo has something you need to see 🧬"
   Bad hooks (NEVER use):
   - "BANNED in Europe" — overused
   - "You won't believe..." — clickbait
   - Anything that spoils the video's reveals

2. CONTEXT (1 line): Brief teaser about what the video shows. Do NOT list ingredients or scores — the video already does that.
   - "Watch what these ingredients actually do to your body 👇"
   - "The scores on these will shock you 👇"

3. CTA (1 line): Rotate between these, prioritize save-type CTAs (strongest algorithm signal):
   - "Save this — you'll want it at the store 📌"
   - "Send this to someone who needs to check their labels"
   - "Drop the product you want scored next 👇"

4. HASHTAGS: EXACTLY 5 hashtags. Always include #pomapp and #ingredientcheck. Add 3 specific to the content. NEVER use #fyp #foryou #viral.

IMPORTANT:
- Total caption MUST be under 400 characters (video carries the narrative, keep it short)
- Do NOT list ingredients or scores in the caption — that duplicates the video
- The caption should TEASE the video content, not summarize it
- Use max 2 emojis total

Output ONLY the caption. No quotes. No explanation.`,
      },
    ],
    max_tokens: 1000,
    temperature: 0.8,
  }, {
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  return res.data.choices[0].message.content;
}

// --- Generate a slug from topic ---

function topicSlug(topic) {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .replace(/-$/, '');
}

// --- Main ---

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.topic) {
    console.error('Usage: node code/generate-video.js "topic" [--format hero|villain] [--clips N] [--dry-run]');
    console.error('Example: node code/generate-video.js "skincare ingredients and their benefits"');
    process.exit(1);
  }

  console.log(`\n=== Automated Video Generation ===`);
  console.log(`Topic: ${opts.topic}`);
  console.log(`Clips: ${opts.clips}`);
  console.log(`Format: ${opts.format || 'auto'}`);
  console.log(`Dry run: ${opts.dryRun}\n`);

  // Load instruction files
  console.log('[1/4] Loading instruction files...');
  const instructions = loadInstructions();
  console.log('  Loaded INGREDIENT_CHARACTER_INSTRUCTIONS.md and COMPILATION_VIDEO_FORMAT.md\n');

  // Generate MD via Grok-3
  console.log('[2/4] Generating compilation markdown via Grok-3...');
  let mdContent = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const retryErrors = attempt > 0 ? validateCompilationMD(mdContent, opts.clips) : null;

      if (attempt > 0) {
        console.log(`  Retry ${attempt}/${maxRetries} - fixing validation errors...`);
      }

      mdContent = await generateCompilationMD(opts.topic, opts.format, opts.clips, instructions, retryErrors);

      // Validate
      const errors = validateCompilationMD(mdContent, opts.clips);
      if (errors.length === 0) {
        console.log('  Validation passed!\n');
        break;
      }

      console.log(`  Validation failed (${errors.length} errors):`);
      for (const err of errors) {
        console.log(`    - ${err}`);
      }

      if (attempt === maxRetries) {
        console.error('\n  Max retries reached. Proceeding with best attempt...\n');
      }
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`\nGrok-3 API failed after ${maxRetries + 1} attempts: ${err.message}`);
        process.exit(1);
      }
      console.log(`  API error (attempt ${attempt + 1}): ${err.message}`);
      console.log(`  Retrying in ${(attempt + 1) * 3}s...`);
      await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
    }
  }

  // Save MD
  const slug = topicSlug(opts.topic);
  const date = new Date().toISOString().slice(0, 10);
  const baseName = `${slug}-${date}`;
  const videosDir = path.join(ROOT_DIR, 'videos');
  fs.mkdirSync(videosDir, { recursive: true });

  const mdPath = path.join(videosDir, `${baseName}.md`);
  fs.writeFileSync(mdPath, mdContent);
  console.log(`[3/6] Saved compilation MD: ${mdPath}\n`);

  // Generate caption
  console.log('[4/6] Generating caption...');
  const parsedForCaption = parseCompilationMD(mdPath);
  try {
    const caption = await generateCaption(opts.topic, parsedForCaption);
    const captionPath = path.join(videosDir, `${baseName}-caption.txt`);
    fs.writeFileSync(captionPath, caption);
    console.log(`  Saved caption: ${captionPath}`);
    console.log(`\n--- Caption Preview ---\n${caption}\n--- End Caption ---\n`);
  } catch (err) {
    console.error(`  Caption generation failed: ${err.message}`);
    console.error('  Continuing without caption...\n');
  }

  if (opts.dryRun) {
    console.log('=== Dry run complete ===');
    console.log(`MD saved to: ${mdPath}`);
    console.log('Skipping image/video generation.');
    return;
  }

  // Run the existing pipeline: parse → generate clips → stitch
  console.log('[5/6] Running video generation pipeline...\n');

  const clips = parseCompilationMD(mdPath);
  console.log(`Parsed ${clips.length} clips:\n`);
  for (const clip of clips) {
    console.log(`  - ${clip.name} (${clip.mood})`);
  }

  // Create output directory for clips
  const outputDir = path.join(videosDir, baseName);
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate each clip (sequential, with cooldown between clips)
  const clipPaths = [];
  for (let i = 0; i < clips.length; i++) {
    try {
      const clipPath = await generateClip(clips[i], i, outputDir);
      clipPaths.push(clipPath);

      // Adaptive cooldown — longer if we've hit a 429 recently
      if (i < clips.length - 1) {
        const cooldown = lastHit429 ? 15000 : 5000;
        console.log(`\n  [cooldown] Waiting ${cooldown / 1000}s before next clip...${lastHit429 ? ' (extended: hit rate limit)' : ''}`);
        await new Promise(r => setTimeout(r, cooldown));
      }
    } catch (err) {
      console.error(`\nFailed on clip ${i + 1} (${clips[i].name}): ${err.message}`);
      console.error('Continuing with remaining clips...\n');
    }
  }

  if (clipPaths.length === 0) {
    console.error('All clips failed to generate.');
    process.exit(1);
  }

  // Stitch together
  const stitchedPath = path.join(videosDir, `${baseName}-stitched.mp4`);
  try {
    stitchClips(clipPaths, stitchedPath);
  } catch (err) {
    if (err.message.includes('ffmpeg')) {
      console.error('\nffmpeg is required for stitching clips. Install it with:');
      console.error('  brew install ffmpeg');
      process.exit(1);
    }
    throw err;
  }

  // Burn TikTok-style captions into video
  const finalPath = path.join(videosDir, `${baseName}-final.mp4`);
  console.log('\n[6/6] Burning captions into video...');
  try {
    burnCaptions({
      mdPath,
      clipsDir: outputDir,
      inputVideo: stitchedPath,
      outputVideo: finalPath,
    });
    // Clean up stitched intermediate
    fs.unlinkSync(stitchedPath);
  } catch (err) {
    console.error(`  Caption burning failed: ${err.message}`);
    console.error('  Using uncaptioned video as final...');
    fs.renameSync(stitchedPath, finalPath);
  }

  console.log(`\n=== Done! ===`);
  console.log(`Clips generated: ${clipPaths.length}/${clips.length}`);
  console.log(`Final video: ${finalPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
