import asyncio
import os
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 320, "height": 720})
        errors = []
        products = [
            ("AP", "http://localhost:3001", os.environ["AP_SIGNOUT_COOKIE"]),
            ("Field", "http://127.0.0.1:3002", os.environ["FIELD_SIGNOUT_COOKIE"]),
        ]
        try:
            cookies = []
            for _, origin, header in products:
                for part in header.split("; "):
                    name, value = part.split("=", 1)
                    cookies.append({"name": name, "value": value, "url": origin})
            await context.add_cookies(cookies)
            pages = []
            for name, origin, _ in products:
                page = await context.new_page()
                page.on("pageerror", lambda error: errors.append(str(error)))
                response = await page.goto(f"{origin}/workspace", wait_until="networkidle")
                assert response and response.status == 200, name
                if name == "Field":
                    await page.get_by_role("heading", name="내 홈페이지 만들기").wait_for()
                else:
                    await page.get_by_role("heading", name="첫 조직 만들기").wait_for()
                signout = page.get_by_role("button", name="로그아웃")
                await signout.wait_for()
                await page.get_by_label("상호").fill("저장 전 상호")
                assert await signout.is_disabled(), f"{name} must keep unsaved organization input"
                assert await page.get_by_text("작성 중인 내용을 저장하거나 비운 뒤 로그아웃할 수 있습니다.").is_visible()
                await page.get_by_label("상호").fill("")
                assert await signout.is_enabled(), name
                pages.append(page)
            await pages[0].get_by_role("button", name="로그아웃").click()
            await pages[0].get_by_role("heading", name="내 사업 AI의 새로운 시작.").wait_for()
            ap_session = await context.request.get("http://localhost:3001/api/auth/get-session")
            field_session = await context.request.get("http://127.0.0.1:3002/api/auth/get-session")
            assert ap_session.status == 200 and await ap_session.json() is None
            assert field_session.status == 200 and (await field_session.json())["user"]
            await pages[1].reload(wait_until="networkidle")
            await pages[1].get_by_role("heading", name="내 홈페이지 만들기").wait_for()
            await pages[1].get_by_role("button", name="로그아웃").click()
            await pages[1].get_by_role("heading", name="내 사업의 새로운 시작.").wait_for()
            field_session = await context.request.get("http://127.0.0.1:3002/api/auth/get-session")
            assert field_session.status == 200 and await field_session.json() is None
            for page in pages:
                assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("both products signed out independently: 320px and no page errors")
        finally:
            await context.close()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
