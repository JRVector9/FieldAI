create table field.inquiries (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  catalog_revision integer not null,
  service_id uuid not null,
  service_snapshot jsonb not null,
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  customer_phone text not null,
  visitor_key_hash text not null unique,
  state text not null check (state in ('needs_owner', 'waiting_customer', 'closed')),
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index field_inquiries_owner_idx on field.inquiries(organization_id, created_at desc);

create table field.inquiry_messages (
  id uuid primary key,
  inquiry_id uuid not null references field.inquiries(id) on delete cascade,
  sender text not null check (sender in ('customer', 'owner')),
  body text not null check (char_length(body) between 1 and 5000),
  delivery_state text not null check (delivery_state in ('pending', 'sent', 'unknown', 'failed', 'not_applicable')),
  created_at timestamptz not null default now()
);
create index field_inquiry_messages_order_idx on field.inquiry_messages(inquiry_id, created_at, id);
