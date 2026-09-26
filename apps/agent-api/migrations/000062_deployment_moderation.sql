create table ap.moderation_reports (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  deployment_id uuid not null references ap.deployments(id) on delete cascade,
  agent_release_id uuid not null,
  public_snapshot jsonb not null,
  submission_key_hash text not null,
  request_hash text not null,
  category text not null check (category in ('inaccurate_information','unsafe_content','other')),
  description text not null check (length(description) between 1 and 2000),
  consent_version text not null check (consent_version = 'ap-deployment-report-v1'),
  consent_at timestamptz not null default now(),
  state text not null default 'submitted' check (state in ('submitted','reviewed','appealed','closed')),
  revision integer not null default 1 check (revision > 0),
  outcome text check (outcome in ('dismissed','correction_requested','deployment_restricted')),
  review_summary text not null default '' check (length(review_summary) <= 2000),
  appeal_message text check (length(appeal_message) between 1 and 2000),
  appeal_decision text check (appeal_decision in ('upheld','overturned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(deployment_id, submission_key_hash)
);
create index ap_moderation_reports_queue_idx on ap.moderation_reports(created_at desc,id desc);
create index ap_moderation_reports_org_idx on ap.moderation_reports(organization_id,created_at desc,id desc);
create table ap.moderation_access_requests (
  id uuid primary key,
  report_id uuid not null references ap.moderation_reports(id) on delete cascade,
  requested_by text not null,
  reason text not null check (length(reason) between 1 and 500),
  minutes integer not null check (minutes between 1 and 60),
  submission_key_hash text not null,
  request_hash text not null,
  approved_by text,
  approval_reason text check (length(approval_reason) between 1 and 500),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(report_id,requested_by,submission_key_hash),
  check (approved_by is null or approved_by <> requested_by),
  check ((approved_by is null and expires_at is null and approval_reason is null)
    or (approved_by is not null and expires_at is not null and approval_reason is not null))
);
create table ap.moderation_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references ap.moderation_reports(id) on delete cascade,
  actor_user_id text,
  action text not null check (action in ('submitted','access_requested','access_approved','detail_read','reviewed','appealed','appeal_decided')),
  reason text not null check (length(reason) between 1 and 2000),
  submission_key_hash text,
  request_hash text,
  result jsonb,
  created_at timestamptz not null default now(),
  unique(report_id,actor_user_id,submission_key_hash)
);
create table ap.deployment_moderation_holds (
  deployment_id uuid not null references ap.deployments(id) on delete cascade,
  report_id uuid not null references ap.moderation_reports(id) on delete cascade,
  created_by text not null,
  created_at timestamptz not null default now(),
  released_by text,
  released_at timestamptz,
  primary key(deployment_id,report_id),
  check ((released_by is null) = (released_at is null))
);
create table ap.report_submission_windows (
  scope text not null check (scope in ('ip','deployment')),
  subject_hash text not null,
  attempts integer not null check (attempts > 0),
  window_started_at timestamptz not null default now(),
  primary key(scope,subject_hash)
);

alter table ap.deployments add column moderation_restricted boolean not null default false;
alter table ap.notification_events alter column inquiry_id drop not null;
alter table ap.notification_events add column moderation_report_id uuid references ap.moderation_reports(id) on delete cascade;
alter table ap.notification_events add constraint notification_events_work_target_check check (
  (inquiry_id is not null and moderation_report_id is null)
  or (inquiry_id is null and moderation_report_id is not null and source_message_id is null
    and audience='owner' and channel='in_app' and state='available')
);

