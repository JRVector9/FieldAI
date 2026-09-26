import asyncio
import json
import re
import sys
from playwright.async_api import async_playwright


async def main(public_id: str, mode: str):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto(f"http://localhost:3001/consult/{public_id}", wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_role("heading", name="HTTP AP 조직").wait_for()
            question = {
                "ai_fallback": "AI 안내 뒤 Field 사업장에 문의하고 싶습니다",
                "direct": "AI 질문 없이 Field 사업장에 문의합니다",
                "concurrent": "AI 요청 중에도 Field 사업장에 문의합니다",
                "photo": "사진을 선택해 Field 사업장에 문의합니다",
                "external": "AI 뒤 사람 문의 없이 Field 사업장에 요청합니다",
                "external_photo": "AI 뒤 사진과 함께 Field 사업장에 요청합니다",
                "external_recover_photo": "Field 준비 뒤 재열람해 사진을 추가합니다",
                "external_lost_photo": "Field 준비 응답 분실 뒤 사진을 다시 고릅니다",
                "unconnected": "Field 연결 없이 사람 문의를 진행합니다",
                "field_down": "Field 상태 장애 뒤 같은 화면에서 다시 확인합니다",
                "no_services": "Field 공개 서비스가 없으면 직접 요청을 막습니다",
                "rate_limited": "Field 조회 한도 뒤 고객 입력 없이 재확인합니다",
                "ai_start_failure": "AI 시작 실패 뒤 사람에게 묻습니다",
                "ai_rejected": "AI 근거 거절 뒤 사람에게 묻습니다",
                "ai_network": "AI 네트워크 실패 뒤 사람에게 묻습니다",
                "ai_server_error": "AI 서버 오류 뒤 사람에게 묻습니다",
                "ai_draft_full": "AI 실패 질문을 초안 여유 공간에 다시 넣습니다",
                "ai_answer_refresh_lost": "AI 답변 저장 뒤 대화 조회를 복구합니다",
                "ai_post_ack_lost": "AI 질문 응답 분실 뒤 원본을 복구합니다",
            }[mode]
            if mode == "ai_post_ack_lost":
                answer = "승인된 상담 서비스를 안내합니다."
                state = {"id": None, "posts": 0, "recoveries": 0}

                async def lost_ai_ack(route):
                    url = route.request.url.split("?", 1)[0]
                    if url.endswith("/messages") and route.request.method == "POST":
                        state["id"] = url.split("/")[-2]
                        state["posts"] += 1
                        await route.abort("failed")
                    elif url.endswith("/messages/recover") and route.request.method == "GET":
                        state["recoveries"] += 1
                        if state["recoveries"] == 1:
                            await route.fulfill(status=503, content_type="application/json",
                                body=json.dumps({"error": "temporarily_unavailable"}))
                        elif state["recoveries"] == 2:
                            await route.fulfill(status=200, content_type="application/json",
                                body=json.dumps({"state": "result_unknown", "runId":
                                    "00000000-0000-4000-8000-000000000003",
                                    "question": question}))
                        else:
                            await route.fulfill(status=200, content_type="application/json",
                                body=json.dumps({"state": "completed", "runId":
                                    "00000000-0000-4000-8000-000000000003",
                                    "question": question, "answer": answer,
                                    "evidenceIds": ["service:0"], "unknowns": [],
                                    "handoffRecommended": False}))
                    elif state["id"] and url.endswith(f"/{state['id']}") and route.request.method == "GET":
                        await route.fulfill(status=200, content_type="application/json",
                            body=json.dumps({"id": state["id"], "state": "ai_assisting",
                                "messages": [
                                    {"id": "00000000-0000-4000-8000-000000000001",
                                        "actor": "customer", "body": question},
                                    {"id": "00000000-0000-4000-8000-000000000002",
                                        "actor": "assistant", "body": answer}]}))
                    else:
                        await route.continue_()

                await page.route("**/v1/engagements/**", lost_ai_ack)
                await page.get_by_label("질문").fill(question)
                await page.get_by_role("button", name="AI에 질문").click()
                await page.get_by_text("AI 질문 결과를 확인하지 못했습니다", exact=False).wait_for()
                assert await page.get_by_role("button", name="사람 문의 제출").is_enabled()
                assert await page.get_by_label("문의 내용").input_value() == question
                assert state["posts"] == 1 and state["recoveries"] == 1
                assert question not in await page.evaluate("JSON.stringify(sessionStorage)")
                await page.reload(wait_until="networkidle")
                await page.get_by_text("결과 미상", exact=False).wait_for()
                assert await page.get_by_label("문의 내용").input_value() == question
                assert state["posts"] == 1 and state["recoveries"] == 2
                await page.get_by_role("button", name="AI 요청 상태 다시 확인").click()
                transcript = page.locator('ol[aria-label="AI 상담 대화"]')
                await transcript.get_by_text(answer, exact=True).wait_for()
                assert await transcript.get_by_text(question, exact=True).count() == 1
                assert state["posts"] == 1 and state["recoveries"] == 3
                assert await page.get_by_role("button", name="AI에 질문").is_enabled()
                assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                assert not errors, errors
                print(json.dumps({"mode": mode, "recoveredAfterReload": True}))
                return
            if mode == "ai_answer_refresh_lost":
                answer = "승인된 상담 서비스를 안내합니다."
                state = {"id": None, "reads": 0}

                async def answer_then_transcript(route):
                    url = route.request.url.split("?", 1)[0]
                    if url.endswith("/messages") and route.request.method == "POST":
                        state["id"] = url.split("/")[-2]
                        await route.fulfill(status=200, content_type="application/json",
                            body=json.dumps({"runId": "00000000-0000-4000-8000-000000000003",
                                "answer": answer, "evidenceIds": ["service:0"],
                                "unknowns": [], "handoffRecommended": False,
                                "knowledgeRevision": 1,
                                "usage": {"inputTokens": 10, "outputTokens": 10}}))
                    elif state["id"] and url.endswith(f"/{state['id']}") and route.request.method == "GET":
                        state["reads"] += 1
                        if state["reads"] == 1:
                            await route.fulfill(status=503, content_type="application/json",
                                body=json.dumps({"error": "temporarily_unavailable"}))
                        else:
                            await route.fulfill(status=200, content_type="application/json",
                                body=json.dumps({"id": state["id"], "state": "ai_assisting",
                                    "messages": [
                                        {"id": "00000000-0000-4000-8000-000000000001",
                                            "actor": "customer", "body": question},
                                        {"id": "00000000-0000-4000-8000-000000000002",
                                            "actor": "assistant", "body": answer}]}))
                    else:
                        await route.continue_()

                await page.route("**/v1/engagements/**", answer_then_transcript)
                await page.get_by_label("질문").fill(question)
                await page.get_by_role("button", name="AI에 질문").click()
                await page.get_by_text(answer, exact=True).wait_for()
                await page.get_by_text("서버가 수락한 AI 답변", exact=True).wait_for()
                assert await page.get_by_role("button", name="AI에 질문").is_disabled()
                assert await page.get_by_role("button", name="사람 문의 제출").is_enabled()
                await page.get_by_role("button", name="AI 대화 다시 불러오기").click()
                transcript = page.locator('ol[aria-label="AI 상담 대화"]')
                await transcript.get_by_text(answer, exact=True).wait_for()
                assert await transcript.get_by_text(question, exact=True).count() == 1
                assert await page.get_by_text("서버가 수락한 AI 답변", exact=True).count() == 0
                assert await page.get_by_role("button", name="AI에 질문").is_enabled()
                assert state["reads"] == 2
                assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                assert not errors, errors
                print(json.dumps({"mode": mode, "transcriptRecovered": True}))
                return
            if mode in ("ai_start_failure", "ai_rejected", "ai_network", "ai_server_error",
                        "ai_draft_full"):
                if mode in ("ai_start_failure", "ai_draft_full"):
                    await page.route("**/v1/public/deployments/*/engagements",
                        lambda route: route.fulfill(status=503, content_type="application/json",
                            body=json.dumps({"error": "blocked_integration"})))
                elif mode == "ai_network":
                    await page.route("**/v1/engagements/*/messages", lambda route: route.abort())
                else:
                    await page.route("**/v1/engagements/*/messages",
                        lambda route: route.fulfill(status=422 if mode == "ai_rejected" else 500,
                            content_type="application/json",
                            body=json.dumps({"error": "unsupported_evidence" if mode == "ai_rejected"
                                else "internal_error"})))
                if mode == "ai_rejected":
                    await page.get_by_label("문의 내용").fill("기존 사람 문의 초안")
                if mode == "ai_draft_full":
                    original_draft = "가" * 4990
                    await page.get_by_label("문의 내용").fill(original_draft)
                await page.get_by_label("질문").fill(question)
                await page.get_by_role("button", name="AI에 질문").click()
                if mode == "ai_draft_full":
                    await page.get_by_text("문의 초안에 질문을 추가하지 못했습니다", exact=False).wait_for()
                    assert await page.get_by_label("문의 내용").input_value() == original_draft
                    assert await page.get_by_label("질문").input_value() == question
                    assert await page.get_by_role("button", name="사람 문의 제출").is_enabled()
                    await page.get_by_label("문의 내용").fill("기존 문의")
                    await page.get_by_role("button", name="이 질문을 문의 초안에 넣기").click()
                    assert await page.get_by_label("문의 내용").input_value() == f"기존 문의\n{question}"
                    assert await page.get_by_text("문의 초안에 질문을 추가하지 못했습니다", exact=False).count() == 0
                    assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                    assert not errors, errors
                    print(json.dumps({"mode": mode, "draftRecovered": True}))
                    return
                await page.get_by_text({
                    "ai_start_failure": "AI 공급사 또는 사용 한도 설정을 사용할 수 없습니다",
                    "ai_rejected": "AI 답변의 근거를 확인하지 못해 표시하지 않았습니다",
                    "ai_network": "AI 질문 결과를 확인하지 못했습니다",
                    "ai_server_error": "AI 답변을 제공하지 못했습니다 (500)",
                }[mode], exact=False).wait_for()
                assert await page.get_by_label("질문").input_value() == question
                expected_draft = f"기존 사람 문의 초안\n{question}" if mode == "ai_rejected" else question
                assert await page.get_by_label("문의 내용").input_value() == expected_draft
                if mode == "ai_rejected":
                    async with page.expect_response(lambda result: "/messages" in result.url
                            and result.request.method == "POST"):
                        await page.get_by_role("button", name="AI에 질문").click()
                    await page.wait_for_function("Array.from(document.querySelectorAll('button'))"
                        ".find(button => button.textContent === 'AI에 질문')?.disabled === false")
                    assert await page.get_by_label("문의 내용").input_value() == expected_draft
                assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                assert not errors, errors
                print(json.dumps({"mode": mode, "draftPreserved": True}))
                return
            name = {"ai_fallback": "같은 화면 고객", "direct": "직접 제출 고객",
                    "concurrent": "동시 제출 고객", "photo": "사진 전달 고객",
                    "external": "외부 직접 고객", "external_photo": "외부 사진 고객",
                    "external_recover_photo": "외부 재열람 고객",
                    "external_lost_photo": "외부 응답 분실 고객",
                    "unconnected": "연결 없는 고객",
                    "field_down": "Field 장애 고객", "no_services": "서비스 없는 고객",
                    "rate_limited": "조회 한도 고객"}[mode]
            phone = {"ai_fallback": "010-3333-4445", "direct": "010-3333-5555",
                     "concurrent": "010-3333-6666", "photo": "010-3333-7777",
                     "external": "010-3333-8888", "external_photo": "010-3333-9999",
                     "external_recover_photo": "010-3333-0001",
                     "external_lost_photo": "010-3333-0002",
                     "unconnected": "010-3333-0003",
                     "field_down": "010-3333-0004", "no_services": "010-3333-0005",
                     "rate_limited": "010-3333-0006"}[mode]
            probe_restored = {"value": False}
            if mode in ("field_down", "no_services", "rate_limited"):
                async def preflight_response(route):
                    if mode == "rate_limited" and not probe_restored["value"]:
                        await route.fulfill(status=429, content_type="application/json",
                            headers={"Retry-After": "60"},
                            body=json.dumps({"error": "field_preflight_rate_limited",
                                "scope": "organization"}))
                        return
                    reason = "field_unavailable" if mode == "field_down" else "no_services"
                    await route.fulfill(status=200, content_type="application/json",
                        body=json.dumps({"ready": True} if probe_restored["value"]
                            else {"ready": False, "reason": reason}))
                await page.route("**/v1/engagements/*/field-readiness", preflight_response)
            if mode.startswith("external") or mode in ("ai_fallback", "unconnected", "field_down", "no_services", "rate_limited"):
                await page.get_by_label("질문").fill(question)
                await page.get_by_role("button", name="AI에 질문").click()
                await page.get_by_text("아래 사람 문의 초안과 AI 질문 내용을 확인해 주세요", exact=False).wait_for()
                assert await page.get_by_label("문의 내용").input_value() == question
            else:
                await page.get_by_label("문의 내용").fill(question)
            if mode in ("field_down", "no_services", "rate_limited"):
                await page.get_by_text("Field의 현재 권한이나 공개 정보를 확인할 수 없습니다" if mode == "field_down"
                    else "Field에 현재 공개된 요청 서비스가 없습니다" if mode == "no_services"
                    else "Field 확인 요청이 많아 잠시 제한됩니다", exact=False).wait_for()
                assert await page.get_by_role("button", name="Field 요청 준비").is_disabled()
                assert await page.get_by_role("button", name="사람 문의 제출").is_enabled()
                if mode in ("field_down", "rate_limited"):
                    probe_restored["value"] = True
                    await page.get_by_role("button", name="Field 연결 다시 확인").click()
                    await page.get_by_text("Field 연결 경로가 설정됐습니다", exact=False).wait_for()
                    assert await page.get_by_role("button", name="Field 요청 준비").is_enabled()
                assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                assert not errors, errors
                print(json.dumps({"mode": mode, "precontactOnly": True}))
                return
            await page.get_by_label("이름").fill(name)
            await page.get_by_role("textbox", name="연락처").fill(phone)
            if mode == "unconnected":
                await page.get_by_text("현재 Field 직접 요청 경로가 없습니다", exact=False).wait_for()
                assert await page.get_by_role("button", name="Field 요청 준비").is_disabled()
                assert await page.get_by_role("button", name="사람 문의 제출").is_enabled()
                await page.get_by_role("button", name="Field 연결 다시 확인").click()
                await page.get_by_text("현재 Field 직접 요청 경로가 없습니다", exact=False).wait_for()
                await page.get_by_role("checkbox", name="AP 대화와 요청 준비에 필요한 연락처 저장에 동의합니다.").check()
                await page.get_by_role("button", name="사람 문의 제출").click()
                await page.get_by_role("link", name="후속 대화 열기").wait_for()
                assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                assert not errors, errors
                print(json.dumps({"mode": mode, "humanInquiry": True}))
                return
            if mode in ("photo", "external_photo", "external_lost_photo"):
                await page.get_by_label("문의 사진 (선택, 최대 8MB)").set_input_files(
                    "quality_checks/report_320.png")
            if mode == "external_lost_photo":
                async def lose_preparation_ack(route):
                    if route.request.method == "POST":
                        accepted = await route.fetch()
                        assert accepted.status == 201
                        await route.abort("failed")
                    else:
                        await route.continue_()

                await page.route("**/v1/conversations/*/submissions", lose_preparation_ack)
            if mode == "concurrent":
                started = asyncio.Event()
                release = asyncio.Event()
                starts = []

                async def delay_start(route):
                    if route.request.method == "POST":
                        starts.append(route.request.url)
                        started.set()
                        await release.wait()
                    await route.continue_()

                await page.route(f"**/v1/public/deployments/{public_id}/engagements", delay_start)
                await page.get_by_label("질문").fill(question)
                await page.get_by_label("문의 내용").fill(question)
                await page.get_by_role("checkbox", name="AP 대화와 요청 준비에 필요한 연락처 저장에 동의합니다.").check()
                await page.get_by_role("button", name="AI에 질문").click()
                await asyncio.wait_for(started.wait(), timeout=10)
                await page.get_by_role("button", name="문의 제출").click()
                await asyncio.sleep(0.2)
                release.set()
                assert len(starts) == 1, f"상담 세션이 {len(starts)}번 생성됨"
            else:
                await page.get_by_role("checkbox", name="AP 대화와 요청 준비에 필요한 연락처 저장에 동의합니다.").check()
                await page.get_by_role("button", name="Field 요청 준비" if mode.startswith("external") else "사람 문의 제출").click()
            if mode == "external_lost_photo":
                await page.get_by_text("응답을 받지 못했습니다", exact=False).wait_for()
                await page.unroute("**/v1/conversations/*/submissions", lose_preparation_ack)
                await page.reload(wait_until="networkidle")
                await page.get_by_text("Field 요청 준비를 복구했습니다", exact=False).wait_for()
                await page.get_by_text("아직 Field에 전달되지 않았습니다", exact=False).first.wait_for()
                await page.get_by_text("사진을 다시 선택", exact=False).wait_for()
                await page.get_by_label("AP 대화 사진 추가 (선택, 최대 8MB)").set_input_files(
                    "quality_checks/report_320.png")
                await page.get_by_role("button", name="사진 첨부 또는 재시도").click()
                await page.get_by_text("AP 대화에 사진을 첨부했습니다", exact=False).wait_for()
            receipt_link = page.get_by_role("link", name="후속 대화 열기")
            await receipt_link.wait_for()
            if mode == "photo":
                await page.get_by_text("문의와 사진을 AP에 저장했습니다", exact=False).wait_for()
            elif mode == "external_photo":
                await page.get_by_text("AP 대화에 사진을 첨부했습니다", exact=False).wait_for()
            inquiry_id = (await receipt_link.get_attribute("href")).split("/")[-1]
            receipt_key = (await page.get_by_text("접수 확인키", exact=True)
                           .locator("..").locator("code").inner_text()).strip()
            if mode.startswith("external"):
                if mode == "external":
                    await page.get_by_text("아직 Field에 전달되지 않았습니다", exact=False).first.wait_for()
                prepared_actions = await page.request.get(
                    f"http://localhost:3001/v1/inquiries/{inquiry_id}/field-actions",
                    headers={"authorization": f"Bearer {receipt_key}"})
                assert prepared_actions.status == 200
                assert (await prepared_actions.json())["actions"] == []
            if mode == "external_recover_photo":
                await page.goto(f"http://localhost:3001/inquiry/{inquiry_id}", wait_until="networkidle")
                await page.get_by_role("textbox", name="접수 확인키").fill(receipt_key)
                await page.get_by_role("button", name="문의 열기").click()
                await page.get_by_label("문의 사진 첨부 (선택, 최대 8MB)").set_input_files(
                    "quality_checks/report_320.png")
                await page.get_by_role("button", name="사진만 첨부 또는 재시도").click()
                await page.get_by_text("사진을 AP 대화에 비공개로 저장했습니다", exact=False).wait_for()
            panel = page.get_by_role("region", name="Field 외부 요청")
            await panel.get_by_role("heading", name="Field에 별도 문의·예약 요청").wait_for()
            await panel.get_by_label("전달 종류").select_option("inquiry")
            if mode in ("photo", "external_photo", "external_recover_photo", "external_lost_photo"):
                await panel.get_by_role("button", name="사진 목록 새로고침").click()
                await panel.get_by_role("checkbox", name=re.compile("문의 사진 1")).check()
            await panel.get_by_role("button", name="현재 가격·시간 확인").click()
            await panel.get_by_label("전달 요약").fill(f"같은 AP 상담 화면에서 {mode} 고객이 Field 문의를 선택함")
            await panel.get_by_role("button", name="제출 조건 확인").click()
            await panel.get_by_role("heading", name="고객 전달 내용 확인").wait_for()
            await panel.get_by_text(name, exact=False).wait_for()
            await panel.get_by_text(phone, exact=False).wait_for()
            await panel.get_by_role("checkbox", name=re.compile("표시된 이름")).check()
            await panel.get_by_role("button", name="Field에 요청 전달").click()
            await panel.locator("p[role='status']").filter(has_text="Field에 문의 접수됨 · 사업자 응답 대기").wait_for()
            actions = await page.request.get(f"http://localhost:3001/v1/inquiries/{inquiry_id}/field-actions",
                                             headers={"authorization": f"Bearer {receipt_key}"})
            assert actions.status == 200
            items = (await actions.json())["actions"]
            assert len(items) == 1 and items[0]["kind"] == "inquiry"
            assert items[0]["state"] == "accepted_external"
            attachment_id = None
            if mode in ("photo", "external_photo", "external_recover_photo", "external_lost_photo"):
                inquiry = await page.request.get(f"http://localhost:3001/v1/inquiries/{inquiry_id}",
                                                 headers={"authorization": f"Bearer {receipt_key}"})
                assert inquiry.status == 200
                attachments = (await inquiry.json())["attachments"]
                assert len(attachments) == 1
                attachment_id = attachments[0]["id"]
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print(json.dumps({"mode": mode, "inquiryId": inquiry_id,
                              "actionRequestId": items[0]["actionRequestId"],
                              "attachmentId": attachment_id}))
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
