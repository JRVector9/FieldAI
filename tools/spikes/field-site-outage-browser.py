import asyncio
import sys

from playwright.async_api import async_playwright, expect


async def main(web_base: str, api_base: str) -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page(viewport={"width": 320, "height": 720})
            for path, recovered_heading in (
                ("/site/field-012345abcdef", "회복된 사이트 홈"),
                ("/site/field-012345abcdef/services", "회복된 서비스 안내"),
            ):
                response = await page.goto(f"{web_base}{path}")
                assert response is not None and response.status == 500
                heading = page.get_by_role("heading", name="사이트를 일시적으로 불러오지 못했습니다")
                button = page.get_by_role("button", name="사이트 다시 불러오기")
                await expect(heading).to_be_visible()
                await expect(button).to_be_visible()
                assert await page.get_by_text("private upstream error").count() == 0
                assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                assert await button.evaluate("element => parseFloat(getComputedStyle(element).fontSize)") >= 14
                assert (await page.request.get(f"{api_base}/__status/200")).status == 204
                await button.click()
                await expect(page.get_by_role("heading", name=recovered_heading)).to_be_visible()
                assert page.url == f"{web_base}{path}"
                assert (await page.request.get(f"{api_base}/__status/503")).status == 204
            print("Field site outage browser: passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
