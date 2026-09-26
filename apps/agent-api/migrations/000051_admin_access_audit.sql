create table ap.admin_access_audit (
  id bigint generated always as identity primary key,
  actor_user_id text not null,
  resource text not null check (resource = 'overview'),
  accessed_at timestamptz not null default now()
);
create index admin_access_audit_recent_idx on ap.admin_access_audit(accessed_at desc);
