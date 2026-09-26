from pathlib import Path
import re,json
ROOT=Path(__file__).resolve().parents[1]
tasks=[]
def t(i,product,title,deps,deliver,qa): tasks.append(dict(id=i,product=product,title=title,deps=deps.split(',') if deps else [],deliver=deliver,qa=qa,status='planned'))
t('C00','계약/조율','저장소·실제 구현·위험 인벤토리','','기존 데이터/코드 유무·권한·보존·변경 범위 ADR','QA115, QA116')
t('C01','계약/조율','제품 경계·OpenAPI·이벤트·상태·QA 고정','C00','B01~B12·양방향 scope·필드·오류 계약·구버전 대응','QA121~QA160')
t('C02','인프라','독립 배포/DB/큐/키/CI 프로필','C01','AP-only·Field-only 실행과 import/권한 제한','QA123, QA124')
t('C03','디자인','공통 무상태 UI·역할별 라우트 설계','C01','14px·모바일·제품 이동·비연결/오류 상태','QA57, QA58, QA119')
t('A00','AP','AP 계정·조직·DB·권한 기반','C02','자체 이메일/카카오·세션·AP migrations·outbox','QA01~QA06, QA125')
t('A01','AP','직접 지식·서비스·승인 버전','A00','source 출처·revision·KnowledgeRelease','QA22, QA81, QA134')
t('A02','AP','자체 비회원 접수·대화·사진·접근','A00','Field 없는 first-party intake·확인키·합성 테스트','QA16~QA20, QA41')
t('A03','AP','자체 문의함·사람 인계·답변','A02','대화 원본·mode·internal note·단일 발송 이벤트','QA21, QA41, QA144')
t('A04','AP','실제 AI 안내·테스트·가드레일','A01,A03','모델 어댑터·근거·도구 선택·예산·실패 대체','QA22~QA24, QA117')
t('A05','AP','상담 링크·기본 외부 위젯·handoff','A04,C03','campaign/publisher 없는 설치·origin·기본 SDK','QA94, QA97~QA102, QA127, QA128')
t('A06','AP','독립 메시지·푸시·대체발송','A03','실제 공급사·한 발송 주체·원장·미상 처리','QA35~QA40')
t('A07','AP','독립 구독·크레딧·가격 동의','A00','AP-only billing·갱신/해지·공급사 검수','QA42~QA46, QA126, QA146')
t('A08','AP','AP 관리자·보존/삭제·백업·신고','A00,A06,A07','원본 보존·AP 권한·복구·운영 runbook','QA47~QA49, QA157')
t('A09','AP','공식 통합자 API·인가·외부 client 계약','A01,A03,A05','AP OAuth server·scope·위임 API·등록 client·문서','QA129~QA133')
t('A10','AP','AI Core 단독 실검수','A05,A06,A07,A08,A09','Field 없는 실제 외부사이트/실알림/구독·QA 증빙','QA117, QA121, QA127, QA128')
t('A11','AP','AI Core 독립 공개 승인','A10','G-A1~G-A3·G-L1 적용 증빙·배포/되돌림','QA121, QA120')
t('F00','Field','Field 계정·조직·DB·권한 기반','C02','자체 이메일/카카오·세션·Field migrations·outbox','QA01~QA06, QA125')
t('F01','Field','사업/서비스·원본 카탈로그 버전','F00','구조화 가격·두 예약 설정·FieldCatalogRelease','QA53, QA77')
t('F02','Field','5단계·템플릿·직접 편집·미디어','F01,C03','실입력·다중페이지·사진·재개·모바일','QA51~QA62, QA70, QA71')
t('F03','Field','사이트 제작 LLM·취소·충돌','F02','AP없는 제작 어댑터·JSON 제한·작업/비용','QA54, QA63, QA64, QA122')
t('F04','Field','사이트 공개·복구·기본/자체 도메인','F03','Field내 원자성·실제 TLS·AP영향 분리','QA07~QA15, QA65~QA75')
t('F05','Field','직접 문의·비회원·사진·후속 접근','F00,F01','AP없어도 저장·capability·안전 연락','QA17~QA20, QA41, QA143')
t('F06','Field','직접 문의함·답변·내부 메모','F05','자체 대화 원본·server 상태·outbox','QA41, QA143')
t('F07','Field','두 예약 방식·달력·수동 일정','F01,F06','요청/확정·DB충돌·변경·취소·snapshot','QA25~QA34')
t('F08','Field','자체 알림·대체발송·이력','F06,F07','자체 공급사 검수·미상·중복·한도','QA35~QA40')
t('F09','Field','구독·관리자·보존·복구','F00,F04,F08','독립 청구/해지·정리모드·Field 운영실','QA42~QA49, QA146, QA157')
t('F10','Field','Field Core 단독 실검수','F04,F07,F08,F09','AP 없는 사이트→직접문의→예약·실알림·구독','QA50, QA80, QA122')
t('F11','Field','Field Core 독립 공개 승인','F10','G-F1~G-F3·G-L1 적용 증빙·배포/되돌림','QA120, QA122')
t('I00','연동','Field 역방향 인가·OAuth 양방향 마법사','A09,F00','서로 다른 token/audience·거부/취소·scope','QA129~QA132')
t('I01','연동','조직·AI·actor·source 매핑·기능 발견','I00,A01,F01','connection ledger·설치만/부분연결·허용리소스','QA130, QA133, QA134')
t('I02','연동','승인 정보 sync·최신성·재조정','I01,F04','Field source→AP 검토·revision/hash·live 중요값','QA84, QA135~QA138, QA156')
t('I03','연동','Field 사이트에 외부 SDK 설치','I01,A05,F04','일반외부사이트와동일한 public 계약·origin','QA86, QA94, QA128')
t('I04','연동','외부 문의/예약 요청·고객 인계','I01,A02,F07','동의·idempotence·unknown·수신 snapshot·Field capability','QA139~QA142, QA153, QA155')
t('I05','연동','Field 문의 통합뷰·AP 답변·알림 소유','I04,A03,A06,F06,F08','원본 API·reply actor·event route·미전달 표시','QA144, QA145, QA148, QA149')
t('I06','연동','해제·부분 장애·구독 종료·삭제','I02,I03,I05','양방향 revoke·원격대기·업무보존·새 알림경로','QA146, QA150~QA155')
t('I07','연동','fault injection·권한/계약 회귀','I06','복수 origin·결과미상·서명재생·scope공격·version 호환','QA131, QA132, QA140, QA158, QA159')
t('I08','연동','Field Connector 공개 승인','I07,A11,F11','G-I1~G-I3·동일 외부 client 계약·고객 E2E','QA50, QA80, QA160')
t('D00','배포/매체','AP 홍보 카드·검토·공개','A01,A04','campaign/knowledge 참조·광고표시·revision','QA87~QA91')
t('D01','배포/매체','매체 조직·도메인·광고 위치','A00,A09','매체 RBAC·소유 증명·slot·AP 관리','QA92, QA94, QA95')
t('D02','배포/매체','정확한 카드 버전 배치 승인','D00,D01','사업자공개와매체승인분리·상태·중지','QA90~QA96')
t('D03','배포/매체','외부 기사 카드·AP 접수 전환','A05,D02','Field 없이 광고 대화→AP 접수·권한/고지','QA97~QA103, QA118')
t('D04','배포/매체','성과·개인정보 없는 집계·export','A02,D03','source event·데모제외·작은집단/차분억제','QA104~QA107')
t('D05','배포/매체','Distribution 독립 검수·출시','D04,A10','G-D1~G-D2·제휴 증빙·AP만으로완료','QA108~QA114, QA118')
t('R00','검수/이행','기존120개 재귀속·추가40개 검수 추적','C01','QA01~QA160적용제품·게이트·기존변경근거','QA01~QA160')
t('R01','검수/이행','기존 서버 존재 시 이행·없으면 N/A 증빙','C00,I06','원본분류·동의·건수·백업·전환·복구','QA115')
t('R02','최종','두제품+연동+매체 전체 최종 인수','A11,F11,I08,D05,R00,R01','G-S1·독립/연결회귀·릴리스 evidence·운영 인계','QA120, QA160')
ids={x['id'] for x in tasks}
assert len(ids)==len(tasks)
for x in tasks:
 assert set(x['deps'])<=ids,(x['id'],x['deps'])
