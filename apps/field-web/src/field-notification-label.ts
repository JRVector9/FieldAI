export function inquiryDeliveryLabel(sender: string, state: string) {
  if (state === "pending") return sender === "customer"
    ? "사업자 관리실 알림 기록됨"
    : "고객 외부 알림 미연결·미발송";
  if (state === "sent") return "외부 알림 발송됨";
  if (state === "unknown") return "외부 알림 결과 확인 중";
  if (state === "failed") return "외부 알림 실패";
  return "자동 알림 없음";
}
