#!/usr/bin/env python3
"""
Auto-post AI video variants to TikTok.

Posts 1 AI video per run from AI_VIDEOS.md (Hook Variants table),
skipping already posted ones. Tracks posted videos in TIKTOK_POSTED_AI_VIDEOS.md.

Usage:
    python code/auto-post-tiktok-ai-video.py
    python code/auto-post-tiktok-ai-video.py --dry-run
"""

import re
import os
import sys
from datetime import datetime
from tiktokautouploader import upload_tiktok

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

AI_VIDEOS_PATH = os.path.join(PROJECT_DIR, 'AI_VIDEOS.md')
POSTED_PATH = os.path.join(PROJECT_DIR, 'TIKTOK_POSTED_AI_VIDEOS.md')

ACCOUNT_NAME = 'the.pom.app'
POSTS_PER_RUN = 1


def parse_ai_videos():
    """Parse AI_VIDEOS.md Hook Variants table."""
    with open(AI_VIDEOS_PATH, 'r') as f:
        content = f.read()

    videos = []
    pattern = r'\|\s*([\d.]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*\[watch\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|'

    for match in re.finditer(pattern, content):
        number = match.group(1).strip()
        video = match.group(2).strip()
        hook = match.group(3).strip()
        video_path = match.group(4).strip()
        caption_cell = match.group(5).strip()

        caption_path = None
        caption_match = re.search(r'\[caption\]\(([^)]+)\)', caption_cell)
        if caption_match:
            caption_path = caption_match.group(1)

        videos.append({
            'number': number,
            'video': video,
            'hook': hook,
            'video_path': video_path,
            'caption_path': caption_path,
        })

    return videos


def get_posted_numbers():
    """Get already posted variant numbers from tracker."""
    try:
        with open(POSTED_PATH, 'r') as f:
            content = f.read()
        return re.findall(r'\*\*Video #:\*\*\s*([\d.]+)', content)
    except FileNotFoundError:
        return []


def add_to_posted(video, status='success'):
    """Append entry to posted tracker."""
    date = datetime.now().strftime('%Y-%m-%d')

    try:
        with open(POSTED_PATH, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        content = '# TikTok Posted AI Videos Tracker\n\n> Track AI video posts to TikTok from AI_VIDEOS.md\n\n---\n'

    entry = f"""
## {date}

### #{video['number']} - {video['video']} (hook: {video['hook']})
**Video #:** {video['number']}
**Posted:** {date}
**Status:** {status}

---
"""
    content += entry
    with open(POSTED_PATH, 'w') as f:
        f.write(content)


def post_one_video(video):
    """Post a single video to TikTok."""
    video_file = os.path.join(PROJECT_DIR, video['video_path'])
    if not os.path.exists(video_file):
        print(f'  File not found: {video["video_path"]}')
        return False

    size_mb = os.path.getsize(video_file) / (1024 * 1024)
    print(f'  File: {video["video_path"]} ({size_mb:.1f} MB)')

    # Load caption
    caption = f'{video["video"]} #pom #ingredients'
    if video['caption_path']:
        caption_file = os.path.join(PROJECT_DIR, video['caption_path'])
        if os.path.exists(caption_file):
            with open(caption_file, 'r') as f:
                caption = f.read().strip()
            print(f'  Caption loaded ({len(caption)} chars)')
    else:
        print('  No caption file, using default')

    print('  Uploading to TikTok...')
    upload_tiktok(
        video=video_file,
        description=caption,
        accountname=ACCOUNT_NAME,
        headless=True,
    )

    add_to_posted(video)
    return True


def main():
    dry_run = '--dry-run' in sys.argv

    print('=' * 50)
    print('  TikTok AI Video Auto-Poster (1/run, 3x/day)')
    print(f'  {datetime.now().isoformat()}')
    if dry_run:
        print('  ** DRY RUN **')
    print('=' * 50)
    print()

    all_videos = parse_ai_videos()
    print(f'Total variants: {len(all_videos)}')

    posted_numbers = get_posted_numbers()
    print(f'Already posted: {len(posted_numbers)} ({", ".join(posted_numbers) if posted_numbers else "none"})')

    unposted = [v for v in all_videos if v['number'] not in posted_numbers]
    print(f'Unposted: {len(unposted)}')

    if not unposted:
        print('\nNo unposted variants available!')
        return

    batch = unposted[:POSTS_PER_RUN]
    print(f'\nPosting {len(batch)} video(s) this run:\n')

    posted_count = 0
    for i, video in enumerate(batch):
        print(f'--- [{i + 1}/{len(batch)}] #{video["number"]} - {video["video"]} (hook: {video["hook"]}) ---')

        if dry_run:
            print(f'  [dry-run] Would post: {video["video_path"]}\n')
            continue

        try:
            if post_one_video(video):
                print('  Posted!\n')
                posted_count += 1
        except Exception as e:
            print(f'  FAILED: {e}\n')

    print('=' * 50)
    print(f'  Done! Posted {posted_count}/{len(batch)}')
    print('=' * 50)


if __name__ == '__main__':
    main()
