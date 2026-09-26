import asyncio
import os

from playwright.async_api import async_playwright, expect


async def sign_in(page, email, password):
    await page.get_by_label("이메일").fill(email)
    await page.get_by_label("비밀번호").fill(password)
    await page.get_by_role("button", name="AP 관리자 로그인").click()


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            normal = await browser.new_page(viewport={"width": 320, "height": 720})
            normal.set_default_timeout(10000)
            response = await normal.goto("http://localhost:3001/admin", wait_until="networkidle")
            assert response and response.status == 200
            await normal.get_by_role("heading", name="AP 관리자 운영 상태").wait_for()
            await sign_in(normal, os.environ["AP_TEST_NORMAL_EMAIL"], os.environ["AP_TEST_NORMAL_PASSWORD"])
            await normal.get_by_text("AP 관리자 권한이 없습니다", exact=False).wait_for()
            await expect(normal.get_by_role("heading", name="고객 알림 미연결")).to_be_hidden()
            await normal.goto("http://localhost:3001/admin/audit", wait_until="networkidle")
            await normal.get_by_text("AP 관리자 권한이 없습니다", exact=False).wait_for()
            await expect(normal.get_by_role("heading", name="최근 관리자 조회")).to_be_hidden()

            operator = await browser.new_page(viewport={"width": 320, "height": 720})
            operator.set_default_timeout(10000)
            response = await operator.goto("http://localhost:3001/admin", wait_until="networkidle")
            assert response and response.status == 200
            await sign_in(operator, os.environ["AP_TEST_ADMIN_EMAIL"], os.environ["AP_TEST_ADMIN_PASSWORD"])
            await operator.get_by_role("heading", name="고객 알림 미연결").wait_for()
            await operator.get_by_role("heading", name="최근 대기 사건").wait_for()
            await operator.get_by_text("사건 ID " + os.environ["AP_TEST_INCIDENT_ID"]).wait_for()
            await operator.get_by_text("AP 관리자 · operator").wait_for()
            overflow = await operator.evaluate("""() => ({width: innerWidth,
                scrollWidth: document.documentElement.scrollWidth,
                elements: [...document.querySelectorAll('body *')]
                    .filter(element => element.getBoundingClientRect().right > innerWidth + 1
                        || element.scrollWidth > element.clientWidth + 1)
                    .slice(0, 8).map(element => ({tag: element.tagName, className: element.className,
                        text: (element.textContent || '').slice(0, 60),
                        right: element.getBoundingClientRect().right,
                        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth}))})""")
            assert overflow["scrollWidth"] <= overflow["width"], overflow
            overview = await operator.request.get("http://localhost:3001/v1/admin/overview")
            assert overview.status == 200
            data = await overview.json()
            assert data["product"] == "agent" and data["role"] == "operator"
            assert set(data["counts"]) == {
                "organizations", "openInquiries", "blockedCustomerNotifications",
                "activeDeployments", "publisherOrganizations", "pendingOutbox",
                "memberships", "approvedAgentOrganizations", "verifiedOwnedEmbeds",
                "activeTrials", "cancelRequestedTrials", "adminReads",
            }
            assert data["recentAdminAccesses"]
            assert os.environ["AP_TEST_ADMIN_EMAIL"] not in str(data)
            assert os.environ["AP_TEST_INCIDENT_ID"] in str(data["recentIncidents"])
            assert os.environ["AP_TEST_PRIVATE_MARKER"] not in str(data)
            assert os.environ["AP_TEST_PRIVATE_MARKER"] not in await operator.locator("body").inner_text()
            field_access = await operator.request.get("http://localhost:3002/v1/admin/overview")
            assert field_access.status == 401
            sections = [
                ("organizations", "AP 조직", "조직 구성원"),
                ("notifications", "AP 발송", "고객 알림 미연결"),
                ("ai-deployments", "AP AI·배포", "승인된 AI 조직"),
                ("billing", "AP 구독", "유효한 체험"),
                ("audit", "AP 신고·감사", "관리자 운영 조회"),
            ]
            for slug, heading, metric in sections:
                response = await operator.goto("http://localhost:3001/admin/" + slug, wait_until="networkidle")
                assert response and response.status == 200
                await operator.get_by_role("heading", name=heading, exact=True).first.wait_for()
                await operator.get_by_role("heading", name=metric, exact=True).wait_for()
                await operator.get_by_text("AP 관리자 · operator").wait_for()
                assert await operator.evaluate("document.documentElement.scrollWidth <= innerWidth"), slug
                assert await operator.evaluate("""() => [...document.querySelectorAll('h1,h2,h3,p,a,button,label,input,small')]
                    .filter(element => element.getBoundingClientRect().height > 0)
                    .every(element => parseFloat(getComputedStyle(element).fontSize) >= 14)"""), slug
            await operator.get_by_role("heading", name="최근 관리자 조회").wait_for()
            await operator.get_by_text("운영자 ID", exact=False).first.wait_for()
            await operator.set_viewport_size({"width": 390, "height": 844})
            await operator.get_by_role("navigation", name="AP 관리자 화면").get_by_role("link", name="발송").focus()
            await operator.keyboard.press("Enter")
            await operator.wait_for_url("http://localhost:3001/admin/notifications")
            await operator.get_by_text("AP 관리자 · operator").wait_for()
            assert await operator.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert "noindex" in (await operator.locator('meta[name="robots"]').get_attribute("content"))
            invalid = await operator.request.get("http://localhost:3001/admin/not-a-section")
            assert invalid.status == 404
            print("AP admin membership and aggregate mobile overview: passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