def closure(i,seen=None):
 seen=set() if seen is None else seen
 if i in seen: return seen
 seen.add(i)
 for d in next(x for x in tasks if x['id']==i)['deps']:closure(d,seen)
 return seen
for release,forbid in [('A11',('F','I','D')),('F11',('A','I','D')),('D05',('F','I'))]:
 assert not any(x.startswith(forbid) for x in closure(release)),(release,closure(release))
lines=['# TASKS — 독립 제품 개발 작업 보드 v3.0','','**총 %d개 작업. 모든 상태는 planned이며 실제 구현/테스트 완료를 의미하지 않는다.**'%len(tasks),'','C=계약/인프라, A=AP, F=Field, I=연동, D=배포·매체, R=회귀/이행. 이전 T00~T23 통합 작업표를 대체한다. 한 작업을 에이전트 한 번의 실행으로 끝내야 한다는 시간 추정은 아니다. 필요하면 같은 부모 ID 아래 하위 작업으로 나눈다.','','| ID | 제품 | 작업 | 선행 | 필수 산출·검수 | QA 연결 |','|---|---|---|---|---|---|']
for x in tasks:lines.append(f"| {x['id']} | {x['product']} | {x['title']} | {', '.join(x['deps']) or '없음'} | {x['deliver']} | {x['qa']} |")
lines+=['','## 실행 순서와 독립 출시','','**C00 → C01 → C02/C03 → A 트랙과 F 트랙 병렬.** AP Core는 A11에서 Field/매체 없이 출시할 수 있다. Field Core는 F11에서 AP 없이 출시할 수 있다. I 트랙은 두 제품의 공개 계약을 이용해 통합하며 I08에서 별도로 승인한다. D05는 AP의 매체 확장 출시이며 Field/연동을 선행으로 요구하지 않는다.','','AP A09가 일반 통합자에게 제공하는 인가/API이고, I00는 Field가 외부 리소스 서버로 제공하는 역방향 구현이다. 이를 서로의 런타임 의존으로 합치지 않는다. 실제 API/인증을 구현하기 전에 UI 목업을 만들 수 있으나 해당 task를 verified로 표시할 수는 없다.','','R01은 운영 서버/DB가 없다는 인벤토리 증빙이 있으면 not_applicable로 종료한다. 있는 경우 이행 검수는 생략하지 않는다. R02는 모든 제품의 기존 요구가 충족됐는지 검수하며 독립 Core 출시에 영향을 주는 선행 작업이 아니다.','','## 모든 작업의 Definition of Done','','UI·API·도메인·DB·권한·이벤트·사용량·오류·보안·테스트·롤백이 해당 범위에서 연결되어야 한다. `implemented`는 코드 완료이며 `verified`는 실행 증빙이 있는 상태다. 외부 승인 부재는 blocked_integration이다. QA의 제품별 적용을 생략하거나 다른 제품의 완료로 대체하지 않는다.','','API/스키마 변경은 Coordinator가 계약을 승인하고 AP/Field 각 consumer 테스트를 통과한 뒤 병합한다. 공통 migration을 두 제품이 동시에 쓰지 않는다.','','## 에이전트별 소유 경로','','| 담당 | 기본 소유 | 변경 금지/협의 |','|---|---|---|','| Coordinator | 공개 계약·상태·작업·ADR | DB 직접 병합은 제품 담당 리뷰 |','| AP Agent | agent-web/worker/domain/db | Field 코드 import 금지 |','| Field Agent | field-web/worker/domain/db | AP 코드 import 금지 |','| Connector Agent | generated clients·integration adapter·contract tests | 상대 내부 repository 호출 금지 |','| Distribution Agent | AP campaign/publisher/embed | Field reservation 구현 금지 |','| Reliability | CI·인프라·복구·security/e2e | 게이트 우회·skip을 pass로 처리 금지 |','','## 작업 카드 기본 형식','','```text','Task / Parent / Product:','State / Owner:','Dependencies / Requirement / QA / Gate:','Allowed paths / Forbidden imports:','Contract inputs and outputs:','Acceptance and failure cases:','Tests run / environment / commit / evidence:','Provider approvals / blockers:','Migration / rollback / handover:','```','']
(ROOT/'TASKS.md').write_text('\n'.join(lines))
(ROOT/'contracts'/'task_graph.json').write_text(json.dumps(tasks,ensure_ascii=False,indent=2))

