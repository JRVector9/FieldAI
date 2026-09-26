import asyncio
import os
import re
import sys
from playwright.async_api import async_playwright


async def main(request_id: str):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto("http://localhost:3002/workspace", wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_label("이메일").first.fill(os.environ["FIELD_TEST_OWNER_EMAIL"])
            await page.get_by_label("비밀번호").first.fill(os.environ["FIELD_TEST_OWNER_PASSWORD"])
            await page.get_by_role("button", name="로그인").click()
            panel = page.locator("#external-inquiries")
            await panel.get_by_role("button", name=re.compile("사진 전달 고객")).click()
            await panel.get_by_text("Field에 비공개 복사 완료").wait_for()
            photo = panel.get_by_role("img", name="고객이 Field 전달에 동의한 문의 사진")
            await photo.wait_for()
            assert await photo.evaluate("image => image.complete && image.naturalWidth > 0")
            assert await panel.get_by_role("link", name="사진 저장").count() == 1
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print(f"Field external photo browser: {request_id} copied image at 320px")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
