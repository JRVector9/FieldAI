import asyncio
import os
from playwright.async_api import async_playwright, expect


async def inspect(browser, origin, cookie, product, expired=False, cancel_fault=False):
    context = await browser.new_context(viewport={"width": 320, "height": 720})
    cookies = []
    for part in cookie.split("; "):
        name, value = part.split("=", 1)
        cookies.append({"name": name, "value": value, "url": origin})
    await context.add_cookies(cookies)
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        response = await page.goto(f"{origin}/workspace/usage", wait_until="networkidle")
        assert response and response.status == 200
        await page.get_by_role("link", name=f"{product} 체험·구독 상태 보기").click()
        assert page.url == f"{origin}/workspace/subscription"
        await page.get_by_role("heading", name=f"{product} 이용 상태").wait_for()
        await page.get_by_role("heading", name="카드 없는 체험").wait_for()
        if not expired:
            fail_get = True

            async def fail_subscription_get(route):
                nonlocal fail_get
                if route.request.method == "GET" and fail_get:
                    fail_get = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await page.route("**/v1/subscription", fail_subscription_get)
            await page.get_by_role("button", name="상태 새로고침").click()
            await page.get_by_text("구독 상태를 불러오지 못했습니다", exact=False).wait_for()
            await expect(page.get_by_role("heading", name="카드 없는 체험")).to_be_hidden()
            await page.get_by_role("button", name="상태 새로고침").focus()
            await page.keyboard.press("Enter")
            await page.get_by_role("heading", name="카드 없는 체험").wait_for()
            await page.unroute("**/v1/subscription", fail_subscription_get)
        if expired:
            await page.get_by_text("상태: 체험 종료", exact=False).wait_for()
            await page.get_by_text("기존 문의", exact=False).wait_for()
            await page.get_by_text("연결 해제", exact=False).wait_for()
            await page.get_by_text("자동 청구는 없습니다", exact=False).wait_for()
            if product == "Field" and os.environ.get("FIELD_SUBSCRIPTION_RESERVATION_ID"):
                reservation_id = os.environ["FIELD_SUBSCRIPTION_RESERVATION_ID"]
                await page.goto(f"{origin}/workspace", wait_until="networkidle")
                await page.locator(f'button[data-reservation-id="{reservation_id}"]').click()
                link = page.get_by_role("link", name="이 예약 기록 JSON 다운로드")
                await link.wait_for()
                assert await link.get_attribute("href") == f"/v1/owner/reservations/{reservation_id}/export"
                async with page.expect_download() as downloaded:
                    await link.click()
                assert (await downloaded.value).suggested_filename == f"field-reservation-{reservation_id}.json"
        elif cancel_fault:
            await page.get_by_text("체험 중", exact=False).wait_for()
            lose_cancel_response = True

            async def cancel_response_route(route):
                nonlocal lose_cancel_response
                if route.request.method == "POST" and lose_cancel_response:
                    lose_cancel_response = False
                    result = await route.fetch()
                    assert result.status == 200
                    await route.abort("failed")
                else:
                    await route.continue_()

            await page.route("**/v1/subscription/cancel", cancel_response_route)
            await page.get_by_role("button", name="체험 종료 예약").click()
            await page.get_by_text("요청 결과를 확인하지 못했습니다", exact=False).wait_for()
            await expect(page.get_by_role("heading", name="카드 없는 체험")).to_be_hidden()
            await page.get_by_role("button", name="상태 새로고침").focus()
            await page.keyboard.press("Enter")
            await page.get_by_text("종료 예약 기록", exact=False).wait_for()
            await expect(page.get_by_role("button", name="체험 종료 예약")).to_be_hidden()
            await page.unroute("**/v1/subscription/cancel", cancel_response_route)
        else:
            await page.get_by_role("checkbox", name="14일 체험(로컬 검수용)을 시작하는 데 동의합니다.").check()
            lose_trial_response = True

            async def trial_response_route(route):
                nonlocal lose_trial_response
                if route.request.method == "POST" and lose_trial_response:
                    lose_trial_response = False
                    result = await route.fetch()
                    assert result.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            await page.route("**/v1/subscription/trial", trial_response_route)
            await page.get_by_role("button", name=f"{product} 체험 시작").click()
            await page.get_by_text("요청 결과를 확인하지 못했습니다", exact=False).wait_for()
            await expect(page.get_by_role("heading", name="카드 없는 체험")).to_be_hidden()
            await page.get_by_role("button", name="상태 새로고침").click()
            await page.unroute("**/v1/subscription/trial", trial_response_route)
            await page.get_by_text("체험 중", exact=False).wait_for()
            await page.get_by_text("자동 청구는 없습니다", exact=False).wait_for()
        assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert not errors, errors
    finally:
        await context.close()


async def main():
    mode = os.environ.get("FIELD_SUBSCRIPTION_BROWSER_MODE")
    expired = mode == "expired"
    cancel_fault = mode == "cancel_fault"
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            await inspect(browser, "http://localhost:3001", os.environ["AP_SUBSCRIPTION_COOKIE"],
                          "AP", expired, cancel_fault)
            await inspect(browser, "http://127.0.0.1:3002", os.environ["FIELD_SUBSCRIPTION_COOKIE"],
                          "Field", expired, cancel_fault)
            print("both expired trial screens passed" if expired else
                  "both cancel fault screens passed" if cancel_fault else "both trial screens passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
