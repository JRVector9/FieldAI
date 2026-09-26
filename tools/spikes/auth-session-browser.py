import asyncio
from playwright.async_api import async_playwright


PAGES = [
    ("AP 작업", "http://localhost:3001/workspace", "로그인"),
    ("AP 연결", "http://localhost:3001/workspace/integrations", "AP 계정 로그인"),
    ("AP 동의 로그인", "http://localhost:3001/connect/sign-in", "AP 계정으로 로그인"),
    ("Field 작업", "http://127.0.0.1:3002/workspace", "로그인"),
    ("Field 동의 로그인", "http://127.0.0.1:3002/connect/sign-in", "Field 계정으로 로그인"),
]


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            for name, url, heading in PAGES:
                context = await browser.new_context(viewport={"width": 320, "height": 720})
                page = await context.new_page()
                errors = []
                sessions = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("response", lambda response: sessions.append(response)
                        if response.url.endswith("/api/auth/get-session") else None)
                response = await page.goto(url, wait_until="networkidle")
                assert response and response.status == 200, (name, response.status if response else None)
                await page.get_by_role("heading", name=heading, exact=True).wait_for()
                assert sessions, f"{name}: no session request"
                assert sessions[-1].status == 200, (name, sessions[-1].status)
                assert await sessions[-1].json() is None, f"{name}: expected logged-out null session"
                assert await page.get_by_text("인증 서버에 연결할 수 없습니다.", exact=False).count() == 0, name
                assert not errors, (name, errors)
                assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), name
                await context.close()
            print("AP/Field logged-out session browser: null is signed-out, no false outage, 320px passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
