// 자체 도메인 상태 API의 last_error(error) 코드를 사업자용 한국어 안내로 바꾼다(추가).
// 화면 컴포넌트(CSS import)와 분리해 단위 검수에서 그대로 불러올 수 있게 한다.
const DOMAIN_ERROR_LABELS: Record<string, string> = {
  ownership_txt_missing: "소유권 TXT 레코드를 찾지 못했습니다. 안내한 TXT 값을 DNS에 추가해 주세요.",
  ownership_txt_unconfirmed: "이번 확인에서 소유권 TXT 레코드를 찾지 못했습니다. 잠시 뒤 다시 확인합니다.",
  ownership_release_pending: "소유권을 확인하지 못해 이 주소의 연결 해제를 진행하고 있습니다.",
  ownership_release_authority_not_configured: "연결 해제 공급사가 설정되지 않아 해제를 끝내지 못했습니다.",
  routing_dns_mismatch: "CNAME 레코드가 안내한 연결 대상과 다릅니다.",
  domain_claimed_by_other_site: "다른 사이트가 이미 이 주소를 사용하고 있습니다.",
  domain_tls_pending: "인증서 발급과 HTTPS 연결 확인을 기다리고 있습니다.",
  domain_tls_unconfirmed: "인증서·HTTPS 연결을 아직 확인하지 못했습니다. 15분 동안 다시 확인합니다.",
  domain_tls_failed: "15분 넘게 인증서·HTTPS 연결을 확인하지 못했습니다. CNAME 대상, 443 포트, 프록시(CDN) 설정을 확인해 주세요. 확인되면 자동으로 연결됩니다.",
  domain_certificate_invalid: "인증서가 만료됐거나 유효 기간을 확인할 수 없습니다.",
  domain_binding_mismatch: "연결 공급사 응답이 이 주소·사이트와 맞지 않습니다.",
  domain_verification_unknown: "확인 결과를 받지 못했습니다. 잠시 뒤 다시 확인합니다.",
  domain_authority_not_configured: "도메인 확인 공급사가 설정되지 않았습니다.",
  domain_release_pending: "연결 해제 결과를 확인하고 있습니다.",
};
export function domainErrorLabel(code: string) {
  return DOMAIN_ERROR_LABELS[code] ?? "연결 확인 중 문제가 있었습니다. 상태 새로고침으로 다시 확인해 주세요.";
}
