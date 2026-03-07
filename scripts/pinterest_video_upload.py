#!/Users/admin/pom/content_gen/.venv/bin/python3
import asyncio
import argparse
import os
import random
import json
from pathlib import Path
from dotenv import load_dotenv
import zendriver as zd
from zendriver.cdp import input_ as cdp_input

load_dotenv()

EMAIL = os.getenv("PINTEREST_EMAIL")
PASSWORD = os.getenv("PINTEREST_PASSWORD")
LINK = "https://www.tiktok.com/@the.pom.app"
COOKIE_DIR = Path(__file__).parent.parent / ".pinterest_profile"


def human_delay(min_ms=500, max_ms=1800):
    return random.uniform(min_ms / 1000, max_ms / 1000)


def fix_chrome_crash_state(user_data_dir: str):
    """Patch Chrome profile to mark last session as clean, preventing 'Restore pages?' dialog."""
    # Fix Default/Preferences
    prefs_path = Path(user_data_dir) / "Default" / "Preferences"
    if prefs_path.exists():
        try:
            prefs = json.loads(prefs_path.read_text(encoding="utf-8"))
            profile = prefs.get("profile", {})
            if profile.get("exit_type") != "Normal" or profile.get("exited_cleanly") is not True:
                profile["exit_type"] = "Normal"
                profile["exited_cleanly"] = True
                prefs["profile"] = profile
                prefs_path.write_text(json.dumps(prefs, indent=3), encoding="utf-8")
        except Exception:
            pass

    # Fix Local State
    local_state_path = Path(user_data_dir) / "Local State"
    if local_state_path.exists():
        try:
            state = json.loads(local_state_path.read_text(encoding="utf-8"))
            if state.get("exited_cleanly") is not True:
                state["exited_cleanly"] = True
                local_state_path.write_text(json.dumps(state, indent=3), encoding="utf-8")
        except Exception:
            pass


async def real_click(page, element):
    """Puppeteer-style click: mouseMoved → mousePressed(buttons=1) → mouseReleased(buttons=0).
    Fixes zendriver's broken mouse_click which sends buttons=1 on release and skips mouseMoved."""
    pos = await element.apply("""(el) => {
        el.scrollIntoView({block: 'center'});
        const rect = el.getBoundingClientRect();
        return JSON.stringify({x: rect.x + rect.width / 2, y: rect.y + rect.height / 2});
    }""")
    coords = json.loads(pos)
    x, y = coords['x'], coords['y']
    tab = page._target

    # 1. Move mouse to element first
    await tab.send(cdp_input.dispatch_mouse_event(
        type_="mouseMoved", x=x, y=y
    ))
    await asyncio.sleep(0.1)

    # 2. Press (buttons=1 = left button held)
    await tab.send(cdp_input.dispatch_mouse_event(
        type_="mousePressed", x=x, y=y,
        button=cdp_input.MouseButton("left"),
        buttons=1,
        click_count=1,
    ))
    await asyncio.sleep(0.05)

    # 3. Release (buttons=0 = no buttons held) — this is the key fix
    await tab.send(cdp_input.dispatch_mouse_event(
        type_="mouseReleased", x=x, y=y,
        button=cdp_input.MouseButton("left"),
        buttons=0,
        click_count=1,
    ))


async def upload_pin(file_path: str, title: str, description: str, board_name: str):
    config = zd.Config()
    config.headless = False
    config.sandbox = False
    config.browser_executable_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    config.browser_connection_timeout = 3
    config.browser_connection_max_tries = 10
    config.add_argument("--disable-notifications")
    config.add_argument("--deny-permission-prompts")
    config.add_argument("--disable-features=PasswordManager,PasswordManagerOnboarding")
    config.add_argument("--disable-session-crashed-bubble")
    config.add_argument("--noerrdialogs")
    config.user_data_dir = str(COOKIE_DIR)
    fix_chrome_crash_state(str(COOKIE_DIR))
    browser = await zd.start(config)

    try:
        page = await browser.get("https://www.pinterest.com/")
        await asyncio.sleep(human_delay(2000, 3500))

        # Check if we need to log in
        needs_login = False
        try:
            await page.find("input[name='id']", timeout=3)
            needs_login = True
        except Exception:
            pass

        if needs_login:
            print(json.dumps({"step": "login", "result": "logging in"}), flush=True)
            await page.get("https://www.pinterest.com/login/")
            await asyncio.sleep(human_delay(2000, 3500))
            email_field = await page.find("input[name='id']")
            await email_field.send_keys(EMAIL)
            await asyncio.sleep(human_delay())
            password_field = await page.find("input[name='password']")
            await password_field.send_keys(PASSWORD)
            await asyncio.sleep(human_delay())
            login_button = await page.find("button[type='submit']")
            await login_button.click()
            await asyncio.sleep(human_delay(4000, 6000))
        else:
            print(json.dumps({"step": "login", "result": "already logged in (cookie)"}), flush=True)

        # Navigate to Pin creation
        await page.get("https://www.pinterest.com/pin-creation-tool/")
        await asyncio.sleep(human_delay(3000, 5000))

        # Upload file
        file_input = await page.find("input[type='file']")
        await file_input.send_file(file_path)
        await asyncio.sleep(human_delay(5000, 8000))

        # Fill title
        title_field = await page.find("#storyboard-selector-title", timeout=15)
        await title_field.click()
        await asyncio.sleep(human_delay(300, 600))
        await title_field.send_keys(title)
        await asyncio.sleep(human_delay())

        # Fill description
        desc_field = await page.find("[aria-label='Add a detailed description']", timeout=10)
        await desc_field.click()
        await asyncio.sleep(human_delay(300, 600))
        await desc_field.send_keys(description)
        await asyncio.sleep(human_delay())

        # Fill link
        link_field = await page.find("#WebsiteField", timeout=10)
        await link_field.click()
        await asyncio.sleep(human_delay(300, 600))
        await link_field.send_keys(LINK)
        await asyncio.sleep(human_delay())

        # Publish — proper CDP click with mouseMoved + correct buttons
        await asyncio.sleep(human_delay(1000, 2000))
        try:
            done_btn = await page.find("[data-test-id='storyboard-creation-nav-done']", timeout=10)
            await real_click(page, done_btn)
            print(json.dumps({"step": "publish", "result": "real_click on publish"}), flush=True)
        except Exception as e:
            print(json.dumps({"step": "publish", "result": f"error: {e}"}), flush=True)

        # Wait for the post to go through
        await asyncio.sleep(10)

        print(json.dumps({"status": "success", "title": title, "board": board_name}))

    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))
    finally:
        await browser.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--description", required=True)
    parser.add_argument("--board", required=True)
    args = parser.parse_args()

    asyncio.run(upload_pin(args.file, args.title, args.description, args.board))
