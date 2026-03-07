# Technical Paper: AI-Powered Content Generation & Distribution System

**Project:** content-gen
**Repository:** https://github.com/intelligent-iterations/content-gen
**Developer:** Intelligent Iterations
**Date:** March 2026

---

## Executive Summary

This document provides technical evidence of a production AI content generation and multi-platform distribution system that autonomously:

1. **Researches trending topics** using Grok-4 with tool-calling capabilities
2. **Generates viral carousel content** with AI image generation
3. **Captures real app screenshots** from Firebase via Android emulator
4. **Distributes to 6+ platforms** (TikTok, Instagram, X, Reddit, YouTube, Pinterest)
5. **Runs on automated schedules** via macOS LaunchD

The system has generated **46,432 total views** across **89 TikTok videos** and **105 Instagram posts** with measurable engagement metrics.

**Live Platform Stats (as of March 7, 2026):**
- **TikTok:** [@the.pom.app](https://www.tiktok.com/@the.pom.app) — 37 followers, 1,225 likes, 89 videos
- **Instagram:** [@the.pom.app](https://www.instagram.com/the.pom.app/) — 34 followers, 105 posts

---

## 1. System Architecture

### 1.1 Content Generation Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CONTENT GENERATION PIPELINE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │   AI        │    │   Content    │    │    Image     │           │
│  │  Research   │───▶│  Generation  │───▶│  Generation  │           │
│  │  (Grok-4)   │    │   (Grok-4)   │    │ (Replicate)  │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│         │                                       │                    │
│         ▼                                       ▼                    │
│  ┌──────────────┐                       ┌──────────────┐            │
│  │  Web Scrape  │                       │    Text      │            │
│  │ (Playwright) │                       │   Overlay    │            │
│  │  + Images    │                       │   (Sharp)    │            │
│  └──────────────┘                       └──────────────┘            │
│                                                │                     │
│                                                ▼                     │
│                                         ┌──────────────┐            │
│                                         │  Screenshot  │            │
│                                         │   Capture    │            │
│                                         │  (Emulator)  │            │
│                                         └──────────────┘            │
│                                                │                     │
│                                                ▼                     │
│                    ┌─────────────────────────────────────────┐      │
│                    │         MULTI-PLATFORM DISTRIBUTION      │      │
│                    ├─────────────────────────────────────────┤      │
│                    │  TikTok │ Instagram │ X │ Reddit │ YT   │      │
│                    └─────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| AI Research | Grok-4 (xAI) | Autonomous topic research with tool-calling |
| Image Generation | Replicate (Seedream-4) | Realistic product photos |
| Web Scraping | Playwright | Ingredient lists, product images |
| Text Overlays | Sharp | TikTok-safe text compositing |
| Screenshot Capture | Android Emulator | Real Firebase app data |
| Distribution | Platform APIs | TikTok, Instagram, X, YouTube, Pinterest, Reddit |
| Scheduling | LaunchD (macOS) | 3x daily automated posting |

---

## 2. API Integration Evidence

### 2.1 Grok-4 Tool-Calling Integration

The system implements a sophisticated tool-calling loop with Grok-4:

**From `code/ai-orchestrator.js`:**
```javascript
const tools = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_webpage",
      description: "Read a webpage and extract content",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          extract: { type: "string", enum: ["ingredients", "full_text"] }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "finish_research",
      description: "Complete research and proceed to content generation"
    }
  }
];

// Research loop with up to 15 iterations
for (let i = 0; i < 15; i++) {
  const response = await grok.chat.completions.create({
    model: "grok-4-1-fast",
    messages: conversationHistory,
    tools: tools,
    tool_choice: "auto"
  });

  // Execute tool calls and continue loop
  for (const toolCall of response.choices[0].message.tool_calls) {
    const result = await executeToolCall(toolCall);
    conversationHistory.push({ role: "tool", content: result });
  }
}
```

### 2.2 Replicate Image Generation

**From `code/generate-image.js`:**
```javascript
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

async function generateImage(prompt) {
  const output = await replicate.run(
    "seedream/seedream-4:latest",
    {
      input: {
        prompt: prompt,
        aspect_ratio: "9:16",
        num_outputs: 1
      }
    }
  );
  return output[0];
}
```

### 2.3 Multi-Platform API Integration

| Platform | API | Authentication | Capability |
|----------|-----|----------------|------------|
| TikTok | Content Posting API | OAuth 2.0 | Photo slideshow uploads |
| Instagram | Graph API | Bearer Token | Carousel posts |
| X (Twitter) | API v2 | OAuth 1.0a | Thread posting |
| YouTube | Data API v3 | OAuth 2.0 | Shorts upload |
| Pinterest | API v5 | OAuth 2.0 | Video pins |
| Reddit | OAuth API | OAuth 2.0 | Image posts |

---

## 3. Production Performance Data

> **Data Source:** Live metrics scraped from TikTok and Instagram on March 7, 2026

### 3.1 Platform Overview

| Platform | Handle | Followers | Posts | Total Engagement |
|----------|--------|-----------|-------|------------------|
| **TikTok** | [@the.pom.app](https://www.tiktok.com/@the.pom.app) | 37 | 89 videos | 1,225 likes, 46,432 views |
| **Instagram** | [@the.pom.app](https://www.instagram.com/the.pom.app/) | 34 | 105 posts | Active |

### 3.2 TikTok Video Performance (Live Data)

| Rank | Views | Video ID |
|------|-------|----------|
| 1 | **4,638** | [7589768933377461525](https://www.tiktok.com/@the.pom.app/video/7589768933377461525) |
| 2 | **2,518** | [7590871703643802901](https://www.tiktok.com/@the.pom.app/video/7590871703643802901) |
| 3 | **1,743** | [7597479356851670292](https://www.tiktok.com/@the.pom.app/video/7597479356851670292) |
| 4 | **1,711** | [7501512585209040134](https://www.tiktok.com/@the.pom.app/video/7501512585209040134) |
| 5 | **1,393** | [7604611393165298965](https://www.tiktok.com/@the.pom.app/video/7604611393165298965) |
| 6 | **1,057** | [7576866709315980564](https://www.tiktok.com/@the.pom.app/video/7576866709315980564) |
| 7 | **1,030** | [7586098446570900757](https://www.tiktok.com/@the.pom.app/video/7586098446570900757) |
| 8 | **1,022** | [7583602152510197012](https://www.tiktok.com/@the.pom.app/video/7583602152510197012) |
| 9 | **1,010** | [7603892752081751316](https://www.tiktok.com/@the.pom.app/video/7603892752081751316) |
| 10 | **987** | [7604196749334318356](https://www.tiktok.com/@the.pom.app/video/7604196749334318356) |

**Full View Distribution (89 videos):**
```
4638, 2518, 1743, 1711, 1393, 1057, 1030, 1022, 1010, 987,
954, 910, 900, 873, 860, 852, 846, 793, 787, 767,
767, 760, 760, 732, 727, 721, 719, 709, 699, 698,
693, 689, 677, 671, 659, 647, 494, 492, 459, 432,
416, 402, 373, 355, 336, 333, 310, 285, 263, 246,
244, 239, 232, 226, 205, 198, 196, 190, 189, 182,
166, 163, 153, 151, 151, 150, 143, 141, 130, 118,
117, 115, 111, 108, 82, 66, 52, 30, 9, 0,
0, 0, 0, 0, 0, 0, 0, 0, 0
```

**Aggregate Stats:**
- **Total Views:** 46,432
- **Total Videos:** 89
- **Average Views/Video:** 522
- **Top 10 Average:** 1,711 views
- **Videos over 1,000 views:** 9 (10%)
- **Videos over 700 views:** 28 (31%)
- **Videos over 500 views:** 36 (40%)
- **Videos with 0 views:** 10 (11%)

### 3.3 Performance Insights

| Metric | Value | Insight |
|--------|-------|---------|
| **Best Video** | 4,638 views | 8.9x average performance |
| **Median Views** | 336 | Consistent baseline |
| **View-to-Like Ratio** | 1,225 likes / 46K views | ~2.6% engagement |
| **Growth Trend** | 37 followers | Organic growth from content |
| **Top 10 Concentration** | 17,109 views | 37% of total views |

### 3.4 Content Category Analysis

| Category | Performance | Notes |
|----------|-------------|-------|
| **EATING (Food)** | Highest engagement | "Banned in Europe" hooks work best |
| **INHALATION (Home)** | Strong dwell time | Air fresheners resonate |
| **SKIN (Skincare)** | Lower completion | Needs hook optimization |

---

## 4. Content Generation Evidence

### 4.1 Example Generated Carousel

**Video 8: Controversial Ingredients in 'Healthy' Protein Bars**
- **Category:** EATING
- **Hook:** "Your 'healthy' protein bar is hiding THIS"
- **Products:** Quest Protein Bar (Sucralose, artificial sweeteners)
- **Slides:** 4 (3 product + 1 screenshot)
- **Performance:** 718 views, 5 comments, 60% completion rate (highest)

### 4.2 AI Research Log Example

```
Research iteration 1/15
  Tool: web_search
  Query: "Quest protein bar ingredients controversial"
  Found 5 results

Research iteration 2/15
  Tool: read_webpage
  URL: "https://incidecoder.com/products/quest-protein-bar"
  Extracted full ingredient list

Research iteration 3/15
  Tool: finish_research
  Research complete!

Pages read: 1
Product images captured: 1
```

### 4.3 Output Structure

```
output/2026-02-04T16-18-42_controversial-ingredients-in-h/
├── metadata.json           # Full generation metadata
├── slide_1_hook.jpg        # AI-generated hook image
├── slide_2_product.jpg     # Product photo (AI or captured)
├── slide_3_screenshot.png  # Real app screenshot from Firebase
├── slide_4_cta.jpg         # Call-to-action slide
├── caption.txt             # Generated caption with hashtags
├── debug-report.html       # Full generation flow visualization
└── preview.html            # Carousel preview
```

---

## 5. Automated Distribution

### 5.1 LaunchD Schedule Configuration

The system runs 3x daily across platforms:

```xml
<!-- com.pom.tiktok-autopost.plist -->
<key>StartCalendarInterval</key>
<array>
    <dict>
        <key>Hour</key><integer>8</integer>
        <key>Minute</key><integer>20</integer>
    </dict>
    <dict>
        <key>Hour</key><integer>12</integer>
        <key>Minute</key><integer>20</integer>
    </dict>
    <dict>
        <key>Hour</key><integer>20</integer>
        <key>Minute</key><integer>20</integer>
    </dict>
</array>
```

### 5.2 Cross-Platform Tracking

The system tracks posted content to prevent duplicates:

```javascript
// From code/auto-post-instagram.js
const tiktokPosted = parseMarkdownFile('CURRENT_POSTED_VIDEOS.md');
const instagramPosted = parseMarkdownFile('INSTAGRAM_POSTED_VIDEOS.md');

// Find unposted content
const unposted = tiktokPosted.filter(
  folder => !instagramPosted.includes(folder)
);

// Post first unposted item
await postToInstagram(unposted[0]);
```

---

## 6. App Screenshot System

### 6.1 Real Firebase Data Integration

Screenshots capture actual app data from Firebase:

**From `code/emulator-screenshot.js`:**
```javascript
// Set App Check debug token for Firebase auth
await adb.shell(`setprop debug.firebase.appcheck ${DEBUG_TOKEN}`);

// Launch app with ingredient data
await adb.shell(`am start -n app.thepom/.MainActivity \
  --es ingredients "${ingredientList}"`);

// Wait for data to load from Firebase
await waitForElement('product_score_card');

// Capture screenshot at TikTok dimensions
await adb.shell('screencap -p /sdcard/screenshot.png');
await adb.pull('/sdcard/screenshot.png', outputPath);
```

### 6.2 Screenshot Integration

Screenshots show real product scores and ingredient breakdowns:
- Product name and score (0-100)
- Flagged ingredients with severity levels
- Scientific research citations
- Swap recommendations

---

## 7. Text Overlay System

### 7.1 TikTok Safe Zones

The system positions text to avoid TikTok UI elements:

| Zone | Y-Position | Purpose |
|------|------------|---------|
| Top | 650px (34%) | Hook text |
| Center | 900px (47%) | Emphasis |
| Bottom-Safe | 1150px (60%) | CTAs |

**Avoid Zones:**
- Top 120px (status bar, notch)
- Bottom 350-500px (captions, music)
- Right 150px (engagement buttons)

### 7.2 Text Rendering

**From `code/add-text-overlay.js`:**
```javascript
const sharp = require('sharp');

async function addTextOverlay(imagePath, text, position) {
  const svg = `
    <svg width="1080" height="1920">
      <text x="540" y="${getY(position)}"
            font-family="Helvetica"
            font-size="72"
            fill="white"
            text-anchor="middle"
            filter="drop-shadow(2px 2px 4px rgba(0,0,0,0.8))">
        ${text}
      </text>
    </svg>
  `;

  return sharp(imagePath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .toFile(outputPath);
}
```

---

## 8. Cost Analysis

### 8.1 Per-Slideshow Costs

| Component | Cost |
|-----------|------|
| Grok-4 API (~5k tokens with research) | ~$0.02-0.05 |
| Seedream-4 images (6 slides) | ~$0.02 |
| TikTok API | FREE |
| Instagram API | FREE |
| **Total per post** | **~$0.04-0.07** |

### 8.2 Monthly Projection

At 3 posts/day across platforms:
- 90 posts/month × $0.05 = **~$4.50/month** in API costs

---

## 9. Key Insights from Production

### 9.1 What Works

1. **"Banned in Europe" hooks** drive engagement (Pop-Tarts: 8 likes)
2. **"Healthy isn't healthy" angles** drive comments (Quest: 5 comments)
3. **Shorter carousels (4 slides)** have 50-65% completion vs 23-30% for 9-10 slides
4. **EATING content** consistently outperforms SKIN
5. **Home products** are underexplored winners (Glade: 10.2s dwell)
6. **Saves = purchase intent** (Sun Drop: 3 saves for grocery reference)

### 9.2 What Doesn't Work

1. **Luxury product angles** (La Mer: 470 views, 0 likes - worst)
2. **Long carousels** (23-30% completion)
3. **Generic "hidden dangers" hooks** for SKIN category
4. **Repeated "BANNED" hooks** lose impact over time
5. **Low brand recognition products** (Naturium: 3.9s dwell - lowest)

---

## 10. Platform Links

### 10.1 App Store Presence

- **iOS:** https://apps.apple.com/us/app/pom-ingredient-checker/id6737084514
- **Android:** https://play.google.com/store/apps/details?id=app.thepom
- **Website:** https://thepom.app
- **Product Hunt:** https://www.producthunt.com/products/pom-ingredient-checker

### 10.2 Social Media (Live Accounts)

| Platform | Handle | Link | Stats |
|----------|--------|------|-------|
| **TikTok** | @the.pom.app | https://www.tiktok.com/@the.pom.app | 37 followers, 1,225 likes |
| **Instagram** | @the.pom.app | https://www.instagram.com/the.pom.app/ | 34 followers, 105 posts |

---

## 11. Conclusion

This content generation system demonstrates production-grade capabilities in:

1. **Autonomous AI research** with Grok-4 tool-calling (up to 15 iterations)
2. **Multi-platform API integration** (TikTok, Instagram, X, YouTube, Pinterest, Reddit)
3. **Real data integration** with Firebase via Android emulator
4. **Scheduled automation** with macOS LaunchD
5. **Measurable results:**
   - **46,432 TikTok views** across 89 videos
   - **1,225 total likes** on TikTok
   - **105 Instagram posts** published
   - **Top video: 4,638 views** (8.9x average)
   - **9 videos exceed 1,000 views** (10%)
   - **28 videos exceed 700 views** (31%)

The system has been deployed in production since February 2026 and continues to generate and distribute content autonomously. All metrics are verifiable via the live social media accounts linked above.

---

**Repository:** https://github.com/intelligent-iterations/content-gen
**Developer:** Intelligent Iterations
**Contact:** support@intelligentiterations.com
