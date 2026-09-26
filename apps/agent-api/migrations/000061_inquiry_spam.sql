alter table ap.inquiries drop constraint ap_inquiries_state_check;
alter table ap.inquiries add constraint ap_inquiries_state_check
  check (state in ('ai_assisting', 'external_ready', 'needs_owner', 'human_active', 'waiting_customer', 'closed', 'spam'));
alter table ap.inquiries drop constraint ap_inquiries_automation_paused_check;
alter table ap.inquiries add constraint ap_inquiries_automation_paused_check
  check ((mode = 'ai' and not automation_paused and state = 'ai_assisting')
    or (mode = 'external' and automation_paused and state = 'external_ready')
    or (mode = 'human' and automation_paused
      and state in ('needs_owner', 'human_active', 'waiting_customer', 'closed', 'spam')));

alter table ap.notification_events add column suppression_reason text;
alter table ap.notification_events drop constraint notification_events_state_check;
alter table ap.notification_events drop constraint notification_events_check;
alter table ap.notification_events add constraint notification_events_state_check
  check (state in ('available', 'blocked_integration', 'not_applicable'));
alter table ap.notification_events add constraint notification_events_check
  check ((audience = 'owner' and channel = 'in_app' and state = 'available' and suppression_reason is null)
    or (audience = 'customer' and channel = 'kakao' and state = 'blocked_integration' and suppression_reason is null)
    or (state = 'not_applicable' and suppression_reason is not null and suppression_reason = 'spam'
      and ((audience = 'owner' and channel = 'in_app') or (audience = 'customer' and channel = 'kakao'))));

alter table ap.inquiry_resolution_events drop constraint inquiry_resolution_events_event_type_check;
alter table ap.inquiry_resolution_events drop constraint inquiry_resolution_events_check;
alter table ap.inquiry_resolution_events add constraint inquiry_resolution_events_event_type_check
  check (event_type in ('closed', 'reopened', 'spam', 'unspammed'));
alter table ap.inquiry_resolution_events add constraint inquiry_resolution_events_check
  check ((event_type in ('closed', 'spam', 'unspammed') and actor_user_id is not null and source_message_id is null)
    or (event_type = 'reopened' and actor_user_id is null and source_message_id is not null));

-- 문의 잠금과 직렬화해 늦게 들어온 Field 예약 사건도 발송 대상에서 제외한다.
create function ap.suppress_spam_notification() returns trigger language plpgsql as $$
declare inquiry_state text;
begin
  select state into inquiry_state from ap.inquiries where id = new.inquiry_id for share;
  if inquiry_state = 'spam' then
    new.state := 'not_applicable';
    new.suppression_reason := 'spam';
  end if;
  return new;
end;
$$;
create trigger ap_notification_spam_guard before insert on ap.notification_events
  for each row execute function ap.suppress_spam_notification();
