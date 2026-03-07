# Ingredient Character Video Production Instructions

Master guide for generating AI ingredient character videos. Every video we make follows this system.

**Platform:** Grok Imagine (grok-imagine-video) using Image-to-Video workflow.
**Process:** Generate image first → feed image + video prompt into Grok I2V.

---

## Prompting Best Practices (Learned From Testing)

These rules apply to BOTH image and video prompts. They were learned from extensive testing on Kling and Grok.

### Prompt Construction

1. **Subject and action in the first 20-30 words** -- Grok prioritizes the beginning of the prompt. Front-load what matters.
2. **50-150 words total** -- sweet spot. Under 50 is too vague, over 150 loses coherence.
3. **Write like a film director** -- natural language scene descriptions, not tag lists. "A golden blob character reaches toward floating droplets" NOT "blob, golden, droplets, macro, 8K."
4. **ONE clear action per prompt** -- the model cannot sequence multiple complex actions in 6-10 seconds. Pick the single best visual metaphor.
5. **Use intensity adverbs for visual actions** -- "powerfully," "gracefully," "breathtakingly" to exaggerate expressiveness. BUT be careful: aggressive words like "violently," "slamming," "forcing" will bleed into the voice tone and make it raspy/gruff.
6. **Majestic > Violent for hero videos** -- use "cascades," "floods," "sweeps," "rises gracefully" instead of "slams," "smashes," "rips." Same visual impact without making the voice aggressive.
7. **Use filmmaking vocabulary** -- "close-up," "shallow depth of field," "dramatic backlight," "slow dolly-in." Grok responds well to cinematic terms.
8. **No negative prompts** -- never say "no blur" or "don't show X." Only describe what you WANT to see.
9. **No text generation** -- AI mangles text. Never ask for labels, captions, logos, or words on screen. Always end with "No text, no captions, no words on screen."

### Voice and Audio Direction

10. **The overall tone of your prompt affects the voice.** If your action descriptions are aggressive ("violently slamming," "ripping apart"), the voice will sound aggressive too. Match the energy of your action words to the voice you want.
11. **Specify voice attributes explicitly** using these trigger words:
    - **Hero/Wonder voices:** "sweet cheerful voice," "warm friendly voice," "bright excited voice"
    - **Villain/Fear voices:** "low ominous voice," "deep menacing voice," "cold sinister voice"
    - **Add "clearly speaking"** to improve articulation
12. **Dialogue MUST be inside the video prompt** -- written in quotes immediately after the speaking action. NEVER separate dialogue into its own section outside the prompt.
13. **Do NOT include any background music or BGM direction in the prompt.** No "Background: BGM playing" or any audio/music instructions. Removing audio direction improves visual and voice quality. Music is added in post-production.

### Image-to-Video Specific

14. **The image prompt handles appearance. The video prompt handles movement.** Do NOT re-describe the character's color, shape, eyes, etc. in the video prompt. The image already has that. Only describe what should MOVE.
15. **Catch the character MID-ACTION in the image** so the video starts at the peak moment, not from a static pose.
16. **Higher resolution input images = better video quality.** Generate the best image you can.

---

## The Core Rule

**SHOW THEN TELL. Never just tell.**

Whatever the character says, the viewer must have ALREADY SEEN IT HAPPEN before the character opens its mouth. The dialogue is confirmation of what the viewer just witnessed, not new information.

**THE ACTION IS THE STAR, NOT THE CHARACTER.**

The character is small. It is the narrator, the guide, the mascot. The SPECTACLE -- the hyperbolic, creative, exaggerated display of what is happening to the surface (skin healing, food contaminating, pan coating flaking, pores unclogging) -- is what takes up most of the frame and most of the prompt. The character occupies 20-30% of attention. The action and its consequence occupy 70-80%. Every prompt should spend more words describing the dramatic transformation/damage/effect than describing the character itself.

---

## The Two Moods

Every video falls into one of two emotional tones. There is no middle ground.

