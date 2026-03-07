# LaunchD Scheduled Tasks (macOS)

This directory contains example LaunchD plist files for scheduling automated content posting.

## Setup

1. Copy the example plist files to `~/Library/LaunchAgents/`
2. Edit each plist to update:
   - `WorkingDirectory` to your content-gen path
   - `ProgramArguments` paths to match your installation
   - `StandardOutPath` and `StandardErrorPath` log paths
3. Load the agents:

```bash
launchctl load ~/Library/LaunchAgents/com.example.tiktok-autopost.plist
```

## Available Schedules

- **tiktok-autopost**: Posts TikTok slideshows 3x daily (8:20am, 12:20pm, 8:20pm)
- **instagram-autopost**: Cross-posts TikTok content to Instagram
- **x-autopost**: Cross-posts Instagram content to X
- **reddit-autopost**: Posts to relevant subreddits
- **pinterest-autopost**: Posts video pins
- **youtube-autopost**: Uploads to YouTube Shorts

## Checking Status

```bash
launchctl list | grep com.example
```

## Viewing Logs

```bash
tail -f ~/path/to/content-gen/logs/tiktok-autopost.log
```