# Rebuild from a supplied legacy PRD or the packaged, already-rehomed legacy QA rows.
import sys
legacy=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'inputs/legacy_prd_v2.0.md'
rows=[]
if legacy.exists():
 for l in legacy.read_text().splitlines():
  if re.match(r'^\| QA\d+ \|',l):
   a=[z.strip() for z in l.split('|')[1:-1]];rows.append({'id':a[0],'name':a[1],'pass':a[2]})
else:
 existing=json.loads((ROOT/'contracts/acceptance_catalog.json').read_text())
 rows=[{'id':r['id'],'name':r['name'],'pass':r['pass']} for r in existing[:120]]
assert len(rows)==120
changes={
11:'Field 내부 공개의 원자성은 Field DB에서 검수. AP 동기화는 별도 상태·승인·stale 처리로 검수하며 분산 원자성을 주장하지 않음',
16:'AP 대화에서 직접 접수로 전환할 때 맥락 유지. Field로 넘어갈 경우 수신 범위·고객 동의·원본 분리',
24:'AP LLM 장애에도 AP 사람 응대/양식 정상. AP 전체 장애에도 Field 직접 문의 정상',
46:'각 제품 신규 기능 제한과 정리 모드 분리. 한 제품의 해지로 상대 구독/기존 예약을 가두지 않음',
50:'Field 단독 직접 흐름과 AP 연결 흐름을 각각 별도 실제 기기에서 검수',
53:'세차·촬영·레슨 정보가 Field 초안/공개본에 반영. 연결 AP는 해당 소스 버전 승인 후 반영',
66:'Field 필수 연락·서비스·예약 검수는 유지하되 AP 미연결만으로 공개를 차단하지 않음',
68:'Field 사이트 확인/테스트와 AP 선택 연결을 구분; 실제 운영 주소만 성공으로 표시',
75:'Field 생성/공개 Worker 멱등·revision 검수. AP sync는 별도 outbox·소스 승인 상태이며 Field 공개 실패와 구분',
79:'각 제품 초안 비공개·승인 원본 유지. 연결 가격은 live version 일치 또는 확인 필요로 처리',
80:'Field 가입·자기 정보·템플릿/실제제작AI·공개·직접문의·예약을 AP 없이 완료. 연결 흐름도 별도 검수',
81:'AP 전용 가입·DB·조직·지식·활성화·상담이 Field 사이트/계정/서버/예약 없이 완료',
83:'AP 고객이 Field에 별도 동의/가입하고 기존 AI를 연결. AP와 Field 조직은 별도며 무단 고객/예약 복제·중복 청구 없음',
84:'Field source 변경을 AP 검토·버전 대조 후 반영. 미승인/미상 가격은 단정하지 않으며 기존 예약 snapshot 불변',
85:'Field 디자인 복구가 AP 사실·설정·중지를 변경하지 않음. 각 사실 복구는 별도 승인',
86:'같은 AP agent의 배포 권한을 검사하고 선택 Field 도구는 연결 scope에서만 사용',
96:'기본 link/owned widget은 캠페인·매체 없이 작동. 광고 카드만 공개/매체 버전 승인 필요',
107:'Field가 보낸 확정 이벤트로 AP 상태/집계를 갱신. 미연결 시 확정 지표는 미지원이며 수금/매출 아님',
108:'AP AI/카드 중지와 Field 사이트·예약 제한 독립. 연동 grant/작업은 범위별 중지',
111:'제품별 tenant 격리, 연결 조직 매핑·source/source_id·캐시·큐·도구에서 교차 권한 차단',
113:'AP와 Field의 구독/크레딧 별도. 연결 동의로 결제/혜택을 자동 복제하지 않음',
115:'기존 v2.0 서버가 있을 때만 원본·조직·대화·동의·과금 이행 검수. 없으면 N/A 근거 기록',
117:'AP만 배포·Field network/env 부재·실제 고객/사업자 두 기기·실LLM/알림/구독으로 완료',
118:'AP만으로 별도 origin 광고→상담→접수→집계 완료. Field 연결 예약 경로는 별도 통합 QA',
120:'제품별 출시/통합증빙·적용160개 QA·독립성·공급사·복구·차단 조건을 표시하고 미실행/skip은 통과로 처리하지 않음'}
for r in rows:
 n=int(r['id'][2:]);r['pass']=changes.get(n,r['pass'])
 if n in set(range(7,16))|set(range(25,35))|set(range(51,81))|{82}: r['scope']='Field'
 elif n>=87 and n<=114 and n not in {100,101,102,108,111,112,113}: r['scope']='AP·배포'
 elif n in {81,96,117}:r['scope']='AP'
 elif n in {83,84,85,86,100,101,102,108,111,113,118}:r['scope']='연동/AP'
 else:r['scope']='제품별/공통'
