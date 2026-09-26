import json, os
from playwright.sync_api import sync_playwright, expect

fixture=json.loads(os.environ['AP_RETENTION_FIXTURE'])
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 errors=[]
 def page_for(actor):
  context=browser.new_context(viewport={'width':320,'height':900})
  context.add_cookies([{'name':v.split('=',1)[0],'value':v.split('=',1)[1],'domain':'localhost','path':'/'} for v in actor['cookie'].split('; ')])
  page=context.new_page(); page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto('http://localhost:3001/admin/audit')
  panel=page.get_by_role('region',name='보존 정책과 분쟁 보류',exact=True)
  expect(panel).to_be_visible(timeout=4000)
  expect(panel.get_by_role('button',name='보존 정책 요청',exact=True)).to_be_enabled()
  return context,page,panel
 first,page,panel=page_for(fixture['operator'])
 panel.get_by_label('익명 대화 보존 일수',exact=True).fill('30')
 panel.get_by_label('정식 문의 보존 일수',exact=True).fill('180')
 panel.get_by_label('사진 보존 일수',exact=True).fill('90')
 panel.get_by_label('정책 검토 참조',exact=True).fill(fixture['reference'])
 panel.get_by_label('정책 요청 사유',exact=True).fill('합성 AP 보존 정책을 화면에서 요청합니다.')
 attempts=[]
 def lose_policy_ack(route):
  if route.request.method!='POST':
   route.continue_(); return
  attempts.append((route.request.headers.get('idempotency-key'),route.request.post_data))
  if len(attempts)==1:
   response=route.fetch(); assert response.status==201
   route.abort('failed')
  else: route.continue_()
 page.route('**/v1/admin/retention/policies',lose_policy_ack)
 panel.get_by_role('button',name='보존 정책 요청',exact=True).click()
 expect(panel.get_by_text('응답을 확인하지 못했습니다.',exact=False)).to_be_visible()
 expect(panel.get_by_role('button',name='보존 정책 요청',exact=True)).to_be_disabled()
 panel.get_by_role('button',name='같은 요청 결과 확인',exact=True).click()
 policy=panel.locator('article').filter(has=page.get_by_role('heading',name=fixture['reference'],exact=True))
 expect(policy).to_be_visible(); expect(policy.get_by_text('승인 대기',exact=False)).to_be_visible()
 assert len(attempts)==2 and attempts[0]==attempts[1], 'policy retry must retain its key and body'
 expect(policy).to_have_count(1); page.unroute('**/v1/admin/retention/policies')
 expect(policy.get_by_role('button',name='정책 승인',exact=True)).to_have_count(0)
 second,other,otherpanel=page_for(fixture['approver'])
 approved=otherpanel.locator('article').filter(has=other.get_by_role('heading',name=fixture['reference'],exact=True))
 approved.get_by_label('정책 승인 사유',exact=True).fill('다른 운영자가 합성 보존 기준을 승인합니다.')
 approved.get_by_role('button',name='정책 승인',exact=True).click()
 expect(approved.get_by_text('승인됨',exact=False)).to_be_visible()
 panel.get_by_role('button',name='보존 상태 다시 조회',exact=True).click()
 panel.get_by_label('보류 조직 ID',exact=True).fill(fixture['org'])
 panel.get_by_label('보류 업무 ID',exact=True).fill(fixture['inquiryId'])
 panel.get_by_label('보류 검토 참조',exact=True).fill('SYNTHETIC-HOLD')
 panel.get_by_label('보류 사유',exact=True).fill('합성 문의의 분쟁 보류를 등록합니다.')
 panel.get_by_label('보류 검토 예정 시각',exact=True).fill('2026-10-01T10:00')
 panel.get_by_role('button',name='분쟁 보류 등록',exact=True).click()
 hold=panel.locator('article').filter(has=page.get_by_role('heading',name='SYNTHETIC-HOLD',exact=True))
 expect(hold).to_be_visible(); expect(hold.get_by_role('button',name='보류 해제',exact=True)).to_have_count(0)
 otherpanel.get_by_role('button',name='보존 상태 다시 조회',exact=True).click()
 otherhold=otherpanel.locator('article').filter(has=other.get_by_role('heading',name='SYNTHETIC-HOLD',exact=True))
 otherhold.get_by_label('보류 해제 사유',exact=True).fill('다른 운영자가 합성 분쟁 보류를 해제합니다.')
 otherhold.get_by_role('button',name='보류 해제',exact=True).click()
 expect(otherhold.get_by_text('해제됨',exact=False)).to_be_visible()
 panel.get_by_role('button',name='보존 상태 다시 조회',exact=True).click()
 panel.get_by_label('검수 조직 ID',exact=True).fill(fixture['org'])
 option=panel.get_by_label('미리보기 정책',exact=True).locator('option').filter(has_text=fixture['reference']).get_attribute('value')
 panel.get_by_label('미리보기 정책',exact=True).select_option(value=option)
 panel.get_by_role('button',name='정리 대상 미리보기',exact=True).click()
 result=panel.get_by_role('region',name='정리 미리보기 결과',exact=True)
 expect(result.get_by_text(fixture['inquiryId'],exact=False)).to_be_visible()
 page.route('**/v1/admin/retention/preview?*',lambda route:route.fulfill(status=503,json={'error':'synthetic_unavailable'}))
 panel.get_by_role('button',name='정리 대상 미리보기',exact=True).click()
 expect(panel.get_by_text('미리보기를 확인하지 못했습니다.',exact=False)).to_be_visible()
 expect(result).to_have_count(0); page.unroute('**/v1/admin/retention/preview?*')
 page.route('**/v1/admin/retention/holds',lambda route:route.fulfill(status=503,json={'error':'synthetic_unavailable'}))
 panel.get_by_role('button',name='보존 상태 다시 조회',exact=True).click()
 expect(panel.get_by_text('기존 목록을 유지하며 조작을 잠급니다.',exact=False)).to_be_visible()
 expect(panel.get_by_role('button',name='보존 정책 요청',exact=True)).to_be_disabled()
 page.unroute('**/v1/admin/retention/holds'); panel.get_by_role('button',name='보존 상태 다시 조회',exact=True).click()
 expect(panel.get_by_role('button',name='보존 정책 요청',exact=True)).to_be_enabled()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'horizontal overflow'
 assert not errors, errors
 page.screenshot(path='/tmp/ap-retention-basis-320.png',full_page=True)
 panel.get_by_role('heading',name='보존 정책과 분쟁 보류',exact=True).scroll_into_view_if_needed()
 page.screenshot(path='/tmp/ap-retention-policy-320.png')
 first.close(); second.close(); browser.close()
 print('AP retention browser: passed')
