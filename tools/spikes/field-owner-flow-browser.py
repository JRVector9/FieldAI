import asyncio
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from playwright.async_api import async_playwright, expect


async def assert_customer_response_loss(guest, reservation_id, key, path, button_name, event_type, label):
    lost_ack = True
    failed_read = True

    async def lose_ack(route):
        nonlocal lost_ack
        if lost_ack:
            lost_ack = False
            response = await route.fetch()
            assert response.status == 200
            await route.abort("failed")
        else:
            await route.continue_()

    async def fail_read(route):
        nonlocal failed_read
        if failed_read:
            failed_read = False
            await route.fulfill(status=503, content_type="application/json",
                                body='{"error":"temporary_unavailable"}')
        else:
            await route.continue_()

    await guest.route(f"**/v1/reservations/{reservation_id}/{path}", lose_ack)
    await guest.route(f"**/v1/reservations/{reservation_id}", fail_read)
    await guest.get_by_role("button", name=button_name, exact=True).click()
    await guest.get_by_text("요청 결과를 확인할 수 없습니다", exact=False).wait_for()
    await expect(guest.get_by_role("button", name=button_name, exact=True)).to_be_hidden()
    await guest.get_by_role("button", name="예약 요청 결과 확인").click()
    await guest.get_by_text(f"{label} 처리가 예약 기록에서 확인됐습니다", exact=False).wait_for()
    assert not lost_ack and not failed_read
    await guest.unroute(f"**/v1/reservations/{reservation_id}/{path}", lose_ack)
    await guest.unroute(f"**/v1/reservations/{reservation_id}", fail_read)
    result = await guest.request.get(f"http://127.0.0.1:3002/v1/reservations/{reservation_id}",
                                     headers={"authorization": f"Bearer {key}"})
    assert result.status == 200
    assert len([event for event in (await result.json())["events"]
                if event["eventType"] == event_type]) == 1


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        owner_context = await browser.new_context(viewport={"width": 320, "height": 720}, timezone_id="Asia/Seoul")
        guest_context = await browser.new_context(viewport={"width": 320, "height": 720}, timezone_id="Asia/Seoul")
        owner = await owner_context.new_page()
        guest = await guest_context.new_page()
        owner.set_default_timeout(15000)
        guest.set_default_timeout(15000)
        errors = []
        owner.on("pageerror", lambda error: errors.append(f"owner: {error}"))
        guest.on("pageerror", lambda error: errors.append(f"guest: {error}"))
        try:
            response = await owner.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            assert response and response.status == 200
            signup = owner.locator("section.field-auth-form")
            await signup.get_by_label("이름").fill("합성 사업자")
            await signup.get_by_label("이메일").fill(os.environ["FIELD_TEST_OWNER_EMAIL"])
            await signup.get_by_label("비밀번호").fill(os.environ["FIELD_TEST_OWNER_PASSWORD"])
            await signup.get_by_role("button", name="내 홈페이지 시작하기").click()

            await owner.get_by_role("heading", name="내 홈페이지 만들기").wait_for()
            await owner.get_by_label("상호").fill("합성 레슨 스튜디오")
            await owner.get_by_role("button", name="조직 만들기").click()

            await owner.get_by_role("heading", name="사업 정보 초안").wait_for()

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
            await recovery.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            await recovery.get_by_role("heading", name="작업실을 불러오지 못했습니다").wait_for()
            await expect(recovery.get_by_role("heading", name="로그인")).to_be_hidden()
            await recovery.get_by_role("button", name="다시 시도").click()
            await recovery.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="더보기").click()
            await recovery.get_by_role("button", name="사업 정보·서비스", exact=True).click()
            await recovery.get_by_role("button", name="사업 정보·공개 관리").click()
            await recovery.get_by_role("heading", name="사업 정보 초안").wait_for()
            await recovery.unroute("**/api/auth/get-session", session_load_route)

            fail_catalog_load = True

            async def catalog_load_route(route):
                nonlocal fail_catalog_load
                if route.request.method == "GET" and fail_catalog_load:
                    fail_catalog_load = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await recovery.route("**/v1/business/draft", catalog_load_route)
            await recovery.reload(wait_until="networkidle")
            await recovery.get_by_role("heading", name="작업실을 불러오지 못했습니다").wait_for()
            await expect(recovery.get_by_role("heading", name="로그인")).to_be_hidden()
            await recovery.get_by_role("button", name="다시 시도").click()
            await recovery.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="더보기").click()
            await recovery.get_by_role("button", name="사업 정보·서비스", exact=True).click()
            await recovery.get_by_role("button", name="사업 정보·공개 관리").click()
            await recovery.get_by_role("heading", name="사업 정보 초안").wait_for()
            await recovery.close()

            await owner.get_by_role("button", name="서비스 추가", exact=True).click()
            await owner.get_by_label("서비스 이름").fill("개인 레슨")
            await owner.get_by_label("서비스 설명").fill("상담 후 진행")
            await owner.get_by_role("button", name="서비스 추가", exact=True).click()
            await owner.get_by_label("서비스 이름").nth(1).fill("그룹 레슨")
            await owner.get_by_label("서비스 설명").nth(1).fill("시간표에서 선택")
            second_service = owner.get_by_label("서비스 이름").nth(1).locator("xpath=../..")
            await second_service.locator("select").first.select_option("slot")
            await owner.get_by_role("button", name="FAQ 추가").click()
            await owner.get_by_label("FAQ 질문 1").fill("준비물이 필요한가요?")
            await owner.get_by_label("FAQ 답변 1").fill("별도 준비물은 없습니다.")
            await expect(owner.get_by_role("button", name="현재 초안 승인")).to_be_enabled(timeout=15000)
            await owner.get_by_role("button", name="현재 초안 승인").click()
            await expect(owner.get_by_text("승인 버전: 1번")).to_be_visible()
            publication_check = await owner_context.new_page()
            publication_check.set_default_timeout(15000)
            publication_check.on("pageerror", lambda error: errors.append(f"publication: {error}"))
            await publication_check.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            await expect(publication_check.locator(".field-owner-stats article").filter(has_text="홈페이지")).to_contain_text("초안")
            await expect(publication_check.get_by_role("link", name="사이트 보기 ↗")).to_have_count(0)

            booking_day = (datetime.now(ZoneInfo("Asia/Seoul")) + timedelta(days=7)).date()
            weekday = ("월", "화", "수", "목", "금", "토", "일")[booking_day.weekday()]
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="예약").click()
            policy = owner.locator("#owner-reservations")
            await policy.get_by_text("영업시간·예약 정책 설정").click()
            day_row = policy.locator(".booking-weekday").filter(has_text=f"{weekday}요일").first
            await day_row.get_by_role("checkbox").check()
            await day_row.get_by_label("시작").fill("09:00")
            await day_row.get_by_label("종료").fill("17:00")
            await policy.get_by_role("button", name="예약 정책 저장").click()
            await policy.get_by_text("예약 정책이 저장되었습니다.").wait_for()
            today_block_start = datetime.now(ZoneInfo("Asia/Seoul")).replace(
                hour=12, minute=0, second=0, microsecond=0)
            today_block = await owner.request.post("http://127.0.0.1:3002/v1/owner/blocks", data={
                "startAt": today_block_start.isoformat(),
                "endAt": (today_block_start + timedelta(minutes=45)).isoformat(),
                "label": "합성 오늘 내부 일정",
            })
            assert today_block.status == 201
            today_block_id = (await today_block.json())["id"]
            await publication_check.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="오늘").click()
            await expect(publication_check.locator(".field-owner-stats article").filter(has_text="오늘 일정")).to_contain_text("1")
            await expect(publication_check.get_by_text("합성 오늘 내부 일정")).to_be_visible()
            assert await publication_check.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            await publication_check.get_by_text("합성 오늘 내부 일정").scroll_into_view_if_needed()
            await publication_check.screenshot(path="/tmp/field-today-schedule-320.png")
            await publication_check.get_by_role("button", name="일정 직접 추가").click()
            await expect(publication_check.get_by_role("dialog", name="수동 일정 등록")).to_be_visible()
            await publication_check.get_by_role("dialog", name="수동 일정 등록").get_by_role("button", name="닫기").click()
            fail_today_calendar = True

            async def today_calendar_route(route):
                if fail_today_calendar:
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await publication_check.route("**/v1/owner/reservations/calendar?*", today_calendar_route)
            await publication_check.reload(wait_until="networkidle")
            await expect(publication_check.locator(".field-owner-stats article").filter(has_text="오늘 일정")).to_contain_text("—")
            fail_today_calendar = False
            await publication_check.get_by_role("button", name="오늘 일정 다시 확인").click()
            await expect(publication_check.locator(".field-owner-stats article").filter(has_text="오늘 일정")).to_contain_text("1")
            await publication_check.unroute("**/v1/owner/reservations/calendar?*", today_calendar_route)
            removed_today_block = await owner.request.delete(f"http://127.0.0.1:3002/v1/owner/blocks/{today_block_id}")
            assert removed_today_block.status == 204
            await publication_check.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="오늘").click()
            await expect(publication_check.locator(".field-owner-stats article").filter(has_text="오늘 일정")).to_contain_text("0")

            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="내 사이트").click()
            await owner.get_by_role("button", name="사이트 시작하기").click()
            await owner.get_by_role("button", name="3 편집").click()
            await owner.get_by_label("페이지 이름").fill("홈")
            await owner.get_by_role("button", name="페이지 추가").click()
            await owner.get_by_label("페이지 이름").fill("서비스 안내")
            await owner.get_by_label("페이지 주소 경로").fill("services")
            await owner.get_by_role("button", name="섹션 추가").click()
            await owner.get_by_label("제목").first.fill("개인 레슨 안내")
            await owner.get_by_role("textbox", name="본문").first.fill("상담 후 일정을 정합니다.")
            await owner.get_by_role("button", name="섹션 추가").click()
            await owner.get_by_label("제목").nth(1).fill("상담 절차")
            await owner.get_by_role("textbox", name="본문").nth(1).fill("문의 후 일정을 확정합니다.")
            await owner.get_by_role("button", name="2번 섹션 위로 이동").focus()
            await owner.keyboard.press("Enter")
            await expect(owner.get_by_label("제목").first).to_have_value("상담 절차")
            await expect(owner.get_by_label("제목").nth(1)).to_have_value("개인 레슨 안내")
            await owner.get_by_role("button", name="섹션 추가").click()
            await owner.get_by_label("제목").nth(2).fill("삭제할 섹션")
            await owner.get_by_role("button", name="3번 섹션 삭제").focus()
            await owner.keyboard.press("Enter")
            await expect(owner.get_by_label("제목")).to_have_count(2)
            await owner.get_by_role("button", name="섹션 추가").click()
            faq_section = owner.get_by_role("group", name="3번 섹션")
            await faq_section.get_by_label("구성").select_option("faq")
            await faq_section.get_by_label("제목").fill("자주 묻는 질문")
            await owner.get_by_role("button", name="초안 저장").click()
            revision = owner.locator("main p").filter(has_text="기본 주소:").first
            await expect(revision).not_to_contain_text("미저장 변경", timeout=15000)
            saved_draft = await owner.request.get("http://127.0.0.1:3002/v1/sites/draft")
            assert saved_draft.status == 200
            services_page = next(page for page in (await saved_draft.json())["pages"] if page["slug"] == "services")
            assert [section["heading"] for section in services_page["sections"]] == ["상담 절차", "개인 레슨 안내", "자주 묻는 질문"]

            await owner.get_by_role("button", name="5 확인·공개").click()
            await expect(owner.get_by_role("button", name="현재 초안 공개")).to_be_enabled()
            completion = owner.get_by_role("region", name="사이트 개설 완료")
            await expect(completion).to_be_hidden()
            lose_public_read = True

            async def lost_public_read(route):
                nonlocal lose_public_read
                if route.request.method == "GET" and lose_public_read:
                    lose_public_read = False
                    await route.abort("failed")
                else:
                    await route.continue_()

            await owner.route("**/v1/public/sites/*", lost_public_read)
            await owner.get_by_role("button", name="현재 초안 공개").click()
            await owner.get_by_text("공개는 완료됐지만 상태를 다시 읽지 못했습니다", exact=False).wait_for()
            await expect(completion).to_be_hidden()
            await owner.get_by_role("button", name="다시 불러오기").click()
            public_link = owner.get_by_role("link", name="공개 사이트 열기")
            await public_link.wait_for()
            await expect(completion).to_be_visible()
            await owner.unroute("**/v1/public/sites/*", lost_public_read)
            public_url = await public_link.get_attribute("href")
            assert public_url and public_url.startswith("http://field-")
            assert ".localhost:3002/site/" in public_url
            await guest.goto(f"{public_url}/services", wait_until="networkidle")
            await expect(guest.get_by_text("준비물이 필요한가요?", exact=True)).to_be_visible()
            await expect(guest.get_by_text("별도 준비물은 없습니다.", exact=True)).to_be_visible()
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            await guest.screenshot(path="/tmp/field-faq-320.png", full_page=True)
            await guest.set_viewport_size({"width": 1440, "height": 900})
            await guest.screenshot(path="/tmp/field-faq-1440.png", full_page=True)
            await guest.set_viewport_size({"width": 320, "height": 720})
            customer_link = completion.get_by_role("link", name="고객 문의 화면 확인")
            assert (await customer_link.get_attribute("href")).startswith(public_url.split("/site/")[0] + "/public/")
            assert await completion.get_by_role("link", name="사업 운영으로 이동").get_attribute("href") == "/workspace"
            assert await completion.get_by_role("link", name="AP 연결 선택하기").get_attribute("href") == "/workspace/integrations"
            await expect(completion).to_contain_text("실제 문의를 제출하면 접수로 기록됩니다")
            assert await owner.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

            async def missing_public_origin(route):
                response = await route.fetch()
                value = await response.json()
                await route.fulfill(status=200, content_type="application/json",
                                    body=json.dumps({**value, "siteOrigin": None}))

            await owner.route("**/v1/public/sites/*", missing_public_origin)
            await owner.reload(wait_until="networkidle")
            await owner.get_by_text("공개본은 있지만 고객 주소를 확인하지 못했습니다", exact=False).wait_for()
            await expect(completion).to_be_hidden()
            await expect(public_link).to_be_hidden()
            await owner.unroute("**/v1/public/sites/*", missing_public_origin)
            await owner.get_by_role("button", name="공개 주소 다시 확인").click()
            await expect(completion).to_be_visible()

            await owner.get_by_role("button", name="3 편집").click()
            await owner.get_by_role("textbox", name="본문").first.fill("상담 후 일정을 정합니다. 공개 결과 재조회 검수.")
            await expect(revision).not_to_contain_text("미저장 변경", timeout=15000)
            draft_before_publish = await owner.request.get("http://127.0.0.1:3002/v1/sites/draft")
            assert draft_before_publish.status == 200
            next_revision = (await draft_before_publish.json())["revision"]
            await owner.get_by_role("button", name="5 확인·공개").click()
            lose_publish_ack = True

            async def lost_publish_ack(route):
                nonlocal lose_publish_ack
                if route.request.method == "POST" and lose_publish_ack:
                    lose_publish_ack = False
                    await route.fetch()
                    await route.abort("failed")
                else:
                    await route.continue_()

            await owner.route("**/v1/sites/releases", lost_publish_ack)
            await owner.get_by_role("button", name="현재 초안 공개").click()
            await owner.get_by_text("공개 요청 결과를 확인할 수 없습니다", exact=False).wait_for()
            await expect(public_link).to_be_hidden()
            await expect(completion).to_be_hidden()
            await owner.get_by_role("button", name="다시 불러오기").click()
            await public_link.wait_for()
            await expect(revision).to_contain_text(f"공개 {next_revision}번")
            await owner.unroute("**/v1/sites/releases", lost_publish_ack)
            public_slug = public_url.rsplit("/", 1)[1]
            confirmed_public = await owner.request.get(
                f"http://127.0.0.1:3002/v1/public/sites/{public_slug}")
            assert confirmed_public.status == 200
            assert (await confirmed_public.json())["siteRevision"] == next_revision
            await publication_check.reload(wait_until="networkidle")
            await expect(publication_check.locator(".field-owner-stats article").filter(has_text="홈페이지")).to_contain_text("공개")
            await expect(publication_check.get_by_role("link", name="사이트 보기 ↗")).to_have_attribute("href", public_url)
            await expect(publication_check.get_by_text("새 문의나 예약 요청이 도착하면 여기에 표시됩니다.")).to_be_visible()
            fail_catalog_status = True

            async def catalog_status_route(route):
                nonlocal fail_catalog_status
                if fail_catalog_status:
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await publication_check.route("**/v1/public/catalog/*", catalog_status_route)
            await publication_check.reload(wait_until="networkidle")
            await expect(publication_check.get_by_role("button", name="사업 정보 공개 상태 다시 확인")).to_be_visible()
            await publication_check.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="더보기").click()
            await publication_check.get_by_role("button", name="사업 정보·서비스", exact=True).click()
            await publication_check.get_by_role("button", name="사업 정보·공개 관리").click()
            await expect(publication_check.get_by_text("승인 버전: 확인 불가")).to_be_visible()
            await expect(publication_check.get_by_role("button", name="현재 초안 승인")).to_be_disabled()
            fail_catalog_status = False
            await publication_check.get_by_role("button", name="사업 정보 공개 상태 다시 확인").click()
            await expect(publication_check.get_by_text("승인 버전: 1번")).to_be_visible()
            await publication_check.unroute("**/v1/public/catalog/*", catalog_status_route)

            fail_site_status = True

            async def site_status_route(route):
                nonlocal fail_site_status
                if fail_site_status:
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await publication_check.route("**/v1/public/sites/*", site_status_route)
            await publication_check.reload(wait_until="networkidle")
            await expect(publication_check.locator(".field-owner-stats article").filter(has_text="홈페이지")).to_contain_text("확인 불가")
            await expect(publication_check.get_by_role("link", name="사이트 보기 ↗")).to_have_count(0)
            fail_site_status = False
            await publication_check.get_by_role("button", name="홈페이지 공개 상태 다시 확인").click()
            await expect(publication_check.locator(".field-owner-stats article").filter(has_text="홈페이지")).to_contain_text("공개")
            await publication_check.unroute("**/v1/public/sites/*", site_status_route)
            await publication_check.close()
            public_services = next(page for page in (await confirmed_public.json())["pages"] if page["slug"] == "services")
            assert [section["heading"] for section in public_services["sections"]] == ["상담 절차", "개인 레슨 안내", "자주 묻는 질문"]
            releases = await owner.request.get("http://127.0.0.1:3002/v1/sites/releases")
            assert releases.status == 200
            assert sum(item["revision"] == next_revision
                       for item in (await releases.json())["releases"]) == 1

            fail_public_load = True

            async def public_load_route(route):
                nonlocal fail_public_load
                if route.request.method == "GET" and fail_public_load:
                    fail_public_load = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route("**/v1/public/sites/*", public_load_route)
            await owner.reload(wait_until="networkidle")
            await owner.get_by_text("공개 사이트 상태를 불러오지 못했습니다", exact=False).wait_for()
            await expect(public_link).to_be_hidden()
            await owner.get_by_role("button", name="다시 불러오기").click()
            await public_link.wait_for()
            await expect(revision).not_to_contain_text("공개 전")
            await owner.unroute("**/v1/public/sites/*", public_load_route)

            fail_history_load = True

            async def history_load_route(route):
                nonlocal fail_history_load
                if route.request.method == "GET" and fail_history_load:
                    fail_history_load = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route("**/v1/sites/releases", history_load_route)
            await owner.reload(wait_until="networkidle")
            await owner.get_by_text("공개 버전 목록을 불러오지 못했습니다", exact=False).wait_for()
            await expect(public_link).to_be_hidden()
            await owner.get_by_role("button", name="다시 불러오기").click()
            await public_link.wait_for()
            await expect(owner.get_by_text("아직 공개 버전이 없습니다.")).to_have_count(0)
            await owner.unroute("**/v1/sites/releases", history_load_route)

            test_link = completion.get_by_role("link", name="고객처럼 첫 문의 테스트")
            test_href = await test_link.get_attribute("href")
            assert test_href and test_href.startswith("/public/") and "ownerTest=1" in test_href
            denied_test = await guest.goto(f"http://127.0.0.1:3002{test_href}", wait_until="networkidle")
            assert denied_test and denied_test.status == 200
            await guest.get_by_text("사업자 로그인 후 이 화면을 다시 열어 주세요", exact=False).wait_for()
            await expect(guest.get_by_role("button", name="테스트 문의 제출")).to_have_count(0)
            await expect(guest.get_by_role("button", name="문의 제출", exact=True)).to_have_count(0)
            await expect(guest.get_by_role("button", name="예약 요청 제출")).to_have_count(0)
            editor_url = owner.url
            await test_link.click()
            await owner.get_by_role("heading", name="사업자 첫 문의 테스트").wait_for()
            await expect(owner.get_by_role("button", name="문의 제출", exact=True)).to_have_count(0)
            await expect(owner.get_by_label("연락처", exact=True)).to_have_count(0)
            await expect(owner.get_by_role("button", name="예약 요청", exact=True)).to_have_count(0)
            test_form = owner.locator("section.special-panel").filter(
                has=owner.get_by_role("heading", name="문의 테스트 작성"))
            await test_form.get_by_label("이름").fill("사업자 고객 체험")
            await test_form.get_by_label("문의 내용").fill("문의 화면과 사업자 답변을 확인합니다.")
            test_ack_lost = True

            async def lose_test_ack(route):
                nonlocal test_ack_lost
                if route.request.method == "POST" and test_ack_lost:
                    test_ack_lost = False
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            await owner.route("**/v1/owner/site-inquiry-test", lose_test_ack)
            await test_form.get_by_role("button", name="테스트 문의 제출").click()
            await owner.get_by_text("테스트 접수 결과를 확인할 수 없습니다", exact=False).wait_for()
            await test_form.get_by_role("button", name="테스트 문의 제출").click()
            await owner.get_by_text("이전 테스트 문의를 확인했습니다", exact=False).wait_for()
            assert not test_ack_lost
            await owner.unroute("**/v1/owner/site-inquiry-test", lose_test_ack)
            test_inbox = await owner.request.get("http://127.0.0.1:3002/v1/owner/inquiries")
            assert test_inbox.status == 200
            assert len([item for item in (await test_inbox.json())["inquiries"] if item["is_test"]]) == 1
            await owner.reload(wait_until="networkidle")
            await owner.get_by_text("이 공개 버전의 테스트 문의가 이미 있습니다", exact=False).wait_for()
            await owner.goto(editor_url, wait_until="networkidle")

            response = await guest.goto(public_url, wait_until="networkidle")
            assert response and response.status == 200
            assert await guest.get_by_role("link", name="서비스 안내").count() == 1
            await guest.get_by_role("link", name="서비스 안내").click()
            await guest.get_by_role("heading", name="개인 레슨 안내").wait_for()
            assert await guest.locator(".field-site-section h1").all_inner_texts() == ["상담 절차", "개인 레슨 안내", "자주 묻는 질문"]
            fail_customer_catalog = True

            async def customer_catalog_route(route):
                nonlocal fail_customer_catalog
                if route.request.method == "GET" and fail_customer_catalog:
                    fail_customer_catalog = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await guest.route("**/v1/public/catalog/*", customer_catalog_route)
            await guest.get_by_role("link", name="직접 문의하기").click()
            await guest.wait_for_load_state("networkidle")
            assert not fail_customer_catalog
            await guest.get_by_text("사업 정보를 불러오지 못했습니다", exact=False).wait_for()
            await expect(guest.get_by_text("공개된 사업 정보가 없습니다", exact=False)).to_have_count(0)
            await expect(guest.get_by_role("button", name="문의 제출")).to_have_count(0)
            await guest.get_by_role("button", name="사업 정보 다시 불러오기").click()
            await guest.unroute("**/v1/public/catalog/*", customer_catalog_route)
            form = guest.locator("section.special-panel").filter(
                has=guest.get_by_role("heading", name="문의 남기기"))
            await form.get_by_label("이름").fill("합성 고객")
            await form.get_by_label("연락처", exact=True).fill("010-1111-2222")
            await form.get_by_label("문의 내용").fill("개인 레슨 가능 시간을 알려주세요.")
            await form.get_by_role("checkbox").check()
            monitor = await owner_context.new_page()
            await monitor.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            await expect(monitor.locator(".field-owner-dashboard > section").get_by_text("합성 고객", exact=False)).to_have_count(0)
            lost_guest_inquiry_ack = True
            inquiry_posts = 0

            async def lose_guest_inquiry_ack(route):
                nonlocal lost_guest_inquiry_ack, inquiry_posts
                inquiry_posts += 1
                if route.request.method == "POST" and lost_guest_inquiry_ack:
                    lost_guest_inquiry_ack = False
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            await guest.route("**/v1/public/catalog/*/inquiries", lose_guest_inquiry_ack)
            await form.get_by_role("button", name="문의 제출").click()
            await guest.get_by_text("응답을 받지 못했습니다", exact=False).wait_for()
            assert not lost_guest_inquiry_ack
            pending_inquiries = await guest.evaluate("""() => Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i))
                .filter(key => key?.startsWith('fieldai:field:pending-public:')).map(key => sessionStorage.getItem(key))""")
            assert len(pending_inquiries) == 1
            assert "010-1111-2222" not in pending_inquiries[0] and "개인 레슨 가능 시간을" not in pending_inquiries[0]
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            block_inquiry_recovery = True

            async def unavailable_inquiry_recovery(route):
                if block_inquiry_recovery:
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await guest.route("**/v1/public/catalog/*/inquiries/recover", unavailable_inquiry_recovery)
            await guest.reload(wait_until="networkidle")
            await guest.get_by_text("이전 문의 결과를 확인하지 못했습니다", exact=False).wait_for()
            await form.get_by_label("이름").fill("합성 고객")
            await form.get_by_label("연락처", exact=True).fill("010-1111-2222")
            await form.get_by_label("문의 내용").fill("다르게 고친 문의")
            await form.get_by_role("checkbox").check()
            await form.get_by_role("button", name="문의 제출").click()
            await guest.get_by_text("이전 문의 제출 결과가 확인되지 않았습니다", exact=False).wait_for()
            assert inquiry_posts == 1
            block_inquiry_recovery = False
            await form.get_by_role("button", name="이전 문의 조회").click()
            await guest.get_by_text("새로고침 전 저장된 문의를 확인했습니다", exact=False).wait_for()
            await guest.unroute("**/v1/public/catalog/*/inquiries/recover", unavailable_inquiry_recovery)
            assert not await guest.evaluate("""() => Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i))
                .some(key => key?.startsWith('fieldai:field:pending-public:'))""")
            await guest.unroute("**/v1/public/catalog/*/inquiries", lose_guest_inquiry_ack)
            await guest.get_by_role("heading", name="문의가 접수되었어요.").wait_for()
            receipt_key = await guest.locator(".field-receipt-secret code").inner_text()
            assert receipt_key
            follow_up_url = await guest.get_by_role("link", name="내 문의 확인하기").get_attribute("href")
            assert follow_up_url and follow_up_url.startswith("/inquiry/")
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

            await monitor.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="오늘").click()
            await expect(monitor.locator(".field-owner-dashboard > section").get_by_text("합성 고객", exact=False)).to_be_visible()
            monitor_tasks = monitor.locator(".field-owner-dashboard > section")
            await monitor_tasks.get_by_role("button", name="답변 필요", exact=True).click()
            await expect(monitor_tasks.get_by_text("합성 고객", exact=False)).to_be_visible()
            await monitor_tasks.get_by_role("button", name="예약 요청", exact=True).click()
            await expect(monitor_tasks.get_by_text("합성 고객", exact=False)).to_have_count(0)
            await monitor_tasks.get_by_role("button", name="모두", exact=True).click()

            await owner.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            today_tasks = owner.locator(".field-owner-dashboard > section")
            await expect(today_tasks.get_by_text("합성 고객", exact=False)).to_be_visible()
            assert await owner.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert await today_tasks.locator(".field-owner-today-task-content strong").first.evaluate(
                "element => element.scrollWidth <= element.clientWidth")
            await today_tasks.get_by_text("합성 고객", exact=False).scroll_into_view_if_needed()
            await owner.screenshot(path="/tmp/field-today-task-320.png")
            await today_tasks.get_by_role("button", name=re.compile("합성 고객.*개인 레슨")).click()
            await owner.get_by_role("heading", name=re.compile("합성 고객.*개인 레슨")).wait_for()
            await owner.get_by_role("button", name="문의 목록으로").click()
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="문의").click()
            inbox = owner.locator("section#external-inquiries + section.special-panel")
            await owner.locator(".field-owner-inbox-list").get_by_role("button", name=re.compile("테스트.*사업자 고객 체험")).click()
            await inbox.get_by_text("실제 고객·동의·연락처가 없고", exact=False).wait_for()
            await inbox.get_by_label("고객에게 답변").fill("내부 답변 확인")
            await inbox.get_by_role("button", name="답변 저장").click()
            await owner.get_by_text("테스트 답변을 내부 기록에 저장했습니다", exact=False).wait_for()
            await inbox.get_by_text("내부 답변 확인").wait_for()
            await expect(inbox.get_by_role("button", name="답변 저장")).to_be_enabled()
            await inbox.get_by_role("button", name="문의 목록으로").click()
            await owner.locator(".field-owner-inbox-list").get_by_role("button", name=re.compile("합성 고객.*개인 레슨")).click()
            await inbox.get_by_role("heading", name=re.compile("합성 고객.*개인 레슨")).wait_for()
            reply_committed = asyncio.Event()
            release_reply = asyncio.Event()

            async def delayed_reply(route):
                response = await route.fetch()
                reply_committed.set()
                await release_reply.wait()
                await route.fulfill(response=response)

            await owner.route("**/v1/owner/inquiries/*/replies", delayed_reply)
            await inbox.get_by_label("고객에게 답변").fill("평일 오후에 가능합니다. 희망 시간을 남겨주세요.")
            await inbox.get_by_role("button", name="답변 저장").click()
            await asyncio.wait_for(reply_committed.wait(), timeout=10)
            await inbox.get_by_role("button", name="내부 메모").click()
            await inbox.get_by_label("내부 메모").fill("합성 Field 메모")
            release_reply.set()
            await inbox.get_by_text("평일 오후에 가능합니다. 희망 시간을 남겨주세요.").wait_for()
            await expect(inbox.get_by_role("button", name="메모 저장")).to_be_enabled()
            await expect(inbox.get_by_label("내부 메모")).to_have_value("합성 Field 메모")
            await inbox.get_by_role("button", name="메모 저장").click()
            await inbox.get_by_text("합성 Field 메모").wait_for()

            await guest.goto(f"http://127.0.0.1:3002{follow_up_url}", wait_until="networkidle")
            await guest.get_by_label("접수 확인키").fill(receipt_key)
            await guest.get_by_role("button", name="문의 열기").click()
            await guest.get_by_text("평일 오후에 가능합니다. 희망 시간을 남겨주세요.").wait_for()
            assert await guest.get_by_text("합성 Field 메모").count() == 0
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
            await owner.screenshot(path="/tmp/field-inbox-closed-320.png")
            await owner.set_viewport_size({"width": 1440, "height": 900})
            await owner.screenshot(path="/tmp/field-inbox-closed-1440.png")
            await owner.set_viewport_size({"width": 320, "height": 720})
            await guest.reload(wait_until="networkidle")
            await guest.get_by_label("접수 확인키").fill(receipt_key)
            await guest.get_by_role("button", name="문의 열기").click()
            await guest.get_by_text("처리 완료된 문의도 추가 질문", exact=False).wait_for()
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
            await guest.get_by_label("추가 질문").fill("다음 주 화요일 오후로 부탁드립니다.")
            await guest.get_by_role("button", name="추가 질문 저장").click()
            await guest.get_by_text("추가 질문을 저장했습니다", exact=False).wait_for()
            await guest.get_by_role("button", name="문의 내용 다시 확인").click()
            await guest.get_by_text("다음 주 화요일 오후로 부탁드립니다.").wait_for()
            await guest.locator(".field-conversation-title").get_by_text("확인 필요").wait_for()
            await owner.reload(wait_until="networkidle")
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="문의").click()
            inbox = owner.locator("section#external-inquiries + section.special-panel")
            await owner.locator(".field-owner-inbox-list").get_by_role("button", name=re.compile("합성 고객.*개인 레슨")).click()
            await inbox.get_by_role("button", name="처리 완료").wait_for()
            assert not failed_follow_up_read
            await guest.unroute(f"**/v1/inquiries/{inquiry_id}", fail_follow_up_read)
            inquiry_record = await guest.request.get(f"http://127.0.0.1:3002/v1/inquiries/{inquiry_id}",
                                                     headers={"authorization": f"Bearer {receipt_key}"})
            assert inquiry_record.status == 200
            assert len([item for item in (await inquiry_record.json())["messages"]
                        if item["body"] == "다음 주 화요일 오후로 부탁드립니다."]) == 1
            lost_followup_ack = True
            followup_body = "새로고침 뒤 같은 Field 추가 질문입니다."
            followup_posts = 0

            async def lose_followup_ack(route):
                nonlocal lost_followup_ack, followup_posts
                followup_posts += 1
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
                .filter(key => key?.startsWith('fieldai:field:pending-message:')).map(key => sessionStorage.getItem(key))""")
            assert len(pending_messages) == 1 and followup_body not in pending_messages[0]
            block_followup_recovery = True

            async def unavailable_followup_recovery(route):
                if block_followup_recovery:
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await guest.route(f"**/v1/inquiries/{inquiry_id}/messages/recover", unavailable_followup_recovery)
            await guest.reload(wait_until="networkidle")
            await guest.get_by_text("이전 추가 질문 결과를 확인하지 못했습니다", exact=False).wait_for()
            assert await guest.get_by_role("button", name="새 확인키 생성").count() == 0
            await guest.get_by_label("추가 질문").fill("다른 질문으로 고쳤습니다.")
            await guest.get_by_role("button", name="추가 질문 저장").click()
            await guest.get_by_text("이전 추가 질문 제출 결과가 확인되지 않았습니다", exact=False).wait_for()
            assert followup_posts == 1
            block_followup_recovery = False
            assert await guest.get_by_label("접수 확인키").count() == 0
            await guest.get_by_role("button", name="이전 추가 질문 조회").click()
            await guest.get_by_text("새로고침 전 저장된 추가 질문을 확인했습니다", exact=False).wait_for()
            await guest.get_by_text(followup_body).wait_for()
            await guest.unroute(f"**/v1/inquiries/{inquiry_id}/messages/recover", unavailable_followup_recovery)
            await guest.unroute(f"**/v1/inquiries/{inquiry_id}/messages", lose_followup_ack)
            assert not await guest.evaluate("""() => Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i))
                .some(key => key?.startsWith('fieldai:field:pending-message:'))""")
            inquiry_record = await guest.request.get(f"http://127.0.0.1:3002/v1/inquiries/{inquiry_id}",
                                                     headers={"authorization": f"Bearer {receipt_key}"})
            recovered_state = await inquiry_record.json()
            recovered_messages = [item for item in recovered_state["messages"] if item["body"] == followup_body]
            assert len(recovered_messages) == 1
            recovered_message_id = recovered_messages[0]["id"]
            await guest.get_by_text("확인키·사진 관리").click()
            await guest.get_by_label("문의 사진 첨부 (선택, 최대 5장·장당 8MB)").set_input_files(
                "quality_checks/report_320.png")
            await guest.get_by_role("button", name="사진만 첨부 또는 재시도").click()
            await guest.get_by_text("사진 1건의 첨부 요청을 확인했습니다", exact=False).wait_for()
            recovered_photo_state = await (await guest.request.get(
                f"http://127.0.0.1:3002/v1/inquiries/{inquiry_id}",
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
            await guest.get_by_label("문의 사진 첨부 (선택, 최대 5장·장당 8MB)").set_input_files(
                "quality_checks/report_320.png")
            assert await guest.get_by_text("남은 사진 1장 선택됨", exact=False).count() == 1, (
                "selecting the same file after a saved upload must update the photo state")
            await guest.get_by_label("추가 질문").fill("사진도 함께 확인해 주세요.")
            await guest.get_by_role("button", name="추가 질문 저장").click()
            await asyncio.wait_for(photo_uploaded.wait(), timeout=10)
            await guest.get_by_text("사진 1건의 첨부 요청을 확인했습니다", exact=False).wait_for()
            await guest.get_by_role("button", name="문의 내용 다시 확인").click()
            await guest.get_by_text("사진도 함께 확인해 주세요.").wait_for()
            await guest.get_by_role("img", name="고객 첨부 사진 1").wait_for()
            assert photo_upload_committed and not failed_photo_read
            await guest.unroute(f"**/v1/inquiries/{inquiry_id}/messages/*/attachments", commit_follow_up_photo)
            await guest.unroute(f"**/v1/inquiries/{inquiry_id}", fail_photo_read)
            photo_inquiry = await guest.request.get(f"http://127.0.0.1:3002/v1/inquiries/{inquiry_id}",
                                                   headers={"authorization": f"Bearer {receipt_key}"})
            assert photo_inquiry.status == 200
            photo_state = await photo_inquiry.json()
            photo_messages = [item for item in photo_state["messages"] if item["body"] == "사진도 함께 확인해 주세요."]
            assert len(photo_messages) == 1
            assert len([item for item in photo_state["attachments"]
                        if item["messageId"] == photo_messages[0]["id"]]) == 1

            await guest.goto(public_url, wait_until="networkidle")
            await guest.get_by_role("link", name="직접 문의하기").click()
            await guest.get_by_role("navigation", name="고객 접수 유형").get_by_role("button", name="예약 요청").click()
            booking = guest.locator("#reservation")
            await booking.get_by_label("희망 시간", exact=True).fill("다음 주 같은 요일 오전 10시")
            await booking.get_by_label("이름").fill("합성 예약 고객")
            await booking.get_by_label("연락처", exact=True).fill("010-2222-3333")
            await booking.get_by_label("요청 내용").fill("개인 레슨을 예약하고 싶습니다.")
            await booking.get_by_role("checkbox").check()
            lost_guest_booking_ack = True

            async def lose_guest_booking_ack(route):
                nonlocal lost_guest_booking_ack
                if route.request.method == "POST" and lost_guest_booking_ack:
                    lost_guest_booking_ack = False
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            await guest.route("**/v1/public/catalog/*/reservations", lose_guest_booking_ack)
            await booking.get_by_role("button", name="예약 요청 제출").click()
            await guest.get_by_text("응답을 받지 못했습니다", exact=False).wait_for()
            assert not lost_guest_booking_ack
            pending_bookings = await guest.evaluate("""() => Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i))
                .filter(key => key?.startsWith('fieldai:field:pending-public:')).map(key => sessionStorage.getItem(key))""")
            assert len(pending_bookings) == 1
            assert "010-2222-3333" not in pending_bookings[0] and "다음 주 같은 요일" not in pending_bookings[0]
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            await guest.reload(wait_until="networkidle")
            await guest.get_by_text("새로고침 전 저장된 예약 요청을 확인했습니다", exact=False).wait_for()
            assert not await guest.evaluate("""() => Array.from({length: sessionStorage.length}, (_, i) => sessionStorage.key(i))
                .some(key => key?.startsWith('fieldai:field:pending-public:'))""")
            await guest.unroute("**/v1/public/catalog/*/reservations", lose_guest_booking_ack)
            await guest.get_by_role("heading", name="예약 요청을 보냈어요.").wait_for()
            request_key = await guest.locator(".field-receipt-secret code").inner_text()
            request_url = await guest.get_by_role("link", name="내 예약 상태 확인하기").get_attribute("href")
            assert request_key and request_url

            await monitor.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="오늘").click()
            await expect(monitor.locator(".field-owner-stats article").filter(has_text="확인할 예약").locator("strong")).to_have_text("1")
            await expect(monitor.locator(".field-owner-dashboard > section").get_by_text("합성 예약 고객", exact=False)).to_be_visible()
            await monitor_tasks.get_by_role("button", name="답변 필요", exact=True).click()
            await expect(monitor_tasks.get_by_text("합성 예약 고객", exact=False)).to_have_count(0)
            await monitor_tasks.get_by_role("button", name="예약 요청", exact=True).click()
            await expect(monitor_tasks.get_by_text("합성 예약 고객", exact=False)).to_be_visible()
            assert await monitor.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            await monitor_tasks.get_by_text("합성 예약 고객", exact=False).scroll_into_view_if_needed()
            await monitor.screenshot(path="/tmp/field-today-filter-320.png")
            await monitor_tasks.get_by_role("button", name="모두", exact=True).click()

            await owner.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="예약").click()
            reservations = owner.locator("#owner-reservations")
            first_booking_button = reservations.get_by_role("button", name=re.compile("합성 예약 고객.*신청 접수"))
            first_booking_id = await first_booking_button.get_attribute("data-reservation-id")
            assert first_booking_id
            await first_booking_button.click()
            await reservations.get_by_label("바로 확정할 시간 (현재 브라우저 시간대)").fill(f"{booking_day}T10:00")
            lost_confirm_ack = True
            failed_confirm_read = True

            async def lose_confirm_ack(route):
                nonlocal lost_confirm_ack
                if lost_confirm_ack:
                    lost_confirm_ack = False
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            async def fail_confirm_read(route):
                nonlocal failed_confirm_read
                if failed_confirm_read:
                    failed_confirm_read = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route(f"**/v1/owner/reservations/{first_booking_id}/confirm", lose_confirm_ack)
            await owner.route(f"**/v1/owner/reservations/{first_booking_id}", fail_confirm_read)
            await reservations.get_by_role("button", name="사업자 최종 확정").click()
            await reservations.get_by_text("확정 결과를 확인할 수 없습니다", exact=False).wait_for()
            await expect(reservations.get_by_role("button", name="사업자 최종 확정")).to_be_hidden()
            await reservations.get_by_role("button", name="예약 처리 결과 확인").click()
            await reservations.get_by_text("확정 처리가 예약 기록에서 확인됐습니다", exact=False).wait_for()
            assert not lost_confirm_ack and not failed_confirm_read
            await owner.unroute(f"**/v1/owner/reservations/{first_booking_id}/confirm", lose_confirm_ack)
            await owner.unroute(f"**/v1/owner/reservations/{first_booking_id}", fail_confirm_read)
            first_booking_state = await owner.request.get(
                f"http://127.0.0.1:3002/v1/owner/reservations/{first_booking_id}")
            assert first_booking_state.status == 200
            assert len([event for event in (await first_booking_state.json())["events"]
                        if event["eventType"] == "field.reservation.confirmed"]) == 1
            await guest.goto(f"http://127.0.0.1:3002{request_url}", wait_until="networkidle")
            await guest.get_by_label("예약 확인키").fill(request_key)
            await guest.get_by_role("button", name="예약 열기").click()
            await guest.locator(".field-conversation-title").get_by_text("확정", exact=True).wait_for()

            await guest.goto(public_url, wait_until="networkidle")
            await guest.get_by_role("link", name="직접 문의하기").click()
            await guest.get_by_role("navigation", name="고객 접수 유형").get_by_role("button", name="예약 요청").click()
            booking = guest.locator("#reservation")
            await booking.locator("form select").first.select_option(label="그룹 레슨")
            availability_pattern = re.compile(r"/v1/public/catalog/[^/]+/availability\?")
            availability_calls = 0

            async def fail_first_availability(route):
                nonlocal availability_calls
                availability_calls += 1
                if availability_calls == 1:
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await guest.route(availability_pattern, fail_first_availability)
            await booking.get_by_label("이름").fill("합성 슬롯 고객")
            await booking.get_by_label("연락처", exact=True).fill("010-3333-4444")
            await booking.get_by_label("요청 내용").fill("그룹 레슨 가능한 시간을 문의합니다.")
            await booking.get_by_role("checkbox").check()
            await booking.get_by_label("희망 날짜").fill(str(booking_day))
            await booking.get_by_text("가능 시간을 불러오지 못했습니다").wait_for()
            assert await booking.locator("form select").nth(1).locator("option").count() == 1
            assert await booking.get_by_role("button", name="예약 요청 제출").is_disabled()
            await booking.get_by_role("button", name="가능 시간 다시 확인").click()
            options = booking.locator("form select").nth(1).locator("option")
            await options.nth(1).wait_for(state="attached")
            assert availability_calls == 2
            await guest.unroute(availability_pattern, fail_first_availability)
            slot_start = None
            alternative_slot = None
            offered_times = []
            for index in range(1, await options.count()):
                value = await options.nth(index).get_attribute("value")
                if value:
                    offered = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
                        ZoneInfo("Asia/Seoul")).time()
                    offered_times.append(offered.strftime("%H:%M"))
                    if offered.hour == 11 and slot_start is None:
                        slot_start = value
                    if offered.hour == 12 and alternative_slot is None:
                        alternative_slot = value
            assert "10:00" not in offered_times, "confirmed request should occupy the shared resource"
            assert slot_start, "11:00 slot should be available after 10:00 request confirmation"
            assert alternative_slot, "12:00 slot should be available for conflict recovery"
            await booking.locator("form select").nth(1).select_option(slot_start)
            stale_request_started = asyncio.Event()
            release_stale_request = asyncio.Event()

            async def hold_next_availability(route):
                stale_request_started.set()
                await release_stale_request.wait()
                await route.fulfill(status=503, content_type="application/json",
                                    body='{"error":"temporary_unavailable"}')

            await guest.route(availability_pattern, hold_next_availability)
            await booking.get_by_label("희망 날짜").fill(str(booking_day + timedelta(days=1)))
            try:
                await asyncio.wait_for(stale_request_started.wait(), timeout=5)
                assert await options.count() == 1, "old date slots must disappear while the new request is pending"
                assert await booking.get_by_role("button", name="예약 요청 제출").is_disabled()
            finally:
                release_stale_request.set()
            await booking.get_by_text("가능 시간을 불러오지 못했습니다").wait_for()
            await guest.unroute(availability_pattern, hold_next_availability)
            await booking.get_by_label("희망 날짜").fill(str(booking_day))
            await options.nth(1).wait_for(state="attached")
            await booking.locator("form select").nth(1).select_option(slot_start)
            assert await booking.get_by_label("이름").input_value() == "합성 슬롯 고객"
            assert await booking.get_by_label("연락처", exact=True).input_value() == "010-3333-4444"
            assert await booking.get_by_role("checkbox").is_checked()
            refreshed_after_conflict = asyncio.Event()
            reservation_post_calls = 0
            reservation_pattern = re.compile(r"/v1/public/catalog/[^/]+/reservations$")

            async def track_conflict_refresh(route):
                refreshed_after_conflict.set()
                await route.continue_()

            async def reject_first_reservation(route):
                nonlocal reservation_post_calls
                reservation_post_calls += 1
                if reservation_post_calls == 1:
                    await route.fulfill(status=409, content_type="application/json",
                                        body='{"error":"slot_unavailable"}')
                else:
                    await route.continue_()

            await guest.route(availability_pattern, track_conflict_refresh)
            await guest.route(reservation_pattern, reject_first_reservation)
            await booking.get_by_role("button", name="예약 요청 제출").click()
            await asyncio.wait_for(refreshed_after_conflict.wait(), timeout=5)
            await options.nth(1).wait_for(state="attached")
            assert await booking.locator("form select").nth(1).input_value() == ""
            assert await booking.get_by_role("button", name="예약 요청 제출").is_disabled()
            assert await booking.get_by_text("이전 제출 시도를 보관 중입니다.", exact=False).count() == 0
            await booking.locator("form select").nth(1).select_option(alternative_slot)
            assert await booking.get_by_label("이름").input_value() == "합성 슬롯 고객"
            assert await booking.get_by_label("연락처", exact=True).input_value() == "010-3333-4444"
            assert await booking.get_by_role("checkbox").is_checked()
            await booking.get_by_role("button", name="예약 요청 제출").click()
            await guest.get_by_role("heading", name="예약 요청을 보냈어요.").wait_for()
            assert reservation_post_calls == 2
            await guest.unroute(availability_pattern, track_conflict_refresh)
            await guest.unroute(reservation_pattern, reject_first_reservation)
            slot_key = await guest.locator(".field-receipt-secret code").inner_text()
            slot_url = await guest.get_by_role("link", name="내 예약 상태 확인하기").get_attribute("href")
            assert slot_key and slot_url

            await owner.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="예약").click()
            reservations = owner.locator("#owner-reservations")
            await reservations.get_by_role("button", name=re.compile("합성 슬롯 고객.*신청 접수")).click()
            await reservations.get_by_role("button", name="사업자 최종 확정").click()
            await reservations.get_by_text("예약이 확정되어 달력을 점유했습니다.", exact=False).wait_for()
            await guest.goto(f"http://127.0.0.1:3002{slot_url}", wait_until="networkidle")
            await guest.get_by_label("예약 확인키").fill(slot_key)
            await guest.get_by_role("button", name="예약 열기").click()
            await guest.locator(".field-conversation-title").get_by_text("확정", exact=True).wait_for()
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            manual_form = reservations.get_by_role("heading", name="전화 예약 수동 등록").locator("..")
            await manual_form.get_by_label("서비스").select_option(label="개인 레슨")
            await manual_form.get_by_label("시간 (현재 브라우저 시간대)").fill(f"{booking_day}T13:00")
            await manual_form.get_by_label("이름").fill("합성 전화 예약 고객")
            await manual_form.get_by_label("연락처").fill("010-5555-6666")
            manual_posts = 0

            async def lose_manual_ack(route):
                nonlocal manual_posts
                manual_posts += 1
                if manual_posts == 1:
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            await owner.route("**/v1/owner/reservations/manual", lose_manual_ack)
            await manual_form.get_by_role("button", name="전화 예약 기록").click()
            await reservations.get_by_text("전화 예약 기록 결과를 확인할 수 없습니다", exact=False).wait_for()
            await manual_form.get_by_role("button", name="전화 예약 기록").click()
            await reservations.get_by_text("기존 전화 예약을 확인했습니다", exact=False).wait_for()
            await owner.unroute("**/v1/owner/reservations/manual", lose_manual_ack)
            assert manual_posts == 2
            manual_list = await owner.request.get("http://127.0.0.1:3002/v1/owner/reservations")
            assert manual_list.status == 200
            matching_manual = [item for item in (await manual_list.json())["reservations"]
                               if item["name"] == "합성 전화 예약 고객"]
            assert len(matching_manual) == 1 and matching_manual[0]["state"] == "confirmed"
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="오늘").click()
            await expect(owner.locator(".field-owner-stats article").filter(has_text="오늘 일정")).to_contain_text("0")
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="예약").click()
            manual_id = matching_manual[0]["id"]
            await reservations.get_by_role("button", name=re.compile("합성 전화 예약 고객.*확정")).click()
            await reservations.get_by_role("heading", name="합성 전화 예약 고객 · 개인 레슨").wait_for()
            await reservations.get_by_label("취소 사유").fill("고객 전화 요청")
            await expect(reservations.get_by_role("button", name="예약 취소·점유 해제")).to_be_enabled()
            lost_cancel_ack = True
            failed_cancel_read = True

            async def lose_cancel_ack(route):
                nonlocal lost_cancel_ack
                if lost_cancel_ack:
                    lost_cancel_ack = False
                    response = await route.fetch()
                    assert response.status == 200
                    await route.abort("failed")
                else:
                    await route.continue_()

            async def fail_cancel_read(route):
                nonlocal failed_cancel_read
                if failed_cancel_read:
                    failed_cancel_read = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route(f"**/v1/owner/reservations/{manual_id}/cancel", lose_cancel_ack)
            await owner.route(f"**/v1/owner/reservations/{manual_id}", fail_cancel_read)
            await reservations.get_by_role("button", name="예약 취소·점유 해제").click()
            await reservations.get_by_text("취소 결과를 확인할 수 없습니다", exact=False).wait_for()
            await expect(reservations.get_by_role("button", name="예약 취소·점유 해제")).to_be_hidden()
            await reservations.get_by_role("button", name="예약 처리 결과 확인").click()
            await reservations.get_by_text("취소 처리가 예약 기록에서 확인됐습니다", exact=False).wait_for()
            assert not lost_cancel_ack and not failed_cancel_read
            await owner.unroute(f"**/v1/owner/reservations/{manual_id}/cancel", lose_cancel_ack)
            await owner.unroute(f"**/v1/owner/reservations/{manual_id}", fail_cancel_read)
            canceled_manual = await owner.request.get(
                f"http://127.0.0.1:3002/v1/owner/reservations/{manual_id}")
            assert canceled_manual.status == 200
            canceled_manual_state = await canceled_manual.json()
            assert canceled_manual_state["state"] == "canceled"
            assert len([event for event in canceled_manual_state["events"]
                        if event["eventType"] == "field.reservation.canceled"]) == 1
            await guest.goto(public_url, wait_until="networkidle")
            await guest.get_by_role("link", name="직접 문의하기").click()
            await guest.get_by_role("navigation", name="고객 접수 유형").get_by_role("button", name="예약 요청").click()
            booking = guest.locator("#reservation")
            await booking.get_by_label("희망 시간", exact=True).fill("다음 주 오후 시간 제안 요청")
            await booking.get_by_label("이름").fill("합성 제안 고객")
            await booking.get_by_label("연락처", exact=True).fill("010-7777-8888")
            await booking.get_by_label("요청 내용").fill("오후 시간으로 조율하고 싶습니다.")
            await booking.get_by_role("checkbox").check()
            await booking.get_by_role("button", name="예약 요청 제출").click()
            await guest.get_by_role("heading", name="예약 요청을 보냈어요.").wait_for()
            proposal_key = await guest.locator(".field-receipt-secret code").inner_text()
            proposal_url = await guest.get_by_role("link", name="내 예약 상태 확인하기").get_attribute("href")
            assert proposal_key and proposal_url
            await owner.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="예약").click()
            reservations = owner.locator("#owner-reservations")
            proposal_button = reservations.get_by_role("button", name=re.compile("합성 제안 고객.*신청 접수"))
            proposal_id = await proposal_button.get_attribute("data-reservation-id")
            assert proposal_id
            await proposal_button.click()
            await reservations.get_by_role("heading", name="합성 제안 고객 · 개인 레슨").wait_for()
            await reservations.get_by_label("고객에게 제안할 새 시간 (현재 브라우저 시간대)").fill(
                f"{booking_day}T14:00")
            lost_proposal_ack = True
            failed_proposal_read = True

            async def lose_proposal_ack(route):
                nonlocal lost_proposal_ack
                if lost_proposal_ack:
                    lost_proposal_ack = False
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            async def fail_proposal_read(route):
                nonlocal failed_proposal_read
                if failed_proposal_read:
                    failed_proposal_read = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route(f"**/v1/owner/reservations/{proposal_id}/proposals", lose_proposal_ack)
            await owner.route(f"**/v1/owner/reservations/{proposal_id}", fail_proposal_read)
            await reservations.get_by_role("button", name="새 시간 제안").click()
            await reservations.get_by_text("시간 제안 결과를 확인할 수 없습니다", exact=False).wait_for()
            await reservations.get_by_role("button", name="예약 처리 결과 확인").click()
            await reservations.get_by_text("시간 제안 처리가 예약 기록에서 확인됐습니다", exact=False).wait_for()
            assert not lost_proposal_ack and not failed_proposal_read
            await owner.unroute(f"**/v1/owner/reservations/{proposal_id}/proposals", lose_proposal_ack)
            await owner.unroute(f"**/v1/owner/reservations/{proposal_id}", fail_proposal_read)
            await guest.goto(f"http://127.0.0.1:3002{proposal_url}", wait_until="networkidle")
            await guest.get_by_label("예약 확인키").fill(proposal_key)
            await guest.get_by_role("button", name="예약 열기").click()
            await guest.locator(".field-conversation-title").get_by_text("시간 제안", exact=True).wait_for()
            await assert_customer_response_loss(guest, proposal_id, proposal_key, "accept-proposal",
                                                "제안 시간 동의", "field.reservation.proposal_accepted", "제안 수락")
            await owner.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="예약").click()
            reservations = owner.locator("#owner-reservations")
            await reservations.get_by_role("button", name=re.compile("합성 제안 고객.*고객 수락")).click()
            await reservations.get_by_role("heading", name="합성 제안 고객 · 개인 레슨").wait_for()
            await reservations.get_by_label("처리 사유").fill("고객과 통화해 요청 종료")
            lost_reject_ack = True
            failed_reject_read = True

            async def lose_reject_ack(route):
                nonlocal lost_reject_ack
                if lost_reject_ack:
                    lost_reject_ack = False
                    response = await route.fetch()
                    assert response.status == 200
                    await route.abort("failed")
                else:
                    await route.continue_()

            async def fail_reject_read(route):
                nonlocal failed_reject_read
                if failed_reject_read:
                    failed_reject_read = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await owner.route(f"**/v1/owner/reservations/{proposal_id}/decision", lose_reject_ack)
            await owner.route(f"**/v1/owner/reservations/{proposal_id}", fail_reject_read)
            await reservations.get_by_role("button", name="요청 거절").click()
            await reservations.get_by_text("거절 결과를 확인할 수 없습니다", exact=False).wait_for()
            await reservations.get_by_role("button", name="예약 처리 결과 확인").click()
            await reservations.get_by_text("거절 처리가 예약 기록에서 확인됐습니다", exact=False).wait_for()
            assert not lost_reject_ack and not failed_reject_read
            await owner.unroute(f"**/v1/owner/reservations/{proposal_id}/decision", lose_reject_ack)
            await owner.unroute(f"**/v1/owner/reservations/{proposal_id}", fail_reject_read)
            rejected_proposal = await owner.request.get(
                f"http://127.0.0.1:3002/v1/owner/reservations/{proposal_id}")
            assert rejected_proposal.status == 200
            proposal_events = (await rejected_proposal.json())["events"]
            assert len([event for event in proposal_events
                        if event["eventType"] == "field.reservation.proposed"]) == 1
            assert len([event for event in proposal_events
                        if event["eventType"] == "field.reservation.reject"]) == 1
            await guest.goto(f"http://127.0.0.1:3002{request_url}", wait_until="networkidle")
            await guest.get_by_label("예약 확인키").fill(request_key)
            await guest.get_by_role("button", name="예약 열기").click()
            await guest.locator(".field-conversation-title").get_by_text("확정", exact=True).wait_for()
            await guest.locator(".field-reservation-tools > summary").click()
            await guest.get_by_label("새 희망 시간").fill("다음 주 오후로 변경")
            await assert_customer_response_loss(guest, first_booking_id, request_key, "change-request",
                                                "시간 변경 요청", "field.reservation.change_requested", "시간 변경 요청")
            await guest.get_by_label("취소 요청 사유").fill("일정이 바뀌었습니다")
            await assert_customer_response_loss(guest, first_booking_id, request_key, "cancel-request",
                                                "취소 요청", "field.reservation.cancel_requested", "취소 요청")
            assert await guest.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            await guest.goto(public_url, wait_until="networkidle")
            await guest.get_by_role("link", name="직접 문의하기").click()
            await guest.get_by_role("navigation", name="고객 접수 유형").get_by_role("button", name="예약 요청").click()
            booking = guest.locator("#reservation")
            await booking.get_by_label("희망 시간", exact=True).fill("카탈로그 변경 전 희망 시간")
            await booking.get_by_label("이름").fill("합성 조건 재확인 고객")
            await booking.get_by_label("연락처", exact=True).fill("010-9999-0000")
            await booking.get_by_label("요청 내용").fill("변경 전 서비스 조건으로 상담합니다.")
            await booking.get_by_role("checkbox").check()
            await booking.get_by_role("button", name="예약 요청 제출").click()
            await guest.get_by_role("heading", name="예약 요청을 보냈어요.").wait_for()
            review_key = await guest.locator(".field-receipt-secret code").inner_text()
            review_url = await guest.get_by_role("link", name="내 예약 상태 확인하기").get_attribute("href")
            assert review_key and review_url
            review_id = review_url.rsplit("/", 1)[-1]
            await owner.goto("http://127.0.0.1:3002/workspace", wait_until="networkidle")
            await owner.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="더보기").click()
            await owner.get_by_role("button", name="사업 정보·서비스", exact=True).click()
            await owner.get_by_role("button", name="사업 정보·공개 관리").click()
            await owner.get_by_label("확정 가격(원, 미정이면 빈칸)").first.fill("25000")
            await expect(owner.get_by_role("button", name="현재 초안 승인")).to_be_enabled()
            await owner.get_by_role("button", name="현재 초안 승인").click()
            await expect(owner.get_by_text("승인 버전: 2번")).to_be_visible()
            await guest.goto(f"http://127.0.0.1:3002{review_url}", wait_until="networkidle")
            await guest.get_by_label("예약 확인키").fill(review_key)
            await guest.get_by_role("button", name="예약 열기").click()
            await guest.locator(".field-reservation-card").wait_for()
            await guest.locator(".field-reservation-tools > summary").click()
            await guest.get_by_role("heading", name="서비스 조건 변경 재확인").wait_for()
            review_form = guest.locator("form").filter(
                has=guest.get_by_role("heading", name="서비스 조건 변경 재확인"))
            await review_form.get_by_label("최신 서비스").select_option(label="개인 레슨")
            await review_form.locator("textarea").fill("재확인 뒤 새 희망 시간")
            await review_form.get_by_role("checkbox").check()
            await assert_customer_response_loss(guest, review_id, review_key, "review-catalog",
                                                "변경 조건 동의·다시 제출", "field.reservation.catalog_reviewed", "조건 재확인")
            await expect(guest.get_by_role("heading", name="서비스 조건 변경 재확인")).to_be_hidden()
            await guest.get_by_text("재확인 뒤 새 희망 시간", exact=True).wait_for()
            await owner.goto("http://127.0.0.1:3002/workspace/subscription", wait_until="networkidle")
            await owner.get_by_role("heading", name="운영 기록 내보내기").wait_for()
            async with owner.expect_download() as download_info:
                await owner.get_by_role("button", name="Field 운영 기록·사진 전체 다운로드").click()
            download = await download_info.value
            assert download.suggested_filename.startswith("field-operations-")
            archive = json.loads(Path(await download.path()).read_text())
            assert archive["product"] == "field"
            assert archive["account"]["email"] == os.environ["FIELD_TEST_OWNER_EMAIL"]
            assert any(member["role"] == "owner" and member["email"] == os.environ["FIELD_TEST_OWNER_EMAIL"]
                       for member in archive["memberships"])
            assert archive["trialSubscription"] is None
            assert archive["apConnections"] == []
            assert len(archive["inquiries"]) >= 1
            assert len(archive["reservations"]) >= 4
            assert archive["site"] is not None
            assert any(row["customerName"] == "합성 고객" for row in archive["inquiries"])
            assert await owner.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("Field owner to guest site and booking flow: passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
