# Video Generation Workflow

This is the master workflow file. When you need videos made, point the AI at this file.

---

## Prompt For AI

Copy this into any AI conversation to generate video prompts:

```
Read these files in order:
1. /Users/lucy/pom/video_gen/INGREDIENT_CHARACTER_INSTRUCTIONS.md
2. /Users/lucy/pom/video_gen/COMPILATION_VIDEO_FORMAT.md

Then generate all the image prompts and video prompts I need for the following video:

[DESCRIBE YOUR VIDEO IDEA HERE]

Output every prompt in the Required Output Format from the instructions file. Put all prompts into a single markdown file I can read through and copy-paste into the Grok AI web playground one by one.
```

---

## How It Works

1. **You** describe the video idea (theme, ingredients, mood)
2. **AI** reads the instruction files and generates all image + video prompts
3. **AI** outputs everything in one MD file, ordered by clip sequence
4. **You** copy-paste each image prompt into Grok web → generate image
5. **You** feed each generated image + its video prompt into Grok I2V → generate video
6. **You** trim and stitch clips together in editing software
7. **You** add background music track across the full video
8. **You** export and post

---

## What The AI Should Output

A single MD file with this structure:

```markdown
# [Video Title]

**Theme:** [description]
**Format:** [A: Hero / B: Villain / C: Twist / D: Hidden Danger]
**Mood:** [Wonder / Fear / Wonder→Fear]
**Total Clips:** [number]
**Estimated Runtime:** [seconds]

---

## Clip 1: [Ingredient/Subject Name] -- [Wonder/Fear]

**Visual Metaphor:** [one line]

### Image Prompt
[copy-paste ready prompt in code block]

### Video Prompt
[copy-paste ready prompt in code block, dialogue INSIDE]

---

## Clip 2: [Ingredient/Subject Name] -- [Wonder/Fear]

...repeat for each clip...
```

---

## Rules For The AI

- Read INGREDIENT_CHARACTER_INSTRUCTIONS.md fully before writing any prompts
- Read COMPILATION_VIDEO_FORMAT.md to understand ordering and structure
- Follow the Required Output Format exactly -- no extra explanation, no separate dialogue lines
- Dialogue MUST be inside the video prompt in quotes, nowhere else
- Each image prompt: 50-150 words, subject in first 20-30 words
- Each video prompt: under 100 words, only describes movement + speech + audio
- End every prompt with "No text, no captions, no words on screen."
- Order clips using the strategies from the compilation format (energy arc, escalation, etc.)
- First clip must be the most visually dramatic (scroll-stopping hook)
- Last clip must be the most recognizable or impactful (satisfying closer)
- Match action word energy to desired voice tone (majestic words = sweet voice, aggressive words = menacing voice)
- Use the checklist from the instructions file before finalizing

---

## Example Usage

### Simple Request
```
Read the video generation files and make me a 6-clip hero compilation
about skincare hydration ingredients.
```

### Specific Request
```
Read the video generation files and make me a 5-clip villain video
about what's really in processed food. Include nitrites, high fructose
corn syrup, and sodium benzoate + vitamin C combo. Format C twist
for the sodium benzoate one.
```

### Single Clip Request
```
Read the video generation files and make me a single Format D hidden
danger clip about non-stick pans releasing PFAS.
```
