import asyncio
import uuid

from playwright.async_api import async_playwright


async def check_width(browser, width):
    context = await browser.new_context(viewport={"width": width, "height": 720}, timezone_id="Asia/Seoul")
    page = await context.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        await page.goto("http://localhost:3001/workspace", wait_until="networkidle")
        form = page.locator("section.agent-auth-form")
        await form.get_by_label("이름").fill("합성 키보드 사업자")
        await form.get_by_label("이메일").fill(f"keyboard-{uuid.uuid4()}@example.invalid")
        await form.get_by_label("비밀번호").fill("SyntheticKeyboard123!")
        await form.get_by_role("button", name="내 AI 시작하기").click()
        await page.get_by_role("heading", name="첫 조직 만들기").wait_for()
        await page.get_by_label("상호").fill("합성 키보드 AP 사업장")
        await page.get_by_role("button", name="조직 만들기").click()
        await page.get_by_role("heading", name="사업 정보 초안").wait_for()

        nav = page.get_by_role("navigation", name="AP 모바일 관리 메뉴")
        await page.get_by_role("link", name="알림", exact=True).focus()
        main_focus_count = 0
        for _ in range(40):
            await page.keyboard.press("Tab")
            await page.wait_for_timeout(400)
            focused = await page.evaluate("""() => {
              const el = document.activeElement;
              const main = document.querySelector('.agent-owner-main');
              const nav = document.querySelector('.agent-owner-mobile-nav');
              const rect = el.getBoundingClientRect();
              return { inMain: main.contains(el), inNav: nav.contains(el),
                label: el.getAttribute('aria-label') || el.innerText || el.tagName,
                top: rect.top, bottom: rect.bottom,
                outline: getComputedStyle(el).outlineStyle,
                navTop: nav.getBoundingClientRect().top };
            }""")
            if focused["inNav"]:
                assert focused["label"].strip() == "오늘", focused
                break
            if focused["inMain"]:
                main_focus_count += 1
                assert focused["top"] >= 54 and focused["bottom"] <= focused["navTop"] - 4, focused
                assert focused["outline"] != "none", focused
        else:
            raise AssertionError("AP 모바일 사업자 메뉴에 키보드로 도달하지 못했습니다")
        assert main_focus_count >= 8, main_focus_count
        await page.keyboard.press("Enter")
        await page.get_by_role("heading", name="내 사업의 오늘").wait_for()
        await page.keyboard.press("Tab")
        assert await nav.get_by_role("link", name="문의").evaluate("el => el === document.activeElement")
        await page.keyboard.press("Enter")
        await page.get_by_role("heading", name="문의함").wait_for()
        assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert not errors, errors
    finally:
        await context.close()


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            for width in (320, 390):
                await check_width(browser, width)
            print("AP owner keyboard: 320/390px visible focus and mobile Today/Inquiry passed")
        finally:
            await browser.close()


asyncio.run(main())
