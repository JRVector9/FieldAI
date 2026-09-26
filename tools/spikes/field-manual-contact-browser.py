import asyncio
import os
from playwright.async_api import async_playwright


async def main():
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
            panel = page.locator("#owner-reservations")
            target = panel.locator(f'button[data-reservation-id="{os.environ["FIELD_TEST_RESERVATION_ID"]}"]')
            await target.click()
            fallback = panel.get_by_role("region", name="연결 해제 후 직접 연락")
            await fallback.get_by_role("heading", name="AP 연결 해제 · 직접 연락 필요").wait_for()
            await panel.get_by_text("AP 처리: AP 사건 반영", exact=True).first.wait_for()
            await panel.get_by_text("AP 고객 알림: 고객 외부 알림 미발송 · 공급사 미연결", exact=True).wait_for()
            await fallback.get_by_text("Field 문자·카카오를 보내거나 알림 소유권을 자동으로 바꾸지 않습니다.", exact=False).wait_for()
            await fallback.get_by_role("checkbox", name="선택한 사건에 대해 실제로 표시한 직접 연락을 했습니다.").check()
            await fallback.get_by_role("button", name="직접 연락 사실 기록").click()
            await panel.get_by_text("Field 직접 연락 기록: 전화 · 연락 시도", exact=False).wait_for()
            await panel.get_by_text("고객에게 도달한 것으로 표시하지 않았습니다.", exact=False).wait_for()
            await page.reload(wait_until="networkidle")
            panel = page.locator("#owner-reservations")
            await panel.locator(f'button[data-reservation-id="{os.environ["FIELD_TEST_RESERVATION_ID"]}"]').click()
            await panel.get_by_text("Field 직접 연락 기록: 전화 · 연락 시도", exact=False).wait_for()
            await panel.get_by_text("AP 고객 알림: 고객 외부 알림 미발송 · 공급사 미연결", exact=True).wait_for()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("Field manual contact browser: 320px revoked reservation record and reload passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
