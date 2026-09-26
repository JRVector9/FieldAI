import asyncio
import os

from playwright.async_api import async_playwright, expect


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        fail_next_list = True

        async def list_route(route):
            nonlocal fail_next_list
            if route.request.method == "GET" and fail_next_list:
                fail_next_list = False
                await route.fulfill(status=503, content_type="application/json",
                                    body='{"error":"temporary_unavailable"}')
            else:
                await route.continue_()

        try:
            await page.route("**/v1/publishers", list_route)
            response = await page.goto("http://localhost:3001/publisher", wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_text("매체 목록을 불러오지 못했습니다", exact=False).wait_for()
            await expect(page.get_by_role("heading", name="매체 계정 로그인")).to_be_hidden()
            await page.get_by_role("button", name="매체 목록 다시 불러오기").click()
            login = page.locator("section.special-panel").filter(
                has=page.get_by_role("heading", name="계정 만들기"))
            await login.get_by_label("이름").fill("합성 매체 관리자")
            await login.get_by_label("이메일").fill(os.environ["AP_TEST_PUBLISHER_EMAIL"])
            await login.get_by_label("비밀번호").fill(os.environ["AP_TEST_PUBLISHER_PASSWORD"])
            await login.get_by_role("button", name="계정 만들기").click()
            await page.get_by_role("navigation", name="제휴 매체 관리실").get_by_role("button", name="매체 설정").click()
            await page.get_by_role("heading", name="매체 조직").wait_for()

            fail_next_list = True
            publisher = page.locator("section.special-panel").filter(
                has=page.get_by_role("heading", name="매체 조직"))
            await publisher.get_by_label("새 매체 이름").fill("합성 매체")
            await publisher.get_by_role("button", name="매체 조직 만들기").click()
            await page.get_by_text("매체 조직은 생성됐지만 목록을 다시 읽지 못했습니다", exact=False).wait_for()
            await page.get_by_role("button", name="매체 목록 다시 불러오기").click()
            await page.locator(".publisher-list button").filter(has_text="합성 매체").wait_for()
            fail_domain_read = True

            async def domain_route(route):
                nonlocal fail_domain_read
                if route.request.method == "GET" and fail_domain_read:
                    fail_domain_read = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
                    await route.continue_()

            await page.route("**/v1/publishers/*/domains", domain_route)
            await publisher.get_by_role("button", name="새로고침").click()
            await page.get_by_text("매체 도메인·광고 위치·배치 요청을 불러오지 못했습니다", exact=False).wait_for()
            await page.get_by_role("button", name="매체 목록 다시 불러오기").click()
            await page.locator(".publisher-list button").filter(has_text="합성 매체").wait_for()
            assert not fail_domain_read
            domain = page.locator("section.special-panel").filter(
                has=page.get_by_role("heading", name="도메인 등록"))
            await domain.get_by_label("매체 사이트 origin").fill(os.environ["AP_TEST_PUBLISHER_ORIGIN"])
            await domain.get_by_role("button", name="도메인 등록").click()
            await domain.get_by_role("heading", name=os.environ["AP_TEST_PUBLISHER_ORIGIN"]).wait_for()
            await page.get_by_role("navigation", name="제휴 매체 관리실").get_by_role("button", name="노출 위치").click()
            slots = page.locator("section.publisher-slots")
            await slots.get_by_label("위치 이름").fill("합성 기사 위치")
            await slots.get_by_role("button", name="위치 등록").click()
            await slots.get_by_role("heading", name="합성 기사 위치").wait_for()
            await page.get_by_role("navigation", name="제휴 매체 관리실").get_by_role("button", name="매체 설정").click()
            lose_create_ack = True

            async def create_route(route):
                nonlocal lose_create_ack
                if route.request.method == "POST" and lose_create_ack:
                    lose_create_ack = False
                    created = await route.fetch()
                    assert created.status == 201
                    await route.abort("failed")
                else:
                    await route.continue_()

            await page.route("**/v1/publishers", create_route)
            await publisher.get_by_label("새 매체 이름").fill("응답 분실 매체")
            await publisher.get_by_role("button", name="매체 조직 만들기").click()
            await page.get_by_text("매체 조직 생성 결과를 확인할 수 없습니다", exact=False).wait_for()
            await expect(publisher.get_by_label("새 매체 이름")).to_have_value("응답 분실 매체")
            await publisher.get_by_role("button", name="매체 조직 만들기").click()
            await page.locator(".publisher-list button").filter(has_text="응답 분실 매체").wait_for()
            assert not lose_create_ack
            result = await page.request.get("http://localhost:3001/v1/publishers")
            assert result.status == 200
            assert len([item for item in (await result.json())["publishers"]
                        if item["name"] == "합성 매체"]) == 1
            assert len([item for item in (await result.json())["publishers"]
                        if item["name"] == "응답 분실 매체"]) == 1
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("AP publisher first read and post-ACK read recovery: passed")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
