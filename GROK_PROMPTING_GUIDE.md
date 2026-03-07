# Grok Imagine Video - Prompting Best Practices

Reference guide for generating AI skincare ingredient character videos using Grok Imagine 1.0 (Aurora engine).

---

## 1. Platform Specs

| Parameter | Value |
|---|---|
| **Duration** | 1-15 seconds (1s increments) |
| **Resolution** | 720p max |
| **Frame Rate** | 24 FPS |
| **Aspect Ratios** | 16:9, 9:16, 1:1, 4:3, 3:4, 3:2, 2:3 |
| **Native Audio** | Yes -- sound + visuals generated simultaneously |
| **Lip Sync** | Yes -- natural mouth movement synchronization |
| **Audio Types** | Sound effects, ambient, dialogue, singing, background music |
| **Generation Speed** | ~15-30 seconds |
| **API Model** | `grok-imagine-video` |

---

## 2. The Prompt Formula

```
[Subject] + [Action/Motion] + [Camera Movement] + [Visual Style] + [Audio Direction]
```

**The first 20-30 words are the most important** -- the system prioritizes prompt beginnings.

### Alternative Five-Part Structure

1. **Scene**: What is happening
2. **Style**: Visual aesthetic
3. **Mood**: Emotional direction
4. **Lighting**: Time of day / light quality
5. **Camera**: Shot type, lens, focus

### Optimal Prompt Length
- **50-150 words** works best
- Short (<50): quick ideas
- Medium (50-150): balanced precision
- Long (>150): risks losing coherence

---

## 3. Key Rules

### Do This
- **Write like a film director**, not a tag list -- natural language scene descriptions
- **Be specific with actions**: "gyrates hips slowly" not "moves"
- **Use filmmaking vocabulary**: wide shot, low-angle, shallow depth of field, tracking shot
- **Specify colors precisely**: "electric blue and hot pink" not "colorful"
- **Describe emotions visually**: "genuine laugh, eyes slightly closed" not "happy"
- **Use intensity adverbs**: "violently," "powerfully," "wildly" to exaggerate expressiveness
- **Reference camera equipment**: "shot on Fujifilm XT4" for specific visual quality
- **Include audio direction**: "upbeat synth track," "ambient rain sounds," "epic orchestral swell"
- **Change only one variable per iteration** when refining

### Don't Do This
- **No negative prompts**: "no blur" doesn't work -- only describe what you WANT
- **No tag stacking**: "knight, castle, epic, 8K" produces generic results
- **No conflicting styles**: stick to ONE primary aesthetic per prompt
- **No complex hand close-ups**: hands get mangled (extra fingers, melting)
- **No legible text in video**: results in garbled, misspelled nonsense
- **No overly busy scenes**: dense crowds lose coherence

---

## 4. Camera Movement Keywords

| Keyword | Effect | Best Use |
|---|---|---|
| slow pan | Smooth horizontal movement | Landscapes, establishing shots |
| orbit 360 | Circular rotation around subject | Product showcase, character reveal |
| zoom in/out | Push in or pull back | Dramatic reveals |
| tracking shot | Following the subject | Action sequences |
| aerial pan | Bird's eye view | Cityscapes |
| handheld | Slight shake effect | Documentary feel, intimacy |
| slow dolly-in | Gradual forward movement | Building tension |
| crane up | Rising upward | Reveals, endings |
| whip pan | Fast horizontal sweep | Transitions, energy |

Use **"unfixed lens"** for camera movements. Use **"fixed lens"** for static shots.

### Multi-Shot Transitions
Use **"camera switch"** or **"shot switch"** as explicit transition cues:
```
Wide shot of city skyline at dusk; camera switch: close-up on protagonist's face with neon reflections
```

---

## 5. Audio Direction

Specify sound atmosphere in prompts:
- "upbeat synth track"
- "epic orchestral swell"
- "ambient rain sounds"
- "pulsing electronic bass"
- "jazz saxophone"
- "engine roar"
- "soft beauty BGM"

Audio is generated natively alongside visuals -- no separate audio pass needed.

**Note:** Text-to-video audio is more reliable than image-to-video audio (I2V can produce generic effects).

---

## 6. Style Keywords

Weave these naturally into sentences, don't list them:

- **Realism**: "photoreal detail," "natural lighting," "lifelike textures"
- **Anime**: "vibrant cel-shading," "expressive linework," "bright anime palette"
- **Painterly**: "oil-painting texture," "lush brushstrokes," "impressionist glow"
- **Cinematic**: "volumetric lighting," "film grain," "dynamic shadows"
- **Surreal**: "dreamlike distortion," "ethereal glow," "otherworldly hues"

---

## 7. Talking Character Tips

For best lip sync results:
- Keep the character **relatively still** (avoid complex full-body motion while speaking)
- Use **close-up** or **medium shot** framing to emphasize facial detail
- Specify the **speaking action** explicitly: "speaking directly to camera," "explaining enthusiastically"
- Include flattering face lighting: "soft studio lighting," "butterfly lighting," "three-point lighting"
- **Avoid complex hand gestures** in same frame as speaking -- hands are a known weak point

---

## 8. Chaining Clips for Longer Videos

For videos longer than 10-15 seconds:
1. Generate first clip
2. Save the last frame
3. Upload it as a new starting image for the next clip
4. Repeat to chain clips into a longer sequence

---

## 9. Grok vs Kling for Our Use Case

