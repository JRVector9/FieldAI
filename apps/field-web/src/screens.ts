import type { Role, Screen } from "@fieldai/ui";

export const screens: Record<Role, Screen[]> = {
  owner: [
    {id:"F-O01",slug:"start",title:"시작하기",description:"사이트가 없는 새 계정에서 나만의 홈페이지 만들기를 시작합니다.",kind:"flow",points:["Field 계정 만들기","사업 정보 입력","디자인 선택","편집·연락·예약","확인 후 공개"],primary:"홈페이지 만들기"},
    {id:"F-O02",slug:"business",title:"사업 정보",description:"실제 상호, 서비스, 지역과 운영 정보를 서버 초안으로 준비합니다.",kind:"form",fields:["상호","업종","서비스","지역","소개","연락처"],points:["실제 입력값만 사용","AI가 가격·경력을 생성하지 않음","초안은 공개 전까지 비공개"],primary:"초안 저장"},
    {id:"F-O03",slug:"design",title:"디자인 선택",description:"서로 다른 세 가지 사이트 배치와 제작 AI 제안을 비교합니다.",kind:"flow",points:["Essential: 간결한 한 페이지","Editorial: 이미지와 이야기 중심","Warm: 친근한 서비스 소개","제작 AI 제안은 검토 후 초안 적용"],primary:"디자인 선택"},
    {id:"F-O04",slug:"editor",title:"사이트 편집",description:"글, 사진, alt 텍스트, 색상, 페이지와 섹션 순서를 편집합니다.",kind:"form",fields:["첫 화면 제목","소개 문장","대표 서비스","문의 버튼 문구"],points:["편집 내용은 초안","모바일 미리보기","복구본은 다시 승인"],primary:"초안 저장"},
    {id:"F-O05",slug:"contact-booking",title:"연락·예약 설정",description:"직접 문의와 전화, 희망시간형 또는 시간표형 예약을 설정합니다.",kind:"form",fields:["문의 안내","전화번호","기본 예약 방식","운영시간"],points:["AI 연결 없이 직접 문의 가능","서비스별 예약 방식 유지","확정은 사업자 승인 후"],primary:"설정 저장"},
    {id:"F-O06",slug:"publish",title:"확인·공개",description:"기본 주소와 모바일 화면, 미승인 변경을 확인하고 공개합니다.",kind:"flow",points:["필수 정보 확인","모바일 미리보기","공개할 버전 승인","실제 공개 결과 확인"],primary:"사이트 공개"},
    {id:"F-O07",slug:"complete",title:"개설 완료",description:"공개가 완료된 뒤 사이트 주소와 다음 운영 작업을 확인합니다.",kind:"overview",emptyTitle:"아직 공개된 사이트가 없습니다",emptyBody:"실제 공개가 확인되면 운영 주소와 직접 문의 경로, 다음 운영 작업을 표시합니다.",points:["실제 공개 전 성공 표시 없음","직접 문의 경로 확인","AI 연결은 선택"]},
    {id:"F-O08",slug:"today",title:"오늘",description:"직접 문의, 예약 요청과 알림 실패를 출처별로 확인합니다.",kind:"overview",points:["샘플 영업 데이터 없음","Field 직접 문의와 외부 AI 구분","미연결을 0건으로 오해하지 않음"]},
    {id:"F-O09",slug:"inbox",title:"문의함",description:"Field 직접 문의와 허용된 외부 AI 상담을 출처별로 봅니다.",kind:"list",points:["Field 원본은 Field에서 답변","AP 원본은 공개 API에서 조회","연결 장애를 빈 목록으로 표시하지 않음"],primary:"문의 열기"},
    {id:"F-O10",slug:"bookings",title:"예약·달력",description:"희망시간 요청과 시간표 선택 예약, 수동 일정을 관리합니다.",kind:"list",points:["요청과 확정 구분","충돌은 최종 승인 시 검사","시간 변경·취소 이력 유지"],primary:"예약 열기"},
    {id:"F-O11",slug:"site",title:"내 사이트",description:"사이트를 편집·미리보고 승인된 버전을 공개하거나 디자인을 복구합니다.",kind:"overview",metrics:["편집 중인 초안","승인된 공개본","기본 주소"],emptyTitle:"사이트가 아직 만들어지지 않았습니다",emptyBody:"초안·미리보기·승인·공개 상태를 구분해 표시합니다.",points:["초안과 공개본 구분","사이트 공개는 Field에서 완료","복구 후 재승인"],primary:"사이트 편집"},
    {id:"F-O12",slug:"catalog",title:"서비스·FAQ",description:"Field 원본 서비스와 FAQ, 가격·운영 규칙의 승인 버전을 관리합니다.",kind:"form",fields:["서비스명","서비스 설명","가격 안내","자주 묻는 질문"],points:["사실과 디자인 변경 분리","AP 동기화 상태 별도","중요값은 최신 버전 확인"],primary:"초안 저장"},
    {id:"F-O13",slug:"integrations",title:"연동 서비스",description:"AP 계정·권한·정보 동기화·설치 상태를 확인합니다.",kind:"list",points:["AP 연결은 선택","양쪽 조직·actor 동의 필요","연결 해제와 구독 해지 분리"],primary:"AI 서비스 연결"},
    {id:"F-O14",slug:"domains",title:"사이트 주소",description:"기본 주소와 자체 도메인의 소유 검증·DNS·TLS 상태를 확인합니다.",kind:"form",fields:["기본 주소","자체 도메인"],points:["검증 전 연결 성공 표시 금지","실패 시 기본 주소 유지"],primary:"주소 확인"},
    {id:"F-O15",slug:"notifications",title:"알림",description:"Field 직접 문의·예약의 발송 설정과 결과를 확인합니다.",kind:"list",columns:["사건","대상","발송 상태","최근 시도"],emptyTitle:"알림 기록이 없습니다",emptyBody:"Field가 보낸 실제 알림의 대기·성공·unknown·실패를 구분합니다.",points:["Field 소유 사건만 발송","unknown 상태 이중 문자 금지"],primary:"알림 설정"},
    {id:"F-O16",slug:"settings",title:"구독·계정",description:"Field 전용 구독과 계정, 데이터 보존 설정을 관리합니다.",kind:"list",columns:["구독 상태","동의 버전","다음 갱신","데이터 관리"],emptyTitle:"구독 정보가 연결되지 않았습니다",emptyBody:"확정된 Field 요금과 해지·보존 설정을 표시합니다.",points:["AP 구독과 분리","기존 확정 예약 정리 경로 유지","가격 동의 전 청구 없음"],primary:"설정 변경"}
  ],
  customer: [
    {id:"F-C01",slug:"site",title:"고객 사이트",description:"사업자가 승인해 공개한 소개와 직접 문의 경로를 봅니다.",kind:"overview",points:["공개본만 표시","AI 미설치 시 직접 문의만 안내"]},
    {id:"F-C02",slug:"services",title:"서비스",description:"실제 등록된 서비스와 예약 방식을 확인합니다.",kind:"list",columns:["서비스","가격 안내","예약 방식"],emptyTitle:"공개된 서비스가 없습니다",emptyBody:"사업자가 승인한 서비스와 가격, 예약 방식만 표시합니다.",points:["승인된 가격만 표시","서비스별 예약 방식 확인"]},
    {id:"F-C03",slug:"about",title:"소개",description:"사업자가 공개한 소개와 운영 정보를 봅니다.",kind:"overview",emptyTitle:"공개된 소개가 없습니다",emptyBody:"사업자가 승인한 소개와 운영 정보가 공개되면 이곳에 표시합니다.",points:["초안은 고객에게 표시하지 않음","사업자 승인 정보만 사용"]},
    {id:"F-C04",slug:"contact",title:"직접 문의",description:"AP 가입 없이 Field 사업자에게 직접 문의를 남깁니다.",kind:"form",fields:["이름","연락처","문의 내용"],points:["비회원 접수 가능","번호만으로 원문 열람 불가"],primary:"문의 제출"},
    {id:"F-C05",slug:"booking",title:"예약 요청",description:"희망시간 또는 시간표 선택 방식으로 요청합니다.",kind:"flow",points:["서비스 선택","가능한 시간 또는 희망시간 입력","요청 내용 확인","사업자 승인 대기"],primary:"예약 요청"},
    {id:"F-C06",slug:"received",title:"접수 상태",description:"제출이 실제로 저장된 뒤 접수 상태를 확인합니다.",kind:"overview",emptyTitle:"확인할 접수 기록이 없습니다",emptyBody:"서버에 저장된 요청만 접수로 표시하며 예약 확정과 알림 발송은 별도 상태입니다.",points:["요청 저장과 예약 확정 구분","발송 결과 별도 표시"]},
    {id:"F-C07",slug:"conversation",title:"후속 대화",description:"처음 접수한 대화 범위에서 답변을 확인하고 이어갑니다.",kind:"list",columns:["접수 내용","사업자 답변","최근 상태"],emptyTitle:"열 수 있는 대화가 없습니다",emptyBody:"접수 브라우저의 세션 또는 별도 확인키로 접근을 확인한 뒤 원문을 표시합니다.",points:["안전한 고객 접근 확인","다른 고객 원문 차단"]},
    {id:"F-C08",slug:"access",title:"접근 확인",description:"새 브라우저에서 별도 확인키로 문의 접근을 확인합니다.",kind:"form",fields:["접수 확인키"],points:["알림 링크만으로 원문 접근 불가","고객 OTP 신규 강제 없음"],primary:"접근 확인"}
  ],
  media: [],
  admin: [
    {id:"F-A01",slug:"operations",title:"운영 현황",description:"Field 서비스와 처리 대기 업무를 확인합니다.",kind:"overview",metrics:["사이트 공개 오류","예약 확인 지연","알림 결과 미상"],emptyTitle:"운영 지표가 연결되지 않았습니다",emptyBody:"Field 자체 사이트·문의·예약 상태를 표시합니다. AP 장애는 연동 상태로 구분합니다.",points:["Field 직접 업무 유지","예약 요청과 확정 구분","알림 결과 미상 추적"]},
    {id:"F-A02",slug:"organizations",title:"사업체",description:"Field 사업체와 사이트 상태를 권한 범위에서 확인합니다.",kind:"list",columns:["사업체","계정 상태","사이트 상태","권한 검토"],emptyTitle:"사업체 목록이 연결되지 않았습니다",emptyBody:"Field 사업체와 membership만 조회합니다.",points:["Field 조직만 관리","권한 변경 감사 기록","AP 계정 자동 연결 금지"]},
    {id:"F-A03",slug:"site-domains",title:"제작·도메인",description:"생성 작업과 도메인 검증·공개 상태를 점검합니다.",kind:"list",columns:["사업체","제작 작업","도메인 검증","공개 버전"],emptyTitle:"사이트 작업 기록이 없습니다",emptyBody:"실제 제작 작업과 DNS·TLS 검증, 승인된 공개본을 구분합니다.",points:["기본 주소 별도 유지","검증 전 성공 표시 금지","공개 실패 시 이전 버전 복구"]},
    {id:"F-A04",slug:"notifications",title:"발송",description:"Field 소유 알림의 대기·성공·unknown·실패를 구분합니다.",kind:"list",columns:["사건","수신 경로","발송 상태","최근 시도"],emptyTitle:"발송 기록이 없습니다",emptyBody:"Field 소유 사건의 실제 발송 시도와 결과를 표시합니다.",points:["AP 사건 중복 발송 금지","unknown 재조회","실패와 접수 상태 분리"]},
    {id:"F-A05",slug:"billing",title:"구독",description:"Field 전용 구독과 청구 원장을 확인합니다.",kind:"list",columns:["사업체","플랜 버전","동의","청구 상태"],emptyTitle:"청구 정보가 연결되지 않았습니다",emptyBody:"확정된 Field 전용 요금과 실제 청구 원장만 표시합니다.",points:["AP 구독과 분리","동의 없는 청구 금지","결과 미상 재조회"]},
    {id:"F-A06",slug:"audit",title:"신고·감사",description:"사유와 기간을 남기고 허용된 범위만 열람합니다.",kind:"list",columns:["사건","요청 사유","접근 범위","감사 기록"],emptyTitle:"검토할 운영 사건이 없습니다",emptyBody:"상세 열람은 별도 승인·사유·기간과 함께 기록합니다.",points:["무제한 열람 금지","고객 원문 최소 접근","조치·복구 근거 보존"]}
  ]
};
