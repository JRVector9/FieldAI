import asyncio
import os
import sys

from playwright.async_api import async_playwright


async def main():
    week_start = sys.argv[1]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto("http://localhost:3001/publisher", wait_until="networkidle")
            assert response and response.status == 200
            login = page.get_by_role("heading", name="매체 계정 로그인").locator("..")
            await login.get_by_label("이메일").fill(os.environ["FIELD_TEST_PUBLISHER_EMAIL"])
            await login.get_by_label("비밀번호").fill(os.environ["FIELD_TEST_PUBLISHER_PASSWORD"])
            await login.get_by_role("button", name="로그인").click()
            await page.get_by_role("navigation", name="제휴 매체 관리실").get_by_role("button", name="집계 성과").click()
            metrics = page.locator("section.distribution-metrics")
            await metrics.get_by_role("heading", name="매체 성과").wait_for()
            period = metrics.locator("article").filter(has_text=f"{week_start} ~")
            await period.get_by_text("예약 최초 확정").wait_for()
            assert await period.locator("strong").last.inner_text() == "5~9건"
            assert await metrics.get_by_role("link", name="같은 집계 CSV 받기").is_visible()
            assert "측정하지 않습니다" in await metrics.inner_text()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("AP publisher metrics browser: confirmed booking band, CSV link and 320px layout passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
