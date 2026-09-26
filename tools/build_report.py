from pathlib import Path
import re, html, json
from markdown_it import MarkdownIt
ROOT=Path(__file__).resolve().parents[1]
master_name='AI_Field_Service_Operator_Final_Development_Plan_v3.0.md'
order=['docs/00_PRODUCT_ARCHITECTURE.md','docs/01_AGENT_PLATFORM_PRD.md','docs/02_FIELD_PRD.md','docs/03_INTEGRATION_CONTRACT.md','docs/04_SECURITY_OPERATIONS_RELEASE.md','docs/05_UI_MIGRATION_MAP.md','docs/06_REQUIREMENTS_QA.md','TASKS.md','AGENTS.md']
lead='''# 독립 AI 플랫폼 × Field\n## 최종 개발 계획 v3.0\n\n**2026년 9월 24일 · 개발 에이전트 인계용 · 제품별 독립 출시 및 정식 연동 기준**\n\n> **AI 플랫폼은 Field의 하위 기능이 아니다. Field를 포함한 외부 서비스가 설치하는 독립 제품이다.**\n\n이번 최종본은 기존 통합 PRD v2.0을 대체한다. 기존 21개 결정과 홈페이지 셀프 제작·역할별 UI를 유지하고 제품 경계·DB·계정·과금·배포·연동 계약을 개정했다.\n\n| 산출물 | 상태 |\n|---|---|\n| 제품 | 독립 Agent Platform / 독립 Field / 공식 연동 계약 |\n| 작업 | 46개 계획 작업, 제품별 독립 DAG |\n| 인수 | 160개 실서비스 인수 기준, 현재 미실행 |\n| 이번 범위 | 개발 문서·계약 예제·보고서. 운영 서버·새 UI 구현은 아님 |\n| 기존 시안 | UI v3는 시각/흐름 참고. 제품별 이전 요구는 06장 적용 |\n\n### 읽는 순서\n\n제품 책임자는 01장, 각 개발자는 02·03장과 04장, 배포 담당자는 05장, UI 담당자는 06장, QA는 07장, 개발 에이전트는 마지막 TASKS·AGENTS 지침을 함께 읽는다. [변경 이력](CHANGELOG_v3.0.md)과 [분할 문서](README.md)를 함께 제공한다.\n\n---\n\n'''
parts=[]
for f in order:
 s=(ROOT/f).read_text()
 # Demote headings only outside code fences.
 out=[];inside=False
 for line in s.splitlines():
  if line.startswith('```'): inside=not inside
  if not inside and re.match(r'^#{1,5} ',line):line='#'+line
  out.append(line)
 parts.append('\n'.join(out))
refs={
'S01':'https://www.rfc-editor.org/rfc/rfc9700.html',
'S02':'https://www.rfc-editor.org/rfc/rfc7009',
'S03':'https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage',
'S04':'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors',
'S05':'https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies',
'S06':'https://www.firsthand.ai/platform'}
text=lead+'\n\n---\n\n'.join(parts)+'\n\n---\n\n**문서 종료 — v3.0 개발 기준. 구현·실서비스 인수 결과는 별도로 기록한다.**\n\n'+'\n'.join(f'[{k}]: {v}' for k,v in refs.items())+'\n'
(ROOT/master_name).write_text(text)
md=MarkdownIt('commonmark',{'html':False}).enable('table')
body=md.render(text)
# Add predictable heading ids, TOC on h2 product/task headings only.
count=0; toc=[]
def headings(m):
 global count
 level=int(m.group(1));content=m.group(2);plain=re.sub('<[^>]+>','',content)
 count+=1;id=f'section-{count}'
 if level==2 and '최종 개발 계획' not in plain:toc.append((id,plain))
 return f'<h{level} id="{id}">{content}</h{level}>'
body=re.sub(r'<h([1-6])>(.*?)</h\1>',headings,body,flags=re.S)
def wrap_table(m):
 table=m.group(0);head=table.split('</thead>')[0];compact=' compact' if head.count('<th>')<=2 else ''
 return f'<div class="table-scroll{compact}" tabindex="0">'+table+'</div>'
