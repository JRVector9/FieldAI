import asyncio
import os
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto("http://localhost:3002/workspace?mode=login", wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_label("이메일").first.fill(os.environ["FIELD_TEST_OWNER_EMAIL"])
            await page.get_by_label("비밀번호").first.fill(os.environ["FIELD_TEST_OWNER_PASSWORD"])
            await page.locator('form button[type="submit"]').click()
            await page.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="오늘").wait_for()
            await page.goto("http://localhost:3002/workspace/integrations", wait_until="domcontentloaded")
            await page.get_by_text("양쪽 동의 완료 · 정보 검토 및 설치 대기").wait_for()
            await page.get_by_role("checkbox", name="기존 예약과 고객 확인키는 남기고 이 연결을 해제합니다.").check()
            await page.get_by_role("button", name="이 연결 해제").click()
            await page.get_by_text("Field 연결 해제됨").wait_for()
            await page.get_by_text("기존 Field 예약은 유지됩니다.", exact=False).wait_for()
            await page.get_by_role("button", name="상태 새로고침").click()
            await page.get_by_text("Field 연결 해제됨").wait_for()
            if os.environ.get("FIELD_REVOKE_OUTAGE") == "ap":
                await page.get_by_text("AP 원격 회수: 대기 중 · 자동 재시도", exact=False).wait_for()
            else:
                for _ in range(20):
                    if await page.get_by_text("AP 원격 회수: 완료", exact=False).count():
                        break
                    await page.wait_for_timeout(250)
                    await page.get_by_role("button", name="상태 새로고침").click()
                else:
                    raise AssertionError("AP remote revocation was not acknowledged in the Field screen")
            overflow = await page.evaluate("""() => ({ width: window.innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              offenders: [...document.querySelectorAll('*')].filter(node =>
                node.scrollWidth > node.clientWidth + 1)
                .sort((a,b) => (b.scrollWidth-b.clientWidth)-(a.scrollWidth-a.clientWidth))
                .slice(0, 10).map(node => ({ tag: node.tagName, cls: node.className,
                  text: node.textContent?.slice(0, 80), client: node.clientWidth,
                  scroll: node.scrollWidth })) })""")
            assert overflow["scrollWidth"] <= overflow["width"], overflow
            assert not errors, errors
            print("Field connection revoke browser: 320px explicit unlink and remote state passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