### 1. Magical Ethereal Wonder (Positive/Benefit Videos)
- The ingredient is the HERO
- Childlike awe, breathtaking transformations, glowing light, sparkles
- The character is joyful, triumphant, majestic
- The transformation is miraculous -- dry wasteland to glass-like perfection
- Think: Pixar magic, fairy godmother moment, the reveal in a makeover show
- **Feeling the viewer should have:** "I NEED this ingredient right now"

### 2. Scary Childlike Fear (Cautionary/Warning Videos)
- The ingredient or behavior is the VILLAIN, or the character is the VICTIM
- Dread, destruction, visible damage, horror
- The character is either menacing and destructive OR terrified and suffering
- The consequence is devastating -- cracking, burning, dissolving, leaching, mutating
- Think: Pixar villain scene, the moment in a kids movie where everything goes wrong
- **Feeling the viewer should have:** "I need to STOP doing this immediately"

---

## The Four Video Formats

### Format A: Hero Explainer (Wonder)
Character introduces itself, shows its function, explains the benefit.
- **Surface:** Skin, gut lining, hair, or any body surface the ingredient acts on
- **Action:** Character does its helpful function (hydrates, protects, repairs)
- **Dialogue:** "I'm [Name]. I [benefit]."

### Format B: Villain Explainer (Fear)
Character introduces itself, shows what it does to you, reveals the harm.
- **Surface:** Whatever the substance contacts -- skin, meat, lungs, gut, water
- **Action:** Character does its damage (poisons, leaches, corrodes, mutates)
- **Dialogue:** "I'm [Name]. I [harmful action]."

### Format C: Good Thing Used Wrong (Twist -- Wonder to Fear)
A normally good product/ingredient becomes harmful because of misuse, wrong pairing, or hidden contents.
- **Beat 1:** Character appears friendly/helpful on a healthy surface (WONDER mood)
- **Beat 2:** The TWIST happens -- sun exposure, wrong combo, hidden ingredient revealed
- **Beat 3:** The consequence -- surface is damaged, character transforms or reveals its dark side (FEAR mood)
- **Image prompt:** Show the character looking friendly/innocent, BUT include a visual hint of the danger (sun rays creeping in, a second character approaching, a crack forming)
- **Video prompt:** The twist plays out -- the friendly character turns harmful or the surface gets destroyed
- **Dialogue:** "I'm [Name]. [Good claim]... but [twist consequence]."
- **Examples:**
  - Retinol in sun: friendly gold character on skin → sun rays hit → skin burns
  - Peanut butter: wholesome jar character → splits open → hydrogenated oil oozes out
  - Sodium benzoate + Vitamin C: two friendly characters meet → fuse into toxic molecule
  - Plastic teabag: innocent teabag sits in cup → hot water hits → billions of plastic particles break off

### Format D: Hidden Danger (Fear)
An everyday object you trust is quietly harming you. Zoom into the micro level to reveal what's happening.
- **Surface:** The object itself at macro/micro scale (pan surface, candle flame, air particles)
- **Action:** The hidden process plays out -- coating flakes off, chemicals release, particles enter body
- **Dialogue:** "I'm your [everyday object]. [What I'm secretly doing to you]."
- **Examples:**
  - Non-stick pan: shiny surface → zoom into scratches → PFAS particles flaking into food
  - Scented candle: warm glow → zoom into smoke → chemical particles entering lungs
  - Microwave plastic: container in microwave → zoom into surface → plastic molecules migrating into food

---

## The Video Structure (6 seconds)

Every 6-second clip follows this exact 3-beat arc:

```
Beat 1 (Frames 1-2s): THE PROBLEM + THE CHARACTER
  - The skin condition is visible and dramatic (dry, cracked, spotted, inflamed, clogged)
  - The character is already present and mid-action
  - This is the scroll-stopping hook -- must be visually arresting in frame 1

Beat 2 (Frames 2-4s): THE ACTION
  - The character DOES the thing it claims to do
  - The consequence plays out on screen -- skin transforms (heals or suffers)
  - Hyperbolic, exaggerated, impossible physics, magical or terrifying
  - This is the SHOW

Beat 3 (Frames 4-6s): THE TELL
  - Character turns to camera, delivers 1 short sentence
  - This confirms what the viewer just saw
  - Sweet/cheerful voice for hero videos, dark/ominous voice for villain videos
```

