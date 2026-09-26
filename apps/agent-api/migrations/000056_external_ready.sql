alter table ap.inquiries drop constraint ap_inquiries_state_check;
alter table ap.inquiries add constraint ap_inquiries_state_check
  check (state in ('ai_assisting', 'external_ready', 'needs_owner', 'human_active', 'waiting_customer', 'closed'));

alter table ap.inquiries drop constraint ap_inquiries_mode_check;
alter table ap.inquiries add constraint ap_inquiries_mode_check check (mode in ('ai', 'external', 'human'));

alter table ap.inquiries drop constraint ap_inquiries_automation_paused_check;
alter table ap.inquiries add constraint ap_inquiries_automation_paused_check
  check ((mode = 'ai' and not automation_paused and state = 'ai_assisting')
      or (mode = 'external' and automation_paused and state = 'external_ready')
      or (mode = 'human' and automation_paused
          and state in ('needs_owner', 'human_active', 'waiting_customer', 'closed')));

alter table ap.inquiries drop constraint ap_inquiries_contact_state_check;
alter table ap.inquiries add constraint ap_inquiries_contact_state_check
  check ((mode = 'ai' and customer_name is null and customer_phone is null
          and visitor_key_hash is null and consent_at is null
          and deployment_id is not null and agent_release_id is not null
          and consult_session_hash is not null and consult_session_expires_at is not null)
      or (mode in ('external', 'human') and customer_name is not null and customer_phone is not null
          and visitor_key_hash is not null and consent_at is not null));
