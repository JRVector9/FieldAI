import asyncio
import os
from playwright.async_api import async_playwright


async def main():
    reservation_id = os.environ["FIELD_TEST_RESERVATION_ID"]
    receipt_key = os.environ["FIELD_TEST_RESERVATION_RECEIPT"]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto(f"http://localhost:3002/reservation/{reservation_id}",
                                       wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_label("예약 확인키").fill(receipt_key)
            await page.get_by_role("button", name="예약 열기").click()
            await page.get_by_text("확인키·사진·변경·취소 관리", exact=True).click()
            route = page.get_by_role("region", name="예약 알림 담당 경로")
            await route.get_by_role("heading", name="이 예약의 향후 처리 알림").wait_for()
            if os.environ.get("FIELD_ROUTE_CONSENT_READY") == "1":
                await route.get_by_text("이전 AP 사건의 종료 결과를 대조하는 중입니다.", exact=False).wait_for()
            else:
                await route.get_by_role("checkbox", name="이 예약의 향후 처리 알림 담당을 Field로 변경하는 데 동의합니다.").check()
                await route.get_by_role("button", name="향후 Field 알림 경로 동의").click()
                await route.get_by_text("고객 동의를 저장했습니다.", exact=False).wait_for()
            await page.goto("http://localhost:3002/workspace?mode=login", wait_until="networkidle")
            await page.get_by_label("이메일").first.fill(os.environ["FIELD_TEST_OWNER_EMAIL"])
            await page.get_by_label("비밀번호").first.fill(os.environ["FIELD_TEST_OWNER_PASSWORD"])
            await page.locator('form button[type="submit"]').click()
            await page.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="예약").click()
            panel = page.locator("#owner-reservations")
            await panel.locator(f'button[data-reservation-id="{reservation_id}"]').click()
            transfer = panel.get_by_role("region", name="향후 예약 알림 경로 전환")
            await transfer.get_by_text("고객 동의가 저장됐습니다.", exact=False).wait_for()
            await transfer.get_by_role("button", name="이전 AP 사건 대조·향후 Field 알림 경로 활성화").click()
            await transfer.get_by_text("현재: Field 세대 2").wait_for()
            await page.goto(f"http://localhost:3002/reservation/{reservation_id}",
                            wait_until="networkidle")
            await page.get_by_label("예약 확인키").fill(receipt_key)
            await page.get_by_role("button", name="예약 열기").click()
            await page.get_by_text("확인키·사진·변경·취소 관리", exact=True).click()
            route = page.get_by_role("region", name="예약 알림 담당 경로")
            await route.get_by_text("이후 새 예약 사건은 Field가 알림을 담당합니다.", exact=False).wait_for()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("Field notification route browser: 320px customer route, owner activation, customer state passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
