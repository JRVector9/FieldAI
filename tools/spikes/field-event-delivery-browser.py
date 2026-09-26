import asyncio
import os
import re
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto("http://localhost:3002/workspace?mode=login", wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_label("이메일").first.fill(os.environ["FIELD_TEST_OWNER_EMAIL"])
            await page.get_by_label("비밀번호").first.fill(os.environ["FIELD_TEST_OWNER_PASSWORD"])
            await page.locator('form button[type="submit"]').click()
            await page.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="예약").click()
            panel = page.locator("#owner-reservations")
            await panel.get_by_role("button", name=re.compile("HTTP 전달 고객")).first.click()
            status = panel.get_by_role("region", name="AP 연결 예약 사건 상태")
            await status.get_by_role("heading", name="AP 전달·처리 상태").wait_for()
            await panel.get_by_text("AP에서 전달된 예약").wait_for()
            received = panel.get_by_role("region", name="Field 업무 수신 기록")
            await received.get_by_text("Field 업무 수신 기록", exact=True).click()
            await received.get_by_text("예약 업무 수행·고객 연락", exact=True).wait_for()
            await received.get_by_text("업무 종결 후 180일 · 사진 90일", exact=False).wait_for()
            await status.get_by_text("AP 처리: AP 사건 반영").first.wait_for()
            await status.get_by_text("AP 고객 알림: 고객 외부 알림 미발송 · 공급사 미연결").wait_for()
            await status.get_by_text("고객 열람: 열람 확인 없음").first.wait_for()
            await status.get_by_role("button", name="상태 새로고침").click()
            await status.get_by_text("AP 고객 알림: 고객 외부 알림 미발송 · 공급사 미연결").wait_for()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("Field event delivery browser: 320px Field/AP/customer state and refresh passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
