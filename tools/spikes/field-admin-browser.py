import asyncio
import os

from playwright.async_api import async_playwright, expect


async def sign_in(page, email, password):
    await page.get_by_label("이메일").fill(email)
    await page.get_by_label("비밀번호").fill(password)
    await page.get_by_role("button", name="Field 관리자 로그인").click()


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            normal = await browser.new_page(viewport={"width": 320, "height": 720})
            normal.set_default_timeout(10000)
            response = await normal.goto("http://localhost:3002/admin", wait_until="networkidle")
            assert response and response.status == 200
            await normal.get_by_role("heading", name="Field 관리자 운영 상태").wait_for()
            await sign_in(normal, os.environ["FIELD_TEST_NORMAL_EMAIL"], os.environ["FIELD_TEST_NORMAL_PASSWORD"])
            await normal.get_by_text("Field 관리자 권한이 없습니다", exact=False).wait_for()
            await expect(normal.get_by_role("heading", name="고객 알림 미연결")).to_be_hidden()
            await normal.goto("http://localhost:3002/admin/audit", wait_until="networkidle")
            await normal.get_by_text("Field 관리자 권한이 없습니다", exact=False).wait_for()
            await expect(normal.get_by_role("heading", name="최근 관리자 조회")).to_be_hidden()

            operator = await browser.new_page(viewport={"width": 320, "height": 720})
            operator.set_default_timeout(10000)
            response = await operator.goto("http://localhost:3002/admin", wait_until="networkidle")
            assert response and response.status == 200
            await sign_in(operator, os.environ["FIELD_TEST_ADMIN_EMAIL"], os.environ["FIELD_TEST_ADMIN_PASSWORD"])
            await operator.get_by_role("heading", name="고객 알림 미연결").wait_for()
            await operator.get_by_role("heading", name="최근 대기 사건").wait_for()
            await operator.get_by_text("사건 ID " + os.environ["FIELD_TEST_INCIDENT_ID"]).wait_for()
            await operator.get_by_text("Field 관리자 · operator").wait_for()
            assert await operator.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            overview = await operator.request.get("http://localhost:3002/v1/admin/overview")
            assert overview.status == 200
            data = await overview.json()
            assert data["product"] == "field" and data["role"] == "operator"
            assert set(data["counts"]) == {
                "organizations", "openInquiries", "blockedCustomerNotifications",
                "openReservations", "publishedSites", "runningSiteJobs", "pendingOutbox",
                "memberships", "failedSiteJobs", "activeTrials", "cancelRequestedTrials", "adminReads",
            }
            assert data["recentAdminAccesses"]
            assert os.environ["FIELD_TEST_ADMIN_EMAIL"] not in str(data)
            assert os.environ["FIELD_TEST_INCIDENT_ID"] in str(data["recentIncidents"])
            assert os.environ["FIELD_TEST_PRIVATE_MARKER"] not in str(data)
            assert os.environ["FIELD_TEST_PRIVATE_MARKER"] not in await operator.locator("body").inner_text()
            ap_access = await operator.request.get("http://localhost:3001/v1/admin/overview")
            assert ap_access.status == 401
            sections = [
                ("organizations", "Field 사업체", "조직 구성원"),
                ("site-domains", "Field 제작·도메인", "실패한 사이트 제작"),
                ("notifications", "Field 발송", "고객 알림 미연결"),
                ("billing", "Field 구독", "유효한 체험"),
                ("audit", "Field 신고·감사", "관리자 운영 조회"),
            ]
            for slug, heading, metric in sections:
                response = await operator.goto("http://localhost:3002/admin/" + slug, wait_until="networkidle")
                assert response and response.status == 200
                await operator.get_by_role("heading", name=heading, exact=True).first.wait_for()
                await operator.get_by_role("heading", name=metric, exact=True).wait_for()
                await operator.get_by_text("Field 관리자 · operator").wait_for()
                assert await operator.evaluate("document.documentElement.scrollWidth <= innerWidth"), slug
                assert await operator.evaluate("""() => [...document.querySelectorAll('h1,h2,h3,p,a,button,label,input,small')]
                    .filter(element => element.getBoundingClientRect().height > 0)
                    .every(element => parseFloat(getComputedStyle(element).fontSize) >= 14)"""), slug
            await operator.get_by_role("heading", name="최근 관리자 조회").wait_for()
            await operator.get_by_text("운영자 ID", exact=False).first.wait_for()
            await operator.set_viewport_size({"width": 390, "height": 844})
            await operator.get_by_role("navigation", name="Field 관리자 화면").get_by_role("link", name="발송").focus()
            await operator.keyboard.press("Enter")
            await operator.wait_for_url("http://localhost:3002/admin/notifications")
            await operator.get_by_text("Field 관리자 · operator").wait_for()
            assert await operator.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert "noindex" in (await operator.locator('meta[name="robots"]').get_attribute("content"))
            invalid = await operator.request.get("http://localhost:3002/admin/not-a-section")
            assert invalid.status == 404
            print("Field admin membership and aggregate mobile overview: passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
