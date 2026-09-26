import asyncio
from playwright.async_api import async_playwright


PRODUCTS = (
    ("AP", "http://localhost:3001", "내 상담 관리실로 돌아오기.", "내 AI 시작하기"),
    ("Field", "http://localhost:3002", "내 관리실로 돌아오기.", "내 홈페이지 시작하기"),
)


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            for product, origin, login_heading, signup_submit in PRODUCTS:
                for entry, expected_submit in (("로그인", "로그인"), ("무료로 시작", signup_submit)):
                    page = await browser.new_page(viewport={"width": 320, "height": 720})
                    try:
                        await page.goto(origin, wait_until="networkidle")
                        await page.get_by_role("link", name=entry, exact=True).click()
                        submit = page.locator("form button[type=submit]")
                        await submit.wait_for()
                        assert await submit.inner_text() == expected_submit, (product, entry, await submit.inner_text())
                        assert await page.get_by_label("이름").count() == (0 if entry == "로그인" else 1)
                        if entry == "로그인":
                            await page.get_by_role("heading", name=login_heading).wait_for()
                        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                    finally:
                        await page.close()
            print("AP and Field homepage login/sign-up entry: 320px passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
