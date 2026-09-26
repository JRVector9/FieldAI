import asyncio
import json
import uuid

from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 320, "height": 720})
        page = await context.new_page()
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            await page.goto("http://localhost:3002/workspace", wait_until="networkidle")
            await page.get_by_label("이름").fill("합성 설치 상태 사업자")
            await page.get_by_label("이메일").fill(f"installation-{uuid.uuid4()}@example.invalid")
            await page.get_by_label("비밀번호").fill("SyntheticInstall123!")
            await page.get_by_role("button", name="내 홈페이지 시작하기").click()
            await page.get_by_role("heading", name="내 홈페이지 만들기").wait_for()
            await page.get_by_label("상호").fill("합성 설치 상태 사업장")
            await page.get_by_role("button", name="조직 만들기").click()
            await page.get_by_role("heading", name="사업 정보 초안").wait_for()

            created = await page.request.post("http://localhost:3002/v1/sites")
            assert created.status == 201, await created.text()
            slug = (await created.json())["slug"]
            await page.goto("http://localhost:3002/workspace/integrations", wait_until="networkidle")
            await page.get_by_text("사이트 초안 주소", exact=False).wait_for()
            assert await page.get_by_role("button", name="사이트 증명값 저장").count() == 0
            assert await page.get_by_role("button", name="AP 계정 연결 시작").count() == 1

            failed_once = False

            async def fail_installation_read(route):
                nonlocal failed_once
                if not failed_once:
                    failed_once = True
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await page.route("**/v1/sites/ap-installation", fail_installation_read)
            await page.reload(wait_until="networkidle")
            await page.get_by_text("사이트 설치 상태를 확인하지 못했습니다", exact=False).wait_for()
            assert await page.get_by_text("먼저 Field 사이트를 공개해 주세요", exact=False).count() == 0
            await page.get_by_role("button", name="사이트 설치 상태 다시 확인").click()
            await page.get_by_text("사이트 초안 주소", exact=False).wait_for()
            assert failed_once
            await page.unroute("**/v1/sites/ap-installation", fail_installation_read)

            connection_id = str(uuid.uuid4())
            site_origin = f"http://{slug}.localhost:3002"

            async def published_site(route):
                await route.fulfill(status=200, content_type="application/json",
                                    body=json.dumps({"siteOrigin": site_origin, "published": True,
                                                     "installation": None}))

            async def selected_connection(route):
                await route.fulfill(status=200, content_type="application/json",
                                    body=json.dumps({"connections": [{
                                        "id": connection_id,
                                        "organizationId": str(uuid.uuid4()),
                                        "apOrganizationId": str(uuid.uuid4()),
                                        "apGrantId": str(uuid.uuid4()),
                                        "apAgentId": str(uuid.uuid4()),
                                        "apAgentName": "합성 AP AI", "scopes": [],
                                        "status": "review_required", "remoteRevokeState": None,
                                        "createdAt": "2026-09-26T00:00:00Z"}]}))

            deployment_failed = False

            async def candidate_deployments(route):
                nonlocal deployment_failed
                if not deployment_failed:
                    deployment_failed = True
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.fulfill(status=200, content_type="application/json",
                                        body='{"deployments":[]}')

            await page.route("**/v1/sites/ap-installation", published_site)
            await page.route("**/v1/connections/ap", selected_connection)
            await page.route("**/v1/connections/ap/*/deployments", candidate_deployments)
            await page.reload(wait_until="networkidle")
            await page.get_by_text("AP 배포 상태를 확인하지 못했습니다", exact=False).wait_for()
            assert await page.get_by_text("허용된 활성 AP 위젯 배포가 없습니다", exact=False).count() == 0
            await page.get_by_role("button", name="AP 배포 다시 확인").click()
            await page.get_by_text("허용된 활성 AP 위젯 배포가 없습니다", exact=False).wait_for()
            assert deployment_failed
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("Field installation state browser: draft, failed reads and retries at 320px passed")
        finally:
            await context.close()
            await browser.close()


asyncio.run(main())
