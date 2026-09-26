import asyncio
import os
from playwright.async_api import async_playwright


async def main():
    origin = f"http://{os.environ['FIELD_TEST_TENANT_HOST']}"
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            site = await page.goto(f"{origin}/site/{os.environ['FIELD_TEST_TENANT_SLUG']}", wait_until="networkidle")
            assert site and site.status == 200
            home_url = page.url
            await page.get_by_role("link", name="서비스 안내").click()
            service_url = f"{home_url}/services"
            assert page.url == service_url
            await page.get_by_role("heading", name="Tenant A 전용 서비스").wait_for()
            await page.reload(wait_until="networkidle")
            await page.get_by_role("heading", name="Tenant A 전용 서비스").wait_for()
            await page.go_back(wait_until="networkidle")
            assert page.url == home_url
            await page.go_forward(wait_until="networkidle")
            assert page.url == service_url
            await page.get_by_role("heading", name="Tenant A 전용 서비스").wait_for()
            await page.get_by_role("link", name="직접 문의하기").click()
            assert page.url == f"{origin}/public/{os.environ['FIELD_TEST_TENANT_ORGANIZATION_ID']}"
            await page.get_by_role("button", name="문의 제출").wait_for()
            await page.get_by_role("navigation", name="고객 접수 유형").get_by_role("button", name="예약 요청").click()
            await page.get_by_role("button", name="예약 요청 제출").wait_for()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            other = await page.goto(f"{origin}/public/{os.environ['FIELD_TEST_OTHER_ORGANIZATION_ID']}")
            assert other and other.status == 404
            assert not errors, errors
            print("Field tenant host browser: passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
