alter table ap.inquiries
  alter column customer_name drop not null,
  alter column customer_phone drop not null,
  alter column visitor_key_hash drop not null,
  alter column consent_at drop not null,
  add column deployment_id uuid references ap.deployments(id),
  add column agent_release_id uuid references ap.agent_releases(id),
  add column consult_session_hash text unique,
  add column consult_session_expires_at timestamptz,
  add column submitted_at timestamptz;

alter table ap.inquiries drop constraint inquiries_state_check;
alter table ap.inquiries add constraint ap_inquiries_state_check
  check (state in ('ai_assisting', 'needs_owner', 'human_active', 'waiting_customer', 'closed'));
alter table ap.inquiries drop constraint inquiries_mode_check;
alter table ap.inquiries add constraint ap_inquiries_mode_check check (mode in ('ai', 'human'));
alter table ap.inquiries drop constraint inquiries_automation_paused_check;
alter table ap.inquiries add constraint ap_inquiries_automation_paused_check
  check ((mode = 'ai' and not automation_paused and state = 'ai_assisting')
      or (mode = 'human' and automation_paused and state <> 'ai_assisting'));
alter table ap.inquiries add constraint ap_inquiries_contact_state_check
  check ((mode = 'ai' and customer_name is null and customer_phone is null
          and visitor_key_hash is null and consent_at is null
          and deployment_id is not null and agent_release_id is not null
          and consult_session_hash is not null and consult_session_expires_at is not null)
      or (mode = 'human' and customer_name is not null and customer_phone is not null
          and visitor_key_hash is not null and consent_at is not null));

alter table ap.inquiry_messages drop constraint inquiry_messages_actor_check;
alter table ap.inquiry_messages add constraint ap_inquiry_messages_actor_check
  check (actor in ('customer', 'assistant', 'owner'));

alter table ap.ai_runs drop constraint ai_runs_kind_check;
alter table ap.ai_runs add constraint ap_ai_runs_kind_check
  check (kind in ('owner_test', 'customer_message'));
alter table ap.ai_runs
  add column inquiry_id uuid references ap.inquiries(id) on delete cascade,
  add column inquiry_revision integer,
  add constraint ap_ai_runs_kind_inquiry_check
    check ((kind = 'owner_test' and inquiry_id is null)
        or (kind = 'customer_message' and inquiry_id is not null and inquiry_revision is not null));
create index ap_ai_runs_inquiry_idx on ap.ai_runs(inquiry_id, started_at desc);