body=re.sub(r'<table>.*?</table>',wrap_table,body,flags=re.S)
nav=''.join(f'<a href="#{i}">{html.escape(t)}</a>' for i,t in toc)
css='''
:root{--ink:#1d1d1f;--muted:#5f6571;--line:#e5e7eb;--blue:#0066cc;--paper:#fff;--bg:#f5f5f7}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:98px}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans CJK KR','Noto Sans KR','Segoe UI',sans-serif;font-size:16px;line-height:1.8;-webkit-font-smoothing:antialiased}a{color:var(--blue);text-decoration:none;overflow-wrap:anywhere}a:hover{text-decoration:underline}button,input{font:inherit}button{min-height:44px;background:white;border:1px solid var(--line);border-radius:11px;padding:8px 16px;color:var(--ink);cursor:pointer;font-size:14px}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #88b8ee;outline-offset:3px}.top{position:sticky;top:0;background:#ffffffef;backdrop-filter:blur(14px);z-index:5;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px 30px}.word{font-weight:700;font-size:20px;letter-spacing:-.7px}.word span{color:var(--muted);font-weight:400;font-size:14px;margin-left:12px}.actions{display:flex;gap:9px;align-items:center}.actions a{font-size:14px;min-height:44px;padding:8px 14px;border-radius:11px;background:#0066cc;color:white;display:inline-flex;align-items:center}.frame{display:grid;grid-template-columns:255px minmax(0,1fr);gap:35px;max-width:1490px;margin:auto;padding:32px 30px 80px}.nav{position:sticky;top:107px;align-self:start;max-height:calc(100vh - 132px);overflow:auto;padding:0 8px 20px 0}.nav .label{font-size:14px;font-weight:600;letter-spacing:.08em;color:var(--muted);margin-bottom:15px}.nav input{font-size:16px;border:1px solid var(--line);width:100%;border-radius:10px;padding:10px 12px;background:white;margin-bottom:15px}.nav a{display:block;padding:10px 12px;color:#434b58;font-size:14px;border-radius:9px;line-height:1.6;word-break:keep-all}.nav a:hover{background:white;text-decoration:none;color:var(--blue)}.nav .hint{font-size:14px;color:var(--muted);padding:18px 10px}.paper{min-width:0;background:white;border:1px solid var(--line);border-radius:22px;padding:45px 48px;box-shadow:0 8px 35px #151a2105}h1{font-size:40px;line-height:1.2;letter-spacing:-1.8px;margin:0 0 20px;word-break:keep-all}h2{font-size:29px;line-height:1.45;letter-spacing:-.85px;margin:45px 0 20px;word-break:keep-all}h3{font-size:22px;line-height:1.5;letter-spacing:-.5px;margin:32px 0 14px;word-break:keep-all}h4{font-size:18px;line-height:1.5;margin:25px 0 12px}p{margin:16px 0;overflow-wrap:anywhere;word-break:normal}strong{font-weight:650}blockquote{margin:24px 0;padding:19px 23px;border-left:4px solid var(--blue);background:#f1f6fc;border-radius:0 13px 13px 0;color:#284765}blockquote p{margin:0}ul,ol{padding-left:26px}li{padding:4px 0;font-size:16px;overflow-wrap:anywhere}.table-scroll{width:100%;overflow:auto;border:1px solid var(--line);border-radius:13px;margin:20px 0}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.65;min-width:560px}.table-scroll.compact table{min-width:0;table-layout:fixed}.table-scroll.compact th:first-child{width:28%}thead{background:#f6f7f9}th{text-align:left;font-weight:600;padding:13px 15px;border-bottom:1px solid var(--line);font-size:14px}td{padding:13px 15px;border-bottom:1px solid #eef0f3;vertical-align:top;font-size:14px;overflow-wrap:anywhere}tr:last-child td{border-bottom:0}table p{margin:0;font-size:14px}pre{padding:20px;background:#f6f7f9;border:1px solid var(--line);border-radius:13px;overflow:auto;font-size:14px;line-height:1.8;tab-size:2;max-width:100%}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px}p code,li code,td code{background:#f1f2f4;padding:2px 4px;border-radius:4px;overflow-wrap:anywhere}hr{border:0;border-top:1px solid var(--line);margin:44px 0}.version{font-size:14px;color:var(--muted);padding-top:25px;text-align:center}.mobile-toggle{display:none}.top .small{font-size:14px}.note{font-size:14px;padding:14px 17px;background:#eef4fb;border-radius:12px;color:#345677;margin:0 0 28px}.hidden{display:none!important}@media(max-width:1050px){.frame{grid-template-columns:210px minmax(0,1fr);gap:20px;padding:23px 20px}.paper{padding:32px 28px}.top{padding:15px 20px}.word span{display:none}}@media(max-width:760px){.top{padding:12px 16px;gap:8px;flex-wrap:wrap}.word{font-size:18px}.actions{gap:5px;flex-wrap:wrap}.actions a,button{padding:7px 10px;font-size:14px}.mobile-toggle{display:inline-flex;align-items:center}.frame{display:block;padding:15px 12px 35px}.nav{position:static;max-height:430px;padding:15px;background:white;border:1px solid var(--line);border-radius:14px;margin-bottom:16px;display:none}.nav.open{display:block}.paper{padding:25px 20px;border-radius:16px}h1{font-size:31px;letter-spacing:-1px}h2{font-size:25px;margin-top:35px}h3{font-size:20px}.table-scroll{margin-left:0;margin-right:0}pre{padding:14px}.note{font-size:14px}.actions .md-link{display:none}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:white;font-size:11pt}.top,.nav,.note,.version{display:none}.frame{display:block;padding:0;max-width:none}.paper{border:0;padding:0;box-shadow:none}h2{page-break-before:always}h2:first-of-type{page-break-before:auto}h2,h3,h4{break-after:avoid}tr,blockquote{break-inside:avoid}.table-scroll{overflow:visible;border-radius:0}table{min-width:0;font-size:10.5pt}pre{white-space:pre-wrap;overflow-wrap:anywhere;break-inside:auto}a{color:inherit}a[href^="http"]{text-decoration:underline}}
'''
js='''
const toc=document.getElementById('toc');
document.getElementById('menu').onclick=()=>{const o=toc.classList.toggle('open');document.getElementById('menu').setAttribute('aria-expanded',String(o));};
document.getElementById('filter').addEventListener('input',e=>{let q=e.target.value.trim().toLowerCase();toc.querySelectorAll('a').forEach(a=>a.classList.toggle('hidden',!a.textContent.toLowerCase().includes(q)));});
document.getElementById('print').onclick=()=>window.print();
toc.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{if(innerWidth<761){toc.classList.remove('open');document.getElementById('menu').setAttribute('aria-expanded','false')}}));
'''
page=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>독립 AI 플랫폼 × Field · 최종 개발 계획 v3.0</title><style>{css}</style></head><body><header class="top"><div class="word">AI Platform × Field <span>Development plan / v3.0</span></div><div class="actions"><button id="menu" class="mobile-toggle" aria-expanded="false" aria-controls="toc">목차</button><a class="md-link" href="{master_name}">Markdown 원문</a><button id="print">인쇄</button></div></header><div class="frame"><nav class="nav" id="toc" aria-label="개발 계획 목차"><div class="label">DEVELOPMENT PLAN</div><input id="filter" aria-label="목차 검색" placeholder="목차 검색">{nav}<div class="hint">본문 검색은 브라우저의 찾기를 이용하세요.<br>문서·계약 예제 검수와 실서비스 인수는 별개입니다.</div></nav><main class="paper"><div class="note">최종 기준: 두 독립 제품 + 공식 연동 계약. 기존 UI v3는 화면 참고이며, 이 보고서는 새 앱 시안이 아닙니다.</div>{body}<div class="version">2026-09-24 · v3.0 · 실행 증빙 없는 항목은 완료로 판단하지 않습니다.</div></main></div><script>{js}</script></body></html>'''
(ROOT/'FINAL_DEVELOPMENT_REPORT_v3.0.html').write_text(page)
print('master',len(text.splitlines()),'lines',len(text.encode()),'bytes; report',len(page.encode()),'bytes; toc',len(toc))
