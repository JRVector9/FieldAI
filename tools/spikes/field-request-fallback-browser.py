import asyncio
import json
import subprocess
import uuid
from datetime import datetime, timedelta, timezone

from playwright.async_api import async_playwright


def seed_received_candidates(organization_id, action_id, reservation_id):
    # AP 장애와 무관하게 Field가 이미 받은 합성 기록을 준비한다. 운영 DB에는 실행하지 않는다.
    source = r"""
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
const url = new URL(process.env.FIELD_DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/fieldai_field_mock')
  throw new Error('local Field mock database required');
const pool = new Pool({ connectionString: url.toString() });
const [org, action, reservation] = process.argv.slice(1);
try {
  const member = (await pool.query("select user_id from field.memberships where organization_id=$1 and role='owner'", [org])).rows[0];
  const service = (await pool.query('select service_snapshot from field.reservations where id=$1 and organization_id=$2', [reservation,org])).rows[0].service_snapshot;
  await pool.query("update field.reservations set source='external_ap' where id=$1 and organization_id=$2", [reservation,org]);
  for (const kind of ['inquiry','reservation_request']) {
  const connection = randomUUID();
  await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,
    ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,
    allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
    values ($1,$2,$3,'http://127.0.0.1:4311/api/auth','fallback-browser',$4,$5,$6,'합성 AP',1,
      '{}','{}',$7,$7,now(),'revoked')`,
    [connection,org,member.user_id,randomUUID(),randomUUID(),randomUUID(),Buffer.from('unused-synthetic')]);
    await pool.query(`insert into field.external_work_requests(id,organization_id,provider,connection_id,
      client_id,field_grant_id,action_request_id,body_hash,origin_conversation_id,source_deployment_id,
      kind,service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,request_snapshot,
      summary,consent_record_id,consent_confirmed_at,conditions_hash,is_test,reservation_id,status)
      values ($1,$2,'agent-platform',$3,'fallback-browser',$4,$5,$6,$7,$8,$9,$10,1,1,$11::jsonb,
        $12::jsonb,'{}','합성 이전 AP 수신 내용',$13,now(),$6,false,$14,'requested')`,
      [randomUUID(),org,connection,randomUUID(),action,'a'.repeat(64),randomUUID(),randomUUID(),kind,
       service.id,JSON.stringify(service),JSON.stringify({name:'이전 AP 고객',phone:'01099999999',verified:false}),
       randomUUID(),kind === 'reservation_request' ? reservation : null]);
  }
} finally { await pool.end(); }
"""
    result = subprocess.run(["node", "--env-file=infra/field/.env", "--input-type=module", "-e", source,
                             organization_id, action_id, reservation_id], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


async def assert_width(page):
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), page.url


