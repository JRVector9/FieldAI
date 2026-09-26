import asyncio
import os
from playwright.async_api import async_playwright, expect


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        late_ready, release_late = asyncio.Event(), asyncio.Event()
        errors = []
        try:
            page = await browser.new_page(viewport={"width": 320, "height": 720})
            page.set_default_timeout(8000)
            page.on("pageerror", lambda error: errors.append(str(error)))
            async def record_failure(response):
                if "/messages" in response.url and response.status >= 400:
                    print("Synthetic widget API failure:", response.status, await response.text())
            page.on("response", record_failure)
            await page.goto(os.environ["AP_WIDGET_TEST_ORIGIN"], wait_until="networkidle")
            frame = page.frame_locator("iframe")
            await expect(frame.locator("#status")).to_have_text("상담 연결 준비 완료")
            await frame.locator("#question").fill("사업 안내가 궁금합니다.")
            await frame.locator("#ask").click()
            await expect(frame.locator("#transcript")).to_contain_text("승인된 안내입니다.")

            async def delay_answer(route):
                response = await route.fetch()
                assert response.status == 200
                late_ready.set()
                await release_late.wait()
                if os.environ.get("AP_WIDGET_LATE_RESPONSE") == "transcript":
                    await route.abort()
                else:
                    await route.fulfill(response=response)

            late_path = "**/v1/engagements/*" if os.environ.get("AP_WIDGET_LATE_RESPONSE") == "transcript" else "**/v1/engagements/*/messages"
            await page.route(late_path, delay_answer)
            await frame.locator("#question").fill("늦게 표시될 합성 질문입니다.")
            await frame.locator("#ask").click()
            await asyncio.wait_for(late_ready.wait(), 10)
            ended = await page.request.get(os.environ["AP_WIDGET_TEST_ORIGIN"] + "/end")
            assert ended.status == 200, await ended.text()
            await frame.locator("#continue").click()
            await expect(frame.locator("#new-conversation")).to_be_visible()
            await expect(frame.locator("#question")).to_be_disabled()
            await expect(frame.locator("#question")).to_have_value("")
            await expect(frame.locator("#transcript li")).to_have_count(0)
            await expect(frame.locator("#continue")).to_be_disabled()

            dropped = False

            async def lose_restart_response(route):
                nonlocal dropped
                body = route.request.post_data_json
                if not dropped and body and body.get("startNewFrom"):
                    dropped = True
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort()
                else:
                    await route.continue_()

            await page.route("**/v1/embed/engagements", lose_restart_response)
            await frame.locator("#new-conversation").click()
            await expect(frame.locator("#new-conversation")).to_be_hidden()
            await expect(frame.locator("#question")).to_be_enabled()
            await expect(frame.locator("#status")).to_contain_text("새 상담")
            release_late.set()
            await page.wait_for_load_state("networkidle")
            await expect(frame.locator("#transcript li")).to_have_count(0)
            await expect(frame.locator("#provisional-answer")).to_be_hidden()
            await expect(frame.locator("#question")).to_have_value("")
            await expect(frame.locator("#status")).to_contain_text("새 상담")
            assert dropped
            active_frame = next(f for f in page.frames if "/frame" in f.url)
            assert await active_frame.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            await page.locator("iframe").screenshot(path="/tmp/ap-widget-ended-320.png")
            assert not errors, errors
            print("AP native widget lifetime: passed; committed response loss recovered; late old answer discarded; no duplicate conversation")
        finally:
            release_late.set()
            await browser.close()


asyncio.run(main())
