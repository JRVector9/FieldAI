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
        first_saved = asyncio.Event()
        release_first = asyncio.Event()
        put_count = 0
        fail_next = False
        drop_after_commit = False
        fail_business_load = True
        fail_draft_load = True

        async def business_route(route):
            nonlocal fail_business_load
            if route.request.method == "GET" and fail_business_load:
                fail_business_load = False
                await route.fulfill(status=503, content_type="application/json",
                                    body='{"error":"temporary_unavailable"}')
            else:
                await route.continue_()

        async def draft_route(route):
            nonlocal put_count, fail_next, drop_after_commit, fail_draft_load
            if route.request.method != "PUT":
                if route.request.method == "GET" and fail_draft_load:
                    fail_draft_load = False
                    await route.fulfill(status=503, content_type="application/json",
                                        body='{"error":"temporary_unavailable"}')
                else:
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

        await page.route("**/v1/sites/draft", draft_route)
        await page.route("**/v1/business/draft", business_route)
        try:
            signed = await page.request.post("http://127.0.0.1:3002/api/auth/sign-in/email",
                                             headers={"origin": "http://127.0.0.1:3002"},
                                             data={"email": os.environ["FIELD_TEST_OWNER_EMAIL"],
                                                   "password": os.environ["FIELD_TEST_OWNER_PASSWORD"]})
            assert signed.status == 200
            response = await page.goto("http://127.0.0.1:3002/workspace/site", wait_until="networkidle")
            assert response and response.status == 200
            await page.get_by_text("사업 정보를 불러오지 못했습니다", exact=False).wait_for()
            await page.get_by_role("button", name="다시 불러오기").click()
            await page.get_by_text("사이트 초안을 불러오지 못했습니다", exact=False).wait_for()
            await page.get_by_role("button", name="다시 불러오기").click()
            await page.get_by_role("button", name="3 편집").wait_for()
            await page.get_by_role("button", name="3 편집").click()
            heading = page.get_by_label("제목").first
            revision_line = page.locator("main p").filter(has_text="기본 주소:").first
            await heading.fill("첫 번째 자동 저장")
            await asyncio.wait_for(first_saved.wait(), timeout=8)
            await heading.fill("저장 응답 중 이어 쓴 내용")
            release_first.set()
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=10000)
            assert await heading.input_value() == "저장 응답 중 이어 쓴 내용"
            saved = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            assert saved.status == 200
            current = await saved.json()
            assert current["pages"][0]["sections"][0]["heading"] == "저장 응답 중 이어 쓴 내용"
            assert current["revision"] >= 2

            fail_next = True
            await heading.fill("네트워크 실패 중 입력")
            await expect(revision_line).to_contain_text("저장 실패", timeout=8000)
            assert await heading.input_value() == "네트워크 실패 중 입력"
            failed = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            assert (await failed.json())["pages"][0]["sections"][0]["heading"] == "저장 응답 중 이어 쓴 내용"
            await page.get_by_role("button", name="초안 저장").click()
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            retried = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            current = await retried.json()
            assert current["pages"][0]["sections"][0]["heading"] == "네트워크 실패 중 입력"

            drop_after_commit = True
            await heading.fill("저장 뒤 응답만 사라짐")
            await expect(revision_line).to_contain_text("저장 실패", timeout=8000)
            committed = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            current = await committed.json()
            assert current["pages"][0]["sections"][0]["heading"] == "저장 뒤 응답만 사라짐"
            committed_revision = current["revision"]
            await page.get_by_role("button", name="초안 저장").click()
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            recovered = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            current = await recovered.json()
            assert current["revision"] == committed_revision

            await page.context.set_offline(True)
            await heading.fill("오프라인에서 쓴 내용")
            await expect(revision_line).to_contain_text("오프라인 · 미저장")
            offline_put_count = put_count
            await asyncio.sleep(1.3)
            assert put_count == offline_put_count
            await page.context.set_offline(False)
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            online_saved = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            current = await online_saved.json()
            assert current["pages"][0]["sections"][0]["heading"] == "오프라인에서 쓴 내용"

            external = {"expectedRevision": current["revision"], "template": current["template"],
                        "palette": current["palette"], "pages": current["pages"]}
            external["pages"][0]["sections"][0]["heading"] = "다른 편집자의 저장"
            changed = await page.request.put("http://127.0.0.1:3002/v1/sites/draft", data=external)
            assert changed.status == 200
            await heading.fill("내 충돌 입력")
            await page.get_by_text("다른 수정", exact=False).wait_for(timeout=8000)
            assert await heading.input_value() == "내 충돌 입력"
            assert "미저장 변경" in await revision_line.inner_text()
            conflict = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            assert (await conflict.json())["pages"][0]["sections"][0]["heading"] == "다른 편집자의 저장"
            page.once("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
            await page.get_by_role("button", name="내 입력으로 다시 저장").click()
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            resolved = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            current = await resolved.json()
            assert current["pages"][0]["sections"][0]["heading"] == "내 충돌 입력"

            external = {"expectedRevision": current["revision"], "template": current["template"],
                        "palette": current["palette"], "pages": current["pages"]}
            external["pages"][0]["sections"][0]["heading"] = "최신 서버 초안"
            changed = await page.request.put("http://127.0.0.1:3002/v1/sites/draft", data=external)
            assert changed.status == 200
            await heading.fill("버릴 로컬 입력")
            await page.get_by_role("heading", name="서버 초안과 저장 충돌").wait_for()
            page.once("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
            await page.get_by_role("button", name="서버 초안 사용").click()
            await expect(heading).to_have_value("최신 서버 초안")
            await expect(revision_line).not_to_contain_text("미저장 변경")

            for number in (2, 3):
                await page.get_by_role("button", name="페이지 추가").click()
                await expect(page.get_by_label("페이지 주소 경로")).to_have_value(f"page-{number}")
                await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            await page.locator(".deployment-options").get_by_role("button", name="페이지 2", exact=True).click()
            await page.get_by_role("button", name="페이지 삭제").click()
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            await page.get_by_role("button", name="페이지 추가").click()
            await expect(page.get_by_label("페이지 주소 경로")).to_have_value("page-4")
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            pages_saved = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            assert pages_saved.status == 200
            assert sorted(item["slug"] for item in (await pages_saved.json())["pages"]) == ["home", "page-3", "page-4"]
            saved_put_count = put_count
            await page.get_by_label("페이지 주소 경로").fill("page-3")
            await expect(page.get_by_label("페이지 이름")).to_have_value("페이지 4")
            await page.get_by_text("페이지 주소 경로가 중복됩니다", exact=False).wait_for(timeout=8000)
            assert put_count == saved_put_count
            await page.get_by_label("페이지 주소 경로").fill("page-4")
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            corrected = await page.request.get("http://127.0.0.1:3002/v1/sites/draft")
            assert sorted(item["slug"] for item in (await corrected.json())["pages"]) == ["home", "page-3", "page-4"]
            saved_put_count = put_count
            await page.get_by_label("페이지 주소 경로").fill("Bad Path")
            await page.get_by_text("영문 소문자·숫자·하이픈", exact=False).wait_for(timeout=8000)
            await expect(page.get_by_label("페이지 이름")).to_have_value("페이지 4")
            assert put_count == saved_put_count
            await page.get_by_label("페이지 주소 경로").fill("page-4")
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            await page.get_by_role("button", name="섹션 추가").click()
            await page.get_by_label("제목").first.fill("모바일 미리보기 제목")
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            saved_put_count = put_count
            await page.get_by_role("button", name="미리보기", exact=True).click()
            await expect(page.get_by_label("페이지 이름")).to_be_hidden()
            await page.get_by_role("heading", name="모바일 미리보기 제목").wait_for()
            await page.get_by_role("navigation", name="사이트 페이지").get_by_role(
                "button", name="페이지 3").click()
            edit_switch = page.get_by_role("button", name="편집", exact=True)
            await edit_switch.focus()
            await page.keyboard.press("Enter")
            await expect(page.get_by_label("페이지 이름")).to_have_value("페이지 3")
            await page.locator(".deployment-options").get_by_role(
                "button", name="페이지 4", exact=True).click()
            await expect(page.get_by_label("제목").first).to_have_value("모바일 미리보기 제목")
            assert put_count == saved_put_count
            await page.get_by_label("제목").first.fill("전환 중 미저장 제목")
            await page.get_by_role("button", name="미리보기", exact=True).click()
            await page.get_by_role("heading", name="전환 중 미저장 제목").wait_for()
            await page.get_by_role("button", name="편집", exact=True).click()
            await expect(page.get_by_label("제목").first).to_have_value("전환 중 미저장 제목")
            await expect(revision_line).not_to_contain_text("미저장 변경", timeout=8000)
            await page.set_viewport_size({"width": 1440, "height": 900})
            await expect(page.get_by_label("페이지 이름")).to_be_visible()
            await page.get_by_role("heading", name="전환 중 미저장 제목").wait_for()
            await page.set_viewport_size({"width": 320, "height": 720})
            await page.reload(wait_until="networkidle")
            await expect(page.get_by_label("페이지 이름")).to_have_value("페이지 4")
            await expect(page.get_by_label("제목").first).to_have_value("전환 중 미저장 제목")
            await page.goto("http://127.0.0.1:3002/workspace/site?step=pages&page=unknown",
                            wait_until="networkidle")
            await expect(page.get_by_label("페이지 이름")).to_have_value("홈")
            other_context = await browser.new_context(viewport={"width": 320, "height": 720})
            other_page = await other_context.new_page()
            other_signed = await other_page.request.post(
                "http://127.0.0.1:3002/api/auth/sign-in/email",
                headers={"origin": "http://127.0.0.1:3002"},
                data={"email": os.environ["FIELD_TEST_OWNER_EMAIL"],
                      "password": os.environ["FIELD_TEST_OWNER_PASSWORD"]})
            assert other_signed.status == 200
            await other_page.goto("http://127.0.0.1:3002/workspace/site", wait_until="networkidle")
            await expect(other_page.get_by_label("페이지 이름")).to_be_visible()
            await other_page.locator(".deployment-options").get_by_role(
                "button", name="페이지 4", exact=True).click()
            await expect(other_page.get_by_label("제목").first).to_have_value("전환 중 미저장 제목")
            assert (await page.request.get(f"http://127.0.0.1:3002/v1/public/sites/{current['slug']}")).status == 404
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print("Field site autosave browser: passed")
        finally:
            release_first.set()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
