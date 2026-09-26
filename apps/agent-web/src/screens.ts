import type { Role, Screen } from "@fieldai/ui";

export const screens: Record<Role, Screen[]> = {
  owner: [
    {id:"AP-O01",slug:"start",title:"시작하기",description:"AI를 만들기 전에 내 사업 정보를 등록합니다. 계정과 조직은 AP에서만 관리합니다.",kind:"flow",points:["AP 계정 만들기","사업 정보 등록","AI 응대 준비","기존 사이트에 설치"],primary:"계정 만들기"},
    {id:"AP-O02",slug:"knowledge",title:"사업 정보·지식",description:"직접 입력한 정보와 외부에서 가져온 정보를 출처별로 검토합니다.",kind:"form",fields:["상호","사업 소개","서비스","자주 묻는 질문"],points:["초안과 승인 버전을 분리","가격·경력·후기는 직접 확인","가져온 정보는 별도 검토"],primary:"초안 저장"},
    {id:"AP-O03",slug:"ai",title:"내 사업 AI",description:"말투와 응대 범위를 정하고, 승인된 정보로 테스트한 뒤 활성화합니다.",kind:"form",fields:["AI 이름","인사말","응대 말투","사람에게 넘길 조건"],points:["승인 정보만 근거로 사용","테스트와 고객 응대 분리","활성화 상태 명확히 표시"],primary:"AI 설정 저장"},
    {id:"AP-O04",slug:"inbox",title:"문의함",description:"AP에서 시작한 고객 상담의 원본을 확인하고 직접 답변합니다.",kind:"list",points:["AI와 사람 응대 상태 구분","고객 공개 답변과 내부 메모 분리","알림 실패를 대화 상태와 분리"],primary:"문의 열기"},
    {id:"AP-O05",slug:"install",title:"공유·설치",description:"상담 링크 또는 기존 사이트의 위젯 설치를 관리합니다.",kind:"flow",points:["상담 링크 발급","사이트 소유·허용 주소 확인","위젯 설치와 테스트","고객 공개 활성화"],primary:"설치 시작"},
    {id:"AP-O06",slug:"integrations",title:"연동 앱",description:"Field 등 외부 앱의 조직·권한·정보 출처를 확인합니다.",kind:"list",points:["연결과 요금 동의 분리","scope와 actor 확인","해제·실패·정보 오래됨 구분"],primary:"앱 연결"},
    {id:"AP-O07",slug:"campaigns",title:"홍보 카드",description:"기본 상담 설치와 별도로 홍보 카드의 버전과 배치를 관리합니다.",kind:"list",columns:["카드 이름","버전","공개 상태","매체 승인"],emptyTitle:"홍보 카드가 없습니다",emptyBody:"카드 초안과 공개 버전, 매체의 배치 승인을 각각 표시합니다.",points:["초안·공개·중지 구분","사업자 공개와 매체 승인 분리","가격은 승인 정보에 바인딩"],primary:"카드 만들기"},
    {id:"AP-O08",slug:"usage",title:"성과·사용량",description:"상담, 접수, 외부 전환과 AI 사용량을 구분해 봅니다.",kind:"overview",metrics:["AI 응답","정식 문의 접수","외부 업무 요청"],emptyTitle:"집계할 실제 사용 기록이 없습니다",emptyBody:"테스트 대화와 고객 접수, 외부 전환을 분리해 집계합니다. 수금이나 예약 확정을 뜻하지 않습니다.",points:["실제 발생한 이벤트만 집계","접수와 예약 확정을 혼동하지 않음","사용량과 청구 원장 구분"]},
    {id:"AP-O09",slug:"settings",title:"구독·계정·데이터",description:"AP의 별도 요금과 계정, 데이터 내보내기와 보존 설정을 확인합니다.",kind:"list",columns:["구독 상태","동의 버전","다음 갱신","데이터 관리"],emptyTitle:"구독 정보가 연결되지 않았습니다",emptyBody:"확정한 AP 요금과 동의, 해지·내보내기 경로가 여기에 표시됩니다.",points:["Field 구독과 분리","가격 동의 전 청구 없음","기존 상담 정리 경로 유지"],primary:"설정 변경"}
  ],
  customer: [
    {id:"AP-C01",slug:"chat",title:"AI 상담",description:"사업자명과 AI 안내를 보고 질문하거나 사람 문의로 이동합니다.",kind:"flow",points:["사업자와 AI 이용 안내 확인","질문 입력","근거 확인 또는 사람에게 문의"],primary:"질문 보내기"},
    {id:"AP-C02",slug:"followup",title:"문의 접수·후속 대화",description:"이름·연락처를 안전한 AP 화면에서 제출하고 같은 대화를 이어갑니다.",kind:"form",fields:["이름","연락처","문의 내용"],points:["번호만으로 원문 열람 불가","확인키는 알림 링크와 분리","예약은 Field에서만 확정"],primary:"문의 제출"}
  ],
  media: [
    {id:"AP-M01",slug:"operations",title:"운영",description:"제휴 매체의 위치와 요청 상태를 확인합니다.",kind:"overview",metrics:["검증된 위치","배치 검토 대기","게시 중인 카드"],emptyTitle:"매체 운영 정보가 없습니다",emptyBody:"자기 매체 조직의 위치와 배치 요청만 표시합니다.",points:["매체 조직 범위만 조회","고객 원문 표시 안 함"]},
    {id:"AP-M02",slug:"placements",title:"광고 위치",description:"소유 도메인과 노출 위치를 등록·검증합니다.",kind:"form",fields:["매체 이름","도메인","위치 이름"],primary:"위치 등록"},
    {id:"AP-M03",slug:"requests",title:"배치 검토",description:"사업자가 공개한 카드의 정확한 버전을 검토합니다.",kind:"list",columns:["요청 카드","공개 버전","노출 위치","검토 상태"],emptyTitle:"검토할 배치 요청이 없습니다",emptyBody:"사업자가 공개한 카드의 요청과 정확한 버전이 표시됩니다.",points:["카드 버전 변경 시 재검토","승인·거절 이유 기록"],primary:"요청 검토"},
    {id:"AP-M04",slug:"performance",title:"성과",description:"허용된 위치의 노출과 전환 집계를 확인합니다.",kind:"overview",metrics:["카드 노출","상담 진입","접수 전환"],emptyTitle:"집계할 성과가 없습니다",emptyBody:"고객을 식별할 수 없는 집계만 표시합니다.",points:["집계만 표시","고객 식별 정보 제외"]},
    {id:"AP-M05",slug:"settings",title:"매체 설정",description:"매체 조직과 검증된 도메인을 관리합니다.",kind:"form",fields:["매체 이름","담당자","도메인"],primary:"설정 저장"}
  ],
  admin: [
    {id:"AP-A01",slug:"operations",title:"운영 현황",description:"AP 서비스 상태와 처리 대기 항목을 확인합니다.",kind:"overview",metrics:["상담 처리 지연","알림 결과 미상","설치 오류"],emptyTitle:"운영 지표가 연결되지 않았습니다",emptyBody:"AP 자체 지표만 표시하며 Field 장애는 연동 상태로 구분합니다.",points:["제품별 장애 분리","대기·unknown 상태 구분","고객 원문 접근은 별도 승인"]},
    {id:"AP-A02",slug:"organizations",title:"조직",description:"AP 조직과 권한을 감사 가능한 범위에서 관리합니다.",kind:"list",columns:["조직","계정 상태","대표 AI","권한 검토"],emptyTitle:"조직 목록이 연결되지 않았습니다",emptyBody:"AP 조직과 membership만 조회합니다.",points:["AP 조직만 관리","권한 변경은 감사 기록","Field 계정 자동 연결 금지"]},
    {id:"AP-A03",slug:"notifications",title:"발송",description:"AP 소유 알림의 대기·성공·unknown·실패 상태를 구분합니다.",kind:"list",columns:["사건","수신 경로","발송 상태","최근 시도"],emptyTitle:"발송 기록이 없습니다",emptyBody:"실제 발송 시도와 결과, unknown 처리 이력이 여기에 표시됩니다.",points:["AP 소유 사건만 발송","결과 미상일 때 중복 문자 금지","대화 저장과 발송 결과 분리"]},
    {id:"AP-A04",slug:"ai-deployments",title:"AI·배포",description:"AI 활성화와 설치 origin, 배포 상태를 점검합니다.",kind:"list",columns:["사업 AI","승인 버전","설치 origin","배포 상태"],emptyTitle:"AI 배포 정보가 없습니다",emptyBody:"승인된 지식·AI 버전과 검증된 설치 주소를 표시합니다.",points:["승인 전 고객 응대 금지","정확한 origin 검증","테스트·운영 분리"]},
    {id:"AP-A05",slug:"billing",title:"구독",description:"AP 전용 요금·동의·청구 원장을 확인합니다.",kind:"list",columns:["조직","플랜 버전","동의","청구 상태"],emptyTitle:"청구 정보가 연결되지 않았습니다",emptyBody:"확정된 AP 전용 플랜과 실제 청구 원장만 표시합니다.",points:["Field 청구 원장과 분리","동의 없는 청구 금지","결제 결과 미상 재조회"]},
    {id:"AP-A06",slug:"audit",title:"신고·감사",description:"사유와 기간, 접근 증빙을 남겨 운영 조치를 검토합니다.",kind:"list",columns:["사건","요청 사유","접근 범위","감사 기록"],emptyTitle:"검토할 운영 사건이 없습니다",emptyBody:"상세 열람은 별도 승인·사유·기간과 함께 기록합니다.",points:["무제한 열람 금지","고객 원문 최소 접근","조치·복구 근거 보존"]}
  ]
};
