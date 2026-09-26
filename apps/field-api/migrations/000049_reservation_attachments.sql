create unique index field_reservations_id_org_unique
  on field.reservations(id, organization_id);

create table field.reservation_attachments (
  id uuid primary key,
  organization_id uuid not null,
  reservation_id uuid not null,
  object_key text not null unique,
  content_type text not null check (content_type = 'image/webp'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 4194304),
  width integer not null check (width between 1 and 2000),
  height integer not null check (height between 1 and 2000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'ready' check (state = 'ready'),
  created_at timestamptz not null default now(),
  foreign key (reservation_id, organization_id)
    references field.reservations(id, organization_id) on delete cascade,
  unique (reservation_id, sha256)
);

create index field_reservation_attachments_owner_idx
  on field.reservation_attachments(organization_id, reservation_id, created_at, id);
