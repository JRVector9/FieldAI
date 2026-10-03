-- 직접 응대 시작(human_takeover)·종료(human_release)도 처리 완료·스팸과 같이 누가 했는지 사건으로 남긴다.
-- 최신 정의(000061)의 종류에 두 값을 더하고, 사업자 행동이므로 actor_user_id 필수·source_message_id 없음 규칙을 따른다.
alter table ap.inquiry_resolution_events drop constraint inquiry_resolution_events_event_type_check;
alter table ap.inquiry_resolution_events drop constraint inquiry_resolution_events_check;
alter table ap.inquiry_resolution_events add constraint inquiry_resolution_events_event_type_check
  check (event_type in ('closed', 'reopened', 'spam', 'unspammed', 'human_takeover', 'human_release'));
alter table ap.inquiry_resolution_events add constraint inquiry_resolution_events_check
  check ((event_type in ('closed', 'spam', 'unspammed', 'human_takeover', 'human_release')
      and actor_user_id is not null and source_message_id is null)
    or (event_type = 'reopened' and actor_user_id is null and source_message_id is not null));
-- 롤백: human_takeover/human_release 행을 먼저 지우거나 보관한 뒤 000061의 두 제약을 그대로 다시 만든다.
