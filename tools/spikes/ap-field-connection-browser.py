import asyncio, json, subprocess, uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

AP='http://localhost:3001'
FIELD='http://127.0.0.1:3002'
PASSWORD='BrowserSyntheticI00!234567'

def require_local_mock(path, key, port, database):
    setting = next((line.partition('=')[2] for line in Path(path).read_text().splitlines()
        if line.startswith(key + '=')), '')
    url = urlparse(setting)
    assert url.hostname == '127.0.0.1' and url.port == port and url.path == '/' + database, \
        f'{key} must point to its local mock database'

def cleanup(ap_org, field_org, ap_email, field_email):
    source='''import { Pool } from 'pg';
const [apOrg, fieldOrg, apEmail, fieldEmail] = process.argv.slice(1);
const ap = new Pool({connectionString: process.env.AP_DATABASE_URL});
const field = new Pool({connectionString: process.env.FIELD_DATABASE_URL});
try {
  if (fieldOrg) await field.query('delete from field.organizations where id = $1', [fieldOrg]);
  if (apOrg) await ap.query('delete from ap.organizations where id = $1', [apOrg]);
  if (fieldEmail) await field.query('delete from "user" where email = $1', [fieldEmail]);
  if (apEmail) await ap.query('delete from "user" where email = $1', [apEmail]);
  console.log('synthetic accounts and organizations cleaned');
} finally { await Promise.all([ap.end(), field.end()]); }'''
    subprocess.run(['node', '--env-file=infra/agent/.env', '--env-file=infra/field/.env',
        '--input-type=module', '-e', source, ap_org, field_org, ap_email, field_email], check=True)

