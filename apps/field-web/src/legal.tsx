import { Brand } from "@fieldai/ui";

// 운영자 신원은 출시 전 NEXT_PUBLIC_LEGAL_* env로만 입력한다(빌드 시 인라인). 값이 없으면 지어내지 않고 미설정 표시를 보여 준다.
export const LEGAL_UNSET = "운영자 정보 미설정 (출시 전 입력 필요)";
export const POLICY_PENDING = "정책 확정 전";

export function legalOperator(): [string, string | undefined][] {
  return [
    ["상호", process.env.NEXT_PUBLIC_LEGAL_BUSINESS_NAME],
    ["대표자", process.env.NEXT_PUBLIC_LEGAL_REPRESENTATIVE],
    ["사업자등록번호", process.env.NEXT_PUBLIC_LEGAL_REGISTRATION_NUMBER],
    ["통신판매업 신고번호", process.env.NEXT_PUBLIC_LEGAL_MAIL_ORDER_NUMBER],
    ["주소", process.env.NEXT_PUBLIC_LEGAL_ADDRESS],
    ["연락 이메일", process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL],
    ["개인정보 보호책임자", process.env.NEXT_PUBLIC_LEGAL_PRIVACY_OFFICER],
  ];
}

// 고객 폼은 테넌트·사용자 도메인에서도 열리므로 처리방침은 플랫폼 origin 기준으로 연결한다.
export const PRIVACY_HREF = `${process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN ?? ""}/privacy`;
const TERMS_HREF = `${process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN ?? ""}/terms`;

// 보존기간 문구는 코드가 실제로 집행하는 기준만 적는다. 일수는 운영자 승인 정책(field.work_retention_policies)으로만 정해지므로 확정 전으로 표시한다.
const WORK_RETENTION = `업무 종료 시점(이후 고객 활동이 있으면 마지막 활동 시점)부터 운영자가 승인한 보존 정책 일수가 지나면 정리합니다. 구체 일수: ${POLICY_PENDING}.`;
const PHOTO_RETENTION = `업무 원문 보존기간 이하로 별도 정리합니다. 구체 일수: ${POLICY_PENDING}.`;

export function PrivacyNotice({ kind }: { kind: "inquiry" | "reservation" }) {
  return <section className="customer-banner legal-notice" aria-label="개인정보 수집·이용 안내">
    <strong>개인정보 수집·이용 안내 (추가)</strong>
    <ul>
      <li>수집 항목: 이름·휴대전화·{kind === "inquiry" ? "문의 내용" : "요청 내용·희망 시간"}·지역/이용 장소(선택)·사진(선택)</li>
      <li>목적: {kind === "inquiry" ? "문의 응대와 접수 확인" : "예약 요청 처리와 접수 확인"}</li>
      <li>보존기간: {WORK_RETENTION} 사진은 {PHOTO_RETENTION}</li>
      <li>제공·위탁: 이 접수를 받는 사업자가 열람·처리하며, 처리 알림 발송은 알림 공급사(카카오 알림톡·문자)에 위탁합니다.</li>
    </ul>
    <a href={PRIVACY_HREF} target="_blank" rel="noopener">개인정보처리방침 전체 보기 (추가)</a>
  </section>;
}

export function LegalFooter() {
  const operator = legalOperator();
  const brief = operator.slice(0, 4).map(([label, value]) => `${label} ${value ?? "미설정"}`).join(" · ");
  const unset = operator.slice(0, 4).some(([, value]) => !value);
  return <div className="legal-footer">
    <nav aria-label="법적 고지"><a href={TERMS_HREF}>이용약관 (추가)</a><a href={PRIVACY_HREF}>개인정보처리방침 (추가)</a></nav>
    <p>{brief}{unset && <strong className="legal-unset"> · {LEGAL_UNSET}</strong>}</p>
  </div>;
}

function OperatorInfo() {
  return <dl className="legal-operator">{legalOperator().map(([label, value]) => <div key={label}><dt>{label}</dt>
    <dd>{value ?? <strong className="legal-unset">{LEGAL_UNSET}</strong>}</dd></div>)}</dl>;
}

type Section = { title: string; rows?: [string, string, string][]; items?: string[] };

