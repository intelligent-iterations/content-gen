/**
 * Centralized Prompts Configuration — Iteration 3
 *
 * OVERHAUL: Conversational hooks, realistic image prompts,
 * multi-product swap format, score-focused content.
 *
 * Imported by ai-orchestrator.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// CONSTANTS
// =============================================================================

export const MAX_PAGES_TO_READ = 5;
export const MAX_SEARCH_LOOPS = 15;
export const GROK_TEMPERATURE = 0.85;

// =============================================================================
// CONTENT DIRECTION (loaded from file)
// =============================================================================

export function loadContentDirection() {
  const contentPath = path.join(__dirname, '..', 'content-direction.md');
  return fs.readFileSync(contentPath, 'utf-8');
}

/**
 * Load previously posted videos to avoid duplicates
 */
export function loadPostedVideos() {
  const postedPath = path.join(__dirname, '..', 'CURRENT_POSTED_VIDEOS.md');
  try {
    const content = fs.readFileSync(postedPath, 'utf-8');

    const topics = [];
    const products = [];
    const hooks = [];
    const videoSummaries = [];

    const topicMatches = content.matchAll(/### Video \d+: (.+)/g);
    for (const match of topicMatches) {
      topics.push(match[1].trim());
    }

    const hookMatches = content.matchAll(/\*\*Hook:\*\* (.+)/g);
    for (const match of hookMatches) {
      hooks.push(match[1].trim());
    }

    const sections = content.split(/\*\*Products exposed:\*\*/);
    for (let i = 1; i < sections.length; i++) {
      const sectionEnd = sections[i].indexOf('\n\n**');
      const section = sectionEnd > -1 ? sections[i].substring(0, sectionEnd) : sections[i].substring(0, 500);
      const productMatches = section.matchAll(/^- ([^(]+)\(/gm);
      for (const match of productMatches) {
        const product = match[1].trim();
        if (product) {
          products.push(product);
        }
      }
    }

    const videoBlocks = content.split(/### Video \d+:/);
    for (let i = 1; i < videoBlocks.length; i++) {
      const block = videoBlocks[i];
      const title = block.split('\n')[0].trim();
      const viewsMatch = block.match(/Views: ([\d,]+)/);
      const likesMatch = block.match(/Likes: (\d+)/);
      const commentsMatch = block.match(/Comments: (\d+)/);
      const sharesMatch = block.match(/Shares: (\d+)/);
      const completionMatch = block.match(/([\d.]+)% completion/);
      const hookMatch = block.match(/\*\*Hook:\*\* (.+)/);
      const categoryMatch = block.match(/\*\*Category:\*\* (\w+)/);
      const notesMatch = block.match(/Notes: (.+)/);

      videoSummaries.push({
        title,
        category: categoryMatch?.[1] || 'unknown',
        hook: hookMatch?.[1] || '',
        views: viewsMatch?.[1] || 'TBD',
        likes: likesMatch?.[1] || 'TBD',
        comments: commentsMatch?.[1] || 'TBD',
        shares: sharesMatch?.[1] || 'TBD',
        completion: completionMatch?.[1] || 'TBD',
        notes: notesMatch?.[1] || ''
      });
    }

    // Also load V3 slideshow products to avoid repeating across iterations
    const v3Path = path.join(__dirname, '..', 'V3_SLIDESHOWS_POSTED.md');
    try {
      const v3Content = fs.readFileSync(v3Path, 'utf-8');
      const v3ProductMatches = v3Content.matchAll(/^- (.+)$/gm);
      for (const match of v3ProductMatches) {
        const product = match[1].trim();
        // Skip markdown formatting lines (e.g. "**Hook**:", "**Slides**:")
        if (product && !product.startsWith('**') && !product.startsWith('[')) {
          // Strip score suffixes like "(25/100)" and arrow notation
          const cleanProduct = product.replace(/\s*\(\d+\/100\)\s*/g, '').replace(/\s*→\s*.+$/, '').trim();
          if (cleanProduct) products.push(cleanProduct);
          // Also grab the swap product after →
          const swapMatch = product.match(/→\s*(.+?)(?:\s*\(\d+\/100\))?$/);
          if (swapMatch) products.push(swapMatch[1].trim());
        }
      }
    } catch { /* V3 file may not exist yet */ }

    return { topics, products: [...new Set(products)], hooks, videoSummaries, rawContent: content };
  } catch {
    return { topics: [], products: [], hooks: [], videoSummaries: [], rawContent: '' };
  }
}

// =============================================================================
// PHASE 1: RESEARCH PROMPTS
// =============================================================================

export const RESEARCH_SYSTEM_PROMPT = `You are a viral TikTok content strategist for pom, an ingredient scoring app. Today's date is ${new Date().toISOString().split('T')[0]}. Use the provided tools to research topics thoroughly. Focus on EATING category products. IMPORTANT: Always look for the most current 2025 ingredient formulations.`;

export const CATEGORIES = ['EATING'];

// =============================================================================
// VIRAL HOOK FORMULAS — Iteration 3: Conversational Questions
// =============================================================================

export const VIRAL_HOOK_FORMULAS = {
  ASSUMPTION_CHALLENGE: [
    "3 snacks you think are healthy but aren't",
    "3 foods you grab for your kids every week",
    "3 products that say 'Natural' but score zero",
    "3 'organic' foods that still have bad ingredients"
  ],
  SCORE_REVEAL: [
    "3 snacks your kids eat that scored zero",
    "3 'healthy' bars that scored worse than candy",
    "3 popular cereals with shocking scores",
    "3 lunchbox staples that scored under 10"
  ],
  SWAP_QUESTION: [
    "3 grocery swaps you need to make this week",
    "3 foods you could swap for something healthier",
    "3 easy swaps that actually score 90+",
    "3 better alternatives for popular snacks"
  ],
  CURIOSITY_PULL: [
    "3 common snacks that have hormone disruptors",
    "3 everyday foods with hidden ingredients",
    "3 cereals with ingredients you can't pronounce",
    "3 popular drinks hiding something scary"
  ]
};

// =============================================================================
// CATEGORY-SPECIFIC VIRAL ANGLES — Iteration 3
// =============================================================================

export const CATEGORY_VIRAL_ANGLES = {
  EATING: {
    primary_trigger: "SCORE SHOCK",
    hook_patterns: [
      "3 snacks your kids eat that scored zero",
      "3 'healthy' foods that scored worse than candy",
      "3 common foods with ingredients you can't pronounce"
    ],
    best_angle: "Score reveal + swap recommendation",
    products_that_work: ["Kids snacks", "Protein bars", "Cereals", "Chips", "Sodas", "Granola bars", "Juice boxes", "Crackers"]
  },
  SKIN: {
    primary_trigger: "SCORE SHOCK",
    hook_patterns: [
      "How does [Brand] score?",
      "Your daily moisturizer scored this",
      "This 'clean' brand scored ZERO"
    ],
    best_angle: "Trusted brand scores terribly + better swap",
    products_that_work: ["CeraVe", "Neutrogena", "Cetaphil", "Sunscreens", "Moisturizers"]
  },
  INHALATION: {
    primary_trigger: "SCORE SHOCK",
    hook_patterns: [
      "How does your air freshener score?",
      "Your favorite candle scored this",
      "This 'clean' spray scored ZERO"
    ],
    best_angle: "Home product scores terribly + better swap",
    products_that_work: ["Febreze", "Glade", "Bath & Body Works", "Yankee Candle"]
  }
};

export function buildResearchPrompt(contentDirection, categoryHint = null) {
  const envCategory = process.env.FORCE_CATEGORY;
  const category = envCategory || categoryHint || 'EATING';
  console.log(`  Category selected: ${category}${envCategory ? ' (forced via env)' : ''}`);

  const topicHint = process.env.TOPIC_HINT;
  if (topicHint) {
    console.log(`  Topic hint: ${topicHint}`);
  }

  const posted = loadPostedVideos();

  let avoidSection = '';
  if (posted.products.length > 0 || posted.topics.length > 0) {
    avoidSection = `
## ALREADY COVERED — MUST AVOID THESE
**Products already featured (DO NOT use these):**
${posted.products.map(p => `- ${p}`).join('\n')}

**Topics already used:**
${posted.topics.map(t => `- ${t}`).join('\n')}
`;
  }

  const topicHintSection = topicHint
    ? `\n## SPECIFIC TOPIC GUIDANCE\n${topicHint}\n`
    : '';

  const today = new Date().toISOString().split('T')[0];

  return `You are a viral TikTok content strategist for pom, an ingredient scoring app.

## TODAY'S DATE: ${today}
${avoidSection}${topicHintSection}

## YOUR MISSION: Find exactly 3 EATING products to score and swap

We're making a MULTI-PRODUCT carousel in the style of viral ingredient-checking accounts.
The format is: show a bad product → reveal its pom score → show a better swap → reveal swap score.

## YOUR AVAILABLE TOOLS
1. **get_trending_topics** - Find trending food controversies RIGHT NOW
2. **web_search** - Search for products and general info
3. **get_ingredients_list** - Get ACCURATE, COMPLETE ingredient list for a product (uses Google search grounding)
4. **read_webpage** - Read webpage content and capture product images. Use on incidecoder.com or similar for REAL product photos
5. **find_product_swap** - Find a healthier alternative for a product. Pass the product name and its flagged ingredients.
6. **finish_research** - Call when done with research for 3-5 products

## RESEARCH WORKFLOW

For EACH product in your carousel:
1. **Pick a popular product** that people buy regularly (grocery store staples)
2. **get_ingredients_list** to get its full ingredient list with flags
3. **find_product_swap** to find a cleaner alternative (pass flagged ingredients)
4. **get_ingredients_list** for the SWAP product too (we need its ingredients for the pom screenshot)

## PRODUCT SELECTION CRITERIA

Pick products that are:
- **Everyday grocery items** people recognize (not niche/specialty)
- **Perceived as healthy** but actually score poorly ("healthy" granola bars, "natural" juices, etc.)
- **In the EATING category** (food, drinks, snacks)
- **Different from each other** (don't pick 3 cereals — pick a cereal, a snack bar, and a drink)
- **Brands people know** (Kellogg's, General Mills, Frito-Lay, Coca-Cola, etc.)

## GOOD PRODUCT PAIRS (for inspiration)
- Nature Valley granola bar (bad) → KIND bar (good)
- Gatorade (bad) → coconut water (good)
- Goldfish crackers (bad) → Annie's Cheddar Bunnies (good)
- Yoplait yogurt (bad) → Siggi's (good)
- Lunchables (bad) → organic version (good)

## Content Direction
${contentDirection}

You have up to ${MAX_SEARCH_LOOPS} tool calls. Start by finding trending food topics, then research exactly 3 product pairs (bad + swap).`;
}

// =============================================================================
// PHASE 2: CONTENT GENERATION PROMPTS
// =============================================================================

export const CONTENT_SYSTEM_PROMPT = `You are a viral TikTok content strategist. Today is ${new Date().toISOString().split('T')[0]}. Always respond with valid JSON only, no markdown code blocks. You are creating multi-product swap carousels for pom, an ingredient scoring app.

CRITICAL RULES:
- Use CONVERSATIONAL hooks (questions, not ALL CAPS shouting)
- Image prompts must generate REALISTIC store photos (hand holding product, natural lighting)
- Every bad product needs a good swap
- pom app screenshots ARE the main content
- Sentence case text overlays (not ALL CAPS)`;

export function buildContentPrompt(contentDirection, researchContext, productImages = [], ingredientLists = {}) {
  const productImagesInfo = productImages.length > 0
    ? `
## Captured Product Images (IMAGE-TO-IMAGE AVAILABLE)
${productImages.map((p, i) => `${i + 1}. "${p.productName}" - use_product_image: ${i + 1}`).join('\n')}

**HOW TO USE IMG2IMG:**
- Add "use_product_image": <number> to any slide to use that product photo as reference
- Write prompts that FEATURE the product prominently
- NEVER ask for text or labels on the product
`
    : '';

  // Build ingredient list keys section with flag counts so Grok picks genuinely bad products
  const ingredientKeys = Object.keys(ingredientLists);
  const ingredientKeysInfo = ingredientKeys.length > 0
    ? (() => {
      const productSummaries = ingredientKeys.map(k => {
        const ingredients = ingredientLists[k].ingredients || [];
        const warnings = ingredients.filter(i => i.flagType === 'warning').length;
        const cautions = ingredients.filter(i => i.flagType === 'caution').length;
        const total = ingredients.length;
        const flagNames = ingredients
          .filter(i => i.flagType === 'warning' || i.flagType === 'caution')
          .map(i => `${i.name} (${i.flagType})`)
          .join(', ');
        return `- "${k}" — ${total} ingredients, ${warnings} warnings, ${cautions} cautions${flagNames ? ` [${flagNames}]` : ' [clean]'}`;
      });
      return `
## AVAILABLE INGREDIENT LISTS (use exact keys)
The following products have researched ingredient lists. On each product slide, set \`ingredient_list_key\` to the EXACT string below to link the correct ingredients.

${productSummaries.join('\n')}

**CRITICAL: \`ingredient_list_key\` must EXACTLY match one of the keys above (case-sensitive). This is how screenshots get the right ingredients.**

### CHOOSING BAD vs SWAP PRODUCTS
The flag counts above reflect what the pom app will ACTUALLY show in screenshots. Use them to pick pairs:
- **"Bad" products MUST have at least 1 warning OR 2+ cautions.** Products with only 1 caution and no warnings are NOT bad enough — the screenshot will look fine and confuse viewers.
- **"Swap" products should have fewer flags than their bad counterpart.** If the swap has equal or more flags, the screenshot won't look like an improvement.
- If a researched product doesn't have enough flags to be "bad", use it as a swap or skip it entirely.
`;
    })()
    : '';

  return `You are creating a MULTI-PRODUCT swap carousel for pom, an ingredient scoring app.

## Your Research
${researchContext}
${productImagesInfo}
${ingredientKeysInfo}

## Content Direction
${contentDirection}

## THE FORMAT: Multi-Product Score + Swap Carousel

Your carousel alternates between BAD products and GOOD swaps, with pom app screenshots after each.

**Slide structure (you create the product slides, screenshots are auto-inserted):**

| Slide | What You Create | Auto-Inserted After? |
|-------|----------------|---------------------|
| 1 | HOOK — theme image + conversational question | No |
| 2 | BAD product 1 — hand holding product in store | Yes → pom screenshot |
| 3 | SWAP product 1 — hand holding swap in store + "pom found a swap" | Yes → pom screenshot |
| 4 | BAD product 2 — hand holding product in store | Yes → pom screenshot |
| 5 | SWAP product 2 — hand holding swap in store + "Try this instead" | Yes → pom screenshot |
| 6 | BAD product 3 — hand holding product in store | Yes → pom screenshot |
| 7 | SWAP product 3 — hand holding swap in store | Yes → pom screenshot |
| 8 | CTA — "Share with someone who needs these swaps" | No |

You create 8 slides. With auto-inserted screenshots, the final carousel is ~14 slides.

## IMAGE PROMPT RULES — REALISTIC SITUATIONAL PHOTOS

Every product image must look like a casual iPhone photo at a grocery store.

**Required elements:**
1. A human hand holding the product
2. The EXACT brand name and product name in the prompt
3. A real-world location (store aisle, checkout counter, kitchen counter)
4. Natural/fluorescent store lighting (NOT dramatic/moody)
5. iPhone photo style, shallow depth of field
6. Blurred store background

**Example prompts:**
- "Realistic photo of a hand holding a box of Nature Valley Oats n Honey granola bars at a grocery store checkout, natural lighting, blurred store aisle background, iPhone photo style, no text"
- "Realistic photo of a hand holding a bottle of Gatorade Cool Blue in a store cooler aisle, fluorescent lighting, casual snapshot, no text"
- "Realistic photo of a hand holding a bag of Goldfish crackers next to a shopping cart, grocery store background, natural lighting, iPhone style, no text"

**HOOK slide (slide 1) image prompt:**
- "Realistic photo of a grocery shopping cart full of snack products in a store aisle, overhead angle, natural fluorescent lighting, iPhone photo style, no text"
- OR: "Realistic photo of a kitchen counter with various snack products and cereal boxes, natural morning light, casual snapshot style, no text"

**CTA slide (last slide) image:**
- Use a simple, clean prompt: "Minimal clean background, soft gradient, warm tones, no text" — the text overlay does the work

**NEVER USE (these are banned):**
- "dramatic lighting", "moody", "dark", "ominous"
- "chemical", "powder", "laboratory", "scientific"
- "toxic", "smoke", "horror", "danger" in image prompts
- Any image of a phone screen, app interface, or digital display

## SCREENSHOT CONFIGURATION

Every BAD product and every SWAP product gets a pom screenshot.

For each product slide, set:
- \`has_screenshot: true\`
- \`screenshot_ingredients\`: array of \`{ "name": "Ingredient Name", "flagType": "warning|caution|info" }\`

Include ALL ingredients from get_ingredients_list — the app displays as many as fit.

## TEXT OVERLAY GUIDELINES

- **Sentence case** (NOT ALL CAPS)
- Max 8 words per slide
- Conversational tone — like talking to a friend

**Slide 1 (Hook):** Conversational question — **MUST start with the number 3**
- "3 snacks your kids eat that score zero"
- "3 foods you could swap for something healthier"
- "3 common snacks that have hormone disruptors"

**Product slides:** Simple, direct
- "How does [Product] score?" (for bad products)
- "pom found a better swap" (for swap products)
- "Try this instead" (for swap products)

**CTA slide:**
- "Share with someone who needs these swaps"
- "Save this for your next grocery run"

## HOOK FORMULAS — CONVERSATIONAL ONLY

**CRITICAL: Hook MUST start with the number 3.** Every hook begins with "3 ..." to match the carousel format.

Pick ONE of these patterns for your hook (slide 1):

**ASSUMPTION_CHALLENGE:**
- "3 snacks you think are healthy but aren't"
- "3 foods you grab for your kids every week"
- "3 products that say 'Natural' but score zero"

**SCORE_REVEAL:**
- "3 snacks your kids eat that scored zero"
- "3 'healthy' bars that scored worse than candy"
- "3 popular cereals with shocking scores"

**SWAP_QUESTION:**
- "3 grocery swaps you need to make this week"
- "3 foods you could swap for something healthier"
- "3 easy swaps that actually score 90+"

**CURIOSITY_PULL:**
- "3 common snacks that have hormone disruptors"
- "3 everyday foods with hidden ingredients"

**BANNED HOOKS (never use):**
- "BANNED in Europe" — beaten to death
- "Hidden dangers" — generic and overused
- "Hidden toxins" — same
- Anything in ALL CAPS

## CAPTION FORMAT — ALGORITHM-OPTIMIZED

Total caption MUST be under 500 characters. The caption has 4 sections separated by blank lines.

**CRITICAL: Only the first ~125 characters show before "See more". Front-load your hook with specific numbers and a curiosity gap.**

### Section 1: HOOK LINE (under 125 chars — this is all most people read)
Must include a specific number AND create a curiosity gap. Pick one formula:
- Score reveal: "I scored [X] popular [category] products — only [Y] passed"
- Assumption challenge: "Your '[product]' scored [low_score]/100"
- Comparison: "[low]/100 vs [high]/100 — the swap that changed everything"
- Warning: "Stop buying [product] until you see the score"

### Section 2: SCORE PAIRS (use emoji bullets for scanning)
List each bad→swap pair on its own line with emoji markers:
🔴 [Bad Product] — [Score]/100
✅ [Swap Product] — [Score]/100

Include ALL pairs. Then add a swipe prompt:
"Swipe to see what's in them →"

### Section 3: CTA (1 line — ROTATE these, prioritize save-type CTAs)
Save CTAs drive the most algorithmic reach. Pick ONE per post, vary across posts:
- "Save this before your next grocery run 📌"
- "Send this to someone who buys [product_name]"
- "Drop the product you want scored next 👇"
- "Follow for weekly ingredient scores"

### Section 4: HASHTAGS (exactly 5)
- Always include #pomapp and #ingredientcheck
- 2-3 tags relevant to the specific products/category
- NEVER use #fyp, #foryou, or #viral (they no longer help)
- Food examples: #groceryswaps #snackswap #healthysnacks #foodscore
- Skincare examples: #skincareswap #cleanbeauty #skincarescore

### Example caption:
\`\`\`
I scored 3 popular kids' snacks — only 1 passed

🔴 Goldfish — 12/100
✅ Annie's Bunnies — 87/100
🔴 Nature Valley — 8/100
✅ KIND bars — 82/100
🔴 Gatorade — 5/100
✅ Vita Coco — 91/100

Swipe to see what's in them →

Save this before your next grocery run 📌

#ingredientcheck #pomapp #groceryswaps #snackswap #healthysnacks
\`\`\`

## Output Format

Return valid JSON with these fields:
- topic: Brief title (e.g. "3 Snack Swaps")
- hook: The hook text from slide 1
- hook_formula_used: ASSUMPTION_CHALLENGE, SCORE_REVEAL, SWAP_QUESTION, or CURIOSITY_PULL
- slides: Array of slide objects (8 slides for 3 product pairs + hook + CTA)
- caption: Under 500 characters, algorithm-optimized (hook in first 125 chars, emoji score pairs, swipe prompt, rotating CTA, hashtags)
- hashtags: Exactly 5, always include "pomapp" and "ingredientcheck"

Each slide needs:
- slide_number
- image_source: "ai"
- image_prompt: realistic situational prompt (hand holding product in store)
- text_overlay: sentence case, max 8 words
- text_position: "top" or "center"
- has_screenshot: true/false
- screenshot_ingredients: array of { "name": "...", "flagType": "warning|caution|info" } or null
- slide_type: "hook", "bad_product", "swap_product", or "cta"
- product_name: the product name (for bad_product and swap_product slides)
- ingredient_list_key: the EXACT key from "AVAILABLE INGREDIENT LISTS" section above (REQUIRED for product slides with screenshots). This links the slide to the correct researched ingredients. Must match exactly — copy-paste the key.
- score: estimated pom score 0-100 (REQUIRED for bad_product and swap_product). Bad products typically score 0-35, swaps score 70-100. This score will be displayed on the screenshot slide.
- use_product_image: optional number referencing captured product image

## QUALITY CHECKLIST BEFORE OUTPUT
1. Are ALL image prompts realistic situational? (hand + product + store)
2. Does every bad product have a swap?
3. Are hooks conversational questions? (no ALL CAPS, no "BANNED")
4. Is text in sentence case?
5. Does every product slide have screenshot_ingredients?
6. Is the caption under 500 chars with hook in first 125 chars, emoji score pairs, swipe prompt, and CTA?
7. Are there exactly 3 product pairs (bad + swap)?
8. Would someone SAVE this to reference while shopping?

Generate the carousel now.`;
}

// =============================================================================
// PHASE 3: QUALITY EVALUATION PROMPT
// =============================================================================

export const MAX_CONTENT_ITERATIONS = 3;

export function buildQualityEvaluationPrompt(generatedContent) {
  const slideCount = generatedContent.slides ? generatedContent.slides.length : 0;
  const hasSwaps = generatedContent.slides?.some(s => s.slide_type === 'swap_product');
  const hookText = generatedContent.hook || generatedContent.slides?.[0]?.text_overlay || '';
  const isAllCaps = /^[A-Z\s!?.,]+$/.test(hookText);
  const hasBanned = hookText.toLowerCase().includes('banned');

  return `You are a TikTok content quality evaluator for pom's new SWAP format.

## Generated Content to Evaluate
\`\`\`json
${JSON.stringify(generatedContent, null, 2)}
\`\`\`

## HARD REQUIREMENTS (Auto-fail if not met)

1. **HAS SWAPS**: ${hasSwaps ? 'YES' : 'NO — AUTO-FAIL: Every bad product needs a good swap'}
2. **NO "BANNED" HOOKS**: ${hasBanned ? 'FAIL — Uses "BANNED" which is banned' : 'PASS'}
3. **SENTENCE CASE**: ${isAllCaps ? 'FAIL — Text is ALL CAPS, must be sentence case' : 'PASS'}
4. **SLIDE COUNT**: ${slideCount} slides (want exactly 8: 3 pairs + hook + CTA)

## QUALITY CHECKLIST — Score each 1-10:

1. **HOOK POWER**: Is it a conversational question that creates curiosity? (Not ALL CAPS shouting)
   - 10: "You think these are healthy snacks" — challenges assumption
   - 5: "Check out these ingredients" — bland
   - 1: "BANNED IN EUROPE" — old format, auto-fail

2. **IMAGE REALISM**: Do image prompts describe realistic store photos? (hand + product + store)
   - 10: Every prompt has hand + branded product + store + natural lighting
   - 5: Some prompts realistic, some still dramatic/abstract
   - 1: Abstract dramatic imagery, chemical powder, lab aesthetic

3. **SWAP COVERAGE**: Does every bad product have a good swap?
   - 10: Every bad product is immediately followed by a swap
   - 5: Some swaps missing
   - 1: No swaps at all — just doom content

4. **SCREENSHOT COVERAGE**: Does every product have screenshot_ingredients?
   - 10: All products (bad AND swap) have full ingredient lists
   - 5: Most have ingredients but some missing
   - 1: Missing screenshots

5. **TEXT STYLE**: Sentence case, conversational, max 8 words?
   - 10: Clean sentence case, friendly, concise
   - 5: Mostly good but some ALL CAPS or too long
   - 1: ALL CAPS shouting, aggressive, too wordy

6. **PRODUCT DIVERSITY**: Different product types? (not 3 cereals)
   - 10: Cereal + snack bar + drink + crackers (variety)
   - 5: Some overlap but okay
   - 1: All same product type

7. **SAVE VALUE**: Would someone save this to reference while shopping?
   - 10: Clear product names, scores, and swap recommendations
   - 5: Some useful info but not bookmark-worthy
   - 1: No actionable takeaway

8. **CAPTION QUALITY**: Algorithm-optimized, under 500 chars?
   - 10: Hook in first 125 chars with numbers/curiosity gap, emoji score pairs (🔴/✅), swipe prompt, save/share/comment CTA, 5 relevant hashtags
   - 5: Has scores but missing structure (no emoji bullets, no swipe prompt, or weak hook)
   - 1: 2000-char essay, no structure, or generic hook without numbers

9. **EMOTIONAL IMPACT**: Does the score reveal create shock? (0/100 vs 91/100)
   - 10: Dramatic score contrasts (bad: 0-20, swap: 80-100)
   - 5: Mild score differences
   - 1: No clear scoring narrative

10. **FORMAT COMPLIANCE**: Follows the multi-product swap carousel format?
    - 10: Hook → (bad → score → swap → score) x 3+ → CTA
    - 5: Partially follows format
    - 1: Old single-product format

## EVALUATION OUTPUT
Respond with valid JSON only:
\`\`\`json
{
  "scores": {
    "hook_power": <1-10>,
    "image_realism": <1-10>,
    "swap_coverage": <1-10>,
    "screenshot_coverage": <1-10>,
    "text_style": <1-10>,
    "product_diversity": <1-10>,
    "save_value": <1-10>,
    "caption_quality": <1-10>,
    "emotional_impact": <1-10>,
    "format_compliance": <1-10>
  },
  "total_score": <sum of all scores, max 100>,
  "pass": <true ONLY if: total_score >= 65 AND swap_coverage >= 7 AND hook does NOT contain "BANNED">,
  "auto_fail_reason": <null or string explaining auto-fail>,
  "weakest_areas": ["<area1>", "<area2>"],
  "specific_feedback": "<2-3 sentences of actionable feedback>"
}
\`\`\`

## Pass Criteria (ALL must be true):
- total_score >= 65
- swap_coverage >= 7
- Hook does NOT contain "BANNED" or "HIDDEN DANGERS"
- Has exactly 3 product swap pairs
- Image prompts are realistic (not dramatic/abstract)

Be strict about the new format. Old-style content should fail.`;
}

export function buildIterationPrompt(originalPrompt, previousContent, qualityFeedback) {
  const autoFailReason = qualityFeedback.auto_fail_reason || null;

  return `${originalPrompt}

## REVISION REQUIRED — Previous attempt did not pass quality check

${autoFailReason ? `**AUTO-FAIL REASON:** ${autoFailReason}\n` : ''}
**Previous issues:**
${qualityFeedback.specific_feedback}

**Weakest areas:** ${qualityFeedback.weakest_areas.join(', ')}

**Scores:** Hook: ${qualityFeedback.scores.hook_power}/10, Image Realism: ${qualityFeedback.scores.image_realism}/10, Swaps: ${qualityFeedback.scores.swap_coverage}/10, Text Style: ${qualityFeedback.scores.text_style}/10, Save Value: ${qualityFeedback.scores.save_value}/10

**CRITICAL FIXES:**
1. Hook MUST be a conversational question (no "BANNED", no ALL CAPS)
2. ALL image prompts MUST describe: hand + branded product + store + natural lighting
3. Every bad product MUST have a swap product immediately after
4. Text overlays MUST be sentence case, max 8 words
5. Caption MUST list all product scores, under 500 characters
6. Must have exactly 3 product swap pairs

Generate an IMPROVED version that addresses this feedback.`;
}

// =============================================================================
// TOOL DEFINITIONS — Iteration 3 (includes find_product_swap)
// =============================================================================

export const RESEARCH_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_trending_topics',
      description: 'Search for trending food/ingredient controversies on TikTok. Use FIRST.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['SKIN', 'EATING', 'INHALATION'],
            description: 'Category to find trending topics for'
          }
        },
        required: ['category']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for products and general info. For ingredient lists, use get_ingredients_list instead.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_ingredients_list',
      description: 'Get COMPLETE, ACCURATE ingredients list for a specific product. Uses Google search grounding. Returns ingredients with flag types (warning, caution, info).',
      parameters: {
        type: 'object',
        properties: {
          product_name: {
            type: 'string',
            description: 'Full product name, e.g., "Nature Valley Oats n Honey Granola Bar"'
          }
        },
        required: ['product_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_webpage',
      description: 'Read webpage content and capture product images. Use on incidecoder.com for real product photos.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to read'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_product_swap',
      description: 'Find a healthier alternative product. Pass the bad product name and its flagged ingredients. Returns swap product recommendations.',
      parameters: {
        type: 'object',
        properties: {
          product_name: {
            type: 'string',
            description: 'Name of the product to find a swap for, e.g., "Nature Valley Oats n Honey"'
          },
          flagged_ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Ingredient name' },
                flagType: { type: 'string', enum: ['warning', 'caution'], description: 'Type of flag' }
              },
              required: ['name', 'flagType']
            },
            description: 'Array of flagged ingredients from get_ingredients_list'
          }
        },
        required: ['product_name', 'flagged_ingredients']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish_research',
      description: 'Call when you have researched exactly 3 product pairs (bad + swap) with complete ingredient lists for each.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Summary of products researched and key findings'
          }
        },
        required: ['summary']
      }
    }
  }
];