### For 10-second clips, expand Beat 2:

```
Beat 1 (0-2s): THE PROBLEM + THE CHARACTER
Beat 2a (2-4s): THE ACTION begins
Beat 2b (4-7s): THE CONSEQUENCE plays out fully
Beat 3 (7-10s): THE TELL -- character speaks to camera
```

---

## Character Design Principles

Pulled from viral video analysis. Every character follows these rules:

### Shape
- **Base shape is always a TEARDROP or BLOB** -- round, soft, approachable
- Small stubby arms and legs
- Body takes up 30-40% of the frame vertically
- Character sits ON the skin surface like it's a landscape

### Face
- **HUGE eyes** -- disproportionately large, Pixar-style, expressive
- Wide mouth capable of exaggerated expressions
- Eyebrows that move independently for emotion
- Eyes and mouth are the primary animation drivers

### Color = Identity
The character's color MUST represent what the ingredient actually looks like. Never guess.

| Ingredient | Color/Texture | Why |
|---|---|---|
| Glycerin | Crystal-clear iridescent gel | Clear viscous liquid |
| Niacinamide | Translucent light blue | Water-soluble, clean |
| Hyaluronic Acid | Bright blue water droplet | Hydration = water |
| Retinol | Golden amber, metallic | Oil-based, warm toned |
| Vitamin C | Orange amber, glowing | Citrus association |
| Salicylic Acid | Clear/glass-like | Transparent liquid |
| Glycolic Acid | Bright green, translucent | AHA = fresh/acidic |
| Kojic Acid | White with molecular structures | Powder-derived |
| Alpha Arbutin | White, soft glow | Powder-derived |
| Mandelic Acid | White/cream or soft gold | Gentle, almond-derived |
| Ceramides | Pearlescent white/cream | Lipid barrier |
| Peptides | Metallic silver/chrome | Bioactive, clinical |
| Zinc | Matte white/grey | Mineral, chalky |
| Squalane | Clear with slight shimmer | Lightweight oil |
| SPF/Sunscreen | Bright white, reflective | White cream |
| Benzoyl Peroxide | Stark white, aggressive | Clinical, harsh |

### Personality = Function
The character's ATTITUDE must match what it does:

- **Hydrators** (Glycerin, HA): Joyful, generous, nurturing
- **Exfoliants** (Glycolic, Salicylic): Fierce, determined, warrior energy
- **Brighteners** (Vitamin C, Arbutin): Radiant, confident, showing off
- **Repair** (Niacinamide, Ceramides): Calm, protective, builder energy
- **Anti-aging** (Retinol, Peptides): Powerful, heroic, intense
- **Villains** (overuse, wrong combos): Menacing, reckless, destructive

---

## The Image Prompt (Step 1)

Generate the static frame first. This sets up Beat 1 (problem + character) and the beginning of Beat 2 (mid-action).

### Image Prompt Skeleton

```
Visual: Extreme macro close-up of [SURFACE CONDITION -- be specific and dramatic].
[THE SPECTACLE -- the main visual event taking up most of the frame. Describe
the dramatic transformation, damage, or effect in vivid hyperbolic detail.
This is 60-70% of the prompt.]
A small [COLOR/TEXTURE] blob character with [BRIEF face details, 1 line max]
[ACTION POSE] amid the spectacle.
[LIGHTING DESCRIPTION], shallow depth of field, Pixar-style 3D animation.
No text, no captions, no words on screen.
```

### Image Prompt Rules

1. **The spectacle dominates the frame and the prompt** -- the dramatic visual event (skin cracking, water vortex, coating flaking, cells mutating) gets the most words and the most visual real estate. The character is SMALL within this spectacle.
2. **Character description is brief** -- 1 line max. Color, shape, expression, pose. That's it. Don't spend 3 sentences on eye color and arm texture.
3. **Frame 1 must contain the PROBLEM/EVENT and the character together** -- never an empty surface shot
4. **Character must be MID-ACTION** -- arms raised, diving, punching, pulling, not standing still
5. **The surface condition must be VISIBLE and DRAMATIC** -- cracks, pores, dark spots, flaking, leaching, melting. Exaggerate it.
6. **The visual metaphor element must already be in motion** -- droplets mid-pull, beams mid-fire, coating mid-flake
7. **No text ever** -- AI mangles text. Logos, labels, captions = garbled mess
8. **Lighting sells the mood** -- warm ethereal backlight for wonder, cold harsh light for fear

