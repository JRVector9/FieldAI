import asyncio
import os
from playwright.async_api import async_playwright


async def main():
    stage = os.environ.get("FIELD_AP_REPLY_BROWSER_STAGE", "retry")
    assert stage in {"denied", "retry"}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto("http://localhost:3002/workspace", wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_label("이메일").first.fill(os.environ["FIELD_TEST_OWNER_EMAIL"])
            await page.get_by_label("비밀번호").first.fill(os.environ["FIELD_TEST_OWNER_PASSWORD"])
            await page.get_by_role("button", name="로그인").click()
            panel = page.locator("#external-inquiries")
            await panel.get_by_role("heading", name="AP에서 전달된 문의").wait_for()
            await panel.get_by_role("button", name="HTTP 전달 고객 · Field 상담 · 테스트 · 접수").click()
            await panel.get_by_text("실제 HTTP로 전달하는 서비스 문의").wait_for()
            assert await panel.get_by_text("010-3333-4444", exact=False).count() > 0
            await panel.get_by_text("AP 원본 상태:", exact=False).wait_for()
            await panel.get_by_text("방문 상담을 받고 싶습니다.").wait_for()
            await panel.get_by_text("Field에서 AP 원본으로 답변했습니다.").wait_for()
            reply = panel.get_by_label("AP 원본 대화에 답변")
            if stage == "denied":
                await reply.fill("320 화면에서 남긴 후속 답변")
                await panel.get_by_role("button", name="AP에 답변 저장").click()
                await page.get_by_text("AP 답변을 저장하지 못했습니다 (403).", exact=False).wait_for()
                await page.reload(wait_until="networkidle")
                panel = page.locator("#external-inquiries")
                await panel.get_by_role("button", name="HTTP 전달 고객 · Field 상담 · 테스트 · 접수").click()
                reply = panel.get_by_label("AP 원본 대화에 답변")
                await page.get_by_text("AP 미전송 초안이 Field에 보관됨").wait_for()
                assert await reply.input_value() == "320 화면에서 남긴 후속 답변"
            else:
                await page.get_by_text("AP 미전송 초안이 Field에 보관됨").wait_for()
                assert await reply.input_value() == "320 화면에서 남긴 후속 답변"
                await panel.get_by_role("button", name="AP에 답변 저장").click()
                await panel.get_by_text("320 화면에서 남긴 후속 답변").wait_for()
                await page.get_by_text("고객 외부 알림은 공급사 미연결로 발송되지 않았습니다.", exact=False).wait_for()

                async def lost_field_response(route):
                    upstream = await route.fetch()
                    assert upstream.status in {200, 201}, await upstream.text()
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"reply_delivery_unknown"}')

                await reply.fill("브라우저 응답 분실 뒤 AP 원본 확인")
                await page.route("**/v1/owner/external-requests/*/replies", lost_field_response)
                await panel.get_by_role("button", name="AP에 답변 저장").click()
                await page.get_by_text("AP 원본에 답변이 저장된 것을 확인했습니다.", exact=False).wait_for()
                await page.unroute("**/v1/owner/external-requests/*/replies", lost_field_response)
                assert await reply.input_value() == ""
                await page.reload(wait_until="networkidle")
                panel = page.locator("#external-inquiries")
                await panel.get_by_role("button", name="HTTP 전달 고객 · Field 상담 · 테스트 · 접수").click()
                await panel.get_by_text("브라우저 응답 분실 뒤 AP 원본 확인").wait_for()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print(f"Field external inquiry browser: 320px AP original, durable reply {stage} passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
