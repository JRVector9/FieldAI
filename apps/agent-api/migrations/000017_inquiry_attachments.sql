create unique index ap_inquiries_id_org_unique on ap.inquiries(id, organization_id);
create unique index ap_inquiry_messages_id_inquiry_unique on ap.inquiry_messages(id, inquiry_id);

create table ap.inquiry_attachments (
  id uuid primary key,
  organization_id uuid not null,
  inquiry_id uuid not null,
  message_id uuid not null,
  object_key text not null unique,
  content_type text not null check (content_type = 'image/webp'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 4194304),
  width integer not null check (width between 1 and 2000),
  height integer not null check (height between 1 and 2000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'ready' check (state = 'ready'),
  created_at timestamptz not null default now(),
  foreign key (inquiry_id, organization_id) references ap.inquiries(id, organization_id) on delete cascade,
  foreign key (message_id, inquiry_id) references ap.inquiry_messages(id, inquiry_id) on delete cascade,
  unique (message_id, sha256)
);
create index ap_inquiry_attachments_message_idx
  on ap.inquiry_attachments(inquiry_id, message_id, created_at, id);
