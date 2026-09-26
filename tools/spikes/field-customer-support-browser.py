import asyncio
import json
import os
import sys
from playwright.async_api import async_playwright, expect


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        errors = []
        try:
            if '--expiry' in sys.argv:
                context = await browser.new_context(viewport={'width': 320, 'height': 720})
                await context.add_cookies([{'name': item.split('=', 1)[0], 'value': item.split('=', 1)[1],
                    'url': 'http://localhost:3002'} for item in os.environ['FIELD_SUPPORT_COOKIE'].split('; ')])
                page = await context.new_page()
                page.set_default_timeout(15000)
                await page.goto('http://localhost:3002/admin/audit', wait_until='networkidle')
                row = page.locator('.field-support-access').filter(has_text=os.environ['FIELD_SUPPORT_ACCESS'])
                await row.get_by_role('button', name='승인 범위 열람', exact=True).click()
                detail = page.get_by_role('region', name='승인된 고객정보')
                await detail.get_by_role('button', name='업무 사진 보기', exact=True).click()
                await expect(detail.get_by_role('img', name='승인된 업무 사진')).to_be_visible()
                await expect(detail).to_have_count(0, timeout=15000)
                await page.get_by_text('열람 시간이 만료되었습니다.', exact=False).wait_for()
                assert 'PRIVATE_RESERVATION_SUBMISSION' not in await page.locator('body').inner_text()
                assert await page.get_by_role('img', name='승인된 업무 사진').count() == 0
                print('Field support deadline cleared: passed')
                return
            accounts = json.loads(os.environ['FIELD_SUPPORT_ACCOUNTS'])
            contexts = [await browser.new_context(viewport={'width': 320, 'height': 720}) for _ in accounts]
            pages = [await context.new_page() for context in contexts]
            for page, account in zip(pages, accounts):
                page.set_default_timeout(10000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                signed = await page.request.post('http://localhost:3002/api/auth/sign-in/email',
                    headers={'origin': 'http://localhost:3002'}, data=account)
                assert signed.status == 200
                await page.goto('http://localhost:3002/admin/audit', wait_until='networkidle')
            operator, approver = pages
            panel = operator.get_by_role('region', name='고객정보 지원 접근')
            await panel.get_by_role('heading', name='고객정보 지원 접근').wait_for()
            assert 'PRIVATE_INQUIRY_BODY' not in await panel.inner_text()
            lose_ack = True

            async def lost_response(route):
                nonlocal lose_ack
                if route.request.method == 'POST' and lose_ack:
                    lose_ack = False
                    response = await route.fetch()
                    assert response.status == 201, f'Original support request: {response.status} {await response.text()}'
                    await route.abort('failed')
                else:
                    await route.continue_()

            await operator.route('**/v1/admin/support-access', lost_response)

            async def request(reference, selected, kind='inquiry', target=None):
                target = target or os.environ['FIELD_SUPPORT_INQUIRY']
                await panel.get_by_label('업무 종류', exact=True).select_option(kind)
                await panel.get_by_label('업무 ID', exact=True).fill(target)
                await panel.get_by_label('조사 참조', exact=True).fill(reference)
                await panel.get_by_label('구체적인 열람 사유', exact=True).fill('고객 요청에 따른 문의 원본 장애 조사')
                for label, value in [('고객 공개 대화·제출 내용', 'conversation'), ('고객 이름·연락처·방문 지역', 'contact'), ('업무 사진', 'photos')]:
                    await panel.get_by_role('checkbox', name=label, exact=True).set_checked(value in selected)
                await panel.get_by_role('checkbox', name='필요한 정보만 제한적으로 확인하겠습니다.', exact=True).check()
                await panel.get_by_role('button', name='열람 승인 요청', exact=True).click()
                if reference == 'SUPPORT-BROWSER-001':
                    await panel.get_by_text('응답을 받지 못했습니다.', exact=False).wait_for()
                    await panel.get_by_role('button', name='같은 요청 결과 확인', exact=True).click()
                await panel.get_by_text('다른 운영자의 승인을 기다립니다.', exact=True).wait_for()
                row = operator.locator('.field-support-access').filter(has_text=reference)
                await expect(row).to_have_count(1)
                return row

            async def approve(reference):
                await approver.get_by_role('button', name='지원 접근 새로고침', exact=True).click()
                row = approver.locator('.field-support-access').filter(has_text=reference)
                assert 'PRIVATE_INQUIRY_BODY' not in await row.inner_text()
                await row.get_by_label('열람 승인 사유', exact=True).fill('고객 요청 장애 조사를 승인합니다.')
                await row.get_by_role('button', name='열람 승인', exact=True).click()
                await expect(row).to_contain_text('승인됨')
                await panel.get_by_role('button', name='지원 접근 새로고침', exact=True).click()
                return row

            row = await request('SUPPORT-BROWSER-001', ['conversation'])
            await expect(row.get_by_role('button', name='열람 승인', exact=True)).to_be_disabled()
            await approve('SUPPORT-BROWSER-001')
            await row.get_by_role('button', name='승인 범위 열람', exact=True).click()
            detail = operator.get_by_role('region', name='승인된 고객정보')
            await expect(detail).to_contain_text('PRIVATE_INQUIRY_BODY')
            for marker in ['PRIVATE_INQUIRY_CUSTOMER', '010-3333-4444', 'PRIVATE_INTERNAL_NOTE']:
                assert marker not in await detail.inner_text()
            assert await detail.get_by_role('button', name='업무 사진 보기').count() == 0
            failed_once = False

            async def failed_queue(route):
                nonlocal failed_once
                if route.request.method == 'GET' and not failed_once:
                    failed_once = True
                    await route.fulfill(status=503, content_type='application/json', body='{"error":"synthetic_unavailable"}')
                else:
                    await route.continue_()

            await operator.route('**/v1/admin/support-access', failed_queue)
            await panel.get_by_role('button', name='지원 접근 새로고침', exact=True).click()
            await panel.get_by_role('alert').wait_for()
            await expect(detail).to_have_count(0)
            await expect(row).to_have_count(1)
            await expect(row.get_by_role('button', name='승인 범위 열람', exact=True)).to_be_disabled()
            assert 'PRIVATE_INQUIRY_BODY' not in await panel.inner_text()
            await operator.unroute('**/v1/admin/support-access')
            await panel.get_by_role('button', name='지원 접근 새로고침', exact=True).click()
            await expect(row.get_by_role('button', name='승인 범위 열람', exact=True)).to_be_enabled()
            row = await request('SUPPORT-BROWSER-002', ['contact', 'photos'])
            approved = await approve('SUPPORT-BROWSER-002')
            await row.get_by_role('button', name='승인 범위 열람', exact=True).click()
            await expect(detail).to_contain_text('PRIVATE_INQUIRY_CUSTOMER')
            await expect(detail).to_contain_text('번호 소유 미확인')
            assert 'PRIVATE_INQUIRY_BODY' not in await detail.inner_text()
            assert 'PRIVATE_INTERNAL_NOTE' not in await detail.inner_text()
            await detail.get_by_role('button', name='업무 사진 보기', exact=True).click()
            photo = detail.get_by_role('img', name='승인된 업무 사진')
            await expect(photo).to_be_visible()
            assert await photo.evaluate('element => element.naturalWidth') == 4
            await operator.screenshot(path='/tmp/field-customer-support-inquiry-320.png', full_page=True)
            row = await request('SUPPORT-BROWSER-003', ['conversation'], 'reservation', os.environ['FIELD_SUPPORT_RESERVATION'])
            await approve('SUPPORT-BROWSER-003')
            await row.get_by_role('button', name='승인 범위 열람', exact=True).click()
            await expect(detail).to_contain_text('PRIVATE_RESERVATION_SUBMISSION')
            await expect(detail).to_contain_text('PRIVATE_RESERVATION_MESSAGE')
            assert 'PRIVATE_RESERVATION_CUSTOMER' not in await detail.inner_text()
            assert 'PRIVATE_RESERVATION_REGION' not in await detail.inner_text()
            row = await request('SUPPORT-BROWSER-004', ['contact', 'photos'], 'reservation', os.environ['FIELD_SUPPORT_RESERVATION'])
            approved = await approve('SUPPORT-BROWSER-004')
            await row.get_by_role('button', name='승인 범위 열람', exact=True).click()
            await expect(detail).to_contain_text('PRIVATE_RESERVATION_CUSTOMER')
            await expect(detail).to_contain_text('PRIVATE_RESERVATION_REGION')
            assert 'PRIVATE_RESERVATION_SUBMISSION' not in await detail.inner_text()
            assert 'PRIVATE_RESERVATION_MESSAGE' not in await detail.inner_text()
            await detail.get_by_role('button', name='업무 사진 보기', exact=True).click()
            await expect(detail.get_by_role('img', name='승인된 업무 사진')).to_be_visible()
            await detail.scroll_into_view_if_needed()
            await operator.screenshot(path='/tmp/field-customer-support-reservation-320.png')
            await approved.get_by_label('승인 회수 사유', exact=True).fill('고객 요청 조사가 끝나 열람 권한을 회수합니다.')
            await approved.get_by_role('button', name='열람 승인 회수', exact=True).click()
            await expect(approved).to_contain_text('회수됨')
            await panel.get_by_role('button', name='열람 권한 다시 확인', exact=True).click()
            await expect(detail).to_have_count(0)
            assert 'PRIVATE_RESERVATION_CUSTOMER' not in await panel.inner_text()
            row = await request('SUPPORT-BROWSER-005', ['conversation', 'photos'], 'external_request', os.environ['FIELD_SUPPORT_EXTERNAL'])
            await approve('SUPPORT-BROWSER-005')
            await row.get_by_role('button', name='승인 범위 열람', exact=True).click()
            await expect(detail).to_contain_text('PRIVATE_RECEIVED_SUMMARY')
            await expect(detail).to_contain_text('Field가 받은 업무 자료')
            await expect(detail).to_contain_text('복사 대기')
            assert 'PRIVATE_RECEIVED_CUSTOMER' not in await detail.inner_text()
            await expect(detail.get_by_role('button', name='업무 사진 보기', exact=True)).to_have_count(1)
            await detail.get_by_role('button', name='업무 사진 보기', exact=True).click()
            await expect(detail.get_by_role('img', name='승인된 업무 사진')).to_be_visible()
            await detail.scroll_into_view_if_needed()
            await operator.screenshot(path='/tmp/field-customer-support-received-320.png')
            await request('SUPPORT-BROWSER-006', ['conversation', 'photos'], 'reservation', os.environ['FIELD_SUPPORT_RESERVATION'])
            await approve('SUPPORT-BROWSER-006')
            for page in pages:
                assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), page.url
            assert not errors, errors
            print('Field customer support scopes and recovery: passed')
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
