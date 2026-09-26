import asyncio
import json
import re
import sys
from playwright.async_api import async_playwright


async def main(origin: str, slug: str, public_id: str):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto(f"{origin}/site/{slug}", wait_until="networkidle")
            assert response and response.status == 200, response.status if response else "no response"
            await page.get_by_role("link", name="직접 문의하기").wait_for()
            await page.get_by_role("link", name="예약 요청하기").wait_for()
            button = page.get_by_role("button", name="사업자 상담 열기")
            await button.wait_for(timeout=10000)
            await button.click()
            assert await page.locator(f'iframe[src*="/embed/v1/{public_id}/frame"]').is_visible()
            frame = page.frame_locator(f'iframe[src*="/embed/v1/{public_id}/frame"]')
            await frame.get_by_text("상담 연결 준비 완료", exact=True).wait_for()
            question = "외부 위젯의 응답 분실 질문"
            answer = "승인된 상담 서비스를 안내합니다."
            state = {"posts": 0, "recoveries": 0, "transcripts": 0, "key": None}
            conversation_id = "00000000-0000-4000-8000-000000000011"

            async def synthetic_ai(route):
                url = route.request.url.split("?", 1)[0]
                if url.endswith("/v1/embed/engagements") and route.request.method == "POST":
                    await route.fulfill(status=201, content_type="application/json",
                        body=json.dumps({"id": conversation_id}))
                elif url.endswith("/messages") and route.request.method == "POST":
                    state["posts"] += 1
                    state["key"] = route.request.headers.get("idempotency-key")
                    await route.abort("failed")
                elif url.endswith("/messages/recover") and route.request.method == "GET":
                    state["recoveries"] += 1
                    if state["recoveries"] == 1:
                        await route.fulfill(status=503, content_type="application/json",
                            body=json.dumps({"error": "temporarily_unavailable"}))
                    elif state["recoveries"] == 2:
                        await route.fulfill(status=200, content_type="application/json",
                            body=json.dumps({"state": "result_unknown", "runId":
                                "00000000-0000-4000-8000-000000000012", "question": question}))
                    else:
                        await route.fulfill(status=200, content_type="application/json",
                            body=json.dumps({"state": "completed", "runId":
                                "00000000-0000-4000-8000-000000000012",
                                "question": question, "answer": answer,
                                "handoffRecommended": False}))
                elif url.endswith(f"/{conversation_id}") and route.request.method == "GET":
                    state["transcripts"] += 1
                    await route.fulfill(status=200, content_type="application/json",
                        body=json.dumps({"id": conversation_id, "state": "ai_assisting",
                            "messages": [
                                {"id": "00000000-0000-4000-8000-000000000013",
                                    "actor": "customer", "body": question},
                                *([{"id": "00000000-0000-4000-8000-000000000014",
                                    "actor": "assistant", "body": answer}]
                                  if state["transcripts"] > 1 else [])]}))
                else:
                    await route.continue_()

            await page.route("**/v1/embed/engagements", synthetic_ai)
            await page.route("**/v1/engagements/**", synthetic_ai)
            await frame.locator("#question").fill(question)
            await frame.get_by_role("button", name="AI에 질문").click()
            await frame.get_by_text("AI 질문 결과를 확인하지 못했습니다", exact=False).wait_for()
            await frame.get_by_role("button", name="AI 요청 상태 다시 확인").click()
            await frame.get_by_text("결과 미상", exact=False).wait_for()
            assert state["posts"] == 1 and state["recoveries"] == 2
            await frame.get_by_role("button", name="AI 요청 상태 다시 확인").click()
            await frame.get_by_text("대화 목록을 읽지 못했습니다", exact=False).wait_for()
            assert await frame.locator("#provisional-answer").is_visible()
            await frame.get_by_role("button", name="AI 요청 상태 다시 확인").click()
            await frame.locator("#transcript").get_by_text(answer, exact=True).wait_for()
            assert state["posts"] == 1 and state["recoveries"] == 4
            assert state["transcripts"] == 2
            assert await frame.locator("#provisional-answer").is_hidden()
            assert re.fullmatch(r"[A-Za-z0-9_-]{43}", state["key"] or "")
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            wrong = origin.replace(slug, "field-000000000000", 1)
            denied = await page.goto(f"{wrong}/site/{slug}", wait_until="domcontentloaded")
            assert denied and denied.status == 404, denied.status if denied else "no response"
            print("Field AP widget browser: 320px SDK button/frame, AI ACK recovery, direct inquiry/booking, tenant host guard passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:4]))
