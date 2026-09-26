create extension if not exists btree_gist;

create table field.booking_policies (
  organization_id uuid primary key references field.organizations(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  timezone text not null,
  weekly jsonb not null,
  closed_dates jsonb not null default '[]'::jsonb,
  special_dates jsonb not null default '{}'::jsonb,
  before_minutes integer not null check (before_minutes between 0 and 1440),
  after_minutes integer not null check (after_minutes between 0 and 1440),
  min_lead_minutes integer not null check (min_lead_minutes between 0 and 43200),
  horizon_days integer not null check (horizon_days between 1 and 365),
  updated_by text not null references "user"(id),
  updated_at timestamptz not null default now()
);

create table field.reservations (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  catalog_revision integer not null check (catalog_revision > 0),
  service_id uuid not null,
  service_snapshot jsonb not null,
  booking_mode text not null check (booking_mode in ('request', 'slot')),
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  customer_phone text not null,
  visitor_key_hash text not null unique,
  preferred_time_text text,
  requested_start_at timestamptz,
  confirmed_start_at timestamptz,
  confirmed_end_at timestamptz,
  timezone text not null,
  state text not null check (state in ('requested', 'proposed', 'customer_accepted', 'confirmed', 'change_requested', 'cancel_requested', 'completed', 'canceled', 'rejected', 'expired')),
  revision integer not null default 0 check (revision >= 0),
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index field_reservations_owner_idx on field.reservations(organization_id, created_at desc);

create table field.occupancies (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  reservation_id uuid unique references field.reservations(id) on delete cascade,
  source text not null check (source in ('reservation', 'manual')),
  label text,
  occupied tstzrange not null,
  created_by text references "user"(id),
  created_at timestamptz not null default now(),
  check (not isempty(occupied)),
  check ((source = 'reservation' and reservation_id is not null)
      or (source = 'manual' and reservation_id is null)),
  exclude using gist (organization_id with =, occupied with &&)
);
