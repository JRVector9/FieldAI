create table field.ap_reply_drafts (
  id uuid primary key,
  external_request_id uuid not null references field.external_work_requests(id) on delete cascade,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  actor_user_id text not null references "user"(id) on delete cascade,
  submission_key text not null unique check (submission_key ~ '^[A-Za-z0-9_-]{32,128}$'),
  request_hmac text not null check (request_hmac ~ '^[a-f0-9]{64}$'),
  body_cipher bytea,
  expected_revision integer not null check (expected_revision >= 0),
  state text not null check (state in ('pending', 'delivery_unknown', 'revision_conflict', 'accepted')),
  ap_message_id uuid,
  ap_revision integer,
  ap_delivery text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'accepted' and body_cipher is null and ap_message_id is not null
    and ap_revision is not null and ap_delivery is not null)
    or (state <> 'accepted' and body_cipher is not null and ap_message_id is null
      and ap_revision is null and ap_delivery is null))
);
create unique index field_ap_reply_drafts_one_open_idx
  on field.ap_reply_drafts(external_request_id) where state <> 'accepted';
create unique index field_ap_reply_drafts_receipt_idx
  on field.ap_reply_drafts(external_request_id, request_hmac, expected_revision)
  where state = 'accepted';
create unique index field_ap_reply_drafts_accepted_revision_idx
  on field.ap_reply_drafts(external_request_id, expected_revision)
  where state = 'accepted';