const PRIVACY_SECTIONS: Section[] = [
  { title: "1. 수집 항목과 이용 목적", rows: [
    ["사업자 계정", "이름, 이메일, 비밀번호(원문을 복원할 수 없는 형태로 저장)", "회원 식별, 로그인, 서비스 안내"],
    ["카카오 로그인(선택)", "카카오 계정 식별값, 카카오 계정 이메일·닉네임", "카카오 계정으로 가입·로그인"],
    ["2단계 인증(선택)", "인증 앱(TOTP) 비밀값과 백업코드(암호화 저장)", "로그인 본인 확인"],
    ["인증 메일 발송 기록", "수신 이메일 주소, 메일 종류(가입 확인·비밀번호 재설정), 발송 상태", "인증 메일 발송과 발송 장애 확인"],
    ["사업 정보·사이트", "사업자가 직접 입력한 상호·서비스·지역·운영시간·사진 등", "사이트 제작과 공개(공개 승인한 내용은 누구나 볼 수 있음)"],
    ["구독 결제", "결제대행사가 발급한 결제 식별값, 결제·환불 기록(카드번호는 Field가 받지 않음)", "구독 요금 결제와 환불"],
    ["고객 문의·예약(비회원)", "이름, 휴대전화, 문의·요청 내용, 선택 서비스, 희망 시간, 지역·이용 장소(선택), 사진(선택)", "문의 응대, 예약 요청 처리, 접수 확인"],
    ["고객 알림 수신 동의", "휴대전화, 동의·철회 기록", "카카오 알림톡·문자로 처리 상태 안내"],
    ["사업자 브라우저 알림", "브라우저 푸시 구독 정보", "새 문의·예약 알림"],
    ["AP에서 전달된 요청", "고객이 AP에서 동의한 전달 항목(이름·연락처·요청 내용·선택한 사진 등)", "전달된 문의·예약 요청 처리"],
    ["접수 확인 보안", "접수 확인키 시도 제한용 IP 기반 해시값", "확인키 무차별 대입 방지"],
  ] },
  { title: "2. 보존기간", rows: [
    ["문의·예약 원문, 연락처, 대화", WORK_RETENTION, "분쟁·법정 기록·조사로 보존 보류된 건은 보류 해제 시까지 보존"],
    ["고객 사진", PHOTO_RETENTION, "보존 정리 후에도 접수번호와 처리 이력은 남습니다"],
    ["접수 확인 시도 기록(IP 해시)", "마지막 시도 후 1일이 지나면 삭제", "확인키 남용 방지 목적에만 사용"],
    ["사업자 계정·사업 정보", "계정·조직 삭제 요청 전까지", "계정 삭제는 계정·조직 삭제 화면에서 요청하면 삭제 조건을 확인한 뒤 바로 실행되며 로그인 정보·2단계 인증을 지우고 이름·이메일을 익명 처리합니다. 조직 삭제는 14일 유예 뒤 실행되며 유예 중에는 취소할 수 있습니다. 실행 시 사업자가 입력한 정보를 지우고, 고객 문의 원본은 위 보존기간 동안, 청구 원장·감사 기록은 법정 기간 동안 유지합니다"],
    ["인증 메일 발송 기록", "발송 완료 기록은 7일 뒤 수신 주소를 익명화하고 30일 뒤 삭제합니다. 발송 대기 기록은 30일, 발송 실패·발송 환경 미연결 기록은 90일 뒤 삭제합니다.", "메일 본문에는 수신 주소를 남기지 않습니다"],
    ["결제·환불 기록", POLICY_PENDING, "관련 법령상 보존기간 검토 필요"],
  ] },
  { title: "3. 제3자 제공", items: [
    "고객이 남긴 문의·예약 정보는 해당 사이트를 운영하는 사업자가 열람·처리합니다.",
    "AP에서 전달된 요청은 처리 결과와 사업자 답변을 해당 요청 경로로 AP에 회신합니다.",
    `그 밖의 제3자 제공: ${POLICY_PENDING}.`,
  ] },
  { title: "4. 처리 위탁 (코드에 연동이 구현된 공급사 · 계약 확정 전)", rows: [
    ["토스페이먼츠", "사업자 구독 결제·환불", "계약 확정 전"],
    ["Solapi", "카카오 알림톡·문자 발송", "계약 확정 전"],
    ["S3 호환 객체 저장소", "고객 사진·사이트 이미지 저장", `공급사·리전 ${POLICY_PENDING}`],
    ["브라우저 푸시 서비스", "사업자 브라우저 알림 전달", "사용 브라우저 제조사가 제공"],
    ["인증 메일 발송, 서버·DB 호스팅", "가입 인증·비밀번호 재설정 메일, 서비스 운영", `공급사 ${POLICY_PENDING}`],
  ] },
  { title: "5. 국외 이전", rows: [
    ["OpenAI (미국)", "제작 AI: 사업자가 입력한 사업 정보와 사이트 구성 요청을 보내 초안을 만듭니다. 고객 문의·예약 정보는 보내지 않습니다.", `이전 일시·방법·보유기간 ${POLICY_PENDING}`],
  ] },
  { title: "6. 이용자 권리와 행사 방법", items: [
    "고객은 접수 확인키로 자신의 문의·예약을 열람하고 추가 메시지를 남길 수 있습니다.",
    "열람·정정·삭제·처리정지 요청은 접수를 받은 사업자 또는 아래 개인정보 보호책임자에게 할 수 있습니다.",
    "사업자는 관리실에서 계정·사업 정보를 확인·수정할 수 있습니다.",
    "사업자는 계정·조직 삭제 화면에서 계정 삭제(즉시)와 조직 삭제(14일 유예, 유예 중 취소 가능)를 요청할 수 있습니다.",
    `요청 처리 기한과 절차: ${POLICY_PENDING}.`,
  ] },
];

