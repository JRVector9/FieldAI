import asyncio
import json
import os
from playwright.async_api import async_playwright, expect


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        accounts = json.loads(os.environ['AP_MODERATION_ACCOUNTS'])
        contexts = [await browser.new_context(viewport={'width': 320, 'height': 720}) for _ in accounts]
        pages = [await context.new_page() for context in contexts]
        errors = []
        for page in pages:
            page.set_default_timeout(10000)
            page.on('pageerror', lambda error: errors.append(str(error)))
        owner, operator, approver = pages
        try:
            for page, account in zip(pages, accounts):
                signed = await page.request.post('http://localhost:3001/api/auth/sign-in/email',
                                                headers={'origin': 'http://localhost:3001'}, data=account)
                assert signed.status == 200
            public = await browser.new_page(viewport={'width': 320, 'height': 720})
            public.set_default_timeout(10000)
            public.on('pageerror', lambda error: errors.append(str(error)))
            deployments = json.loads(os.environ['AP_MODERATION_DEPLOYMENTS'])
            deployment, other = deployments
            url = f'http://localhost:3001/consult/{deployment["publicId"]}'
            await public.goto(url, wait_until='networkidle')
            original = await public.request.post(f'http://localhost:3001/v1/public/deployments/{deployment["publicId"]}/engagements')
            assert original.status == 201
            original_id = (await original.json())['id']
            report_button = public.get_by_role('button', name='상담 배포 신고', exact=True)
            report_button_style = await report_button.evaluate('(element) => ({ fontSize: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height })')
            await report_button.click()
            modal = public.get_by_role('dialog', name='상담 배포 신고')
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

            await public.route('**/v1/public/deployments/*/reports', lost_response)
            await modal.get_by_role('button', name='신고 제출', exact=True).click()
            await modal.get_by_text('응답을 받지 못했습니다.', exact=False).wait_for()
            await modal.get_by_role('button', name='같은 신고 다시 확인', exact=True).click()
            await modal.get_by_text('신고를 접수했습니다.', exact=False).wait_for()
            report_id = await modal.locator('code').inner_text()
            await operator.goto('http://localhost:3001/admin/audit', wait_until='networkidle')
            await operator.get_by_role('heading', name='상담 배포 신고').wait_for()
            assert 'PRIVATE_REPORT_BROWSER' not in await operator.locator('body').inner_text()
            row = operator.locator('.agent-moderation-case').filter(has_text=report_id)
            await row.get_by_role('button', name='상세 접근 신청').click()
            await operator.get_by_label('지원 접근 사유').fill('공개 안내 신고 사실 확인')
            await operator.get_by_role('button', name='지원 접근 신청').click()
            await operator.get_by_text('다른 운영자의 승인을 기다립니다.', exact=True).wait_for()
            await approver.goto('http://localhost:3001/admin/audit', wait_until='networkidle')
            grant = approver.locator('.agent-moderation-access').filter(has_text=report_id)
            await grant.get_by_label('승인 사유').fill('신고 확인 업무 승인')
            await grant.get_by_role('button', name='지원 접근 승인').click()
            await grant.get_by_text('승인됨', exact=False).wait_for()
            await operator.get_by_role('button', name='신고 목록 새로고침').click()
            grant = operator.locator('.agent-moderation-access').filter(has_text=report_id)
            await grant.get_by_role('button', name='승인 접근으로 상세 열기').click()
            detail = operator.get_by_role('region', name='승인된 신고 상세')
            await expect(detail).to_contain_text('PRIVATE_REPORT_BROWSER')
            await detail.locator('summary').filter(has_text='신고 당시 공개 안내').click()
            await expect(detail).to_contain_text('신고 당시 AP 승인 서비스')
            await expect(detail).to_contain_text('신고 당시 AP 승인 답변')
            assert 'PRIVATE_AP_BROWSER_INSTRUCTION' not in await detail.inner_text()
            assert report_button_style['fontSize'] >= 14 and report_button_style['height'] >= 44, report_button_style
            await detail.get_by_label('검토 결과').select_option('deployment_restricted')
            await detail.get_by_label('사업자에게 전달할 검토 요약').fill('공개 안내 정정 전 상담 배포만 제한합니다.')
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
            disabled = await public.request.get(f'http://localhost:3001/v1/public/deployments/{deployment["publicId"]}')
            assert disabled.status == 404
            available = await public.request.get(f'http://localhost:3001/v1/public/deployments/{other["publicId"]}')
            assert available.status == 200
            await public.reload(wait_until='networkidle')
            await public.get_by_text('상담 배포 제한 중 · 기존 대화와 사람 문의는 유지됩니다.', exact=True).wait_for()
            await expect(public.get_by_role('button', name='AI에 질문', exact=False)).to_be_disabled()
            recovered = await public.request.get(f'http://localhost:3001/v1/public/deployments/{deployment["publicId"]}/engagements/current')
            assert (await recovered.json())['engagement']['id'] == original_id
            human = public.locator('#human-inquiry')
            await human.get_by_label('이름', exact=True).fill('기존 상담 고객')
            await human.get_by_label('연락처', exact=True).fill('010-3333-4446')
            await human.get_by_label('문의 내용', exact=True).fill('제한 중에도 기존 상담을 사람에게 이어갑니다.')
            await human.get_by_role('checkbox').check()
            await human.get_by_role('button', name='사람 문의 제출', exact=True).click()
            await human.get_by_text('접수 확인키', exact=True).wait_for()
            receipt_key = await human.locator('code').inner_text()
            receipt = await public.request.get(f'http://localhost:3001/v1/inquiries/{original_id}', headers={'authorization': f'Bearer {receipt_key}'})
            assert receipt.status == 200
            assert '제한 중에도 기존 상담을 사람에게 이어갑니다.' in await receipt.text()
            await public.screenshot(path='/tmp/agent-moderation-existing-customer-320.png', full_page=True)
            anonymous = await browser.new_page(viewport={'width': 320, 'height': 720})
            await anonymous.goto(url, wait_until='networkidle')
            await anonymous.get_by_text('상담 링크가 중지됐거나 최신 승인 정보가 필요합니다.', exact=True).wait_for()
            assert await anonymous.locator('#human-inquiry').count() == 0
            await anonymous.close()
            await owner.goto('http://localhost:3001/workspace/deployments', wait_until='networkidle')
            await owner.get_by_text('상담 배포 제한 중', exact=False).wait_for()
            await owner.goto('http://localhost:3001/workspace', wait_until='networkidle')
            await owner.get_by_role('navigation', name='빠른 이동').get_by_role('link', name='알림', exact=False).click()
            await owner.get_by_role('button', name='사업 안내 신고 검토 결과', exact=False).click()
            await owner.wait_for_url('http://localhost:3001/workspace/moderation')
            await owner.get_by_text('공개 안내 정정 전 상담 배포만 제한합니다.', exact=True).wait_for()
            assert 'PRIVATE_REPORT_BROWSER' not in await owner.locator('body').inner_text()
            await owner.get_by_label('이의 내용').fill('사업 안내를 정정했습니다. 재검토를 요청합니다.')
            await owner.get_by_role('button', name='이의 제출', exact=True).click()
            await owner.get_by_text('이의 검토 중', exact=True).wait_for()
            await operator.get_by_role('button', name='신고 목록 새로고침').click()
            await operator.locator('.agent-moderation-access').filter(has_text=report_id).get_by_role('button', name='승인 접근으로 상세 열기').click()
            await expect(detail).to_contain_text('사업 안내를 정정했습니다.')
            await detail.get_by_label('이의 결정').select_option('overturned')
            await detail.get_by_label('사업자에게 전달할 검토 요약').fill('정정 확인 후 해당 공개 제한을 해제합니다.')
            await detail.get_by_label('처리 사유').fill('정정된 승인 안내를 확인했습니다.')
            await detail.get_by_role('button', name='이의 결정 저장').click()
            await expect(detail).to_contain_text('처리 종료')
            response = await public.goto(url, wait_until='networkidle')
            assert response.status == 200
            restored = await public.request.get(f'http://localhost:3001/v1/public/deployments/{deployment["publicId"]}')
            assert restored.status == 200
            await public.get_by_role('button', name='상담 배포 신고', exact=True).wait_for()
            await owner.get_by_role('button', name='검토 결과 다시 확인').click()
            await owner.get_by_text('이의 인용', exact=True).wait_for()
            for page in [*pages, public]:
                widths = await page.evaluate('({page:document.documentElement.scrollWidth,viewport:innerWidth})')
                assert widths['page'] <= widths['viewport'], {'url': page.url, **widths,
                    'overflow': await page.evaluate('Array.from(document.querySelectorAll("body *")).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width})).slice(0,12)')}
            assert not errors, errors
            await operator.screenshot(path='/tmp/agent-moderation-admin-320.png', full_page=True)
            await owner.screenshot(path='/tmp/agent-moderation-owner-320.png', full_page=True)
            print('AP report and scoped review appeal: passed')
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
