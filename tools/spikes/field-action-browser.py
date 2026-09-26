import asyncio
import json
import os
import sys
from playwright.async_api import async_playwright


async def main(inquiry_id: str):
    receipt = os.environ["FIELD_ACTION_TEST_RECEIPT"]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            response = await page.goto(f"http://localhost:3001/inquiry/{inquiry_id}", wait_until="networkidle")
            assert response and response.status == 200, response.status if response else "no response"
            failed_once = False

            async def fail_first_service_lookup(route):
                nonlocal failed_once
                if not failed_once:
                    failed_once = True
                    await route.fulfill(status=503, content_type="application/json", body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await page.route("**/v1/inquiries/*/field-services", fail_first_service_lookup)
            await page.get_by_label("접수 확인키").fill(receipt)
            await page.get_by_role("button", name="문의 열기").click()
            panel = page.get_by_role("region", name="Field 외부 요청")
            await panel.get_by_text("Field 연결 정보를 불러오지 못했습니다.", exact=False).wait_for()
            assert failed_once
            await panel.get_by_role("button", name="Field 예약 상태 확인").first.wait_for()
            assert await panel.get_by_role("button", name="현재 가격·시간 확인").count() == 0
            failed_history = False

            async def fail_first_history_lookup(route):
                nonlocal failed_history
                if route.request.method == "GET" and not failed_history:
                    failed_history = True
                    await route.fulfill(status=503, content_type="application/json", body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await page.route("**/v1/inquiries/*/field-actions", fail_first_history_lookup)
            async with page.expect_response(lambda response: response.url.endswith("/field-actions") and response.status == 503):
                await panel.get_by_role("button", name="다시 불러오기").click()
            assert failed_history
            await panel.get_by_text("Field 연결 정보를 불러오지 못했습니다.", exact=False).wait_for()
            assert await panel.get_by_role("button", name="현재 가격·시간 확인").count() == 0
            partial_facts_seen = False

            async def partial_field_facts(route):
                nonlocal partial_facts_seen
                response = await route.fetch()
                value = await response.json()
                assert value["connections"]
                for connection in value["connections"]:
                    connection["state"] = "field_facts_unavailable"
                    connection["services"] = []
                partial_facts_seen = True
                await route.fulfill(response=response, body=json.dumps(value),
                    content_type="application/json")

            await page.route("**/v1/inquiries/*/field-services", partial_field_facts)
            async with page.expect_response(lambda response: response.url.endswith("/field-services")
                and response.status == 200):
                await panel.get_by_role("button", name="다시 불러오기").click()
            assert partial_facts_seen
            await panel.get_by_text("Field 현재 정보를 확인하지 못했습니다", exact=False).wait_for()
            assert await panel.get_by_role("button", name="현재 가격·시간 확인").count() == 0
            await page.unroute("**/v1/inquiries/*/field-services", partial_field_facts)
            mixed_facts_seen = False

            async def mixed_field_facts(route):
                nonlocal mixed_facts_seen
                response = await route.fetch()
                value = await response.json()
                assert len(value["connections"]) == 1
                assert value["connections"][0]["state"] == "available"
                value["connections"].extend([
                    {"connectionId": "00000000-0000-4000-8000-000000000098",
                     "state": "field_facts_unavailable", "services": [
                         {"id": "00000000-0000-4000-8000-000000000097",
                          "name": "중단된 임시 서비스", "description": "이전 정보", "bookingMode": "request"}]},
                    {"connectionId": "00000000-0000-4000-8000-000000000099",
                     "state": "field_reauthorization_required", "services": []},
                ])
                mixed_facts_seen = True
                await route.fulfill(response=response, body=json.dumps(value),
                    content_type="application/json")

            await page.route("**/v1/inquiries/*/field-services", mixed_field_facts)
            async with page.expect_response(lambda response: response.url.endswith("/field-services")
                and response.status == 200):
                await panel.get_by_role("button", name="Field 정보 다시 확인").click()
            assert mixed_facts_seen
            await panel.get_by_text("Field 현재 정보를 확인하지 못했습니다", exact=False).wait_for()
            await panel.get_by_text("사업자 재동의가 필요합니다", exact=False).wait_for()
            assert await panel.get_by_label("Field 사업장").locator("option").count() == 1
            assert await panel.get_by_text("중단된 임시 서비스", exact=False).count() == 0
            await panel.get_by_role("button", name="Field 예약 상태 확인").first.click()
            await panel.get_by_text("Field 현재 상태: 예약 확정", exact=False).wait_for()
            await panel.get_by_text("AP 고객 외부 알림 미발송", exact=False).wait_for()
            await panel.get_by_role("button", name="현재 가격·시간 확인").click()
            await page.unroute("**/v1/inquiries/*/field-services", mixed_field_facts)
            await panel.get_by_label("희망 시간").fill("다음 주 월요일 오후")
            await panel.get_by_label("전달 요약").fill("브라우저에서 제출한 예약 요청")
            await panel.get_by_text("50,000원", exact=False).wait_for()
            preflight_rejected = False
            preflight_refreshed = False

            async def reject_preflight_terms(route):
                nonlocal preflight_rejected
                if not preflight_rejected:
                    preflight_rejected = True
                    await route.fulfill(status=409, content_type="application/json",
                        body='{"error":"service_conditions_changed"}')
                else:
                    await route.continue_()

            async def refreshed_preflight_availability(route):
                nonlocal preflight_refreshed
                preflight_refreshed = True
                response = await route.fetch()
                value = await response.json()
                value["catalogRevision"] += 1
                value["service"]["priceAmount"] = 45000
                await route.fulfill(response=response, body=json.dumps(value),
                    content_type="application/json")

            await page.route("**/v1/inquiries/*/field-availability", reject_preflight_terms)
            await page.route("**/v1/inquiries/*/field-connections/*/services/*/availability*",
                refreshed_preflight_availability)
            async with page.expect_response(lambda response: response.url.endswith("/field-availability")
                and response.status == 409):
                await panel.get_by_role("button", name="제출 조건 확인").click()
            assert preflight_rejected
            await panel.get_by_text("45,000원", exact=False).wait_for()
            assert preflight_refreshed
            assert await panel.get_by_text("50,000원", exact=False).count() == 0
            assert await panel.get_by_role("heading", name="고객 전달 내용 확인").count() == 0
            await page.unroute("**/v1/inquiries/*/field-availability", reject_preflight_terms)
            await page.unroute("**/v1/inquiries/*/field-connections/*/services/*/availability*",
                refreshed_preflight_availability)
            async def fail_preflight_check(route):
                await route.fulfill(status=503, content_type="application/json",
                    body='{"error":"field_facts_unavailable"}')

            await page.route("**/v1/inquiries/*/field-availability", fail_preflight_check)
            await panel.get_by_role("button", name="제출 조건 확인").click()
            await panel.get_by_text("현재 조건을 확인하지 못했습니다 (503).", exact=False).wait_for()
            assert await panel.get_by_text("45,000원", exact=False).count() == 0
            assert await panel.get_by_role("heading", name="고객 전달 내용 확인").count() == 0
            await page.unroute("**/v1/inquiries/*/field-availability", fail_preflight_check)
            await panel.get_by_role("button", name="현재 가격·시간 확인").click()
            await panel.get_by_text("50,000원", exact=False).wait_for()
            await panel.get_by_role("button", name="제출 조건 확인").click()
            await panel.get_by_role("heading", name="고객 전달 내용 확인").wait_for()
            assert await panel.get_by_text("HTTP 전달 고객", exact=False).count() > 0
            assert await panel.get_by_text("010-3333-4444", exact=False).count() > 0
            await panel.get_by_role("checkbox").check()
            rejected_once = False
            refresh_with_changed_price = False
            refreshed_count = 0

            async def reject_changed_terms(route):
                nonlocal rejected_once, refresh_with_changed_price
                if route.request.method == "POST" and not rejected_once:
                    rejected_once = True
                    refresh_with_changed_price = True
                    await route.fulfill(status=409, content_type="application/json",
                        body='{"error":"service_conditions_changed"}')
                else:
                    await route.continue_()

            async def changed_availability(route):
                nonlocal refresh_with_changed_price, refreshed_count
                if refresh_with_changed_price:
                    refresh_with_changed_price = False
                    refreshed_count += 1
                    response = await route.fetch()
                    value = await response.json()
                    value["catalogRevision"] += 1
                    value["service"]["priceAmount"] = 60000
                    await route.fulfill(response=response, body=json.dumps(value),
                        content_type="application/json")
                else:
                    await route.continue_()

            await page.route("**/v1/inquiries/*/field-actions", reject_changed_terms)
            await page.route("**/v1/inquiries/*/field-connections/*/services/*/availability*",
                changed_availability)
            await panel.get_by_role("button", name="Field에 요청 전달").click()
            assert rejected_once
            await panel.get_by_text("60,000원", exact=False).wait_for()
            assert refreshed_count == 1
            assert await panel.get_by_role("heading", name="고객 전달 내용 확인").count() == 0
            assert await panel.get_by_role("button", name="Field에 요청 전달").count() == 0
            await panel.get_by_role("button", name="현재 가격·시간 확인").click()
            await panel.get_by_text("50,000원", exact=False).wait_for()
            await panel.get_by_role("button", name="제출 조건 확인").click()
            await panel.get_by_role("heading", name="고객 전달 내용 확인").wait_for()
            await panel.get_by_role("checkbox").check()
            prior_actions = await panel.locator("li").count()
            await panel.get_by_role("button", name="Field에 요청 전달").click()
            await panel.locator("li").nth(prior_actions).wait_for(timeout=10000)
            await panel.locator("li").first.get_by_text("Field에 요청 접수됨 · 예약 확정 전", exact=False).wait_for()
            await panel.get_by_role("button", name="Field 예약 접근 코드 발급").first.click()
            handoff_panel = panel.get_by_role("heading", name="Field 예약 접근 코드").locator("..")
            code = (await handoff_panel.locator("code").inner_text()).strip()
            assert len(code) == 43
            handoff_url = await handoff_panel.get_by_role("link", name="Field에서 코드 교환하기").get_attribute("href")
            assert handoff_url and "?" not in handoff_url and "#" not in handoff_url
            field_page = await browser.new_page(viewport={"width": 320, "height": 720})
            field_page.set_default_timeout(10000)
            field_page.on("pageerror", lambda error: errors.append(str(error)))
            await field_page.goto(handoff_url, wait_until="networkidle")
            await field_page.get_by_label("1회 접근 코드").fill(code)
            await field_page.get_by_role("button", name="Field 예약 확인키 받기").click()
            await field_page.get_by_text("Field 예약 확인키", exact=True).wait_for()
            await field_page.get_by_role("button", name="예약 열기").click()
            await field_page.get_by_role("heading", name="Field 상담 · 신청 접수").wait_for()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert await field_page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("AP Field action browser: 320px consent, one-use Field handoff, independent reservation key passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
