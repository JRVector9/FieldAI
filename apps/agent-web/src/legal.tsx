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

// 보존기간 문구는 코드가 실제로 집행하는 기준만 적는다. 일수는 운영자 승인 정책(ap.work_retention_policies)으로만 정해지므로 확정 전으로 표시한다.
const WORK_RETENTION = `문의 종료 시점(이후 활동이 있으면 마지막 활동 시점)부터 운영자가 승인한 보존 정책 일수가 지나면 정리합니다. 구체 일수: ${POLICY_PENDING}.`;
const PHOTO_RETENTION = `문의 원문 보존기간 이하로 별도 정리합니다. 구체 일수: ${POLICY_PENDING}.`;
const ANONYMOUS_RETENTION = `마지막 대화 활동 시점부터 운영자가 승인한 연락처 없는 대화 보존 일수가 지나면 정리합니다. 구체 일수: ${POLICY_PENDING}.`;

export function PrivacyNotice() {
  return <section className="customer-banner legal-notice" aria-label="개인정보 수집·이용 안내">
    <strong>개인정보 수집·이용 안내 (추가)</strong>
    <ul>
      <li>수집 항목: 이름·휴대전화·문의 내용·사진(선택)</li>
      <li>목적: 사업자의 문의 응대와 접수 확인</li>
      <li>보존기간: {WORK_RETENTION} 사진은 {PHOTO_RETENTION}</li>
      <li>제공·위탁: 이 상담을 운영하는 사업자가 열람·처리하며, 처리 알림 발송은 알림 공급사(카카오 알림톡·문자)에 위탁합니다. Field 사업자에게는 고객이 따로 확인·동의한 경우에만 전달합니다.</li>
    </ul>
    <a href="/privacy" target="_blank" rel="noopener">개인정보처리방침 전체 보기 (추가)</a>
  </section>;
}

export function LegalFooter() {
  const operator = legalOperator();
  const brief = operator.slice(0, 4).map(([label, value]) => `${label} ${value ?? "미설정"}`).join(" · ");
  const unset = operator.slice(0, 4).some(([, value]) => !value);
  return <div className="legal-footer">
    <nav aria-label="법적 고지"><a href="/terms">이용약관 (추가)</a><a href="/privacy">개인정보처리방침 (추가)</a></nav>
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
    ["사업 지식", "사업자가 직접 입력·승인한 서비스·FAQ·지역·영업시간 등", "AI 상담의 답변 근거"],
    ["구독 결제", "결제대행사가 발급한 결제 식별값, 결제·환불 기록(카드번호는 AP가 받지 않음)", "구독 요금 결제와 환불"],
    ["고객 AI 상담", "고객이 입력한 질문과 대화 기록(연락처 없이 이용)", "승인된 사업 정보 기반 답변 생성"],
    ["고객 사람 문의(비회원)", "이름, 휴대전화, 문의 내용, 선택 서비스, 사진(선택)", "사업자의 문의 응대와 접수 확인"],
    ["고객 알림 수신 동의", "휴대전화, 동의·철회 기록", "카카오 알림톡·문자로 처리 상태 안내"],
    ["사업자 브라우저 알림", "브라우저 푸시 구독 정보", "새 문의 알림"],
    ["접수 확인 보안", "접수 확인키 시도 제한용 IP 기반 해시값", "확인키 무차별 대입 방지"],
  ] },
  { title: "2. 보존기간", rows: [
    ["연락처 없는 AI 상담 대화", ANONYMOUS_RETENTION, "분쟁·법정 기록·조사로 보존 보류된 건은 보류 해제 시까지 보존"],
    ["문의 원문, 연락처, 대화", WORK_RETENTION, "분쟁·법정 기록·조사로 보존 보류된 건은 보류 해제 시까지 보존"],
    ["고객 사진", PHOTO_RETENTION, "보존 정리 후에도 접수번호와 처리 이력은 남습니다"],
    ["접수 확인 시도 기록(IP 해시)", "마지막 시도 후 1일이 지나면 삭제", "확인키 남용 방지 목적에만 사용"],
    ["사업자 계정·사업 지식", POLICY_PENDING, "계정 삭제 기능 준비 중. 그 전까지는 아래 연락처로 요청"],
    ["결제·환불 기록", POLICY_PENDING, "관련 법령상 보존기간 검토 필요"],
  ] },
  { title: "3. 제3자 제공", items: [
    "고객이 남긴 문의는 해당 상담을 운영하는 사업자가 열람·처리합니다.",
    "Field 요청 전달은 고객이 서비스·가격·시간과 수신 사업자, 전달 항목을 확인하고 별도로 동의한 경우에만 연결된 Field 사업자에게 전달합니다.",
    `그 밖의 제3자 제공: ${POLICY_PENDING}.`,
  ] },
  { title: "4. 처리 위탁 (코드에 연동이 구현된 공급사 · 계약 확정 전)", rows: [
    ["토스페이먼츠", "사업자 구독 결제·환불", "계약 확정 전"],
    ["Solapi", "카카오 알림톡·문자 발송", "계약 확정 전"],
    ["S3 호환 객체 저장소", "고객 사진 저장", `공급사·리전 ${POLICY_PENDING}`],
    ["브라우저 푸시 서비스", "사업자 브라우저 알림 전달", "사용 브라우저 제조사가 제공"],
    ["인증 메일 발송, 서버·DB 호스팅", "가입 인증·비밀번호 재설정 메일, 서비스 운영", `공급사 ${POLICY_PENDING}`],
  ] },
  { title: "5. 국외 이전", rows: [
    ["OpenAI (미국)", "AI 상담: 고객 질문, 같은 상담의 대화 기록, 사업자가 승인한 사업 정보를 보내 답변을 만듭니다. 사람 문의 사진은 AI 분석에 사용하지 않습니다.", `이전 일시·방법·보유기간 ${POLICY_PENDING}`],
  ] },
  { title: "6. 이용자 권리와 행사 방법", items: [
    "고객은 접수 확인키로 자신의 문의를 열람하고 추가 메시지를 남길 수 있습니다. 전화번호나 알림 링크만으로는 열 수 없습니다.",
    "열람·정정·삭제·처리정지 요청은 상담을 운영하는 사업자 또는 아래 개인정보 보호책임자에게 할 수 있습니다.",
    "사업자는 관리실에서 계정·사업 지식을 확인·수정할 수 있습니다.",
    `요청 처리 기한과 절차: ${POLICY_PENDING}.`,
  ] },
];

