# n8n Workflow for pom TikTok Slideshow Generator

## Overview

This folder contains modular steps that can be used with n8n or run standalone.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Research   │───>│  Content    │───>│  Images     │
│  (Grok API) │    │  (Grok API) │    │  (Replicate)│
└─────────────┘    └─────────────┘    └─────────────┘
                                            │
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Upload    │<───│ Screenshots │<───│  Overlays   │
│  (TikTok)   │    │  (Emulator) │    │  (Sharp)    │
└─────────────┘    └─────────────┘    └─────────────┘
```

## Steps

### Step 1: Research (`step1-research.js`)
- Uses Grok API with web search tools
- Finds products and ingredients
- Captures product images
- **Input:** `{ category?: 'SKIN' | 'EATING' | 'INHALATION' }`
- **Output:** `{ researchContext, productImages[] }`

### Step 2: Content Generation (`step2-content.js`)
- Uses Grok API to generate carousel content
- **Input:** `{ researchContext, productImages[] }`
- **Output:** `{ topic, hook, slides[], caption, hashtags }`

### Step 3: Image Generation (`step3-images.js`)
- Uses Replicate (Seedream-4) for AI images
- Downloads captured product images
- **Input:** `{ slides[], productImages[] }`
- **Output:** `{ slides[] }` with `imagePath` added

### Step 4: Text Overlays (`step4-overlays.js`)
- Uses Sharp to add text overlays
- **Input:** `{ slides[] }` with `imagePath`
- **Output:** `{ slides[] }` with `finalImagePath` added

### Step 5: Screenshots (`step5-screenshots.js`)
- Captures pom app screenshots from Android emulator
- **Note:** Requires local emulator setup
- **Input:** `{ slides[] }` with `has_screenshot`
- **Output:** `{ slides[] }` with `screenshotPath` added

### Step 6: Preview (`step6-preview.js`)
- Generates interactive HTML preview
- Includes copy caption + download images buttons
- Auto-opens in browser
- **Input:** `{ slides[], topic, caption, hashtags, outputDir }`
- **Output:** `{ previewPath, previewUrl, topic }`

## Standalone Usage

Each step can be run from command line:

```bash
# Step 1: Research (outputs JSON)
node n8n/step1-research.js EATING > /tmp/research.json

# Step 2: Content (takes research output)
node n8n/step2-content.js /tmp/research.json > /tmp/content.json

# Step 3: Images
node n8n/step3-images.js /tmp/content.json /tmp/images

# Step 4: Overlays
node n8n/step4-overlays.js /tmp/images/output.json /tmp/final

# Step 5: Screenshots (optional)
node n8n/step5-screenshots.js /tmp/final/output.json /tmp/screenshots

# Step 6: Upload
node n8n/step6-upload.js /tmp/final/output.json
```

## n8n Setup

1. Import `workflow.json` into n8n
2. Configure environment variables in n8n:
   - `XAI_API_KEY` - Grok API key
   - `REPLICATE_API_TOKEN` - Replicate API token
   - `TIKTOK_ACCESS_TOKEN` - TikTok access token
3. Adjust file paths in Code nodes for your server
4. The workflow runs every 12 hours by default

## Environment Variables

Required in `.env`:
```
XAI_API_KEY=your_grok_api_key
REPLICATE_API_TOKEN=your_replicate_token
TIKTOK_ACCESS_TOKEN=your_tiktok_token
```

## Notes

- Screenshot capture (Step 5) needs Android emulator running locally
- For cloud deployment, you may want to skip screenshots or use a different approach
- TikTok upload creates drafts (SELF_ONLY privacy) - publish manually or change to PUBLIC_TO_EVERYONE
