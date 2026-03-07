# Kling VIDEO 2.6 - Prompting Best Practices

Reference guide for generating AI skincare ingredient character videos using Kling VIDEO 2.6's Native Audio model.

---

## 1. What VIDEO 2.6 Can Do

VIDEO 2.6 generates visuals, natural voiceovers, matching sound effects, and ambient atmosphere **in a single pass**. No more separate audio/video workflows.

### Supported Audio Types
| Voice Narration | Dialogue | Singing/Rap | Ambient Sound Effects | Object/Action SFX | Mixed Sound Effects |
|---|---|---|---|---|---|
| Character voice narration | Multi-person voice dialogue | Characters singing or rapping with lyrics | Background sounds like wind, ocean waves, street noise, traffic | Sounds like glass breaking, footsteps, knife slicing, machine rumble | Combination of voice, background sounds, and sound effects for immersive audio-visual experience |

### Two Creation Paths
- **Text-to-Audio-Visual:** From a sentence to a complete audio-visual video
- **Image-to-Audio-Visual:** Bring static images to life with sound and motion (upload AI-generated character images + text to create video)

### Parameter Settings
- **Video Duration:** 5s or 10s
- **Aspect Ratio:** 16:9, 1:1, 9:16 (use **9:16** for our vertical skincare videos)
- **Video Output:** Up to 4 videos at a time
- **Native Audio Toggle:** Must be **enabled** for synchronized audio generation

---

## 2. The Prompt Formula

```
Prompt = Scene (scene description) + Element (subject description) + Movement (motion description) + Audio (dialogue / singing / sound effects / pure music) + Other (style / emotion / camera)
```

### Audio Sub-Formulas

- **Dialogue:** `"Sentence"` + Emotion + Speech Speed + Tone + Character Label
  - Single Character: Specify voice attributes, e.g. `[Man speaking]`, `"Sentence"` + Deep + Fast
  - Multiple Characters: Use clear labels, e.g. `[Character A, angrily]` says, `"Sentence."` `[Character B, calmly]` replies, `"Sentence."`
- **Sound Effects:** Sound Source (Action/Object) + State + **Professional Sound Effects**
  - Structure: e.g. `Wooden Door/Suddenly Slams` -> `[Sound Effect: Bang]`
  - Material/State: Glass Breaking, Metal Impact, Screeching Brakes
- **Ambient Sound:** Scene + Sound Elements + Spatial Reverb
  - Elements: Rain, Insects, Crowd Murmurs, Traffic
  - Spatial Feel: Echo in an Open Hall (Reverb), Small Room Acoustics
- **Pure Music:** Instrument Type + Music Genre + Emotion
  - Structure: Piano Performance + Jazz + Melancholy
  - Genres: Classical, Rock, Electronic

**Tip:** Use quotation marks `" "` to clarify spoken content in prompts.

---

## 3. Key Prompting Guidelines for Our Use Case

### P1. Structured Naming
Character labels must be **unique and consistent** throughout the prompt.

| Do This | Not This |
|---|---|
| `[Character A: Blue-suited Agent]` and `[Character B: Female Assistant]` | `[Agent]` says... Then, he says... |

### P2. Visual Anchoring
**First describe the action**, then follow with the dialogue. Bind dialogue to the character's unique actions.

