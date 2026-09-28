export function ownerReservationDeliveryNotice(delivery: string | undefined): string {
  if (delivery === "blocked_integration")
    return "고객 외부 알림은 미발송 상태입니다. 공급사 연결을 확인해 주세요.";
  if (delivery === "not_applicable") return "이 처리에는 고객 자동 알림이 없습니다.";
  if (delivery === "manual_contact_required") return "고객에게 직접 연락이 필요합니다. 자동 알림 발송은 확인되지 않았습니다.";
  if (delivery === "handled_by_ap") return "AP가 고객 알림을 담당합니다. AP 알림 상태를 확인해 주세요.";
  return "고객 외부 알림 발송 결과는 이 예약 처리 응답만으로 확인할 수 없습니다. 관리실 알림 설정·이력에서 확인해 주세요.";
}

export function reservationMessageNotificationLabel(state: string | null): string {
  if (state === "blocked_integration") return "Field에서 열람 가능 · 외부 알림 미발송";
  if (state === "sent") return "외부 발송 확인 · 열람은 미확인";
  if (state === "accepted") return "공급사 접수 · 수신·열람 미확인";
  if (state === "failed") return "외부 알림 발송 실패";
  return "Field에서 열람 가능 · 외부 알림 결과는 별도 확인";
}
