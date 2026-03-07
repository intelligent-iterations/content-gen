# Pinterest Auto-Poster Setup Guide

## Overview

Posts photos (slideshow images) and videos to Pinterest via browser automation (Zendriver). Uses Grok API for generating titles/descriptions. No Pinterest API key needed.

## System Requirements

- macOS (LaunchAgent scheduling) or Linux (use cron instead)
- Node.js 22+
- Python 3.10+
- Chromium browser (installed via Playwright)

## 1. Install Node.js Dependencies

```bash
npm install axios dotenv
```

Only `axios` and `dotenv` are needed for the Pinterest script. The full `package.json` has other deps for the broader project.

## 2. Set Up Python Virtual Environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install zendriver playwright python-dotenv
playwright install chromium
```

## 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Grok API (xAI) — for generating Pinterest titles/descriptions
XAI_API_KEY=your_xai_api_key_here

# Pinterest login (for Zendriver browser automation)
PINTEREST_EMAIL=your@email.com
PINTEREST_PASSWORD=yourpassword
```

## 4. Directory Structure

The script expects this layout:

```
project-root/
├── .env
├── .venv/                          # Python virtual environment
├── code/
│   └── auto-post-pinterest.js      # Main auto-poster script
├── scripts/
│   └── pinterest_video_upload.py   # Zendriver upload script
├── output/                         # Slideshow content
│   ├── iteration3/                 # Iteration 3 slideshows (preferred)
│   │   └── <folder>/
│   │       ├── metadata.json
│   │       └── slide_1.jpg, slide_2.jpg, ...
│   └── <folder>/
│       ├── metadata.json
│       └── slide_1.jpg, slide_2.jpg, ...
├── videos/                         # Video content
│   └── <video-folder>/
│       ├── <name>-captioned.mp4    # Preferred (captioned version)
│       ├── <name>-final.mp4        # Fallback (no captions)
│       └── <name>-caption.txt      # Optional caption text
├── logs/                           # Auto-created log directory
└── PINTEREST_POSTED_VIDEOS.md      # Tracks what's been posted
```

### Content Metadata Format

Each slideshow folder must have a `metadata.json`:

```json
{
  "topic": "3 Snack Swaps for Healthier Choices",
  "hook": "3 snacks you think are healthy but aren't",
  "caption": "Your caption text here...",
  "hashtags": ["ingredientcheck", "healthyswaps"]
}
```

Videos don't need metadata — the script derives the topic from the folder name and reads `*-caption.txt` if present.

## 5. Usage

```bash
# Post one item (prefers photos, falls back to videos)
node code/auto-post-pinterest.js

# Dry run (shows what would be posted without uploading)
node code/auto-post-pinterest.js --dry-run

# Post only a photo
node code/auto-post-pinterest.js --type=photo

# Post only a video
node code/auto-post-pinterest.js --type=video
```

## 6. Scheduled Posting (macOS)

Load the LaunchAgent for 3x daily posting (7:15am, 1:15pm, 7:15pm):

```bash
launchctl load com.pom.pinterest-autopost.plist
```

To stop:

```bash
launchctl unload com.pom.pinterest-autopost.plist
```

**Important:** Update the paths in `com.pom.pinterest-autopost.plist` to match your machine:
- Node.js path (find with `which node`)
- Script path
- Working directory
- Log paths

### Scheduled Posting (Linux — use cron)

```bash
crontab -e
```

Add:

```
15 7,13,19 * * * cd /path/to/project && /path/to/node code/auto-post-pinterest.js >> logs/pinterest-autopost.log 2>&1
```

## 7. Board Mapping

The script auto-selects a Pinterest board based on topic keywords:

| Keywords | Board |
|---|---|
| skincare, cosmetics, skin, retinol, sunscreen | Skincare Ingredient Warnings |
| food, snack, candy, preservatives, grocery | Food Ingredient Warnings |
| air, candle, freshener, clean | Home & Air Quality Warnings |
| swap, alternative, healthier | Healthy Product Swaps |
| (anything else) | Product Ingredient Warnings |

Boards are created automatically on Pinterest if they don't exist.

## 8. Troubleshooting

**Browser doesn't open / Zendriver fails:**
- Make sure Chromium is installed: `.venv/bin/playwright install chromium`
- On headless servers, install Xvfb: `apt install xvfb` and run with `DISPLAY=:99`

**Pinterest login fails:**
- Pinterest may show a CAPTCHA after multiple logins — log in manually once to clear it
- Check email/password in `.env`

**Pinterest UI selectors changed:**
- Pinterest updates their UI periodically. If uploads fail, inspect `pinterest.com/pin-creation-tool/` and update the `data-test-id` selectors in `scripts/pinterest_video_upload.py`

**"No unposted content found":**
- All content in `output/` and `videos/` has been posted
- Check `PINTEREST_POSTED_VIDEOS.md` for what's tracked
- Add new content to the directories

## Files Reference

| File | Purpose |
|---|---|
| `code/auto-post-pinterest.js` | Main orchestrator: finds content, calls Grok, triggers upload |
| `scripts/pinterest_video_upload.py` | Zendriver browser automation for Pinterest upload |
| `.env` | API keys and Pinterest credentials |
| `com.pom.pinterest-autopost.plist` | macOS LaunchAgent for scheduled posting |
| `PINTEREST_POSTED_VIDEOS.md` | Tracker file (prevents duplicate posts) |
