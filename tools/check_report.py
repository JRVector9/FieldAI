from pathlib import Path
from playwright.sync_api import sync_playwright
import json
R=Path(__file__).resolve().parents[1]
results=[]; errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [320,390,768,1440]:
  page=browser.new_page(viewport={'width':width,'height':1040},device_scale_factor=1)
  page.emulate_media(reduced_motion='reduce')
  page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content((R/'FINAL_DEVELOPMENT_REPORT_v3.0.html').read_text(),wait_until='load')
  page.evaluate('document.fonts.ready');page.wait_for_timeout(150)
  info=page.evaluate('''() => {const bad=[];for(const el of document.querySelectorAll('body *')){if(!el.getClientRects().length)continue;const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(''); if(own && parseFloat(getComputedStyle(el).fontSize)<14)bad.push({tag:el.tagName,text:own.slice(0,50),size:getComputedStyle(el).fontSize});}return {width:innerWidth,bodyWidth:document.documentElement.scrollWidth,minFontViolations:bad,headingCount:document.querySelectorAll('h2').length,tableCount:document.querySelectorAll('table').length};}''')
  assert info['bodyWidth']<=width,info
  assert not info['minFontViolations'],info
  page.screenshot(path=str(R/'quality_checks'/f'report_{width}.png'),full_page=False)
  if width==390:
   page.get_by_role('button',name='목차',exact=True).click();assert page.locator('#toc').evaluate("e=>e.classList.contains('open')")
   page.get_by_placeholder('목차 검색').fill('공식 연동'); visible=page.locator('#toc a:not(.hidden)').count();assert visible==1,visible
   page.locator('#toc a:not(.hidden)').click();assert not page.locator('#toc').evaluate("e=>e.classList.contains('open')")
   page.wait_for_timeout(250)
   page.screenshot(path=str(R/'quality_checks'/'integration_390.png'),full_page=False)
   info['mobile_toc_filter_navigation']='passed'
  if width==1440:
   page.locator('#toc a').filter(has_text='공식 연동 계약').click();page.wait_for_timeout(250)
   page.screenshot(path=str(R/'quality_checks'/'integration_1440.png'),full_page=False)
  results.append(info);page.close()
 browser.close()
assert not errors,errors
(R/'quality_checks/report_browser.json').write_text(json.dumps({'scope':'HTML report only, not UI v3 or service app','results':results,'page_errors':errors},ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