async def main():
    require_local_mock('infra/agent/.env', 'AP_DATABASE_URL', 55431, 'fieldai_agent_mock')
    require_local_mock('infra/field/.env', 'FIELD_DATABASE_URL', 55432, 'fieldai_field_mock')
    ap_email=f'browser-ap-{uuid.uuid4()}@example.invalid'
    field_email=f'browser-field-{uuid.uuid4()}@example.invalid'
    ap_org=''; field_org=''
    try:
        async with async_playwright() as playwright:
            browser=await playwright.chromium.launch(headless=True)
            context=await browser.new_context(viewport={'width':320,'height':720})
            page=await context.new_page()
            errors=[]
            page.on('pageerror', lambda error: errors.append(str(error)))
            async def request(base,path,method='GET',body=None):
                url=base+path
                headers={'origin':base} if method != 'GET' else {}
                if method == 'POST': response=await context.request.post(url,data=body,headers=headers)
                elif method == 'PUT': response=await context.request.put(url,data=body,headers=headers)
                else: response=await context.request.get(url,headers=headers)
                value=await response.json()
                assert response.status in (200,201), (path,response.status,value)
                return value
            await request(AP,'/api/auth/sign-up/email','POST',{'email':ap_email,'password':PASSWORD,'name':'Browser AP owner'})
            await request(AP,'/api/auth/sign-in/email','POST',{'email':ap_email,'password':PASSWORD})
            created=await request(AP,'/v1/organizations','POST',{'name':'Browser AP organization'})
            ap_org=created['id']
            await request(AP,'/v1/knowledge/draft','PUT',{'expectedRevision':0,'businessName':'Browser AP organization','introduction':'승인된 소개','services':[{'name':'상담','description':'상담 서비스'}],'faqs':[]})
            await request(AP,'/v1/knowledge/releases','POST',{'expectedRevision':1})
            await request(AP,'/v1/agents/draft','PUT',{'expectedRevision':0,'name':'Browser AP AI','tone':'clear','guideScope':'승인 안내','handoffText':'담당자가 응대합니다.'})
            await request(AP,'/v1/agents/releases','POST',{'expectedRevision':1,'expectedKnowledgeRevision':1})
            await request(FIELD,'/api/auth/sign-up/email','POST',{'email':field_email,'password':PASSWORD,'name':'Browser Field owner'})
            await request(FIELD,'/api/auth/sign-in/email','POST',{'email':field_email,'password':PASSWORD})
            created=await request(FIELD,'/v1/organizations','POST',{'name':'Browser Field organization'})
            field_org=created['id']
            await request(FIELD,'/v1/business/draft','PUT',{'expectedRevision':0,'businessName':'Browser Field organization','introduction':'승인된 소개','region':'서울','openingHours':'평일','contactPhone':'010-1111-2222','defaultBookingMode':'request','services':[{'id':str(uuid.uuid4()),'name':'상담','description':'Field에서 승인한 상담 설명','bookingMode':'request','durationMinutes':30,'priceAmount':None}]})
            await request(FIELD,'/v1/catalog/releases','POST',{'expectedRevision':1})
            await page.goto(FIELD+'/workspace/integrations')
            await page.get_by_role('button',name='AP 계정 연결 시작').click()
            await page.wait_for_url('**/connect/select?**',timeout=15000)
            assert '3001' in page.url, page.url
            await page.get_by_label('AP 조직과 승인 AI').select_option(ap_org)
            await page.get_by_role('button',name='선택하고 동의 내용 확인').click()
            await page.wait_for_url('**/consent?**')
            await page.get_by_role('button',name='접근 허용').click()
            await page.wait_for_url('**/workspace/integrations?result=pending_field_consent*')
            assert page.url.startswith(FIELD),page.url
            await page.get_by_role('link',name='AP에서 Field 정보 제공 동의 계속하기').click()
            await page.wait_for_url('**/workspace/integrations?fieldConnectionId=*')
            assert page.url.startswith(AP),page.url
            try:
                await page.get_by_role('button',name='Field 사업장 정보 제공 동의 시작').wait_for(timeout=5000)
            except Exception:
                print('AP integration page:',page.url,(await page.locator('body').inner_text())[:1500])
                raise
            await page.get_by_role('button',name='Field 사업장 정보 제공 동의 시작').click()
            await page.wait_for_url('**/connect/select?**',timeout=15000)
            assert page.url.startswith(FIELD),page.url
            await page.get_by_label('Field 사업장').select_option(field_org)
            await page.get_by_role('button',name='선택하고 동의 내용 확인').click()
            await page.wait_for_url('**/consent?**')
            await page.get_by_role('button',name='접근 허용').click()
            await page.wait_for_url('**/workspace/integrations?result=review_required*')
            assert page.url.startswith(AP),page.url
            await page.get_by_text('양쪽 동의 완료 · 검토 및 설치 대기').wait_for()
            await page.get_by_role('button',name='Field 지원 기능 확인').click()
            await page.get_by_text('Field 공개 기능을 확인했습니다. 기능 지원과 실제 사이트 설치·업무 연결은 별도 상태입니다.').wait_for()
            await page.get_by_text('사업 정보 읽기: 지원').wait_for()
            await page.get_by_text('외부 문의·예약 요청: 지원').wait_for()
            await page.get_by_role('button',name='Field 승인 정보 가져와 검토').click()
            await page.get_by_text('Field 원본 개정 1 · AP 공개 전 검토 자료').wait_for()
            await page.get_by_text('Field 승인 정보를 AP 검토 원장에 저장했습니다. AP 고객 상담에는 아직 반영되지 않았습니다.').wait_for()
            await page.reload()
            await page.get_by_role('button',name='보관된 검토 자료 열기').click()
            await page.get_by_text('AP에 보관된 Field 검토 자료입니다. 현재 Field 값과 다를 수 있습니다.').wait_for()
            await page.get_by_text('Field 원본 개정 1 · AP 공개 전 검토 자료').wait_for()
            await page.get_by_label('표시된 Field 원본 개정과 서비스를 검토했습니다.').check()
            await page.get_by_role('button',name='이 Field 정보 출처 승인').click()
            await page.get_by_text('AP 정보 출처 검토 승인 완료 · 고객 AI 반영 대기').wait_for()
            await page.reload()
            await page.get_by_role('button',name='보관된 검토 자료 열기').click()
            await page.get_by_text('AP 정보 출처 검토 승인 완료 · 고객 AI 반영 대기').wait_for()
            await page.get_by_text('AP 직접 승인 지식 1번째 공개본').wait_for()
            await page.get_by_label('사업장 소개와 지역').check()
            await page.get_by_label('상담 설명').check()
            publish_button=page.get_by_role('button',name='선택한 설명을 AP 지식 공개본으로 만들기')
            assert await publish_button.is_disabled()
            await page.get_by_label('출처 처리').select_option('field:0')
            assert await publish_button.is_enabled()
            await page.get_by_role('button',name='선택한 설명을 AP 지식 공개본으로 만들기').click()
            await page.get_by_text('선택한 Field 설명을 AP 지식 공개본으로 만들었습니다. 고객 AI에 반영하려면 AI 설정에서 새 지식 버전을 승인해 주세요.').wait_for()
            await page.get_by_role('link',name='AI 설정에서 새 지식 버전 승인').wait_for()
            await page.reload()
            await page.get_by_role('button',name='보관된 검토 자료 열기').click()
            await page.get_by_role('link',name='AI 설정에서 새 지식 버전 승인').wait_for()
            assert await page.get_by_label('출처 처리').input_value() == 'field:0'
            ap_dimensions=await page.evaluate('({body:document.body.scrollWidth,viewport:innerWidth})')
            assert ap_dimensions['body']<=ap_dimensions['viewport'],ap_dimensions
            await page.goto(FIELD+'/workspace/integrations')
            await page.get_by_text('양쪽 동의 완료 · 정보 검토 및 설치 대기').wait_for()
            refresh=page.get_by_role('region',name='AP 정보 갱신')
            try:
                await refresh.get_by_text('AP 저장 버전: 1 · AP 승인 버전: 1').wait_for(timeout=5000)
            except Exception:
                print('Field refresh panel:',await refresh.inner_text())
                print('Field connections:',await (await context.request.get(FIELD+'/v1/connections/ap')).text())
                raise
            await refresh.get_by_role('button',name='AP 정보 갱신 요청').click()
            await refresh.get_by_text('AP에 갱신 작업이 기록됐습니다.',exact=False).wait_for()
            try:
                await refresh.get_by_role('button',name='작업 상태 확인').wait_for(timeout=5000)
            except Exception:
                print('Field refresh after request:',await refresh.inner_text())
                print('Field refresh session:',await page.evaluate('Object.keys(sessionStorage).filter(k=>k.startsWith("field-source-refresh:")).map(k=>({connection:k.slice(21),operationId:JSON.parse(sessionStorage.getItem(k)).operationId}))'))
                raise
            for _ in range(40):
                if await refresh.get_by_role('button',name='작업 상태 확인').count() == 0:
                    raise AssertionError('AP refresh finished unexpectedly: ' + await refresh.inner_text())
                await refresh.get_by_role('button',name='작업 상태 확인').click()
                await page.wait_for_timeout(500)
                if await refresh.get_by_text('AP에 출처 1번을 가져왔습니다.',exact=False).count():
                    break
            else:
                raise AssertionError('AP source refresh did not complete')
            await refresh.get_by_text('AP 저장 버전: 1 · AP 승인 버전: 1').wait_for()
            dimensions=await page.evaluate('({body:document.body.scrollWidth,viewport:innerWidth})')
            assert dimensions['body']<=dimensions['viewport'],dimensions
            assert not errors,errors
            print(json.dumps({'result':'pass','viewport':'320x720','ap_status':'review_required','field_status':'review_required','field_source':'current','knowledge_release':'published_ai_approval_required','page_errors':errors},ensure_ascii=False))
            await browser.close()
    finally:
        cleanup(ap_org,field_org,ap_email,field_email)

asyncio.run(main())