new=[
('AP 완전 독립 실행','AP','Field 미배포·DB권한/환경값/네트워크 없는 상태에서 가입→설치→접수→응대→구독 완료'),
('Field 완전 독립 실행','Field','AP 미배포·환경값/DB없는 상태에서 자체제작LLM·사이트·직접문의·예약·구독 완료'),
('빌드·마이그레이션 분리','AP/Field','상대 앱/마이그레이션 없이 build/migrate/restore; import graph가 공개 client만 허용'),
('DB·큐·파일 접근 분리','AP/Field','각 runtime credential로 상대 DB/queue/bucket 직접 접근 거부'),
('동일 이메일/카카오 양제품 가입','AP/Field','각 조직/세션 생성·별도 동의, token/cookie 자동공유·권한 합침 없음'),
('연결과 과금 동의 분리','연동','OAuth 승인·AI 설치만으로 상대 구독 시작/카드 복제/추가 청구 없음'),
('기본 상담 설치 독립','AP','campaign/publisher/예약 엔터티 없는 고객이 상담 link와 owned widget을 사용'),
('Field와 일반 외부사이트 동일 계약','연동/AP','같은 AP SDK와 공개 권한으로 일반 외부 사이트와 Field 설치, 내부 예외없음'),
('연결할 조직/AI 선택','연동','양쪽 actor가 선택한 조직/AI만 mapping, 이메일/상호로 자동 연결하지 않음'),
('역방향 동의 거부','연동','AP 설치는 유지하고 Field 사실/예약 도구는 비활성, 취소를 connected로 위장하지 않음'),
('issuer/audience/token 교환 공격','연동','AP용 token을 Field API에 제출하거나 반대로 제출 시 거부, code/state/redirect 검수'),
('과도한 scope/금지 도구','연동','AP에서 Field confirm/가격수정/관리자 API 불가; 누락 scope 도구 비노출'),
('사람 답변 actor 경계','연동','Field 소유자가 자신의 AP 위임권한으로 연결 대화만 답변, 타직원·타채널 원문 접근 차단'),
('source 충돌과 편집 권한','AP/연동','Field source 필드 AP 직접덮어쓰기 금지, native 중복은 명시 mapping·검수'),
('사실 발행과 AP 승인 사이','연동','Field 공개는 독립 완료·AP는 pending_review, 미승인 값을 고객에게 공개하지 않음'),
('중요값 최신성 조회 실패','연동','가격/시간/활성 상태를 최신이라 단정하지 않고 사람문의 대체, AP native 상담은 유지'),
('같은 소스 버전 다른 hash','연동','integrity_conflict로 격리·알림, 승인정보 조용히 덮어쓰기 금지'),
('소스 이벤트 역순·누락','연동','낮은 revision이 최신을 덮지 않음, snapshot 재조회·재조정'),
('외부 요청 timeout 뒤 중복 전송','연동','동일 action ID/hash로 한 external_request만, 결과조회 전 새 업무 생성 금지'),
('웹훅 서명·재전송·역순','연동','raw body HMAC·시간창·key rotation·inbox 유일·aggregate 조회·순서 역행 방지'),
('최종 고객 전달 동의','연동','수신 제품·사업자·항목·정책·조건hash 확인 없이는 전송/알림 없음'),
('첨부 수신·URL 악용','연동','승인 자산만 인증API로 copy/scan, 임의 URL·다른고객사진 가져오기 거부'),
('원본별 장애 격리','AP/Field','AP 장애중 Field 원본 메시지/예약과 Field장애중 AP 원본상담을 각각 정상 처리'),
('Field에서 AP 대화 답변','연동','AP message ID·sequence·mode 원본 한곳, Field 별도 transcript 작성 없음'),
('AP 답변 API 실패','연동','Field가 전송성공/고객수신을 거짓 표시하지 않고 미전송 초안 유지'),
('한 제품 구독 종료','AP/Field','상대 구독·원본·기존예약 유지, 자기 신규기능만 정책대로 제한'),
('생산 가격 미확정','AP/Field','승인되지 않은 가격/plan으로 청구 불가; mock 금액이 live로 전환되지 않음'),
('이벤트별 단일 알림 주체','연동','AP문의/Field직접문의/연결예약 각각 정해진 제품만 카카오/문자 발송'),
('원격 수신과 최종 알림 구분','연동','202 inbox ACK·processed·provider success·read를 별도로 표시'),
('로컬 revoke 즉시 차단','연동','해제 후 로컬 scope/도구/원문조회 차단, 데이터삭제/구독해지로 대체하지 않음'),
('원격 장애 중 revoke','연동','원격토큰 회수대기 durable retry·짧은만료·사용시검사, 완료 오표시 없음'),
('연결 소스 해제','연동/AP','Field 소스는 사용중단, AP native로 자동 변환 금지; 다른 native 상담 유지'),
('AP 해제 이후 기존 예약','연동/Field','이미 수신한 Field 작업·snapshot 유지; 권한있는 고객 Field 경로/직접연락 제공'),
('부분 배포 해제','연동/AP','Field 배포만 중지하고 AP 독립링크·다른 사이트·제휴계약은 자동 삭제하지 않음'),
('고객 cross-product 접근','연동','유효 AP capability+연결 예약+1회Field handoff만 교환, 전화번호/ID만으론 불가'),
('최종 제출 직전 가격/시간 변경','연동','expected_service_revision mismatch409, 변경내용 고객 재확인 전 자동접수/확정 금지'),
('관리자 제품 경계','AP/Field','각 admin MFA·membership·audit, 같은운영자여도 다른 제품 DB/콘솔 자동 접근 금지'),
('API/schema 버전 독립 배포','연동','구 consumer 계약회귀·알수없는필드/enum 처리, breaking change 새버전/이행'),
('로그/이벤트/매체 최소정보','공통','서명/토큰/연락처/사진/원문이 URL·웹훅·로그·매체 집계에 유출되지 않음'),
('제품별 출시 게이트 독립','전체','A/F/I/D각 증빙과 최종Suite 분리, 아직미완료 모듈을 통합완료라 보고하지 않음')]
assert len(new)==40
for n,(name,scope,passed) in enumerate(new,121):rows.append(dict(id=f'QA{n}',name=name,scope=scope,**{'pass':passed}))
q=['# 07. 요구사항 추적과 인수 검수 160개','','**기존 QA01~QA120의 ID를 보존하고 제품 경계에 맞게 기대값을 개정했으며, 독립성·연동 QA121~QA160을 추가했다. 아래는 실행해야 할 인수 명세이고 이번 문서 작성 중 실서비스 테스트가 통과했다는 뜻이 아니다.**','','제품별/공통으로 표시한 행은 해당 제품에서 각각 검수한다. AP 승인으로 Field 검수를 대신하지 않는다. Core 릴리스에 없는 매체/연동 QA는 적용 외로 구분하고, 전체 Suite에서는 해당 항목도 실행한다. provider credential 부재는 적용 외가 아니라 blocked_integration이다.','','## 기존 테스트의 중요한 개정','','공유 DB 원자성→제품내 원자성+동기화 상태, AI-only 동일 조직→별도 제품 조직+동의 mapping, 통합 과금→독립 원장, 동일 브라우저 시안→실제 독립 서버/기기 검수로 바꿨다. 전체 기존 21개 요구의 삭제는 없다.','','| ID | 적용 | 시나리오 | 통과 조건 |','|---|---|---|---|']
for r in rows:q.append(f"| {r['id']} | {r['scope']} | {r['name']} | {r['pass']} |")
q+=['','## 확정 요구와 검수의 연결','','| 요구 | 적용 검수 |','|---|---|','| D01~D04 다양한업종·제작·문의·AI | QA07~24, QA50~80, QA121~128 |','| D05 모바일·PC | QA57~59, QA119, 제품별 실제 핵심 경로 |','| D06~D09 알림·무인증접수 | QA17~21, QA35~41, QA141, QA148~155 |','| D10~D13 사이트·서비스·도메인 | QA07~15, QA53~75, QA134~138 |','| D14~D15 예약·수동일정 | QA25~34, QA139, QA153, QA156 |','| D16~D19 가입·체험·구독·서비스대금 제외 | QA01~06, QA42~49, QA125~126, QA146~147 |','| D20~D21 승인된정보·초안·복구 | QA08~12, QA22~24, QA63~75, QA84~90, QA135~138 |','| 최신 결정: 두 독립 제품·Field 외부설치 | B01~B12 전체, QA121~160 |','| Firsthand식 홍보·매체 역할 | QA87~114, QA118~119, Distribution 게이트 |','','## 실제 테스트 결과 기록 형식','','```text','QA ID / Product / Release / Commit:','Environment / Browser / Device / Provider mode:','Fixture (synthetic only):','Command and reproduction:','Expected / Actual:','Result: not_run | passed | failed | blocked_integration | not_applicable_with_evidence','Evidence file / logs / screenshots:','Owner / reviewed_at / blocker / next action:','```','','현재 이 패키지의 160개 서비스 인수 항목은 **not_run**이다. 문서·JSON 예제·작업 DAG·HTML 보고서 표시 검사는 별도의 `quality_checks/DOCUMENT_QA.md`에만 기록한다.','']
(ROOT/'docs'/'06_REQUIREMENTS_QA.md').write_text('\n'.join(q))
(ROOT/'contracts'/'acceptance_catalog.json').write_text(json.dumps([dict(**r,status='not_run') for r in rows],ensure_ascii=False,indent=2))
print('tasks',len(tasks),'qa',len(rows),'independent release closures valid')
