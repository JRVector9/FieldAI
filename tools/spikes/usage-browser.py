import asyncio
import os
from playwright.async_api import async_playwright


async def inspect(browser, origin, cookie, expected):
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
        response = await page.goto(f"{origin}/workspace", wait_until="networkidle")
        assert response and response.status == 200
        await page.get_by_role("link", name="실제 사용량 보기").click()
        assert page.url == f"{origin}/workspace/usage"
        await page.get_by_role("heading", name="이번 달 사용 기록").wait_for()
        await page.get_by_text(expected).wait_for()
        await page.get_by_text("비용이나 청구액이 아닙니다.", exact=False).wait_for()
        assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert not errors, errors
    finally:
        await context.close()


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            await inspect(browser, "http://localhost:3001", os.environ["AP_USAGE_COOKIE"],
                          "사람 문의 접수: 1건")
            await inspect(browser, "http://127.0.0.1:3002", os.environ["FIELD_USAGE_COOKIE"],
                          "Field 직접 문의: 1건")
            print("both usage screens passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
