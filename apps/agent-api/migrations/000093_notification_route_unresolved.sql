-- push 수신함(Field 사건)이 AP 연결 조건 불충족·일시 장애로 알림 경로를 확인하지 못하면 영구 생략 대신 미루고,
-- 수신 뒤 24시간 안에 확인하지 못한 사건만 AP 고객 알림 없이 route_unresolved 사유로 닫는다.
-- 최신 정의(000090)에 이 사유 하나만 더한다.
alter table ap.notification_events drop constraint notification_events_check;
alter table ap.notification_events add constraint notification_events_check check(
 (audience='owner' and channel='in_app' and state='available' and suppression_reason is null)
 or (audience='customer' and channel='kakao' and state in ('blocked_integration','pending','accepted','unknown','sent','failed','blocked_limit') and suppression_reason is null)
 or (state='not_applicable' and suppression_reason='spam')
 or (audience='customer' and channel='kakao' and state='not_applicable' and field_reservation_event_id is not null
   and suppression_reason in ('field_route_active','field_route_suspended','route_transfer_pending','route_unknown','route_unresolved')));
-- 롤백: route_unresolved 행을 보관·삭제한 뒤 000090의 notification_events_check를 다시 만든다.
