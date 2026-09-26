create table ap.platform_admin_memberships (
  user_id text primary key references "user"(id) on delete cascade,
  role text not null check (role in ('operator', 'auditor')),
  granted_at timestamptz not null default now()
);