const TERMS_SECTIONS: Section[] = [
  { title: "1. 서비스 내용", items: [
    "Field는 사업자가 직접 사이트를 만들고 고객의 직접 문의·예약 요청을 받아 처리하는 서비스입니다.",
    "AI 상담(Agent Platform)은 별도 제품이며 별도 가입·요금으로 운영됩니다.",
    "고객이 지불하는 서비스 대금은 사업자가 직접 받으며, Field는 고객 결제를 대행하지 않습니다.",
  ] },
  { title: "2. 사이트와 AI 초안", items: [
    "제작 AI가 만든 문구와 배치는 사업자가 확인·승인하기 전까지 초안입니다. 공개는 사업자가 직접 승인한 뒤에만 이루어집니다.",
    "가격·자격·경력·후기 등 사업 정보의 정확성은 이를 입력·승인한 사업자가 확인해야 합니다.",
  ] },
  { title: "3. 예약", items: [
    "고객의 예약 요청은 사업자가 확정하기 전까지 확정 일정이 아닙니다.",
  ] },
  { title: "4. 요금·결제·환불", items: [`구독 가격·세금·환불 조건: ${POLICY_PENDING}.`] },
  { title: "5. 계정·이용 제한·서비스 변경과 중단", items: [`세부 조항: ${POLICY_PENDING} (출시 전 법무 검토 필요).`] },
  { title: "6. 책임 제한·분쟁 해결·준거법", items: [`세부 조항: ${POLICY_PENDING} (출시 전 법무 검토 필요).`] },
];

function SectionView({ section }: { section: Section }) {
  return <section className="special-panel legal-section"><h2>{section.title}</h2>
    {section.rows && <div className="legal-table"><table><tbody>{section.rows.map(row => <tr key={row[0]}><th scope="row">{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table></div>}
    {section.items && <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
  </section>;
}

export function LegalDocument({ kind }: { kind: "terms" | "privacy" }) {
  const title = kind === "terms" ? "Field 이용약관" : "Field 개인정보처리방침";
  return <div className="site-shell legal-shell">
    <header className="site-header"><a href="/" aria-label="Field 홈"><Brand product="Field" /></a><nav aria-label="법적 고지"><a href="/terms">이용약관</a><a href="/privacy">개인정보처리방침</a></nav></header>
    <main className="feature-section legal-main">
      <div className="feature-heading"><p className="eyebrow">Field · 법적 고지 (추가)</p><h1>{title}</h1>
        <p className="state-message">이 문서는 출시 전 초안입니다. “{POLICY_PENDING}” 항목과 운영자 정보는 법무 검토와 계약 확정 후 채워야 합니다. 시행일: {POLICY_PENDING}.</p></div>
      {(kind === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS).map(section => <SectionView key={section.title} section={section} />)}
      <section className="special-panel legal-section"><h2>{kind === "terms" ? "운영자 정보" : "개인정보 보호책임자와 운영자 정보"}</h2><OperatorInfo /></section>
    </main>
  </div>;
}