| | Grok Imagine 1.0 | Kling 2.6 |
|---|---|---|
| **Speed** | ~15-30s per clip | Slower |
| **Cost** | ~$0.25/5s clip | Higher |
| **Audio Quality** | 9.0/10 (highest rated) | Strong but lower rated |
| **Lip Sync** | Natural mouth sync | Frame-accurate sync |
| **Resolution** | 720p max | Up to 1080p |
| **Character Consistency** | No explicit feature | Reference-driven consistency |
| **Multi-shot** | Manual (chain via last frame) | Built-in storyboarding (6 shots) |

**Bottom line:** Grok is faster, cheaper, and has better-rated audio. Kling has higher resolution and better character consistency. For short-form vertical video with talking characters, Grok is the better fit.

---

## 10. Our Prompt Template (Skincare Ingredient Characters)

### The Formula

```
[Character description on macro skin] + [ONE metaphorical action showing function] + [Character speaks with dialogue in quotes] + [Camera/style] + [Audio direction]
```

### Rules We Learned from Testing

1. **Subject first** -- character description in the first 20-30 words, no scene preamble
2. **ONE action, not six** -- pick the single best visual metaphor for the ingredient's function. The model can't sequence multiple complex actions in 6-10s
3. **Show AND tell** -- whatever the character says, it must physically act out at the same time. "I pull moisture from the air" = character literally grabs water droplets from the air
4. **Dialogue must be in quotes** right after the speaking action -- binds speech to the character
5. **Keep dialogue to 1-2 short sentences** for 6s clips, 2-3 for 10s clips
6. **Hyperbolic action verbs** -- "slams," "rips," "blasts," "yanks" not "applies" or "helps"
7. **Style and camera at the end** -- Grok front-loads attention, so subject/action comes first
8. **No labels or structured tags** -- no `Visual:`, no `[Character, voice]:`, just natural language
9. **Always include audio direction last** -- "Upbeat beauty background music" at the end

### Working Prompt Structure (6 seconds)

```
A tiny [color/texture] [shape] character with [face details] sits on extreme macro human skin.
The character [ONE dramatic metaphorical action showing its function].
[Result of the action on the skin].
The character speaks directly to camera with clear lip sync: "[1-2 sentence first-person monologue]"
Close-up, [lighting], shallow depth of field, Pixar-style 3D animation.
[Audio direction].
```

### Working Prompt Structure (10 seconds)

```
A tiny [color/texture] [shape] character with [face details] sits on extreme macro human skin.
The character [dramatic metaphorical action 1].
[Result on skin].
The character [celebrates/reacts], then speaks directly to camera with clear lip sync: "[2-3 sentence first-person monologue]"
Close-up, [lighting], shallow depth of field, Pixar-style 3D animation.
[Audio direction].
```

---

## 11. Ingredient Prompt Examples

### Glycerin (6s)

```
A tiny translucent golden gel blob character with large expressive brown eyes and a wide mouth sits on extreme macro human skin. The character reaches up, grabs a shimmering water droplet from the air, and slams it into the skin. The skin plumps and glows. The character speaks directly to camera with clear lip sync: "I'm Glycerin! I pull moisture from the air into your skin!" Close-up, warm golden backlight, shallow depth of field, Pixar-style 3D animation. Upbeat beauty background music.
```

**Visual metaphor:** Literally grabs water from the air and pushes it into skin = humectant function.

### Visual Metaphor Bank (For Future Ingredients)

| Ingredient | Function | Hyperbolic Visual Metaphor |
|---|---|---|
| **Glycerin** | Humectant, pulls moisture | Grabs water droplets from the air and slams them into skin |
| **Niacinamide** | Barrier repair, calms redness | Builds a glowing shield wall over irritated red skin, redness fades behind it |
| **Hyaluronic Acid** | Deep hydration, plumps | Dives into a pore like a pool, skin inflates and plumps up around it |
| **Retinol** | Cell turnover, anti-aging | Rips off a layer of old dull skin like a tablecloth reveal, fresh glowing skin underneath |
| **Salicylic Acid** | Unclogs pores | Dives headfirst into a clogged pore and blasts debris out like a cannon |
| **Vitamin C** | Brightening, antioxidant | Radiates blinding golden light outward, dull skin lights up like sunrise |
| **Glycolic Acid** | Exfoliation | Punches through flaking dead skin, shatters it like glass |
| **Alpha Arbutin** | Fades dark spots | Shoots laser beams at dark spots, zapping them away one by one |
| **Kojic Acid** | Evens skin tone | Generates lightning from hands, electrifies uneven patches into uniform tone |
| **Mandelic Acid** | Gentle exfoliation for sensitive skin | Gently sweeps dead skin away with a tiny broom, skin underneath is smooth |
| **Ceramides** | Moisture barrier | Stacks bricks into a wall on the skin surface, sealing moisture inside |
| **Peptides** | Collagen production | Flexes muscles and punches the ground, collagen fibers spring up around it |
| **AHA** | Surface exfoliation | Surfs across the skin on a wave of serum, dead skin dissolves in its wake |
| **BHA** | Deep pore cleaning | Shrinks down and dives into a pore, scrubs the walls clean from inside |
| **Zinc** | Oil control, anti-inflammatory | Absorbs oil like a sponge, squeezes it out, stands on now-matte skin |
| **Squalane** | Lightweight moisture | Melts into the skin like butter on a warm pan, skin becomes silky smooth |
