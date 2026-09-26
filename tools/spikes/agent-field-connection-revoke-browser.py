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
            response = await page.goto("http://localhost:3001/workspace/integrations", wait_until="domcontentloaded")
            assert response and response.status == 200
            await page.get_by_label("이메일").first.fill(os.environ["AP_TEST_OWNER_EMAIL"])
            await page.get_by_label("비밀번호").first.fill(os.environ["AP_TEST_OWNER_PASSWORD"])
            await page.get_by_role("button", name="로그인").click()
            await page.get_by_role("heading", name="연결 기록").wait_for()
            await page.get_by_text("양쪽 동의 완료 · 검토 및 설치 대기").wait_for()
            await page.get_by_role("checkbox", name="기존 AP 문의와 Field 예약은 남기고 이 연결을 해제합니다.").check()
            await page.get_by_role("button", name="이 연결 해제").click()
            await page.get_by_text("AP 연결 해제됨").wait_for()
            await page.get_by_text("기존 AP 문의와 Field 예약은 유지됩니다.", exact=False).wait_for()
            await page.get_by_role("button", name="상태 새로고침").click()
            await page.get_by_text("AP 연결 해제됨").wait_for()
            if os.environ.get("FIELD_REVOKE_OUTAGE") == "field":
                await page.get_by_text("Field 원격 회수: 확인 대기 · 자동 재시도 중", exact=False).wait_for()
            else:
                for _ in range(20):
                    if await page.get_by_text("Field 원격 회수: 확인됨", exact=False).count():
                        break
                    await page.wait_for_timeout(250)
                    await page.get_by_role("button", name="상태 새로고침").click()
                else:
                    raise AssertionError("Field remote revocation was not acknowledged in the AP screen")
            overflow = await page.evaluate("""() => ({ width: window.innerWidth,
              scrollWidth: document.documentElement.scrollWidth })""")
            assert overflow["scrollWidth"] <= overflow["width"], overflow
            assert not errors, errors
            print("AP connection revoke browser: 320px explicit unlink and remote state passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