| Do This | Not This |
|---|---|
| `[Black-suited Agent, angrily shouting]` "Where is the truth?" | `[Black-suited Agent]` "Where is the truth?" (model won't know who slammed the table) |

### P3. Audio Details
Assign **unique tone and emotion labels** to each character.

| Do This | Not This |
|---|---|
| `[Black-suited Agent, raspy, deep voice]:` "Don't move." `[Female Assistant, clear, fearful voice]:` "I'm scared." | `[Man]` says... `[Woman]` says... (too vague, model confuses voices) |

### P4. Temporal Control
Use **clear linking words** to control the sequence and rhythm of dialogue.

| Do This | Not This |
|---|---|
| `... [Black-suited Agent]: "Why?" Immediately, [Female Assistant]: "Because it's time."` | `[Black-suited Agent]` "Why?" `[Female Assistant]` "Because it's time." (model may generate continuous speech from one character) |

**Optional strong constraint:** Insert `"this is when the speaker switches"` between characters.

---

## 4. Applying This to Skincare Ingredient Videos

### Recommended Prompt Structure for a Solo Ingredient Character

Since our videos use **Solo Monologue** (character speaks directly to camera with natural emotion and synchronized lip movements), the prompt pattern is:

```
Visual: [macro skin scene description with specific skin condition].
[Character description: shape, color, texture, size, facial features, personality].
[Character] stands on the skin surface, [specific action matching the ingredient's function].
[Character, cheerful/determined/gentle voice] says: "[First-person monologue about what the ingredient does]."
Background: Soft beauty BGM playing.
```

### Example Prompt (Niacinamide Character)

```
Visual: Extreme macro close-up of human skin. The left half is visibly irritated
with cracked, inflamed texture and visible red capillaries. The right half is
smoother, healthier skin. A stream of clear glossy serum flows diagonally across
the skin surface.

A small, round, translucent light-blue blob character with bubble texture inside,
large blue eyes, a cheerful smile, tiny blue arms and legs, wearing a small
translucent lab coat. The character stands at the boundary between irritated and
healthy skin, near the serum stream.

The character walks along the dividing line between damaged and healthy skin,
gesturing with arms spread wide. Eyes close happily when smiling. The serum
spreads and the irritated skin transforms to smooth healthy skin.

[Niacinamide Character, sweet and fresh voice] says: "I'm Niacinamide! I
strengthen your skin barrier and calm irritation. I reduce pores and brighten
your tone!"

Background: Upbeat beauty BGM playing.
```

### Example Prompt (Product Bottle Character)

```
Visual: An elegant bathroom vanity with a decorative wash basin, vintage brass
faucet, and a pink cherry blossom branch in a vase. Sage green walls with soft,
warm ambient lighting.

A white frosted glass dropper bottle with a visible product label stands on the
countertop. The bottle has two large round black eyes with eyebrows on the upper
portion, a small smiling mouth, and small white stubby arms emerging from the
sides. The white dropper cap serves as the character's head.

The bottle character stands mostly stationary with subtle body tilts, eye
movements looking at camera, mouth opening and closing to match dialogue. Arms
occasionally gesture outward.

[Niacinamide Bottle, cheerful voice] says: "I'm The Ordinary Niacinamide! I
regulate your sebum production and minimize your pores. Leave me on overnight
for best results!"

Background: Soft beauty BGM playing.
```

---

## 5. Important Notes & Tips

### Language & Voice
- Currently supports **Chinese and English** voice output only
- If you input other languages, the model auto-translates to English for voice generation without affecting video output
- Use **lowercase letters** for English words whenever possible
- Use **uppercase** only for acronyms or proper nouns
- For singing or dialogue scenes, use the **10s parameter** for more complete and stable results

### Image-to-Video Quality
- Video quality is **highly dependent on input image resolution** -- upload higher-resolution images
- This is critical for our workflow: generate high-res character images first (via Flux/Midjourney), then animate with Kling

### Common Audio Trigger Words

| Audio Type | Category | Trigger Words |
|---|---|---|
| **Speech** | Core Speech | Speaking, Talking |
| | Volume/Clarity | Whispering, Softly Speaking, Clearly Speaking/Crisp Voice |
| | Emotion/Tone | Excitedly Speaking, Complaining, Sighing, Gently Speaking |
| | Vocal Quality | Hoarse Voice, Deep Voice |
| | Pace/Rhythm | Fast Talking / Rapid Speech, Slow Talking |
| | Performance | Reciting / Reading Aloud, Monologue, Narration / Voiceover |
| **Sound Effects** | Daily Actions | Tapping / Knocking, Footsteps, Chewing / Munching |
| | Material Impact | Glass Shattering, Metal Clanging, Friction / Rubbing |
| | Natural Elements | Thunder, Fire Crackling, Bubbling / Gurgling |
| | Mechanical Noise | Alarm / Siren, Braking, Gears Whirring |
| | Musical Instruments | Piano Music, Guitar Plucking |
| **Ambient** | Urban | Traffic Noise / Car Flow, Crowd Murmur, Subway Noise, Construction Noise |
| | Nature | Ocean Waves, Bird Chirping, Wind Sound, Rainforest |
| | Indoor Space | Library Silence, Cafe Background Music, Air Conditioner Hum, Fireplace Burning |

---

## 6. Voice Control (Advanced)

### Overview
The **Voice Control** feature lets you select a target voice and the model replicates its vocal characteristics. Useful for maintaining consistent character voices across multiple videos.

### Prompt Formula with Voice Control
```
Prompt = Scene (scene description) + [Element (element description) @ Voice Name] + Motion (motion description) + Audio (dialogue / singing / sound effects / music) + Others (style / emotion / camera)
```

### How to Create a Custom Voice
1. Click `[+ Create New Voice]`
2. Upload audio/video file (mp3, wav, mp4) -- 5-30 seconds, single person speaking, neutral emotion, steady rate, no background noise
3. System auto-extracts the voice. Name it. Up to 200 voices total.

### How to Use Voices in Prompts
- **Method 1:** Type `@` in the input box to open the voice dropdown, select a voice
- **Method 2:** Open the Select Voice list in the creation panel, click a desired voice

### Voice Binding Format
```
[Character Name] @VoiceName: "Dialogue."
```
- Example: `[Livestream Host] @Sweet Female Voice: "This top is a trending must-have!"`
- Each `@VoiceName` is **independent per character** and won't override others
- Recommended for **two-character dialogue** scenarios; performance may degrade with 3+ characters

### Current Limitations
- Voice creation and usage: **Chinese and English audio/video content only**
- Voice consistency may be weaker in singing scenarios

---

## 7. Workflow Summary for Our Videos

1. **Write the script** -- first-person monologue for each ingredient character (7-10 seconds of dialogue)
2. **Generate character image** -- use Flux/Midjourney to create high-res still of the character on macro skin
3. **Craft the Kling prompt** using the formula: Scene + Element + Movement + Audio + Background
4. **Use Image-to-Audio-Visual** mode -- upload the character image + prompt
5. **Enable Native Audio** -- set to 9:16 aspect ratio, 10s duration
6. **Generate 4 variations** and pick the best one
7. **Compile** multiple 7-10s character clips into a single 45-60s video with transitions
