#!/Users/admin/pom/content_gen/.venv/bin/python3
"""
YouTube Shorts uploader using Playwright + exported cookies.
No OAuth required. Export cookies from Cookie-Editor browser extension.

Usage:
  python scripts/youtube_upload.py --file video.mp4 --title "Title" --description "Desc"
  python scripts/youtube_upload.py --file video.mp4 --title "Title" --description "Desc" --schedule "02/21/2026, 14:00"
"""

import asyncio
import argparse
import json
import sys
import random
from pathlib import Path
from playwright.async_api import async_playwright

COOKIES_PATH = Path(__file__).parent.parent / "youtube_cookies.json"


def human_delay(min_ms=500, max_ms=1800):
    return random.uniform(min_ms, max_ms)


async def upload_short(file_path: str, title: str, description: str, schedule: str = None):
    async with async_playwright() as p:
        browser = await p.firefox.launch(headless=False)
        context = await browser.new_context()

        # Load cookies exported from Cookie-Editor
        with open(COOKIES_PATH, "r") as f:
            raw_cookies = json.load(f)

        playwright_cookies = []
        for c in raw_cookies:
            cookie = {
                "name": c["name"],
                "value": c["value"],
                "domain": c.get("domain", ".youtube.com"),
                "path": c.get("path", "/"),
            }
            if c.get("expirationDate"):
                cookie["expires"] = c["expirationDate"]
            if c.get("secure"):
                cookie["secure"] = c["secure"]
            if c.get("sameSite"):
                ss = c["sameSite"].lower()
                if ss in ("strict", "lax", "none"):
                    cookie["sameSite"] = ss.capitalize() if ss != "none" else "None"
            playwright_cookies.append(cookie)

        await context.add_cookies(playwright_cookies)
        page = await context.new_page()

        # Navigate to YouTube Studio
        print(json.dumps({"step": "navigate", "result": "going to studio"}), flush=True)
        await page.goto("https://studio.youtube.com")
        await page.wait_for_timeout(int(human_delay(3000, 5000)))

        # Check if we're logged in
        if "accounts.google.com" in page.url:
            print(json.dumps({"status": "error", "error": "cookies expired - redirected to login"}))
            await browser.close()
            return

        # Click upload button
        print(json.dumps({"step": "upload_btn", "result": "clicking upload"}), flush=True)
        await page.click("#upload-icon")
        await page.wait_for_timeout(int(human_delay(2000, 3000)))

        # Upload the video file
        file_input = page.locator("input[type='file']")
        await file_input.set_input_files(file_path)
        print(json.dumps({"step": "file_upload", "result": f"uploading {file_path}"}), flush=True)

        # Wait for upload dialog
        await page.wait_for_timeout(int(human_delay(5000, 8000)))

        # Set title (clear default and type new)
        title_input = page.locator("#textbox").first
        await title_input.click()
        await page.keyboard.press("Meta+a")
        await page.wait_for_timeout(200)
        await page.keyboard.type(title, delay=30)
        print(json.dumps({"step": "title", "result": title}), flush=True)
        await page.wait_for_timeout(int(human_delay(500, 1000)))

        # Set description
        desc_input = page.locator("#textbox").nth(1)
        await desc_input.click()
        await page.wait_for_timeout(200)
        await page.keyboard.type(description, delay=20)
        print(json.dumps({"step": "description", "result": "filled"}), flush=True)
        await page.wait_for_timeout(int(human_delay(500, 1000)))

        # Select "Not made for kids"
        not_for_kids = page.locator("tp-yt-paper-radio-button[name='NOT_MADE_FOR_KIDS']")
        await not_for_kids.click()
        await page.wait_for_timeout(int(human_delay(800, 1500)))

        # Click through to Visibility page (Next x3)
        for i in range(3):
            next_btn = page.locator("#next-button")
            await next_btn.click()
            print(json.dumps({"step": f"next_{i+1}", "result": "clicked"}), flush=True)
            await page.wait_for_timeout(int(human_delay(1500, 2500)))

        if schedule:
            # Click "Schedule" radio button
            schedule_radio = page.locator("tp-yt-paper-radio-button[name='SCHEDULE']")
            await schedule_radio.click()
            await page.wait_for_timeout(int(human_delay(800, 1500)))

            # Set date
            date_input = page.locator("#datepicker-trigger input")
            await date_input.click()
            await page.keyboard.press("Meta+a")
            await page.keyboard.type(schedule.split(",")[0].strip())
            await page.wait_for_timeout(500)

            # Set time
            time_input = page.locator("#time-of-day-trigger input")
            await time_input.click()
            await page.keyboard.press("Meta+a")
            await page.keyboard.type(schedule.split(",")[1].strip())
            await page.wait_for_timeout(int(human_delay(800, 1500)))

            # Click Schedule/Done
            done_btn = page.locator("#done-button")
            await done_btn.click()
            print(json.dumps({"step": "schedule", "result": schedule}), flush=True)
        else:
            # Set to Public
            public_radio = page.locator("tp-yt-paper-radio-button[name='PUBLIC']")
            await public_radio.click()
            await page.wait_for_timeout(int(human_delay(800, 1500)))

            # Click Done/Publish
            done_btn = page.locator("#done-button")
            await done_btn.click()
            print(json.dumps({"step": "publish", "result": "clicked done"}), flush=True)

        # Wait for upload to finish processing
        print(json.dumps({"step": "waiting", "result": "waiting for upload to complete"}), flush=True)
        await page.wait_for_timeout(15000)

        # Try to grab the video URL
        video_url = None
        try:
            link_el = page.locator("a.style-scope.ytcp-video-info")
            video_url = await link_el.get_attribute("href", timeout=5000)
        except Exception:
            pass

        if video_url:
            print(json.dumps({"status": "success", "title": title, "url": video_url}))
        else:
            print(json.dumps({"status": "success", "title": title, "url": "check YouTube Studio"}))

        await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--description", required=True)
    parser.add_argument("--schedule", default=None, help="Schedule: 'MM/DD/YYYY, HH:MM'")
    args = parser.parse_args()

    if not Path(COOKIES_PATH).exists():
        print(json.dumps({"status": "error", "error": f"cookies not found at {COOKIES_PATH}"}))
        print("Export cookies from Cookie-Editor extension -> save as youtube_cookies.json", file=sys.stderr)
        sys.exit(1)

    if not Path(args.file).exists():
        print(json.dumps({"status": "error", "error": f"video not found: {args.file}"}))
        sys.exit(1)

    asyncio.run(upload_short(args.file, args.title, args.description, args.schedule))
