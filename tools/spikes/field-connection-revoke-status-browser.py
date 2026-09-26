import asyncio
import os
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(8000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto("http://localhost:3002/workspace", wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_label("이메일").first.fill(os.environ["FIELD_TEST_OWNER_EMAIL"])
            await page.get_by_label("비밀번호").first.fill(os.environ["FIELD_TEST_OWNER_PASSWORD"])
            await page.get_by_role("button", name="로그인").click()
            await page.locator("#external-inquiries").get_by_role("heading", name="AP에서 전달된 문의").wait_for()
            await page.goto("http://localhost:3002/workspace/integrations", wait_until="domcontentloaded")
            await page.get_by_role("heading", name="연결 기록").wait_for()
            await page.get_by_text("Field 연결 해제됨").first.wait_for()
            await page.get_by_role("button", name="상태 새로고침").click()
            await page.get_by_text("AP 원격 회수: 완료", exact=False).first.wait_for()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("Field connection revoke browser: 320px AP recovery ACK passed")
        except Exception:
            print("Recovery status UI:", (await page.locator("body").inner_text())[:1000], flush=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