---

## The Video Prompt (Step 2)

Feed the generated image into image-to-video. This prompt ONLY describes movement and audio. Do NOT re-describe the character's appearance.

**CRITICAL: The video prompt is ONE single block of text. The dialogue in quotes MUST be inside this block. NEVER output dialogue separately outside the video prompt. Everything -- action, consequence, speaking, dialogue, no-text instruction -- lives in one continuous prompt. Do NOT include any background music or BGM direction.**

### Video Prompt Skeleton

```
[THE SPECTACLE COMPLETES -- describe the dramatic transformation, damage,
or healing playing out in vivid detail. This is the majority of the prompt.
Surface cracks sealing, coating disintegrating, cells mutating, moisture
flooding in, particles releasing -- whatever the main event is, describe
it fully.] The small character [brief reaction], turns to camera and
speaks with clear lip sync and a [VOICE TONE] voice, clearly speaking:
"[DIALOGUE -- 1 SHORT SENTENCE]." No text, no captions, no subtitles
on screen.
```

**This is a SINGLE prompt. Copy-paste the entire block into Grok's I2V text field. Do not break it into parts.**

### Video Prompt Rules

1. **Start from where the image left off** -- the image is mid-action, the video completes it
2. **Do NOT re-describe the character's appearance** -- the image already has it, focus only on MOVEMENT
3. **The skin transformation is the money shot** -- spend the most prompt words here
4. **Dialogue is ONE sentence, max two** -- 6 seconds is tight, don't overwrite
5. **Dialogue MUST be in quotes inside the video prompt** -- never output it separately
6. **Voice tone words must match the mood** -- but remember: aggressive action words ("slamming," "violently") will bleed into the voice and make it sound raspy/gruff even if you specify "sweet voice." Use majestic action words for hero videos ("cascades," "sweeps," "floods") and save aggressive words for villain videos where a gruff voice is wanted.
7. **Voice trigger words that work:**
   - Wonder/Hero: "sweet cheerful voice," "warm friendly voice," "bright excited voice" + "clearly speaking"
   - Fear/Villain: "low ominous voice," "deep menacing voice," "cold sinister voice" + "clearly speaking"
8. **Always end with no-text instruction** -- fight the auto-captioning
9. **Keep total video prompt under 100 words** -- Grok loses coherence on long I2V prompts since the image already carries the visual information

---

## Dialogue Style Guide

Scripts match the viral video pattern: **Name → what I do FOR YOU → visible benefit/consequence.**

### Hero Script Formula
> "I'm [Name]. I [ACTION VERB] [BENEFIT you see on your skin]."

Examples:
- "I'm Glycerin. I lock in moisture and keep your skin soft, plump, and glowing."
- "I'm Niacinamide. I calm irritation and strengthen your skin barrier."
- "I'm Vitamin C. I brighten your skin and boost collagen."
- "I'm Retinol. I turn over dead skin and reveal what's underneath."

### Villain/Warning Script Formula
> "I'm [Name/Behavior]. I [DESTRUCTIVE ACTION] and [CONSEQUENCE you see on your skin]."

OR for cautionary "don't do this" videos:
> "[Consequence statement]. This is what happens when you [bad behavior]."

Examples:
- "I'm Retinol Overuse. I burn through your barrier and leave you raw."
- "Your moisture barrier just collapsed. This is what happens when you mix acids."
- "I'm UV Damage. I break down your collagen fiber by fiber."

### Rules
- **Never explain the mechanism** -- don't say "I'm a humectant that attracts water molecules." Say "I lock in moisture."
- **Always benefit/consequence focused** -- what does the VIEWER'S SKIN experience
- **Action verbs only** -- lock, drag, pull, force, seal, blast, burn, rip, melt, shield, crush
- **Under 15 words** for 6s clips, under 25 words for 10s clips

