# Cross-Post to Instagram Workflow

This document describes the complete workflow for generating TikTok slideshows and cross-posting them to Instagram as carousels.

## Overview

```
TikTok (9:16) → Crop (4:5) → Instagram Carousel
```

1. **Generate** TikTok slideshow (9:16, 1080x1920)
2. **Crop** for Instagram (4:5, 1080x1350) with rule-of-thirds text alignment
3. **Post** to Instagram via Graph API

---

## Step 1: Generate TikTok Slideshow

```bash
node code/generate-slideshow-v2.js
```

### With Category & Topic Control

```bash
# Force a specific category
FORCE_CATEGORY=SKIN node code/generate-slideshow-v2.js
FORCE_CATEGORY=EATING node code/generate-slideshow-v2.js
FORCE_CATEGORY=INHALATION node code/generate-slideshow-v2.js

# Add topic guidance for variety
FORCE_CATEGORY=SKIN TOPIC_HINT="Focus on SUNSCREEN, not moisturizers" node code/generate-slideshow-v2.js
FORCE_CATEGORY=EATING TOPIC_HINT="Focus on PROTEIN BARS, not kids snacks" node code/generate-slideshow-v2.js
FORCE_CATEGORY=INHALATION TOPIC_HINT="Focus on CLEANING PRODUCTS, not candles" node code/generate-slideshow-v2.js
```

### Output

- Creates folder in `output/` with timestamp and topic name
- Contains: `slide_1.jpg`, `slide_2.jpg`, ... `metadata.json`, `preview.html`
- Opens preview in browser

---

## Step 2: Crop for Instagram

```bash
node code/crop-for-instagram.js <folder-name>
```

### Examples

```bash
# Specific folder
node code/crop-for-instagram.js 2026-02-04T16-30-05_hidden-dangers-in-household-cl

# Most recent 3 folders
node code/crop-for-instagram.js

# All folders without instagram/ subfolder
node code/crop-for-instagram.js --all
```

### What It Does

- Reads `metadata.json` to get text positions
- Crops 9:16 → 4:5 with smart positioning:
  - **Top text** (y=650) → crop 200px from top → text at upper third
  - **Center text** (y=900) → crop 450px from top → text at upper third
  - **Bottom-safe text** (y=1150) → crop 250px from top → text at lower third
  - **Screenshots** → center crop (285px from top/bottom)
- Creates `instagram/` subfolder with cropped images

### Rule of Thirds Alignment

```
4:5 Instagram (1080x1350)
┌─────────────────────┐
│                     │
├─────────────────────┤ ← Upper third line (y=450)
│                     │
│                     │
├─────────────────────┤ ← Lower third line (y=900)
│                     │
└─────────────────────┘
```

---

## Step 3: Post to Instagram

```bash
node code/post-to-instagram.js <folder-name>
```

### Examples

```bash
# Specific folder
node code/post-to-instagram.js 2026-02-04T16-30-05_hidden-dangers-in-household-cl

# Most recent folder with instagram/ subfolder
node code/post-to-instagram.js
```

### What It Does

1. Uploads images to Firebase Storage (temporary signed URLs)
2. Creates Instagram carousel item containers
3. Creates carousel parent container with caption
4. Waits 10 seconds for processing
5. Publishes to feed
6. Logs to `INSTAGRAM_POSTED_VIDEOS.md`

### Caption Handling

- Instagram limit: 2200 characters
- Script truncates at sentence boundary if needed
- Hashtags appended at end

---

## Complete Workflow Example

```bash
# 1. Generate slideshow about sunscreen
FORCE_CATEGORY=SKIN TOPIC_HINT="Focus on SUNSCREEN controversy - oxybenzone, octinoxate, Hawaii ban, coral reef damage" node code/generate-slideshow-v2.js

# 2. Crop for Instagram (use the folder name from output)
node code/crop-for-instagram.js 2026-02-04T16-08-49_hidden-risks-in-popular-sunscr

# 3. Post to Instagram
node code/post-to-instagram.js 2026-02-04T16-08-49_hidden-risks-in-popular-sunscr
```

---

## Batch Processing

### Generate 3 Slideshows (One Per Category)

Run sequentially (not parallel) to avoid emulator conflicts:

```bash
FORCE_CATEGORY=SKIN TOPIC_HINT="Sunscreen or makeup" node code/generate-slideshow-v2.js
FORCE_CATEGORY=EATING TOPIC_HINT="Protein bars or energy drinks" node code/generate-slideshow-v2.js
FORCE_CATEGORY=INHALATION TOPIC_HINT="Cleaning products or laundry" node code/generate-slideshow-v2.js
```

