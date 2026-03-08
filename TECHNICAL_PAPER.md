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

The system has generated **82,967 total views** across both platforms with measurable engagement metrics:
- **TikTok:** 18,916 views across 33 AI-generated videos (since Jan 31, 2026)
- **Instagram:** 64,051 views across 67 posts

**Live Platform Stats (as of March 8, 2026):**
- **TikTok:** [@the.pom.app](https://www.tiktok.com/@the.pom.app) — 37 followers, 33 AI videos, 18.9K views
- **Instagram:** [@the.pom.app](https://www.instagram.com/the.pom.app/) — 34 followers, 67 posts, **12.2K top post**

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

> **Data Source:** Live metrics from TikTok profile and Instagram Professional Dashboard (March 8, 2026)

### 3.1 Platform Overview

> **Note:** TikTok metrics only include AI-generated content (Jan 31, 2026 onwards)

| Platform | Handle | Followers | Posts | Total Views | Top Post |
|----------|--------|-----------|-------|-------------|----------|
| **TikTok** | [@the.pom.app](https://www.tiktok.com/@the.pom.app) | 37 | 33 AI videos | 18,916 | 1,393 |
| **Instagram** | [@the.pom.app](https://www.instagram.com/the.pom.app/) | 34 | 67 posts | 64,051 | **12,200** |
| **Combined** | — | 71 | 100 posts | **82,967** | 12,200 |

### 3.2 TikTok Video Performance (AI-Generated Only)

> **Data Source:** AI-generated videos posted January 31, 2026 onwards

| Rank | Views | Date | Video ID |
|------|-------|------|----------|
| 1 | **1,393** | Feb 8 | [7604611393165298965](https://www.tiktok.com/@the.pom.app/video/7604611393165298965) |
| 2 | **1,010** | Feb 6 | [7603892752081751316](https://www.tiktok.com/@the.pom.app/video/7603892752081751316) |
| 3 | **987** | Feb 7 | [7604196749334318356](https://www.tiktok.com/@the.pom.app/video/7604196749334318356) |
| 4 | **873** | Feb 11 | [7605660888179264788](https://www.tiktok.com/@the.pom.app/video/7605660888179264788) |
| 5 | **860** | Feb 15 | [7607158490129386773](https://www.tiktok.com/@the.pom.app/video/7607158490129386773) |
| 6 | **852** | Feb 11 | [7605722974653517076](https://www.tiktok.com/@the.pom.app/video/7605722974653517076) |
| 7 | **846** | Feb 12 | [7606021584704294165](https://www.tiktok.com/@the.pom.app/video/7606021584704294165) |
| 8 | **787** | Feb 13 | [7606371506293181716](https://www.tiktok.com/@the.pom.app/video/7606371506293181716) |
| 9 | **767** | Feb 12 | [7606115019020832021](https://www.tiktok.com/@the.pom.app/video/7606115019020832021) |
| 10 | **732** | Feb 19 | [7608687444854181141](https://www.tiktok.com/@the.pom.app/video/7608687444854181141) |

**Full View Distribution (33 AI videos):**
```
1393, 1010, 987, 873, 860, 852, 846, 787, 767, 732,
727, 721, 719, 709, 699, 698, 693, 689, 671, 494,
459, 416, 373, 336, 310, 226, 205, 182, 151, 141,
108, 82, 0
```

**Aggregate Stats:**
- **Total Views:** 18,916
- **Total AI Videos:** 33
- **Average Views/Video:** 573
- **Top 10 Average:** 911 views
- **Videos over 700 views:** 14 (42%)
- **Videos over 500 views:** 19 (58%)
- **Videos with 0 views:** 1 (3%)

### 3.3 Instagram Post Performance (Live Data)

> **Data Source:** Instagram Professional Dashboard - Content Insights (March 8, 2026)

| Rank | Views | Description |
|------|-------|-------------|
| 1 | **12,200** | Top performer (viral) |
| 2 | **6,900** | Strong viral reach |
| 3 | **5,500** | High engagement |
| 4 | **2,600** | Above average |
| 5 | **2,300** | Above average |
| 6 | **2,300** | Above average |
| 7 | **1,900** | Strong performer |
| 8 | **1,700** | Strong performer |
| 9 | **1,300** | Good reach |
| 10 | **1,100** | Good reach |

**Instagram Aggregate Stats:**
- **Total Views:** 64,051
- **Total Posts:** 67
- **Average Views/Post:** 955
- **Top 10 Average:** 3,780 views
- **Posts over 5,000 views:** 3 (4%)
- **Posts over 1,000 views:** 13 (19%)
- **Posts over 500 views:** 28 (42%)

### 3.4 Cross-Platform Performance Insights

| Metric | TikTok (AI) | Instagram | Combined |
|--------|-------------|-----------|----------|
| **Total Views** | 18,916 | 64,051 | **82,967** |
| **Total Posts** | 33 | 67 | 100 |
| **Average Views** | 573 | 955 | 830 |
| **Top Post** | 1,393 | 12,200 | 12,200 |
| **Posts >700 views** | 14 (42%) | 24 (36%) | 38 (38%) |

### 3.5 Content Category Analysis

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
| **TikTok** | @the.pom.app | https://www.tiktok.com/@the.pom.app | 37 followers, 33 AI videos, 18.9K views |
| **Instagram** | @the.pom.app | https://www.instagram.com/the.pom.app/ | 34 followers, 67 posts, 64K views |

---

## 11. Conclusion

This content generation system demonstrates production-grade capabilities in:

1. **Autonomous AI research** with Grok-4 tool-calling (up to 15 iterations)
2. **Multi-platform API integration** (TikTok, Instagram, X, YouTube, Pinterest, Reddit)
3. **Real data integration** with Firebase via Android emulator
4. **Scheduled automation** with macOS LaunchD
5. **Measurable results:**
   - **82,967 total views** across both platforms
   - **18,916 TikTok views** across 33 AI-generated videos (since Jan 31, 2026)
   - **64,051 Instagram views** across 67 posts
   - **Top post: 12,200 views** on Instagram (14.7x average)
   - **14 TikTok videos exceed 700 views** (42%)
   - **3 Instagram posts exceed 5,000 views** (viral tier)

The system has been deployed in production since February 2026 and continues to generate and distribute content autonomously. All metrics are verifiable via the live social media accounts and Instagram Professional Dashboard linked above.

---

**Repository:** https://github.com/intelligent-iterations/content-gen
**Developer:** Intelligent Iterations
**Contact:** support@intelligentiterations.com