---

## Visual Metaphor Bank

The character must PHYSICALLY ACT OUT its function. This is the menu of pre-planned actions.

### Hero Metaphors (Wonder/Positive)

| Ingredient | Action Metaphor |
|---|---|
| **Glycerin** | Reaches into the air, pulls water droplets down, slams them into dry skin -- cracks seal, skin plumps |
| **Hyaluronic Acid** | Dives into a pore like a pool, skin around it inflates and plumps like a balloon |
| **Niacinamide** | Builds a glowing shield wall brick by brick over red irritated skin -- redness fades behind the wall |
| **Vitamin C** | Radiates blinding golden light outward like a sun, dull grey skin lights up to glowing |
| **Retinol** | Grips the edge of old dull skin and rips it off like a tablecloth -- fresh glowing skin underneath |
| **Salicylic Acid** | Dives headfirst into a giant clogged pore and blasts debris out from inside like a cannon |
| **Glycolic Acid** | Surfs across the skin on a wave of serum, dead skin shatters like glass in its wake |
| **Alpha Arbutin** | Shoots beams of light at dark spots one by one, each spot fades on impact |
| **Ceramides** | Stacks glowing bricks into a fortress wall on the skin surface, sealing moisture inside |
| **Peptides** | Punches the ground like a superhero landing, collagen fibers spring up from the impact |
| **Squalane** | Melts into the skin like butter on a warm pan, skin becomes silky smooth |
| **SPF** | Opens a glowing umbrella/force field above the skin, UV rays bounce off |
| **Mandelic Acid** | Gently sweeps dead skin away with a magical broom, smooth skin revealed underneath |
| **Zinc** | Absorbs oil like a sponge, wrings it out, stands proudly on now-matte skin |
| **AHA** | Dissolves the top layer of dead skin like melting ice, fresh layer emerges |
| **BHA** | Shrinks down and dives deep into a pore, scrubs the walls clean from inside out |

### Villain Metaphors (Fear/Warning)

| Scenario | Action Metaphor |
|---|---|
| **Retinol Overuse** | Character turns aggressive red, claws at the skin barrier, barrier cracks and crumbles, raw skin exposed |
| **Mixing Acids** | Two characters collide and explode, skin beneath burns and peels |
| **No SPF** | UV rays rain down like fire arrows, skin chars, wrinkles etch in real-time |
| **Over-Exfoliating** | Character scrubs manically, skin gets thinner and thinner until it's raw and bleeding |
| **Popping Pimples** | Character squeezes a pore, bacteria explode outward and spread across the skin like wildfire |
| **Sleeping in Makeup** | Makeup particles sink into pores overnight, pores clog and swell into angry bumps |
| **Skipping Moisturizer** | Skin dries and cracks like a desert, character desperately tries to hold the cracks together but fails |
| **Too Much Vitamin C** | Character overheats, turns dark orange, skin becomes irritated and splotchy |
| **Expired Products** | Character decays and crumbles, spreads bacteria across the skin surface |

---

## Checklist Before Generating

Run through this for every video:

### Image Prompt Checks
- [ ] Is the skin problem / surface VISIBLE and DRAMATIC?
- [ ] Is the character MID-ACTION, not standing still?
- [ ] Does the character's color actually represent the ingredient?
- [ ] Does the character's personality match its function?
- [ ] Is there ONE clear visual metaphor, not three?
- [ ] Is the subject in the first 20-30 words?
- [ ] Is the total prompt 50-150 words?
- [ ] Does it end with "No text, no captions, no words on screen"?

### Video Prompt Checks
- [ ] Does it ONLY describe movement (not re-describe character appearance)?
- [ ] Is the dialogue IN QUOTES INSIDE the video prompt? (not separate)
- [ ] Does the dialogue match the viral script formula? (Name → action → benefit/consequence)
- [ ] Is the dialogue under 15 words for 6s / under 25 words for 10s?
- [ ] Do the action words match the desired voice tone? (majestic words = sweet voice, aggressive words = menacing voice)
- [ ] Is a voice trigger word specified? (sweet cheerful / warm friendly / low ominous / deep menacing + clearly speaking)
- [ ] Does every claim in the dialogue have a matching visual action BEFORE it?
- [ ] Is the total video prompt under 100 words?
- [ ] Does it end with "No text, no captions, no subtitles on screen"? (NO BGM direction)

