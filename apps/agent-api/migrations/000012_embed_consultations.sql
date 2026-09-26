alter table ap.embed_sessions
  add column conversation_id uuid unique references ap.inquiries(id) on delete set null,
  add column transferred_at timestamptz;

alter table ap.first_party_handoffs
  add column conversation_id uuid references ap.inquiries(id) on delete set null;