const TERMS_SECTIONS: Section[] = [
  { title: "1. 서비스 내용", items: [
    "Agent Platform은 사업자가 승인한 정보로 고객 질문에 답하는 AI 상담을 상담 링크와 외부 사이트 설치로 제공하는 서비스입니다.",
    "사이트 제작과 직접 예약 운영(Field)은 별도 제품이며 별도 가입·요금으로 운영됩니다.",
  ] },
  { title: "2. AI 답변과 사업 지식", items: [
    "AI는 사업자가 승인한 정보만 근거로 답하며, 근거가 없으면 사람 문의로 안내합니다. AI 답변은 예약 확정이나 가격 보장이 아닙니다.",
    "사업 지식의 정확성은 이를 입력·승인한 사업자가 확인해야 합니다. 승인 전 내용은 초안입니다.",
  ] },
  { title: "3. 요금·결제·환불", items: [`구독 가격·세금·환불 조건: ${POLICY_PENDING}.`] },
  { title: "4. 계정·이용 제한·서비스 변경과 중단", items: [`세부 조항: ${POLICY_PENDING} (출시 전 법무 검토 필요).`] },
  { title: "5. 제휴 매체·광고 표시", items: [`세부 조항: ${POLICY_PENDING} (출시 전 법무 검토 필요).`] },
  { title: "6. 책임 제한·분쟁 해결·준거법", items: [`세부 조항: ${POLICY_PENDING} (출시 전 법무 검토 필요).`] },
];

function SectionView({ section }: { section: Section }) {
  return <section className="special-panel legal-section"><h2>{section.title}</h2>
    {section.rows && <div className="legal-table"><table><tbody>{section.rows.map(row => <tr key={row[0]}><th scope="row">{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table></div>}
    {section.items && <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
  </section>;
}

export function LegalDocument({ kind }: { kind: "terms" | "privacy" }) {
  const title = kind === "terms" ? "Agent Platform 이용약관" : "Agent Platform 개인정보처리방침";
  return <div className="site-shell legal-shell">
    <header className="site-header"><a href="/" aria-label="Agent Platform 홈"><Brand product="Agent Platform" /></a><nav aria-label="법적 고지"><a href="/terms">이용약관</a><a href="/privacy">개인정보처리방침</a></nav></header>
    <main className="feature-section legal-main">
      <div className="feature-heading"><p className="eyebrow">Agent Platform · 법적 고지 (추가)</p><h1>{title}</h1>
        <p className="state-message">이 문서는 출시 전 초안입니다. “{POLICY_PENDING}” 항목과 운영자 정보는 법무 검토와 계약 확정 후 채워야 합니다. 시행일: {POLICY_PENDING}.</p></div>
      {(kind === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS).map(section => <SectionView key={section.title} section={section} />)}
      <section className="special-panel legal-section"><h2>{kind === "terms" ? "운영자 정보" : "개인정보 보호책임자와 운영자 정보"}</h2><OperatorInfo /></section>
    </main>
  </div>;
}
