export type TrialPolicy = { consentVersion: string; days: number; source: "mock" | "configured" }
  | { consentVersion: null; days: null; source: "unavailable" };

// 서버가 내려준 체험 정책으로 안내·동의 문구를 만든다. "로컬 mock 전용"은 mock 정책에서만 쓴다.
export function trialPolicyCopy(policy: TrialPolicy) {
  if (policy.source === "mock") return { offer: `로컬 mock 전용 ${policy.days}일 체험 제안입니다. 카드 등록이나 자동 유료 전환은 없습니다.`,
    consent: `${policy.days}일 체험(로컬 검수용)을 시작하는 데 동의합니다.` };
  if (policy.source === "configured") return { offer: `${policy.days}일 무료 체험, 카드 등록 없음, 자동 유료 전환 없음.`,
    consent: `${policy.days}일 무료 체험을 시작하는 데 동의합니다.` };
  return { offer: "체험 정책이 승인되지 않아 이 환경에서는 시작할 수 없습니다.", consent: null };
}
