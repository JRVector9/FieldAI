import asyncio
import os
from playwright.async_api import async_playwright, expect


async def main():
    web = "http://127.0.0.1:3001"
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 320, "height": 720})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        first_saved = asyncio.Event()
        release_first = asyncio.Event()
        put_count = 0
        fail_next = False
        drop_after_commit = False

        async def draft_route(route):
            nonlocal put_count, fail_next, drop_after_commit
            if route.request.method != "PUT":
                await route.continue_()
                return
            put_count += 1
            if put_count == 1:
                response = await route.fetch()
                first_saved.set()
                await release_first.wait()
                await route.fulfill(response=response)
            elif fail_next:
                fail_next = False
                await route.abort("failed")
            elif drop_after_commit:
                drop_after_commit = False
                await route.fetch()
                await route.abort("failed")
            else:
                await route.continue_()

        await page.route("**/v1/knowledge/draft", draft_route)
        try:
            signed = await page.request.post(f"{web}/api/auth/sign-in/email",
                                             headers={"origin": web},
                                             data={"email": os.environ["AP_TEST_OWNER_EMAIL"],
                                                   "password": os.environ["AP_TEST_OWNER_PASSWORD"]})
            assert signed.status == 200
            response = await page.goto(f"{web}/workspace", wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_role("navigation", name="AP 모바일 관리 메뉴").get_by_role("link", name="승인").click()
            panel = page.locator("section.special-panel").filter(has=page.get_by_role("heading", name="사업 정보 초안")).first
            intro = panel.locator("textarea").first
            revision_line = panel.locator(".panel-heading span")
            await intro.fill("첫 번째 자동 저장")
            await asyncio.wait_for(first_saved.wait(), timeout=8)
            await intro.fill("저장 응답 중 이어 쓴 소개")
            release_first.set()
            await expect(revision_line).not_to_contain_text("미저장", timeout=10000)
            assert await intro.input_value() == "저장 응답 중 이어 쓴 소개"
            current_response = await page.request.get(f"{web}/v1/knowledge/draft")
            current = await current_response.json()
            assert current_response.status == 200
            assert current["introduction"] == "저장 응답 중 이어 쓴 소개"
            assert current["revision"] >= 2

            await panel.get_by_role("button", name="서비스 추가").click()
            await expect(revision_line).not_to_contain_text("미저장", timeout=8000)
            current = await (await page.request.get(f"{web}/v1/knowledge/draft")).json()
            assert current["services"][0]["name"] == ""
            assert await page.get_by_role("button", name="현재 초안 승인").is_disabled()
            await page.reload(wait_until="networkidle")
            await page.get_by_role("navigation", name="AP 모바일 관리 메뉴").get_by_role("link", name="승인").click()
            await panel.get_by_label("서비스 이름").first.wait_for()
            assert await panel.get_by_label("서비스 이름").first.input_value() == ""
            await panel.get_by_label("서비스 이름").first.fill("방문 상담")
            await expect(revision_line).not_to_contain_text("미저장", timeout=8000)

            await panel.get_by_role("button", name="질문 추가").click()
            await expect(revision_line).not_to_contain_text("미저장", timeout=8000)
            await page.reload(wait_until="networkidle")
            await page.get_by_role("navigation", name="AP 모바일 관리 메뉴").get_by_role("link", name="승인").click()
            assert await panel.get_by_label("질문").first.input_value() == ""
            await panel.get_by_label("질문").first.fill("언제 연락하나요?")
            await panel.get_by_label("확인된 답변").first.fill("담당자가 확인해 안내합니다.")
            await expect(revision_line).not_to_contain_text("미저장", timeout=8000)
            await page.get_by_role("button", name="현재 초안 승인").click()
            await page.get_by_text("현재 승인 버전: 없음", exact=True).wait_for(state="hidden", timeout=8000)
            published = await page.request.get(f"{web}/v1/public/organizations/{os.environ['AP_TEST_ORGANIZATION_ID']}")
            assert published.status == 200
            approved_intro = (await published.json())["introduction"]

            fail_next = True
            await intro.fill("요청 실패 중 입력")
            await expect(revision_line).to_contain_text("저장 실패", timeout=8000)
            assert await intro.input_value() == "요청 실패 중 입력"
            await panel.get_by_role("button", name="초안 저장").click()
            await expect(revision_line).not_to_contain_text("미저장", timeout=8000)

            drop_after_commit = True
            await intro.fill("저장 뒤 응답만 사라짐")
            await expect(revision_line).to_contain_text("저장 실패", timeout=8000)
            current = await (await page.request.get(f"{web}/v1/knowledge/draft")).json()
            assert current["introduction"] == "저장 뒤 응답만 사라짐"
            committed_revision = current["revision"]
            await panel.get_by_role("button", name="초안 저장").click()
            await expect(revision_line).not_to_contain_text("미저장", timeout=8000)
            current = await (await page.request.get(f"{web}/v1/knowledge/draft")).json()
            assert current["revision"] == committed_revision

            await page.context.set_offline(True)
            await intro.fill("오프라인에서 쓴 소개")
            await expect(revision_line).to_contain_text("오프라인 · 미저장")
            offline_put_count = put_count
            await asyncio.sleep(1.3)
            assert put_count == offline_put_count
            await page.context.set_offline(False)
            await expect(revision_line).not_to_contain_text("미저장", timeout=8000)
            current = await (await page.request.get(f"{web}/v1/knowledge/draft")).json()
            assert current["introduction"] == "오프라인에서 쓴 소개"

            external = {key: current[key] for key in ("businessName", "introduction", "services", "faqs")}
            external["expectedRevision"] = current["revision"]
            external["introduction"] = "다른 편집자의 소개"
            assert (await page.request.put(f"{web}/v1/knowledge/draft", data=external)).status == 200
            await intro.fill("내 충돌 소개")
            await page.get_by_role("heading", name="지식 초안 저장 충돌").wait_for()
            assert await intro.input_value() == "내 충돌 소개"
            page.once("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
            await page.get_by_role("button", name="내 입력으로 다시 저장").click()
            await expect(revision_line).not_to_contain_text("미저장", timeout=8000)
            current = await (await page.request.get(f"{web}/v1/knowledge/draft")).json()
            assert current["introduction"] == "내 충돌 소개"

            external = {key: current[key] for key in ("businessName", "introduction", "services", "faqs")}
            external["expectedRevision"] = current["revision"]
            external["introduction"] = "서버에서 선택할 소개"
            assert (await page.request.put(f"{web}/v1/knowledge/draft", data=external)).status == 200
            await intro.fill("버릴 로컬 소개")
            await page.get_by_role("heading", name="지식 초안 저장 충돌").wait_for()
            page.once("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
            await page.get_by_role("button", name="서버 초안 사용").click()
            await expect(intro).to_have_value("서버에서 선택할 소개")
            published = await page.request.get(f"{web}/v1/public/organizations/{os.environ['AP_TEST_ORGANIZATION_ID']}")
            assert (await published.json())["introduction"] == approved_intro
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("AP knowledge autosave browser: passed")
        finally:
            release_first.set()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