async def assert_catalog_states(page, organization_id):
    url = f"http://localhost:3002/v1/public/catalog/{organization_id}"
    received = asyncio.Event()
    release = asyncio.Event()

    async def delayed(route):
        received.set()
        await release.wait()
        await route.continue_()

    await page.route(url, delayed)
    await page.goto(f"http://localhost:3002/public/{organization_id}", wait_until="domcontentloaded")
    await asyncio.wait_for(received.wait(), timeout=10)
    header = page.locator(".field-public-header")
    await header.get_by_text("승인 정보를 불러오는 중", exact=True).wait_for()
    assert await header.get_by_role("link", name="사업 정보 보기", exact=True).count() == 0
    assert await page.locator(".field-public-inquiry form").count() == 0
    release.set()
    await header.get_by_text("지역·운영시간 미등록", exact=True).wait_for()
    await header.get_by_role("link", name="사업 정보 보기", exact=True).wait_for()
    await page.unroute(url, delayed)

    async def unpublished(route):
        await route.fulfill(status=404, content_type="application/json", body='{"error":"not_found"}')

    await page.route(url, unpublished)
    await page.reload(wait_until="networkidle")
    await header.get_by_text("공개된 사업 정보 없음", exact=True).wait_for()
    assert await header.get_by_role("link", name="사업 정보 보기", exact=True).count() == 0
    assert await page.locator(".field-public-inquiry form").count() == 0
    assert await page.get_by_role("button", name="사업 정보 다시 불러오기", exact=True).count() == 0
    await assert_width(page)
    await page.unroute(url, unpublished)

    for failure in ["http", "network"]:
        attempts = 0

        async def unavailable(route):
            nonlocal attempts
            attempts += 1
            if attempts > 1:
                await route.continue_()
            elif failure == "network":
                await route.abort("failed")
            else:
                await route.fulfill(status=503, content_type="application/json", body='{"error":"unavailable"}')

        await page.route(url, unavailable)
        await page.reload(wait_until="networkidle")
        await header.get_by_text("사업 정보 확인 실패", exact=True).wait_for()
        assert await header.get_by_role("link", name="사업 정보 보기", exact=True).count() == 0
        assert await page.locator(".field-public-inquiry form").count() == 0
        await assert_width(page)
        await page.get_by_role("button", name="사업 정보 다시 불러오기", exact=True).click()
        await header.get_by_text("지역·운영시간 미등록", exact=True).wait_for()
        await page.locator(".field-public-inquiry form").wait_for()
        await header.get_by_role("link", name="사업 정보 보기", exact=True).wait_for()
        assert attempts == 2
        await page.unroute(url, unavailable)


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        owner = await browser.new_context(viewport={"width": 320, "height": 720})
        customer = await browser.new_context(viewport={"width": 320, "height": 720})
        page = await owner.new_page()
        guest = await customer.new_page()
        errors = []
        for surface in [page, guest]:
            surface.set_default_timeout(10000)
            surface.on("pageerror", lambda error: errors.append(str(error)))
        try:
            await page.goto("http://localhost:3002/workspace", wait_until="networkidle")
            await page.get_by_label("이름", exact=True).fill("합성 재접수 사업자")
            await page.get_by_label("이메일", exact=True).fill(f"fallback-{uuid.uuid4()}@example.invalid")
            await page.get_by_label("비밀번호", exact=True).fill("SyntheticFallback123!")
            await page.get_by_role("button", name="내 홈페이지 시작하기", exact=True).click()
            await page.get_by_role("heading", name="내 홈페이지 만들기", exact=True).wait_for()
            await page.get_by_label("상호", exact=True).fill("합성 재접수 사업장")
            await page.get_by_role("button", name="조직 만들기", exact=True).click()
            await page.get_by_role("heading", name="사업 정보 초안", exact=True).wait_for()
            draft = await page.request.get("http://localhost:3002/v1/business/draft")
            assert draft.status == 200
            data = await draft.json()
            org = data["organizationId"]
            services = [{"id": str(uuid.uuid4()), "name": f"{mode} 상담", "description": "",
                         "bookingMode": mode, "durationMinutes": 30, "priceAmount": None}
                        for mode in ["request", "slot"]]
            saved = await page.request.put("http://localhost:3002/v1/business/draft", data={
                **data, "expectedRevision": data["revision"], "services": services})
            assert saved.status == 200, await saved.text()
            released = await page.request.post("http://localhost:3002/v1/catalog/releases",
                                               data={"expectedRevision": (await saved.json())["revision"]})
            assert released.status == 201, await released.text()
            policy = await page.request.put("http://localhost:3002/v1/booking-policy", data={
                "expectedRevision": 0, "timezone": "Asia/Seoul",
                "weekly": {day: {"open": "10:00", "close": "18:00"}
                           for day in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]},
                "closedDates": [], "specialDates": {}, "beforeMinutes": 0, "afterMinutes": 0,
                "minLeadMinutes": 0, "horizonDays": 30})
            assert policy.status == 200, await policy.text()
            old = await page.request.post(f"http://localhost:3002/v1/public/catalog/{org}/reservations", data={
                "serviceId": services[0]["id"], "name": "이전 AP 고객", "phone": "01099999999",
                "preferredTimeText": "다음 주 오후", "consent": True})
            assert old.status == 201, await old.text()
            old_reservation = (await old.json())["id"]
            action_id = str(uuid.uuid4())
            seed_received_candidates(org, action_id, old_reservation)

            await assert_catalog_states(guest, org)
            await guest.locator(".field-public-header").get_by_text("지역·운영시간 미등록", exact=True).wait_for()
            form = guest.locator(".field-public-inquiry form")
            await form.get_by_text("AP 이용 후 다시 접수하나요?", exact=False).click()
            await form.get_by_label("AP 이용 후 새 요청으로 제출합니다.", exact=True).check()
            await form.get_by_label("기존 AP 요청 ID (선택)", exact=True).fill(action_id)
            await form.get_by_label("이름", exact=True).fill("새 직접 문의 고객")
            await form.get_by_label("연락처", exact=True).fill("01012345678")
            await form.get_by_label("문의 내용", exact=True).fill("직접 새로 작성한 문의")
            await form.get_by_label("문의 처리에 필요한 연락처 저장에 동의합니다. 위 개인정보 수집·이용 안내를 확인했습니다. (필수)", exact=True).check()
            await assert_width(guest)
            assert await form.locator(".field-request-fallback").evaluate(
                "el => [...el.querySelectorAll('summary,p,label,input:not([type=checkbox])')].every(item => parseFloat(getComputedStyle(item).fontSize) >= 14)")
            await guest.screenshot(path="/tmp/field-fallback-customer-320.png", full_page=True)
            async with guest.expect_response(lambda response: response.request.method == "POST"
                                              and response.url.endswith(f"/{org}/inquiries")) as info:
                await form.get_by_role("button", name="문의 제출", exact=True).click()
            response = await info.value
            assert response.status == 201, await response.text()
            inquiry = await response.json()
            own = await guest.request.get(f"http://localhost:3002/v1/inquiries/{inquiry['id']}",
                                         headers={"authorization": f"Bearer {inquiry['receiptKey']}"})
            assert (await own.json())["fallback"]["actionRequestId"] == action_id
            assert "fallbackReview" not in await own.json()

            reservations = []
            for index, service in enumerate(services):
                await guest.goto(f"http://localhost:3002/public/{org}?view=booking", wait_until="networkidle")
                await guest.get_by_role("button", name="예약 요청", exact=True).click()
                form = guest.locator("#reservation form")
                await form.get_by_label("서비스", exact=False).select_option(service["id"])
                if index == 0:
                    await form.get_by_label("희망 시간", exact=True).fill("다음 주 오전")
                else:
                    day = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")
                    await form.get_by_label("희망 날짜", exact=True).fill(day)
                    await form.get_by_label("가능 시간", exact=False).locator("option").nth(1).wait_for(state="attached")
                    value = await form.get_by_label("가능 시간", exact=False).locator("option").nth(1).get_attribute("value")
                    await form.get_by_label("가능 시간", exact=False).select_option(value)
                await form.get_by_label("이름", exact=True).fill(f"새 직접 예약 고객 {index}")
                await form.get_by_label("연락처", exact=True).fill("01012345678")
                await form.get_by_label("요청 내용", exact=True).fill("고객이 별도로 작성한 예약")
                await form.get_by_text("AP 이용 후 다시 접수하나요?", exact=False).click()
                await form.get_by_label("AP 이용 후 새 요청으로 제출합니다.", exact=True).check()
                if index == 0:
                    await form.get_by_label("기존 AP 요청 ID (선택)", exact=True).fill(action_id)
                await form.get_by_label("예약 처리에 필요한 연락처 저장에 동의합니다. 위 개인정보 수집·이용 안내를 확인했습니다. (필수)", exact=True).check()
                await assert_width(guest)
                async with guest.expect_response(lambda response: response.request.method == "POST"
                                                  and response.url.endswith(f"/{org}/reservations")) as info:
                    await form.get_by_role("button", name="예약 요청 제출", exact=True).click()
                response = await info.value
                assert response.status == 201, await response.text()
                booking = await response.json()
                assert booking["fallback"]["origin"] == "ap_customer_reported"
                assert booking["fallback"]["actionRequestId"] == (action_id if index == 0 else None)
                reservations.append(booking)

            await page.reload(wait_until="networkidle")
            await page.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="문의", exact=True).click()
            await page.locator(f'[data-inbox-key="field:{inquiry["id"]}"]').click()
            review = page.locator(".field-fallback-review:visible")
            await review.get_by_role("heading", name="AP 이용 후 새 직접 요청", exact=True).wait_for()
            assert await review.get_by_role("button", name="기존 수신 문의 보기", exact=True).count() == 1
            candidate_failed = False

            async def fail_candidate_once(route):
                nonlocal candidate_failed
                if not candidate_failed:
                    candidate_failed = True
                    await route.fulfill(status=503, content_type="application/json", body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await page.route("**/v1/owner/external-requests/*", fail_candidate_once)
            await review.get_by_role("button", name="기존 수신 문의 보기", exact=True).click()
            await page.get_by_text("기존 수신 문의를 열지 못했습니다 (503)", exact=False).wait_for()
            await review.get_by_role("heading", name="AP 이용 후 새 직접 요청", exact=True).wait_for()
            await page.unroute("**/v1/owner/external-requests/*", fail_candidate_once)
            assert candidate_failed
            await review.get_by_role("button", name="기존 수신 문의 보기", exact=True).click()
            await page.get_by_text("전달 내용: 합성 이전 AP 수신 내용", exact=True).wait_for()
            await page.get_by_role("button", name="문의 목록으로", exact=True).click()
            await page.locator(f'[data-inbox-key="field:{inquiry["id"]}"]').click()
            await page.locator(".field-fallback-review:visible").get_by_role("button", name="기존 예약 보기", exact=True).click()
            await page.locator("#owner-reservation-detail").get_by_role("heading", name="이전 AP 고객 · request 상담", exact=True).wait_for()
            await page.get_by_role("navigation", name="모바일 사업자 메뉴").get_by_role("link", name="문의", exact=True).click()
            await page.get_by_role("button", name="문의 목록으로", exact=True).click()
            await page.locator(f'[data-inbox-key="reservation:{reservations[0]["id"]}"]').click()
            await page.locator(".field-owner-inbox-reservation .field-fallback-review").get_by_role("heading", name="AP 이용 후 새 직접 요청", exact=True).wait_for()
            await assert_width(page)
            await page.locator(".field-owner-inbox-reservation .field-fallback-review").scroll_into_view_if_needed()
            await page.screenshot(path="/tmp/field-fallback-owner-320.png", full_page=True)
            assert not errors, errors
            print(json.dumps({"state": "passed", "viewport": 320, "inquiry": 1, "bookingModes": 2,
                              "candidateInquiryNavigation": True, "candidateReservationNavigation": True,
                              "candidateLookup503Recovery": True,
                              "pageErrors": errors}, ensure_ascii=False))
        except Exception:
            print(json.dumps({"url": guest.url, "intakeView": await guest.locator(".field-public-main").get_attribute("data-intake-view"),
                              "bookingForms": await guest.locator("#reservation form").count(),
                              "selectLabels": await guest.locator("#reservation select").evaluate_all(
                                  "els => els.map(el => ({labels: [...el.labels].map(l => l.textContent), name: el.getAttribute('aria-label')}))")}, ensure_ascii=False))
            await guest.screenshot(path="/tmp/field-fallback-failure-320.png", full_page=True)
            raise
        finally:
            await owner.close()
            await customer.close()
            await browser.close()


asyncio.run(main())
