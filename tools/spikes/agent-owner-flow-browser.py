import asyncio
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from playwright.async_api import async_playwright, expect


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        owner_context = await browser.new_context(viewport={"width": 320, "height": 720})
        guest_context = await browser.new_context(viewport={"width": 320, "height": 720})
        owner = await owner_context.new_page()
        guest = await guest_context.new_page()
        owner.set_default_timeout(15000)
        guest.set_default_timeout(15000)
        errors = []
        owner.on("pageerror", lambda error: errors.append(f"owner: {error}"))
        guest.on("pageerror", lambda error: errors.append(f"guest: {error}"))
        try:
            response = await owner.goto("http://localhost:3001/workspace", wait_until="networkidle")
            assert response and response.status == 200
            signup = owner.locator("section.agent-auth-form")
            await signup.get_by_label("이름").fill("합성 AP 사업자")
            await signup.get_by_label("이메일").fill(os.environ["AP_TEST_OWNER_EMAIL"])
            await signup.get_by_label("비밀번호").fill(os.environ["AP_TEST_OWNER_PASSWORD"])
            await signup.get_by_role("button", name="내 AI 시작하기").click()

            await owner.get_by_role("heading", name="첫 조직 만들기").wait_for()
            await owner.get_by_label("상호").fill("합성 AP 상담실")
            await owner.get_by_role("button", name="조직 만들기").click()
            panel = owner.locator("section.special-panel").filter(
                has=owner.get_by_role("heading", name="사업 정보 초안")).first
            await panel.get_by_role("heading", name="사업 정보 초안").wait_for()

            recovery = await owner_context.new_page()
            recovery.set_default_timeout(5000)
            recovery.on("pageerror", lambda error: errors.append(f"recovery: {error}"))
            fail_session_load = True

            async def session_load_route(route):
                nonlocal fail_session_load
                if route.request.method == "GET" and fail_session_load:
                    fail_session_load = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await recovery.route("**/api/auth/get-session", session_load_route)
            await recovery.goto("http://localhost:3001/workspace", wait_until="networkidle")
            await recovery.get_by_role("heading", name="작업실을 불러오지 못했습니다").wait_for()
            await expect(recovery.get_by_role("heading", name="로그인")).to_be_hidden()
            await recovery.get_by_role("button", name="다시 시도").click()
            await recovery.get_by_role("navigation", name="AP 모바일 관리 메뉴").get_by_role("link", name="승인").click()
            await recovery.get_by_role("heading", name="사업 정보 초안").wait_for()
            await recovery.unroute("**/api/auth/get-session", session_load_route)

            fail_draft_load = True

            async def draft_load_route(route):
                nonlocal fail_draft_load
                if route.request.method == "GET" and fail_draft_load:
                    fail_draft_load = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await recovery.route("**/v1/knowledge/draft", draft_load_route)
            await recovery.reload(wait_until="networkidle")
            await recovery.get_by_role("heading", name="작업실을 불러오지 못했습니다").wait_for()
            await expect(recovery.get_by_role("heading", name="로그인")).to_be_hidden()
            await recovery.get_by_role("button", name="다시 시도").click()
            await recovery.get_by_role("navigation", name="AP 모바일 관리 메뉴").get_by_role("link", name="승인").click()
            await recovery.get_by_role("heading", name="사업 정보 초안").wait_for()
            await recovery.close()

            await panel.get_by_label("사업 소개").fill("승인된 방문 상담을 안내합니다.")
            await panel.get_by_role("button", name="서비스 추가").click()
            await panel.get_by_label("서비스 이름").fill("방문 상담")
            await panel.get_by_label("서비스 설명").fill("상담 후 담당자가 연락합니다.")
            await panel.get_by_role("button", name="질문 추가").click()
            await panel.get_by_label("질문").fill("언제 연락하나요?")
            await panel.get_by_label("확인된 답변").fill("담당자가 확인 후 연락합니다.")
            await expect(owner.get_by_role("button", name="현재 초안 승인")).to_be_enabled(timeout=15000)
            await owner.get_by_role("button", name="현재 초안 승인").click()
            await expect(owner.get_by_text("현재 승인 버전: 1번")).to_be_visible()

            fail_ai_release_load = True

            async def ai_release_load_route(route):
                nonlocal fail_ai_release_load
                if route.request.method == "GET" and fail_ai_release_load:
                    fail_ai_release_load = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route("**/v1/agents/releases/latest", ai_release_load_route)
            await owner.get_by_role("link", name="AI 설정·답변 테스트 열기").click()
            await owner.get_by_text("AI 승인 상태를 불러오지 못했습니다", exact=False).wait_for()
            await expect(owner.get_by_role("heading", name="AI 설정 초안")).to_be_hidden()
            fail_ai_knowledge_load = True

            async def ai_knowledge_load_route(route):
                nonlocal fail_ai_knowledge_load
                if route.request.method == "GET" and fail_ai_knowledge_load:
                    fail_ai_knowledge_load = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route("**/v1/public/organizations/*", ai_knowledge_load_route)
            await owner.get_by_role("button", name="다시 불러오기").click()
            await owner.get_by_text("승인 지식을 불러오지 못했습니다", exact=False).wait_for()
            await owner.get_by_role("button", name="다시 불러오기").click()
            await owner.get_by_role("heading", name="AI 설정 초안").wait_for()
            await owner.unroute("**/v1/agents/releases/latest", ai_release_load_route)
            await owner.unroute("**/v1/public/organizations/*", ai_knowledge_load_route)
            await owner.get_by_label("AI 이름").fill("합성 상담 AI")
            await owner.get_by_label("안내 범위").fill("승인된 방문 상담 사실만 안내")
            await owner.get_by_label("사람 연결 안내").fill("담당자가 확인해 답합니다.")
            draft_save_puts = 0

            async def lost_ai_draft_ack(route):
                nonlocal draft_save_puts
                if route.request.method == "PUT":
                    draft_save_puts += 1
                    await route.fetch()
                    await route.abort("failed")
                else:
                    await route.continue_()

            await owner.route("**/v1/agents/draft", lost_ai_draft_ack)
            await owner.get_by_role("button", name="AI 설정 저장").click()
            await owner.get_by_text("AI 설정 저장 결과를 확인할 수 없습니다", exact=False).wait_for()
            await expect(owner.get_by_role("button", name="현재 AI·지식 승인")).to_be_disabled()
            await owner.unroute("**/v1/agents/draft", lost_ai_draft_ack)
            fail_ai_draft_reconcile = True

            async def ai_draft_reconcile_route(route):
                nonlocal fail_ai_draft_reconcile
                if route.request.method == "GET" and fail_ai_draft_reconcile:
                    fail_ai_draft_reconcile = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route("**/v1/agents/draft", ai_draft_reconcile_route)
            await owner.get_by_role("button", name="저장 상태 확인").click()
            await owner.get_by_text("AI 설정 저장 상태를 불러오지 못했습니다", exact=False).wait_for()
            await expect(owner.get_by_label("AI 이름")).to_have_value("합성 상담 AI")
            await owner.get_by_role("button", name="저장 상태 확인").click()
            await owner.get_by_text("AI 설정 초안을 저장했습니다", exact=False).wait_for()
            assert draft_save_puts == 1
            await owner.unroute("**/v1/agents/draft", ai_draft_reconcile_route)
            await expect(owner.get_by_role("button", name="현재 AI·지식 승인")).to_be_enabled()
            approval_posts = 0

            async def lost_ai_approval_ack(route):
                nonlocal approval_posts
                if route.request.method == "POST":
                    approval_posts += 1
                    await route.fetch()
                    await route.abort("failed")
                else:
                    await route.continue_()

            await owner.route("**/v1/agents/releases", lost_ai_approval_ack)
            await owner.get_by_role("button", name="현재 AI·지식 승인").click()
            await owner.get_by_text("AI 승인 결과를 확인할 수 없습니다", exact=False).wait_for()
            await owner.get_by_role("button", name="다시 불러오기").click()
            await owner.get_by_text("AI 승인: 1번", exact=False).wait_for()
            assert approval_posts == 1
            await owner.unroute("**/v1/agents/releases", lost_ai_approval_ack)

            await owner.get_by_label("AI 이름").fill("합성 상담 AI 두 번째 설정")
            remote_draft = await owner_context.request.get("http://localhost:3001/v1/agents/draft")
            assert remote_draft.status == 200
            remote_body = await remote_draft.json()
            remote_write = await owner_context.request.put("http://localhost:3001/v1/agents/draft", data={
                "expectedRevision": remote_body["revision"],
                "name": "다른 작업자의 AI 설정",
                "tone": remote_body["tone"],
                "guideScope": remote_body["guideScope"],
                "handoffText": remote_body["handoffText"],
            })
            assert remote_write.status == 200
            await owner.get_by_role("button", name="AI 설정 저장").click()
            await owner.get_by_role("heading", name="AI 설정 저장 충돌").wait_for()
            await expect(owner.get_by_label("AI 이름")).to_have_value("합성 상담 AI 두 번째 설정")
            await owner.get_by_role("button", name="내 입력으로 다시 저장").click()
            await owner.get_by_text("AI 설정 초안을 저장했습니다", exact=False).wait_for()
            await expect(owner.get_by_role("button", name="현재 AI·지식 승인")).to_be_enabled()
            fail_approval_read = True

            async def approval_read_route(route):
                nonlocal fail_approval_read
                if route.request.method == "GET" and fail_approval_read:
                    fail_approval_read = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route("**/v1/agents/releases/latest", approval_read_route)
            await owner.get_by_role("button", name="현재 AI·지식 승인").click()
            await owner.get_by_text("AI 승인은 완료됐지만 상태를 다시 읽지 못했습니다", exact=False).wait_for()
            await owner.get_by_role("button", name="다시 불러오기").click()
            await owner.get_by_text("AI 승인: 2번", exact=False).wait_for()
            await owner.unroute("**/v1/agents/releases/latest", approval_read_route)

            await owner.get_by_label("AI 이름").fill("사용하지 않을 AI 이름")
            remote_draft = await owner_context.request.get("http://localhost:3001/v1/agents/draft")
            assert remote_draft.status == 200
            remote_body = await remote_draft.json()
            remote_write = await owner_context.request.put("http://localhost:3001/v1/agents/draft", data={
                "expectedRevision": remote_body["revision"],
                "name": "서버에서 선택할 AI 이름",
                "tone": remote_body["tone"],
                "guideScope": remote_body["guideScope"],
                "handoffText": remote_body["handoffText"],
            })
            assert remote_write.status == 200
            await owner.get_by_role("button", name="AI 설정 저장").click()
            await owner.get_by_role("heading", name="AI 설정 저장 충돌").wait_for()
            await owner.get_by_role("button", name="서버 초안 사용").click()
            await expect(owner.get_by_label("AI 이름")).to_have_value("서버에서 선택할 AI 이름")
            await expect(owner.get_by_role("heading", name="AI 설정 저장 충돌")).to_be_hidden()

            fail_deployment_list = True

            async def deployment_list_route(route):
                nonlocal fail_deployment_list
                if route.request.method == "GET" and fail_deployment_list:
                    fail_deployment_list = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route("**/v1/deployments", deployment_list_route)
            await owner.get_by_role("link", name="상담 배포").click()
            await owner.get_by_text("배포 목록을 불러오지 못했습니다", exact=False).wait_for()
            await expect(owner.get_by_text("만든 상담 배포가 없습니다.")).to_be_hidden()
            await expect(owner.get_by_role("button", name="상담 링크 만들기")).to_be_hidden()
            await owner.get_by_role("button", name="다시 불러오기").click()
            await owner.get_by_role("button", name="상담 링크 만들기").wait_for()
            await owner.unroute("**/v1/deployments", deployment_list_route)
            link_create_keys = []

            async def lost_link_create_ack(route):
                if route.request.method == "POST":
                    link_create_keys.append(route.request.post_data_json["idempotencyKey"])
                    if len(link_create_keys) == 1:
                        await route.fetch()
                        await route.abort("failed")
                        return
                await route.continue_()

            await owner.route("**/v1/deployments", lost_link_create_ack)
            await owner.get_by_role("button", name="상담 링크 만들기").click()
            await expect(owner.locator("p.state-message")).to_contain_text("배포 생성 결과를 확인할 수 없습니다")
            await owner.get_by_role("button", name="생성 결과 확인").click()
            await owner.get_by_role("heading", name=re.compile("상담 링크 · pending")).wait_for()
            assert len(link_create_keys) == 2 and link_create_keys[0] == link_create_keys[1]
            await expect(owner.locator(".deployment-list article.knowledge-source").filter(
                has=owner.get_by_role("heading", name=re.compile("상담 링크")))).to_have_count(1)
            await owner.unroute("**/v1/deployments", lost_link_create_ack)
            deployment = owner.locator(".deployment-list article.knowledge-source").first
            fail_activation_list = True

            async def activation_list_route(route):
                nonlocal fail_activation_list
                if route.request.method == "GET" and fail_activation_list:
                    fail_activation_list = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route("**/v1/deployments", activation_list_route)
            await deployment.get_by_role("button", name="활성화").click()
            await owner.get_by_text("상담 배포를 활성화했지만 목록을 다시 읽지 못했습니다", exact=False).wait_for()
            await owner.get_by_role("button", name="다시 불러오기").click()
            await owner.unroute("**/v1/deployments", activation_list_route)
            deployment = owner.locator(".deployment-list article.knowledge-source").first
            public_link = deployment.locator('a[href^="/consult/"]')
            await public_link.wait_for()
            consultation_url = await public_link.get_attribute("href")
            assert consultation_url and consultation_url.startswith("/consult/")
            await owner.wait_for_load_state("networkidle")
            assert await owner.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

            consultation_public_id = consultation_url.rsplit("/", 1)[1]
            fail_consultation_lookup = True

            async def consultation_lookup_route(route):
                nonlocal fail_consultation_lookup
                if route.request.method == "GET" and fail_consultation_lookup:
                    fail_consultation_lookup = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await guest.route(f"**/v1/public/deployments/{consultation_public_id}", consultation_lookup_route)
            fail_customer_knowledge = True

            async def customer_knowledge_route(route):
                nonlocal fail_customer_knowledge
                if route.request.method == "GET" and fail_customer_knowledge:
                    fail_customer_knowledge = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await guest.route("**/v1/public/organizations/*", customer_knowledge_route)
            response = await guest.goto(f"http://localhost:3001{consultation_url}", wait_until="networkidle")
            assert response and response.status == 200
            assert not fail_consultation_lookup
            await guest.get_by_text("상담 링크를 확인하지 못했습니다", exact=False).wait_for()
            await expect(guest.get_by_text("상담 링크가 중지됐거나", exact=False)).to_have_count(0)
            await guest.get_by_role("button", name="상담 링크 다시 확인").click()
            await guest.unroute(f"**/v1/public/deployments/{consultation_public_id}", consultation_lookup_route)
            await guest.get_by_text("사업 정보를 불러오지 못했습니다", exact=False).wait_for()
            assert not fail_customer_knowledge
            await expect(guest.get_by_text("공개된 사업 정보가 없습니다", exact=False)).to_have_count(0)
            await expect(guest.get_by_text("사업 정보를 불러오는 중입니다.", exact=True)).to_have_count(0)
            await expect(guest.get_by_role("button", name="문의 제출")).to_be_disabled()
            await guest.get_by_role("button", name="사업 정보 다시 불러오기").click()
            await guest.unroute("**/v1/public/organizations/*", customer_knowledge_route)
            await guest.locator(".agent-public-header-business strong").get_by_text("합성 AP 상담실").wait_for()
            ai = guest.locator("section.agent-public-chat")
            await ai.get_by_label("질문", exact=True).fill("방문 상담 가격은 얼마인가요?")
            await ai.get_by_role("button", name="AI에 질문").click()
            await ai.get_by_text("AI 공급사 또는 예산 설정을 사용할 수 없습니다.", exact=False).wait_for()
            human = guest.locator("section.special-panel").filter(
                has=guest.get_by_role("heading", name="사람에게 문의"))
            await human.get_by_label("이름").fill("합성 AP 고객")
            await human.get_by_label("연락처", exact=True).fill("010-4444-5555")
            await human.get_by_label("문의 내용").fill("방문 상담 가능 시간을 알려주세요.")
            await human.get_by_role("checkbox").check()
            monitor = await owner_context.new_page()
            await monitor.goto("http://localhost:3001/workspace", wait_until="networkidle")
            await expect(monitor.locator(".agent-owner-dashboard > section").get_by_text("합성 AP 고객", exact=False)).to_have_count(0)
            lost_guest_submission_ack = True

            async def lose_guest_submission_ack(route):
                nonlocal lost_guest_submission_ack
                if route.request.method == "POST" and lost_guest_submission_ack:
                    lost_guest_submission_ack = False
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            submission_pattern = re.compile(r"/v1/(?:conversations/[0-9a-f-]+/submissions|public/organizations/[0-9a-f-]+/inquiries)$")
            await guest.route(submission_pattern, lose_guest_submission_ack)
            await human.get_by_role("button", name="문의 제출").click()
            await guest.get_by_text("응답을 받지 못했습니다", exact=False).wait_for()
            assert not lost_guest_submission_ack
            pending_attempts = await guest.evaluate("""() => Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i))
                .filter(key => key?.startsWith('fieldai:ap:pending-public:')).map(key => sessionStorage.getItem(key))""")
            assert len(pending_attempts) == 1
            assert "010-4444-5555" not in pending_attempts[0] and "방문 상담 가능 시간을" not in pending_attempts[0]
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            await guest.reload(wait_until="networkidle")
            await guest.get_by_text("새로고침 전 저장된 문의를 확인했습니다", exact=False).wait_for()
            assert not await guest.evaluate("""() => Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i))
                .some(key => key?.startsWith('fieldai:ap:pending-public:'))""")
            await guest.unroute(submission_pattern, lose_guest_submission_ack)
            await human.get_by_text("접수 확인키").wait_for()
            receipt_key = await human.locator("code").inner_text()
            follow_up_url = await human.get_by_role("link", name="후속 대화 열기").get_attribute("href")
            assert receipt_key and follow_up_url
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

            await monitor.get_by_role("navigation", name="AP 모바일 관리 메뉴").get_by_role("link", name="오늘").click()
            await expect(monitor.locator(".agent-owner-dashboard > section").get_by_text("합성 AP 고객", exact=False)).to_be_visible()

            await owner.goto("http://localhost:3001/workspace", wait_until="networkidle")
            today_tasks = owner.locator(".agent-owner-dashboard > section")
            await expect(today_tasks.get_by_text("합성 AP 고객", exact=False)).to_be_visible()
            assert await owner.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert await today_tasks.locator(".agent-owner-today-task-content strong").first.evaluate(
                "element => element.scrollWidth <= element.clientWidth")
            await today_tasks.get_by_text("합성 AP 고객", exact=False).scroll_into_view_if_needed()
            await owner.screenshot(path="/tmp/agent-today-task-320.png")
            await today_tasks.get_by_role("button", name=re.compile("합성 AP 고객")).click()
            await expect(owner.locator("#agent-inquiries .agent-inbox-thread-info")).to_contain_text("상담 링크")
            await owner.get_by_role("button", name="문의 목록으로").click()
            await owner.get_by_role("navigation", name="AP 모바일 관리 메뉴").get_by_role("link", name="문의").click()
            inbox = owner.locator("#agent-inquiries")
            await inbox.get_by_role("button", name=re.compile("합성 AP 고객")).click()
            await expect(inbox.locator(".agent-inbox-thread-info")).to_contain_text("상담 링크")
            reply_committed = asyncio.Event()
            release_reply = asyncio.Event()

            async def delayed_reply(route):
                response = await route.fetch()
                reply_committed.set()
                await release_reply.wait()
                await route.fulfill(response=response)

            await owner.route("**/v1/owner/inquiries/*/replies", delayed_reply)
            await inbox.get_by_label("고객에게 답변", exact=True).fill("평일 오후에 연락드리겠습니다.")
            await inbox.get_by_role("button", name="답변 저장").click()
            await asyncio.wait_for(reply_committed.wait(), timeout=10)
            await inbox.get_by_role("button", name="내부 메모").click()
            await inbox.get_by_label("내부 메모", exact=True).fill("합성 검수 기록")
            release_reply.set()
            await inbox.get_by_text("평일 오후에 연락드리겠습니다.").wait_for()
            await expect(inbox.get_by_role("button", name="메모 저장")).to_be_enabled()
            await expect(inbox.get_by_label("내부 메모", exact=True)).to_have_value("합성 검수 기록")
            await inbox.get_by_role("button", name="메모 저장").click()
            await owner.get_by_text("내부 메모를 저장했습니다.", exact=False).wait_for()
            await inbox.get_by_text("합성 검수 기록").wait_for()

            await guest.goto(f"http://localhost:3001{follow_up_url}", wait_until="networkidle")
            await guest.get_by_label("접수 확인키").fill(receipt_key)
            await guest.get_by_role("button", name="문의 열기").click()
            await guest.get_by_text("평일 오후에 연락드리겠습니다.").wait_for()
            assert await guest.get_by_text("합성 검수 기록").count() == 0
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            lost_close_ack = True

            async def lose_close_ack(route):
                nonlocal lost_close_ack
                if lost_close_ack:
                    lost_close_ack = False
                    response = await route.fetch()
                    assert response.status == 200
                    await route.abort("failed")
                else:
                    await route.continue_()

            await owner.route("**/v1/owner/inquiries/*/close", lose_close_ack)
            await inbox.get_by_role("button", name="처리 완료").click()
            await inbox.get_by_text("응답을 받지 못해 처리 결과", exact=False).wait_for()
            assert not lost_close_ack
            await inbox.get_by_role("button", name="현재 상태 다시 확인").click()
            await inbox.get_by_text("이 문의는 처리 완료 상태입니다", exact=False).wait_for()
            await owner.unroute("**/v1/owner/inquiries/*/close", lose_close_ack)
            await owner.screenshot(path="/tmp/agent-inbox-closed-320.png")
            await owner.set_viewport_size({"width": 1440, "height": 900})
            await owner.screenshot(path="/tmp/agent-inbox-closed-1440.png")
            await owner.set_viewport_size({"width": 320, "height": 720})
            await guest.get_by_role("button", name="문의 열기").click()
            await guest.get_by_text("처리 완료된 문의도 추가 질문", exact=False).wait_for()
            assert await owner.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            inquiry_id = follow_up_url.rsplit("/", 1)[-1]
            failed_follow_up_read = True

            async def fail_follow_up_read(route):
                nonlocal failed_follow_up_read
                if failed_follow_up_read:
                    failed_follow_up_read = False
                    await route.abort("failed")
                else:
                    await route.continue_()

            await guest.route(f"**/v1/inquiries/{inquiry_id}", fail_follow_up_read)
            await guest.get_by_label("추가 질문").fill("다음 주 화요일 오후 상담이 가능할까요?")
            await guest.get_by_role("button", name="추가 질문 저장").click()
            await guest.get_by_text("추가 질문을 AP에 저장", exact=False).wait_for()
            await guest.get_by_role("button", name="문의 내용 다시 확인").click()
            await guest.get_by_text("다음 주 화요일 오후 상담이 가능할까요?").wait_for()
            await guest.get_by_role("heading", name=re.compile("사업자 확인 필요")).wait_for()
            await owner.reload(wait_until="networkidle")
            await owner.get_by_role("navigation", name="AP 모바일 관리 메뉴").get_by_role("link", name="문의").click()
            await inbox.get_by_role("button", name=re.compile("합성 AP 고객")).click()
            await inbox.get_by_role("button", name="처리 완료").wait_for()
            assert not failed_follow_up_read
            await guest.unroute(f"**/v1/inquiries/{inquiry_id}", fail_follow_up_read)
            inquiry_record = await guest.request.get(f"http://localhost:3001/v1/inquiries/{inquiry_id}",
                                                     headers={"authorization": f"Bearer {receipt_key}"})
            assert inquiry_record.status == 200
            assert len([item for item in (await inquiry_record.json())["messages"]
                        if item["body"] == "다음 주 화요일 오후 상담이 가능할까요?"]) == 1
            lost_followup_ack = True
            followup_body = "새로고침 뒤에도 같은 추가 질문을 확인합니다."

            async def lose_followup_ack(route):
                nonlocal lost_followup_ack
                if lost_followup_ack:
                    lost_followup_ack = False
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            await guest.route(f"**/v1/inquiries/{inquiry_id}/messages", lose_followup_ack)
            await guest.get_by_label("추가 질문").fill(followup_body)
            await guest.get_by_role("button", name="추가 질문 저장").click()
            await guest.get_by_text("응답을 받지 못했습니다", exact=False).wait_for()
            assert not lost_followup_ack
            pending_messages = await guest.evaluate("""() => Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i))
                .filter(key => key?.startsWith('fieldai:ap:pending-message:')).map(key => sessionStorage.getItem(key))""")
            assert len(pending_messages) == 1 and followup_body not in pending_messages[0]
            await guest.reload(wait_until="networkidle")
            await guest.get_by_text("새로고침 전 저장된 추가 질문을 확인했습니다", exact=False).wait_for()
            await guest.get_by_text(followup_body).wait_for()
            assert not await guest.evaluate("""() => Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i))
                .some(key => key?.startsWith('fieldai:ap:pending-message:'))""")
            await guest.unroute(f"**/v1/inquiries/{inquiry_id}/messages", lose_followup_ack)
            inquiry_record = await guest.request.get(f"http://localhost:3001/v1/inquiries/{inquiry_id}",
                                                     headers={"authorization": f"Bearer {receipt_key}"})
            recovered_state = await inquiry_record.json()
            recovered_messages = [item for item in recovered_state["messages"] if item["body"] == followup_body]
            assert len(recovered_messages) == 1
            recovered_message_id = recovered_messages[0]["id"]
            await guest.get_by_label("문의 사진 첨부 (선택, 최대 8MB)").set_input_files(
                "quality_checks/report_320.png")
            await guest.get_by_role("button", name="사진만 첨부 또는 재시도").click()
            await guest.get_by_text("사진을 문의에 비공개로 저장했습니다", exact=False).wait_for()
            recovered_photo_state = await (await guest.request.get(
                f"http://localhost:3001/v1/inquiries/{inquiry_id}",
                headers={"authorization": f"Bearer {receipt_key}"})).json()
            assert len([item for item in recovered_photo_state["attachments"]
                        if item["messageId"] == recovered_message_id]) == 1
            await guest.locator("li").filter(has_text=followup_body).get_by_role("img").wait_for()
            photo_upload_committed = False
            failed_photo_read = True
            photo_uploaded = asyncio.Event()

            async def commit_follow_up_photo(route):
                nonlocal photo_upload_committed
                response = await route.fetch()
                assert response.status == 201
                photo_upload_committed = True
                photo_uploaded.set()
                await route.fulfill(response=response)

            async def fail_photo_read(route):
                nonlocal failed_photo_read
                if photo_upload_committed and failed_photo_read:
                    failed_photo_read = False
                    await route.abort("failed")
                else:
                    await route.continue_()

            await guest.route(f"**/v1/inquiries/{inquiry_id}/messages/*/attachments", commit_follow_up_photo)
            await guest.route(f"**/v1/inquiries/{inquiry_id}", fail_photo_read)
            await guest.get_by_label("문의 사진 첨부 (선택, 최대 8MB)").set_input_files(
                "quality_checks/report_320.png")
            assert await guest.get_by_text("선택한 사진: report_320.png").count() == 1, (
                "selecting the same file after a saved upload must update the photo state")
            await guest.get_by_label("추가 질문").fill("사진도 AP에서 확인해 주세요.")
            await guest.get_by_role("button", name="추가 질문 저장").click()
            await asyncio.wait_for(photo_uploaded.wait(), timeout=10)
            await guest.get_by_text("사진을 문의에 비공개로 저장했습니다", exact=False).wait_for()
            await guest.get_by_role("button", name="문의 내용 다시 확인").click()
            await guest.get_by_text("사진도 AP에서 확인해 주세요.").wait_for()
            await guest.get_by_role("img", name="고객 첨부 사진 1").wait_for()
            assert photo_upload_committed and not failed_photo_read
            await guest.unroute(f"**/v1/inquiries/{inquiry_id}/messages/*/attachments", commit_follow_up_photo)
            await guest.unroute(f"**/v1/inquiries/{inquiry_id}", fail_photo_read)
            photo_inquiry = await guest.request.get(f"http://localhost:3001/v1/inquiries/{inquiry_id}",
                                                   headers={"authorization": f"Bearer {receipt_key}"})
            assert photo_inquiry.status == 200
            photo_state = await photo_inquiry.json()
            photo_messages = [item for item in photo_state["messages"] if item["body"] == "사진도 AP에서 확인해 주세요."]
            assert len(photo_messages) == 1
            assert len([item for item in photo_state["attachments"]
                        if item["messageId"] == photo_messages[0]["id"]]) == 1

            external_origin = os.environ["AP_TEST_EXTERNAL_SITE_ORIGIN"]
            fixture_port = urlparse(external_origin).port
            assert fixture_port
            await owner.goto("http://localhost:3001/workspace/deployments", wait_until="networkidle")
            await owner.get_by_label("사이트 origin").fill(external_origin)
            await owner.get_by_role("button", name="위젯 등록").click()
            widget = owner.locator(".deployment-list article.knowledge-source").filter(
                has=owner.get_by_role("heading", name=re.compile("소유 사이트 위젯")))
            await widget.get_by_role("button", name="소유 확인").wait_for()
            await expect(widget).to_contain_text("/.well-known/ap-site-verification")
            proof_text = await widget.locator("code").last.inner_text()
            assert proof_text.startswith("ap-site-verification=")
            proof = proof_text.split("=", 1)[1]
            await widget.get_by_role("button", name="소유 확인").click()
            await owner.get_by_text("사이트 소유 증명 또는 최신 AI·지식 승인이 필요합니다.").wait_for()
            urlopen(Request(f"http://127.0.0.1:{fixture_port}/__test/proof",
                            data=proof.encode(), method="PUT"), timeout=5).close()
            await widget.get_by_role("button", name="소유 확인").click()
            await widget.get_by_text("사이트 소유 확인 완료").wait_for()
            lost_widget_activation = True

            async def widget_activation_route(route):
                nonlocal lost_widget_activation
                if route.request.method == "POST" and lost_widget_activation:
                    lost_widget_activation = False
                    await route.fetch()
                    await route.abort("failed")
                else:
                    await route.continue_()

            await owner.route("**/v1/deployments/*/activate", widget_activation_route)
            await widget.get_by_role("button", name="활성화").click()
            await owner.get_by_text("배포 상태 변경 결과를 확인할 수 없습니다", exact=False).wait_for()
            await owner.get_by_role("button", name="다시 불러오기").click()
            await owner.unroute("**/v1/deployments/*/activate", widget_activation_route)
            widget = owner.locator(".deployment-list article.knowledge-source").filter(
                has=owner.get_by_role("heading", name=re.compile("소유 사이트 위젯")))
            await widget.get_by_text("본문에 표시하는 코드:").wait_for()
            install_code = await widget.locator("code").first.inner_text()
            assert 'src="http://localhost:3001/sdk/v1.js"' in install_code
            public_id = re.search(r'data-deployment="(dep_[A-Za-z0-9_-]{20,50})"', install_code)
            assert public_id, install_code
            urlopen(Request(f"http://127.0.0.1:{fixture_port}/__test/deployment",
                            data=public_id.group(1).encode(), method="PUT"), timeout=5).close()

            response = await guest.goto(external_origin, wait_until="networkidle")
            assert response and response.status == 200
            await guest.get_by_role("heading", name="독립 외부 사이트").wait_for()
            await guest.get_by_role("button", name="사업자 상담 열기").click()
            frame = guest.frame_locator(f'iframe[src*="/embed/v1/{public_id.group(1)}/frame"]')
            await frame.get_by_text("상담 연결 준비 완료").wait_for()
            await frame.get_by_label("질문 또는 문의 초안 (연락처 제외)").fill("방문 상담은 언제 가능한가요?")
            await frame.get_by_role("button", name="AI에 질문").click()
            await frame.get_by_text("AI 공급사가 연결되지 않았습니다.", exact=False).wait_for()
            async with guest.expect_popup() as popup_info:
                await frame.get_by_role("button", name="AP에서 이어가기").click()
            consult = await popup_info.value
            consult_responses = []
            consult.on("response", lambda response: consult_responses.append(
                f"{response.status} {response.url}") if "/v1/" in response.url else None)
            await consult.locator(".agent-public-header-business strong").get_by_text("합성 AP 상담실").wait_for()
            external_human = consult.locator("section.special-panel").filter(
                has=consult.get_by_role("heading", name="사람에게 문의"))
            await expect(external_human.get_by_label("문의 내용")).to_contain_text("방문 상담은 언제 가능한가요?")
            await external_human.get_by_label("이름").fill("합성 외부 사이트 고객")
            await external_human.get_by_label("연락처", exact=True).fill("010-5555-6666")
            await external_human.get_by_role("checkbox").check()
            await external_human.get_by_role("button", name="문의 제출").click()
            try:
                await external_human.get_by_text("접수 확인키").wait_for(timeout=10000)
            except Exception:
                print("external inquiry status:", await consult.locator('[role="status"]').all_text_contents(),
                      "responses:", consult_responses, file=sys.stderr)
                raise
            external_receipt_key = await external_human.locator("code").inner_text()
            external_follow_up = await external_human.get_by_role("link", name="후속 대화 열기").get_attribute("href")
            assert external_receipt_key and external_follow_up
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

            await owner.goto("http://localhost:3001/workspace", wait_until="networkidle")
            await owner.get_by_role("navigation", name="AP 모바일 관리 메뉴").get_by_role("link", name="문의").click()
            inbox = owner.locator("#agent-inquiries")
            await inbox.get_by_role("button", name=re.compile("합성 외부 사이트 고객")).click()
            await expect(inbox.locator(".agent-inbox-thread-info")).to_contain_text("외부 사이트 위젯")
            await inbox.get_by_label("고객에게 답변", exact=True).fill("외부 사이트 문의에 답변드립니다.")
            await inbox.get_by_role("button", name="답변 저장").click()
            await inbox.get_by_text("외부 사이트 문의에 답변드립니다.").wait_for()
            await consult.goto(f"http://localhost:3001{external_follow_up}", wait_until="networkidle")
            await consult.get_by_label("접수 확인키").fill(external_receipt_key)
            await consult.get_by_role("button", name="문의 열기").click()
            await consult.get_by_text("외부 사이트 문의에 답변드립니다.").wait_for()

            fresh_context = await browser.new_context(viewport={"width": 320, "height": 720})
            fresh = await fresh_context.new_page()
            fresh.on("pageerror", lambda error: errors.append(f"fresh: {error}"))
            await fresh.goto(external_origin, wait_until="networkidle")
            await fresh.get_by_role("button", name="사업자 상담 열기").click()
            fallback_frame = fresh.frame_locator(f'iframe[src*="/embed/v1/{public_id.group(1)}/frame"]')
            async with fresh.expect_popup() as fallback_popup_info:
                await fallback_frame.get_by_role("link", name="직접 문의 링크").click()
            fallback = await fallback_popup_info.value
            await fallback.get_by_role("heading", name="합성 AP 상담실").wait_for()
            fallback_human = fallback.locator("section.special-panel").filter(
                has=fallback.get_by_role("heading", name="사람에게 문의"))
            await fallback_human.get_by_label("이름").fill("합성 직접 문의 고객")
            await fallback_human.get_by_label("연락처", exact=True).fill("010-6666-7777")
            await fallback_human.get_by_label("문의 내용").fill("팝업 인계 없이 바로 문의합니다.")
            await fallback_human.get_by_role("checkbox").check()
            await fallback_human.get_by_role("button", name="문의 제출").click()
            await fallback_human.get_by_text("접수 확인키").wait_for(timeout=10000)
            await owner.goto("http://localhost:3001/workspace/subscription", wait_until="networkidle")
            await owner.get_by_role("heading", name="사업·직접 문의 기록 내보내기").wait_for()
            async with owner.expect_download() as download_info:
                await owner.get_by_role("button", name="조직 사업·직접 문의 기록 다운로드").click()
            download = await download_info.value
            assert download.suggested_filename.startswith("ap-inquiries-")
            archive = json.loads(Path(await download.path()).read_text())
            assert archive["product"] == "agent"
            assert archive["account"]["email"] == os.environ["AP_TEST_OWNER_EMAIL"]
            assert any(member["role"] == "owner" and member["email"] == os.environ["AP_TEST_OWNER_EMAIL"]
                       for member in archive["memberships"])
            assert archive["knowledge"]["releases"]
            assert archive["agent"]["releases"]
            assert archive["deployments"]
            assert len(archive["inquiries"]) >= 2
            assert any(row["customerName"] == "합성 외부 사이트 고객"
                       for row in archive["inquiries"])
            assert await owner.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("AP owner to guest consultation flow: passed (link and independent owned widget)")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