### Crop All Recent

```bash
node code/crop-for-instagram.js --all
```

---

## Tracking Files

| File | Purpose |
|------|---------|
| `CURRENT_POSTED_VIDEOS.md` | TikTok posts tracker |
| `INSTAGRAM_POSTED_VIDEOS.md` | Instagram posts tracker |
| `output/<folder>/metadata.json` | Slideshow metadata |
| `output/<folder>/instagram/` | Cropped 4:5 images |

---

## Configuration

### Instagram API (in `code/post-to-instagram.js`)

```javascript
const IG_USER_ID = '17841467650044681';  // Instagram Business Account ID
const ACCESS_TOKEN = '...';              // Facebook Graph API token (60-day)
```

### Firebase Storage (for image hosting)

```javascript
const serviceAccountPath = '/Users/lucy/pom/mcp-pom-functions/pom-service-accounts/dev.json';
storageBucket: 'scany-dev.appspot.com'
```

### Token Permissions Required

- `pages_show_list`
- `instagram_basic`
- `instagram_content_publish`
- `pages_read_engagement`

---

## Troubleshooting

### "Caption too long"
- Instagram limit is 2200 characters
- Script auto-truncates at sentence boundary

### "Object does not exist" error
- Check access token hasn't expired (60-day tokens)
- Verify Instagram Business Account ID
- Ensure token has required permissions

### Screenshots failing
- Run generations sequentially, not in parallel
- Emulator needs to be running: `~/Library/Android/sdk/emulator/emulator -avd Medium_Phone`

### Content too similar
- Use `TOPIC_HINT` to guide research away from repeated angles
- Check `CURRENT_POSTED_VIDEOS.md` for what's been covered
- The script auto-loads posted products to avoid duplicates

---

---

## Automated Posting (12pm, 5pm, 10pm)

### Option 1: n8n Workflow

Import the workflow file into n8n:

```bash
# File location
/Users/lucy/pom/video_gen/n8n-instagram-workflow.json
```

1. Open n8n
2. Go to Workflows → Import from File
3. Select `n8n-instagram-workflow.json`
4. Activate the workflow

### Option 2: macOS launchd (No n8n needed)

```bash
# Create logs directory
mkdir -p /Users/lucy/pom/video_gen/logs

# Copy plist to LaunchAgents
cp /Users/lucy/pom/video_gen/com.pom.instagram-autopost.plist ~/Library/LaunchAgents/

# Load the schedule
launchctl load ~/Library/LaunchAgents/com.pom.instagram-autopost.plist

# Check if loaded
launchctl list | grep pom

# To unload/stop
launchctl unload ~/Library/LaunchAgents/com.pom.instagram-autopost.plist
```

### Option 3: Manual cron

```bash
# Edit crontab
crontab -e

# Add these lines (12pm, 5pm, 10pm daily)
0 12 * * * cd /Users/lucy/pom/video_gen && /usr/local/bin/node code/auto-post-instagram.js >> logs/instagram-autopost.log 2>&1
0 17 * * * cd /Users/lucy/pom/video_gen && /usr/local/bin/node code/auto-post-instagram.js >> logs/instagram-autopost.log 2>&1
0 22 * * * cd /Users/lucy/pom/video_gen && /usr/local/bin/node code/auto-post-instagram.js >> logs/instagram-autopost.log 2>&1
```

### Auto-Post Script

The `auto-post-instagram.js` script:
1. Reads `CURRENT_POSTED_VIDEOS.md` for TikTok posts
2. Reads `INSTAGRAM_POSTED_VIDEOS.md` for already-posted
3. Picks the first unposted TikTok carousel
4. Crops it (if not already cropped)
5. Posts to Instagram
6. Logs to `INSTAGRAM_POSTED_VIDEOS.md`

```bash
# Manual run
node code/auto-post-instagram.js

# Check remaining unposted
node -e "import('./code/auto-post-instagram.js').then(m => console.log(m.getUnpostedFolders()))"
```

### Logs

```bash
# View logs
tail -f /Users/lucy/pom/video_gen/logs/instagram-autopost.log

# View errors
tail -f /Users/lucy/pom/video_gen/logs/instagram-autopost-error.log
```

---

## Token Refresh

Access tokens expire after 60 days. To refresh:

1. Go to [Facebook Access Token Tool](https://developers.facebook.com/tools/accesstoken/)
2. Or use Graph API Explorer with permissions:
   - `pages_show_list`
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
3. Update token in `code/post-to-instagram.js`
