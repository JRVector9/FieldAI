import asyncio
import json
import os
from playwright.async_api import async_playwright, expect


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        errors = []
        try:
            accounts = json.loads(os.environ['FIELD_RETENTION_ACCOUNTS'])
            pages = [await browser.new_page(viewport={'width': 320, 'height': 720}) for _ in accounts]
            for page, account in zip(pages, accounts):
                page.set_default_timeout(10000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                signed = await page.request.post('http://localhost:3002/api/auth/sign-in/email', headers={'origin': 'http://localhost:3002'}, data=account)
                assert signed.status == 200
            owner, operator, approver = pages
            await operator.goto('http://localhost:3002/admin/audit', wait_until='networkidle')
            panel = operator.get_by_role('region', name='보존 정책과 분쟁 보류', exact=True)
            await panel.get_by_role('heading', name='보존 정책과 분쟁 보류', exact=True).wait_for()
            await panel.get_by_role('region', name='정리 실행 원장', exact=True).wait_for()
            lost = True

            async def lose_ack(route):
                nonlocal lost
                if route.request.method == 'POST' and lost:
                    lost = False
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort('failed')
                else:
                    await route.continue_()

            await operator.route('**/v1/admin/retention/policies', lose_ack)
            form = panel.get_by_role('form', name='보존 정책 요청')
            await form.get_by_label('업무 보존 일수', exact=True).fill('180')
            await form.get_by_label('사진 보존 일수', exact=True).fill('90')
            await form.get_by_label('정책 검토 참조', exact=True).fill('SYNTHETIC-BROWSER-POLICY')
            await form.get_by_label('정책 요청 사유', exact=True).fill('합성 업무에 적용할 정책 검수 요청입니다.')
            await form.get_by_role('button', name='보존 정책 요청', exact=True).click()
            await panel.get_by_text('응답을 확인하지 못했습니다', exact=False).wait_for()
            await panel.get_by_role('button', name='같은 요청 결과 확인', exact=True).click()
            await panel.get_by_text('처리 결과를 확인했습니다.', exact=True).wait_for()
            policies = await (await operator.request.get('http://localhost:3002/v1/admin/retention/policies')).json()
            matching = [x for x in policies['policies'] if x['reference'] == 'SYNTHETIC-BROWSER-POLICY']
            assert len(matching) == 1
            policy = matching[0]['id']
            card = panel.locator('.field-retention-policy').filter(has_text=policy)
            assert await card.get_by_role('button', name='정책 승인', exact=True).count() == 0
            await approver.goto('http://localhost:3002/admin/audit', wait_until='networkidle')
            approval_panel = approver.get_by_role('region', name='보존 정책과 분쟁 보류', exact=True)
            approval = approval_panel.locator('.field-retention-policy').filter(has_text=policy)
            await approval.get_by_label('정책 승인 사유', exact=True).fill('합성 업무 정책에 대한 검토 승인을 기록합니다.')
            await approval.get_by_role('button', name='정책 승인', exact=True).click()
            await approval_panel.get_by_text('처리 결과를 확인했습니다.', exact=True).wait_for()
            await panel.get_by_role('button', name='보존 상태 다시 조회', exact=True).click()
            preview_form = panel.get_by_role('form', name='정리 대상 미리보기')
            await preview_form.get_by_label('검수 조직 ID', exact=True).fill(os.environ['FIELD_RETENTION_ORG'])
            await preview_form.get_by_label('미리보기 정책', exact=True).select_option(policy)
            await preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True).click()
            preview = panel.get_by_role('region', name='정리 미리보기 결과', exact=True)
            inquiry = preview.locator('.field-retention-work').filter(has_text=os.environ['FIELD_RETENTION_INQUIRY'])
            await inquiry.get_by_text('보존 기간 전', exact=True).wait_for()
            assert 'PRIVATE_' not in await preview.inner_text()
            hold = panel.get_by_role('form', name='분쟁 보류 등록')
            await hold.get_by_label('보류 조직 ID', exact=True).fill(os.environ['FIELD_RETENTION_ORG'])
            await hold.get_by_label('보류 업무 ID', exact=True).fill(os.environ['FIELD_RETENTION_INQUIRY'])
            await hold.get_by_label('보류 검토 참조', exact=True).fill('SYNTHETIC-HOLD-BROWSER')
            await hold.get_by_label('보류 사유', exact=True).fill('합성 분쟁을 조사하는 동안 자료를 보류합니다.')
            await hold.get_by_role('button', name='분쟁 보류 등록', exact=True).click()
            await panel.get_by_text('처리 결과를 확인했습니다.', exact=True).wait_for()
            await preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True).click()
            await inquiry.get_by_text('분쟁·조사 보류', exact=True).wait_for()
            holds = await (await operator.request.get('http://localhost:3002/v1/admin/retention/holds')).json()
            selected = [h for h in holds['holds'] if h['reference'] == 'SYNTHETIC-HOLD-BROWSER']
            assert len(selected) == 1
            assert await panel.locator('.field-retention-hold').filter(has_text=selected[0]['id']).get_by_role('button', name='보류 해제', exact=True).count() == 0
            await approval_panel.get_by_role('button', name='보존 상태 다시 조회', exact=True).click()
            release = approval_panel.locator('.field-retention-hold').filter(has_text=selected[0]['id'])
            await release.get_by_label('보류 해제 사유', exact=True).fill('합성 분쟁 검토가 종료되어 보류를 해제합니다.')
            await release.get_by_role('button', name='보류 해제', exact=True).click()
            await approval_panel.get_by_text('처리 결과를 확인했습니다.', exact=True).wait_for()
            await operator.route('**/v1/admin/retention/preview?*', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"synthetic_unavailable"}'))
            await preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True).click()
            await panel.get_by_text('미리보기를 확인하지 못했습니다.', exact=False).wait_for()
            assert await preview.count() == 0
            await operator.unroute('**/v1/admin/retention/preview?*')
            await preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True).click()
            await inquiry.get_by_text('보존 기간 전', exact=True).wait_for()
            await operator.route('**/v1/admin/retention/holds', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"synthetic_unavailable"}'))
            await panel.get_by_role('button', name='보존 상태 다시 조회', exact=True).click()
            await panel.get_by_text('보존 원장을 확인하지 못했습니다.', exact=False).wait_for()
            await expect(card).to_be_visible()
            await expect(preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True)).to_be_disabled()
            assert await preview.count() == 0
            await operator.unroute('**/v1/admin/retention/holds')
            await panel.get_by_role('button', name='보존 상태 다시 조회', exact=True).click()
            await expect(preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True)).to_be_enabled()
            await preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True).click()
            await inquiry.get_by_text('보존 기간 전', exact=True).wait_for()
            await operator.screenshot(path='/tmp/field-retention-admin-320.png', full_page=True)
            await panel.get_by_role('heading', name='보존 정책과 분쟁 보류', exact=True).scroll_into_view_if_needed()
            await operator.screenshot(path='/tmp/field-retention-policy-320.png')
            # 승인 전 취소, 요청 ACK 유실, 다른 운영자 승인, 독립 worker의 실제 정리를 확인한다.
            ended_id = os.environ['FIELD_RETENTION_PURGE_INQUIRY']
            await preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True).click()
            purge_card = preview.locator('.field-retention-work').filter(has_text=ended_id)
            request_form = purge_card.get_by_role('form', name=f'정리 요청 {ended_id}', exact=True)
            await request_form.get_by_label('정리 범위', exact=True).select_option('photos')
            await request_form.get_by_label('정리 요청 사유', exact=True).fill('합성 사진의 승인 전 취소 경로 검수입니다.')
            await request_form.get_by_role('checkbox').check()
            await request_form.get_by_role('button', name='정리 실행 요청', exact=True).click()
            await panel.get_by_text('처리 결과를 확인했습니다.', exact=True).wait_for()
            jobs_panel = panel.get_by_role('region', name='정리 실행 원장', exact=True)
            canceled = jobs_panel.locator('.field-retention-job').filter(has_text=ended_id)
            await canceled.get_by_label('정리 취소 사유', exact=True).fill('승인 전 합성 정리 요청을 취소합니다.')
            await canceled.get_by_role('button', name='정리 요청 취소', exact=True).click()
            await canceled.get_by_role('heading', name='요청 취소됨', exact=True).wait_for()
            await preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True).click()
            job_lost = True

            async def lose_job_ack(route):
                nonlocal job_lost
                if route.request.method == 'POST' and job_lost:
                    job_lost = False
                    response = await route.fetch()
                    assert response.status == 201
                    await route.abort('failed')
                else:
                    await route.continue_()

            await operator.route('**/v1/admin/retention/jobs', lose_job_ack)
            await request_form.get_by_label('정리 범위', exact=True).select_option('work')
            await request_form.get_by_label('정리 요청 사유', exact=True).fill('합성 업무 원문과 실제 사진 정리를 검수합니다.')
            await request_form.get_by_role('checkbox').check()
            await request_form.get_by_role('button', name='정리 실행 요청', exact=True).click()
            await panel.get_by_text('응답을 확인하지 못했습니다', exact=False).wait_for()
            await panel.get_by_role('button', name='같은 요청 결과 확인', exact=True).click()
            await panel.get_by_text('처리 결과를 확인했습니다.', exact=True).wait_for()
            jobs = await (await operator.request.get('http://localhost:3002/v1/admin/retention/jobs')).json()
            selected_jobs = [j for j in jobs['jobs'] if j['targetId'] == ended_id and j['state'] == 'pending']
            assert len(selected_jobs) == 1
            job_id = selected_jobs[0]['id']
            assert await jobs_panel.locator('.field-retention-job').filter(has_text=job_id).get_by_role('button', name='정리 실행 승인', exact=True).count() == 0
            await approval_panel.get_by_role('button', name='보존 상태 다시 조회', exact=True).click()
            approved_job = approval_panel.locator('.field-retention-job').filter(has_text=job_id)
            await approved_job.get_by_label('정리 승인 사유', exact=True).fill('합성 업무와 제거 범위를 검토하고 승인합니다.')
            await approved_job.get_by_role('button', name='정리 실행 승인', exact=True).click()
            for _ in range(30):
                ledger = await (await operator.request.get('http://localhost:3002/v1/admin/retention/jobs')).json()
                current = next(j for j in ledger['jobs'] if j['id'] == job_id)
                if current['state'] == 'completed' and current['error'] is None:
                    break
                await asyncio.sleep(0.2)
            assert current['state'] == 'completed' and current['error'] is None, current
            await panel.get_by_role('button', name='보존 상태 다시 조회', exact=True).click()
            finished = jobs_panel.locator('.field-retention-job').filter(has_text=job_id)
            await finished.get_by_role('heading', name='정리 완료', exact=True).wait_for()
            await operator.route('**/v1/admin/retention/jobs', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"synthetic_unavailable"}'))
            await panel.get_by_role('button', name='보존 상태 다시 조회', exact=True).click()
            await panel.get_by_text('보존 원장을 확인하지 못했습니다.', exact=False).wait_for()
            await expect(finished).to_be_visible()
            await expect(preview_form.get_by_role('button', name='정리 대상 미리보기', exact=True)).to_be_disabled()
            await operator.unroute('**/v1/admin/retention/jobs')
            await panel.get_by_role('button', name='보존 상태 다시 조회', exact=True).click()
            customer = await browser.new_page(viewport={'width': 320, 'height': 720})
            customer.on('pageerror', lambda error: errors.append(str(error)))
            await customer.goto(f'http://localhost:3002/inquiry/{ended_id}', wait_until='networkidle')
            await customer.get_by_label('접수 확인키', exact=True).fill(os.environ['FIELD_RETENTION_PURGE_KEY'])
            await customer.get_by_role('button', name='문의 열기', exact=True).click()
            await customer.get_by_role('status', name='보존 정리 안내', exact=True).wait_for()
            assert 'PRIVATE_PURGE_BROWSER' not in await customer.locator('body').inner_text()
            assert await customer.get_by_role('button', name='추가 질문 저장', exact=True).count() == 0
            await customer.screenshot(path='/tmp/field-retention-ended-customer-320.png', full_page=True)
            await finished.scroll_into_view_if_needed()
            await operator.screenshot(path='/tmp/field-retention-jobs-320.png')
            assert await customer.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            await owner.goto('http://localhost:3002/workspace', wait_until='networkidle')
            await owner.get_by_role('navigation', name='모바일 사업자 메뉴').get_by_role('link', name='문의', exact=True).click()
            await owner.locator(f'[data-inbox-key="ap:{os.environ["FIELD_RETENTION_EXTERNAL"]}"]').click()
            owner_lost = True

            async def lose_close_ack(route):
                nonlocal owner_lost
                if owner_lost:
                    owner_lost = False
                    response = await route.fetch()
                    assert response.status == 200
                    await route.abort('failed')
                else:
                    await route.continue_()

            await owner.route('**/v1/owner/external-requests/*/close', lose_close_ack)
            await owner.get_by_role('button', name='Field 수신 업무 종결', exact=True).click()
            await owner.get_by_text('종결 응답을 확인하지 못했습니다.', exact=False).wait_for()
            await owner.get_by_role('button', name='Field 수신 업무 종결', exact=True).click()
            await owner.get_by_text('Field 업무 종결됨', exact=False).wait_for()
            for page in pages:
                assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            assert not errors, errors
            print('Field retention native mobile flows: passed')
        finally:
            await browser.close()


asyncio.run(main())
