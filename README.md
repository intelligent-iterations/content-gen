# Content Gen

An AI-powered content generation and multi-platform distribution system. Automatically researches topics, generates viral carousels/slideshows, and cross-posts to TikTok, Instagram, X, Reddit, YouTube, and Pinterest.

## Features

- **AI Research Loop**: Grok-4 autonomously researches topics with tool-calling (web search, page scraping, up to 15 iterations)
- **Multi-Format Generation**: Creates TikTok slideshows, Instagram carousels, X threads, YouTube Shorts
- **AI Image Generation**: Uses Replicate (Seedream-4) for realistic product photos
- **App Screenshot Integration**: Captures real app screenshots via Android emulator
- **Text Overlays**: Automatic TikTok-safe text overlay placement with safe zones
- **Cross-Platform Posting**: Automated posting to 6+ platforms
- **Scheduled Automation**: LaunchD plists for macOS scheduling
- **Debug Reports**: Conversational HTML reports showing full generation flow

## How It Works

1. **Research Phase**: Grok researches trending topics via web search and page scraping
2. **Content Generation**: Grok creates carousel structures with hooks and CTAs
3. **Image Generation**: AI generates realistic product photos (or uses captured images)
4. **Screenshot Capture**: Captures real app data from emulator
5. **Text Overlays**: Adds captions to all slides with TikTok-safe positioning
6. **Distribution**: Cross-posts to all configured platforms

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+ (for some posting scripts)
- API keys for: xAI (Grok), Replicate, TikTok, Instagram, X, etc.

### Installation

```bash
npm install
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Configuration

1. Copy the environment file:
```bash
cp .env.example .env
```

2. Add your API keys to `.env`

3. Copy and customize the content direction:
```bash
cp content-direction.example.md content-direction.md
```

4. Set up platform OAuth tokens as needed (see `TIKTOK_POSTING_GUIDE.md`)

## Usage

### Generate Content with AI Research
```bash
node code/ai-orchestrator.js
```

### Generate Slideshow
```bash
node code/generate-slideshow.js
```

### Post to Platforms

```bash
# TikTok
node code/upload-to-tiktok.js output/2024-01-01T12-00-00_slug

# Instagram
node code/post-to-instagram.js

# X (Twitter)
node code/post-to-x.js

# Reddit
node code/post-to-reddit.js
```

### Automated Posting (macOS)

See `launchd/README.md` for setting up scheduled posting.

## Project Structure

```
content-gen/
├── code/
│   ├── ai-orchestrator.js     # Main AI research loop with tool-calling
│   ├── generate-slideshow.js  # Carousel generation
│   ├── generate-image.js      # AI image generation (Replicate/Seedream-4)
│   ├── add-text-overlay.js    # Text overlay engine with safe zones
│   ├── emulator-screenshot.js # App screenshot capture
│   ├── web-scraper.js         # DuckDuckGo web scraping
│   ├── playwright-scraper.js  # Playwright page scraping + image capture
│   ├── upload-to-tiktok.js    # TikTok posting
│   ├── post-to-instagram.js   # Instagram posting
│   ├── post-to-x.js           # X posting
│   ├── post-to-reddit.js      # Reddit posting
│   └── ...
├── launchd/                   # macOS scheduling examples
├── n8n/                       # n8n workflow integration
├── workflows/                 # Workflow definitions
├── output/                    # Generated content (gitignored)
├── content-direction.example.md  # Example content configuration
└── .env.example               # Environment template
```

## Configuration Files

### content-direction.md

Controls the AI's content generation:
- Brand voice and tone
- Content categories/pillars
- Hook formulas
- Text overlay guidelines
- Image prompt style

### .env

All API credentials:
- `XAI_API_KEY` - Grok API
- `REPLICATE_API_TOKEN` - Image generation
- `TIKTOK_*` - TikTok Content API
- `INSTAGRAM_*` - Instagram Graph API
- `X_*` - Twitter API v2
- And more (see `.env.example`)

## APIs Used

| API | Purpose |
|-----|---------|
| Grok (xAI) | Content research and generation |
| Replicate | AI image generation (Seedream-4) |
| Gemini | Content extraction |
| TikTok | Slideshow posting |
| Instagram Graph | Carousel posting |
| X (Twitter) v2 | Thread posting |
| YouTube Data | Shorts upload |
| Pinterest | Video pin creation |
| Reddit | Image post submission |

## TikTok Safe Zones

Content is placed to avoid TikTok UI elements:
- **Top 120px**: Status bar, notch
- **Bottom 350-500px**: Captions, hashtags, music
- **Right 150px**: Engagement buttons

## Cost Per Slideshow

| Component | Cost |
|-----------|------|
| Grok API (~5k tokens with research) | ~$0.02-0.05 |
| Seedream-4 images (6 slides) | ~$0.02 |
| TikTok API | FREE |
| **Total** | **~$0.04-0.07** |

## n8n Integration

The `n8n/` directory contains workflow steps that can be imported into n8n for visual workflow automation. See `n8n/README.md`.

## License

MIT
