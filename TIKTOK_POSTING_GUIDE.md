# TikTok Posting Guide

How to post photo carousels and videos to TikTok through their Content Posting API.

## Prerequisites

- TikTok Developer account with an approved app
- OAuth access token with `video.publish` scope
- For photo carousels: a verified domain (we use `media.thepom.app`)

## Photo Carousel (PULL_FROM_URL)

Photos **only** support `PULL_FROM_URL` — TikTok pulls images from public URLs you provide. `FILE_UPLOAD` is **not supported** for photos.

### 1. Host images on a verified domain

Images must be hosted on a domain you've verified in the TikTok Developer Portal. We use Firebase Storage + a Cloud Function at `media.thepom.app`.

```
https://media.thepom.app/slide_1738900000_1.jpg
https://media.thepom.app/slide_1738900000_2.jpg
```

TikTok accepts **JPG and WEBP only** — no PNG. Convert PNGs before uploading.

### 2. Call content/init

```
POST https://open.tiktokapis.com/v2/post/publish/content/init/
```

```json
{
  "post_mode": "DIRECT_POST",
  "media_type": "PHOTO",
  "post_info": {
    "title": "Your title here (max 90 chars)",
    "description": "Your caption here (max 4000 chars)",
    "privacy_level": "SELF_ONLY",
    "disable_comment": false,
    "auto_add_music": true
  },
  "source_info": {
    "source": "PULL_FROM_URL",
    "photo_images": [
      "https://media.thepom.app/slide_1.jpg",
      "https://media.thepom.app/slide_2.jpg",
      "https://media.thepom.app/slide_3.jpg"
    ],
    "photo_cover_index": 0
  }
}
```

Headers:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

Response:
```json
{
  "data": { "publish_id": "abc123" },
  "error": { "code": "ok", "message": "" }
}
```

### 3. Poll for status

```
POST https://open.tiktokapis.com/v2/post/publish/status/fetch/
```

```json
{
  "publish_id": "abc123"
}
```

Poll every 5 seconds until `status` is `PUBLISH_COMPLETE` or `FAILED`.

---

## Video (FILE_UPLOAD)

Videos support `FILE_UPLOAD` — you upload the video directly to TikTok's servers via a presigned URL. No domain verification needed.

### 1. Call video/init

**Important:** Videos use a different endpoint than photos, and the body format is different — no `media_type` or `post_mode` fields.

```
POST https://open.tiktokapis.com/v2/post/publish/video/init/
```

```json
{
  "post_info": {
    "title": "Your title here (max 90 chars)",
    "description": "Your caption here (max 4000 chars)",
    "privacy_level": "SELF_ONLY",
    "disable_comment": false,
    "disable_duet": false,
    "disable_stitch": false
  },
  "source_info": {
    "source": "FILE_UPLOAD",
    "video_size": 28000000,
    "chunk_size": 28000000,
    "total_chunk_count": 1
  }
}
```

For files under 64MB, use a single chunk (`chunk_size` = `video_size`, `total_chunk_count` = 1). For larger files, use 10MB chunks.

Response:
```json
{
  "data": {
    "publish_id": "abc123",
    "upload_url": "https://open-upload.tiktokapis.com/video/..."
  },
  "error": { "code": "ok", "message": "" }
}
```

### 2. Upload video chunks

Upload each chunk via PUT to the `upload_url`:

```
PUT <upload_url>
Content-Type: video/mp4
Content-Length: <chunk_size>
Content-Range: bytes <start>-<end>/<total_size>
```

For a single-chunk upload of a 28MB file:
```
Content-Range: bytes 0-27999999/28000000
```

Expect status `201` for the final chunk.

### 3. Poll for status

Same as photo carousel — poll `/v2/post/publish/status/fetch/` every 5 seconds.

---

## Common Gotchas

| Issue | Cause | Fix |
|-------|-------|-----|
| `url_ownership_unverified` | Image URLs are on an unverified domain | Verify domain in TikTok Developer Portal with a signature file |
| `unaudited_client_can_only_post_to_private_accounts` | Unaudited apps can only post to private accounts | Set the TikTok **account** to private (not just the post privacy) |
| `Invalid media_type or post_mode` | Using `/content/init/` for videos | Videos use `/video/init/` with no `media_type` or `post_mode` fields |
| `The request source info is empty or incorrect` | Using `FILE_UPLOAD` for photos | Photos only support `PULL_FROM_URL` |
| `The total chunk count is invalid` | Too many chunks | Use single chunk for files under 64MB |
| PNG images rejected | TikTok doesn't accept PNG | Convert to JPG before uploading |

## Endpoints Summary

| Action | Endpoint |
|--------|----------|
| Photo carousel post | `POST /v2/post/publish/content/init/` |
| Video post | `POST /v2/post/publish/video/init/` |
| Poll status | `POST /v2/post/publish/status/fetch/` |
| Creator info | `POST /v2/post/publish/creator_info/query/` |

## Using the Posting UI

```bash
# Photo carousel (pass an output folder)
node code/tiktok-posting-ui.js <output-folder-name>

# Video (pass a .mp4 file)
node code/tiktok-posting-ui.js <video-file.mp4>
```

Opens `http://localhost:3001` with a form that handles all the API calls, Firebase Storage uploads, and TikTok compliance requirements.
