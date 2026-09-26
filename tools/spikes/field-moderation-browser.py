import asyncio
import json
import os
from playwright.async_api import async_playwright, expect


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        accounts = json.loads(os.environ['FIELD_MODERATION_ACCOUNTS'])
        contexts = [await browser.new_context(viewport={'width': 320, 'height': 720}) for _ in accounts]
        pages = [await context.new_page() for context in contexts]
        errors = []
        for page in pages:
            page.set_default_timeout(10000)
            page.on('pageerror', lambda error: errors.append(str(error)))
        owner, operator, approver = pages
        try:
            for page, account in zip(pages, accounts):
                signed = await page.request.post('http://localhost:3002/api/auth/sign-in/email',
                                                headers={'origin': 'http://localhost:3002'}, data=account)
                assert signed.status == 200
            public = await browser.new_page(viewport={'width': 320, 'height': 720})
            public.set_default_timeout(10000)
            slug = os.environ['FIELD_MODERATION_SLUG']
            url = f'http://{slug}.localhost:3002/site/{slug}'
            await public.goto(url, wait_until='networkidle')
            report_button = public.get_by_role('button', name='공개 사이트 신고', exact=True)
            report_button_style = await report_button.evaluate('(element) => ({ fontSize: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height })')
            await report_button.click()
            modal = public.get_by_role('dialog', name='공개 사이트 신고')
            await modal.get_by_label('신고 설명').fill('PRIVATE_REPORT_BROWSER: 공개 안내 확인을 요청합니다.')
            await modal.get_by_label('신고 검토를 위한 내용 제공에 동의합니다.').check()
            lose_ack = True

            async def lost_response(route):
                nonlocal lose_ack
                if route.request.method == 'POST' and lose_ack:
                    lose_ack = False
                    await route.fetch()
                    await route.abort('failed')
                else:
                    await route.continue_()

            await public.route('**/v1/public/sites/*/reports', lost_response)
            await modal.get_by_role('button', name='신고 제출', exact=True).click()
            await modal.get_by_text('응답을 받지 못했습니다.', exact=False).wait_for()
            await modal.get_by_role('button', name='같은 신고 다시 확인', exact=True).click()
            await modal.get_by_text('신고를 접수했습니다.', exact=False).wait_for()
            report_id = await modal.locator('code').inner_text()
            await operator.goto('http://localhost:3002/admin/audit', wait_until='networkidle')
            await operator.get_by_role('heading', name='공개 사이트 신고').wait_for()
            assert 'PRIVATE_REPORT_BROWSER' not in await operator.locator('body').inner_text()
            row = operator.locator('.field-moderation-case').filter(has_text=report_id)
            await row.get_by_role('button', name='상세 접근 신청').click()
            await operator.get_by_label('지원 접근 사유').fill('공개 안내 신고 사실 확인')
            await operator.get_by_role('button', name='지원 접근 신청').click()
            await operator.get_by_text('다른 운영자의 승인을 기다립니다.', exact=True).wait_for()
            await approver.goto('http://localhost:3002/admin/audit', wait_until='networkidle')
            grant = approver.locator('.field-moderation-access').filter(has_text=report_id)
            await grant.get_by_label('승인 사유').fill('신고 확인 업무 승인')
            await grant.get_by_role('button', name='지원 접근 승인').click()
            await grant.get_by_text('승인됨', exact=False).wait_for()
            await operator.get_by_role('button', name='신고 목록 새로고침').click()
            grant = operator.locator('.field-moderation-access').filter(has_text=report_id)
            await grant.get_by_role('button', name='승인 접근으로 상세 열기').click()
            detail = operator.get_by_role('region', name='승인된 신고 상세')
            await expect(detail).to_contain_text('PRIVATE_REPORT_BROWSER')
            await detail.locator('summary').filter(has_text='신고 당시 공개 안내').click()
            await expect(detail).to_contain_text('신고 당시 승인 서비스')
            await expect(detail).to_contain_text('50,000원')
            await expect(detail).to_contain_text('신고 당시 승인 답변')
            await expect(detail).to_contain_text('신고 당시 사이트 본문 검토 문구')
            assert report_button_style['fontSize'] >= 14 and report_button_style['height'] >= 44, report_button_style
            await detail.get_by_label('검토 결과').select_option('site_hidden')
            await detail.get_by_label('사업자에게 전달할 검토 요약').fill('공개 안내 정정 전 사이트 공개만 제한합니다.')
            await detail.get_by_label('처리 사유').fill('승인 사업 안내와 대조했습니다.')
            lose_review_ack = True

            async def lost_review_response(route):
                nonlocal lose_review_ack
                if lose_review_ack:
                    lose_review_ack = False
                    await route.fetch()
                    await route.abort('failed')
                else:
                    await route.continue_()

            await operator.route('**/v1/admin/reports/*/review', lost_review_response)
            await detail.get_by_role('button', name='검토 결과 저장').click()
            await operator.get_by_text('응답을 받지 못했습니다.', exact=False).wait_for()
            await operator.get_by_role('button', name='같은 처리 다시 확인').click()
            await expect(detail).to_contain_text('검토 완료')
            response = await public.goto(url, wait_until='networkidle')
            assert response.status == 404
            restricted = await public.request.get(f'http://{slug}.localhost:3002/v1/public/sites/{slug}')
            identity = await restricted.json()
            response = await public.goto(f'http://{slug}.localhost:3002/public/{identity["organizationId"]}', wait_until='networkidle')
            assert response.status == 200
            await owner.goto('http://localhost:3002/workspace', wait_until='networkidle')
            await expect(owner.locator('.field-owner-stats')).to_contain_text('공개 제한')
            await owner.get_by_role('navigation', name='빠른 이동').get_by_role('link', name='알림', exact=False).click()
            await owner.get_by_role('button', name='사업 안내 신고 검토 결과', exact=False).click()
            await owner.wait_for_url('http://localhost:3002/workspace/moderation')
            await owner.get_by_text('공개 안내 정정 전 사이트 공개만 제한합니다.', exact=True).wait_for()
            assert 'PRIVATE_REPORT_BROWSER' not in await owner.locator('body').inner_text()
            await owner.get_by_label('이의 내용').fill('사업 안내를 정정했습니다. 재검토를 요청합니다.')
            await owner.get_by_role('button', name='이의 제출', exact=True).click()
            await owner.get_by_text('이의 검토 중', exact=True).wait_for()
            await operator.get_by_role('button', name='신고 목록 새로고침').click()
            await operator.locator('.field-moderation-access').filter(has_text=report_id).get_by_role('button', name='승인 접근으로 상세 열기').click()
            await expect(detail).to_contain_text('사업 안내를 정정했습니다.')
            await detail.get_by_label('이의 결정').select_option('overturned')
            await detail.get_by_label('사업자에게 전달할 검토 요약').fill('정정 확인 후 해당 공개 제한을 해제합니다.')
            await detail.get_by_label('처리 사유').fill('정정된 승인 안내를 확인했습니다.')
            await detail.get_by_role('button', name='이의 결정 저장').click()
            await expect(detail).to_contain_text('처리 종료')
            response = await public.goto(url, wait_until='networkidle')
            assert response.status == 200
            await owner.get_by_role('button', name='검토 결과 다시 확인').click()
            await owner.get_by_text('이의 인용', exact=True).wait_for()
            for page in pages:
                assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert not errors, errors
            await operator.screenshot(path='/tmp/field-moderation-admin-320.png', full_page=True)
            await owner.screenshot(path='/tmp/field-moderation-owner-320.png', full_page=True)
            print('Field report and scoped review appeal: passed')
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