### Overall Checks
- [ ] Is the mood clearly WONDER or FEAR, no in-between?
- [ ] Is the output in the Required Output Format? (no separate Dialogue line, no "Why it works" explanation)

---

## Required Output Format

When generating prompts for a new ingredient video, output EXACTLY this format and nothing else:

```
## [Ingredient Name] -- [Mood: Wonder OR Fear]

**Visual Metaphor:** [one line summary of the action]

### Image Prompt
[The full image prompt in a code block, ready to copy-paste]

### Video Prompt
[The full video prompt in a code block, ready to copy-paste.
DIALOGUE MUST BE INSIDE THIS BLOCK. Never separate it.]
```

**DO NOT** add a separate "Dialogue:" line outside the prompts. The dialogue lives inside the video prompt. That's its only home.

**DO NOT** add explanation paragraphs like "Why it works" or "This is effective because." Just output the two prompts.

---

## Full Example (Glycerin)

## Glycerin -- Wonder

**Visual Metaphor:** Pulls water from air → floods into cracked skin → cracks seal and skin glows

### Image Prompt
```
Visual: Extreme macro close-up of dry cracked dehydrated human skin with deep
fissures and visible flaking. Hundreds of shimmering water droplets are suspended
in the air above, mid-motion, being pulled downward by a magnetic force toward
the skin. The droplets trail glowing streaks of light as they descend. The cracks
in the skin are beginning to fill with luminous moisture at the edges. A small
crystal-clear iridescent gel blob character with bright blue eyes and a determined
mouth stands amid the spectacle, arms raised above its head, pulling the water
down. Dramatic ethereal backlight with particles sparkling, shallow depth of
field, Pixar-style 3D animation. No text, no captions, no words on screen.
```

### Video Prompt
```
The hundreds of water droplets crash downward into the cracked skin in a
breathtaking cascade. On impact the deep cracks seal shut one by one, the skin
swells and inflates, transforming from a dry wasteland into glossy dewy glass-like
perfection with a glowing aura spreading outward across the entire surface. The
small character bounces triumphantly, turns to camera and speaks with clear lip
sync and a sweet cheerful voice, clearly speaking: "I'm Glycerin. I lock in
moisture and keep your skin soft, plump, and glowing." No text, no captions,
no subtitles on screen.
```

## Full Example (Nitrite -- Villain)

## Nitrite -- Fear

**Visual Metaphor:** Paints grey meat bright pink with a brush → cells mutate underneath → revealed as toxic

### Image Prompt
```
Visual: Extreme macro close-up of raw grey processed meat tissue with visible
muscle fibers and fat marbling. A dripping pink paintbrush mid-stroke is actively
painting the grey meat a bright artificial pink. Half the meat is already painted
vibrant pink, the other half still grey and raw. Tiny pink chemical particles
spray off the brush into the meat fibers. Beneath the painted surface, dark
clusters of mutating cells are beginning to form, visible through the translucent
pink layer. A small hot pink blob character with dark red eyes and a sinister grin
grips the paintbrush. Cold harsh fluorescent lighting from above, shallow depth
of field, Pixar-style 3D animation. No text, no captions, no words on screen.
```

### Video Prompt
```
The paintbrush completes its stroke, the remaining grey meat turning bright
artificial pink. But beneath the pink surface the meat cells visibly darken and
mutate, swelling into angry black and purple clusters that pulse and spread like
a disease through the tissue. The pink paint cracks and peels back revealing the
corrupted cells underneath. The small character drops the brush, turns to camera
with a cold smirk and speaks with clear lip sync and a deep menacing voice,
clearly speaking: "I'm Nitrite. I make your meat look fresh... while your cells
pay the price." No text, no
captions, no subtitles on screen.
```
