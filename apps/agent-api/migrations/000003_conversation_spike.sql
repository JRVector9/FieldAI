create table spike.conversations (
  id uuid primary key,
  mode text not null default 'ai' check (mode in ('ai', 'human')),
  revision integer not null default 0,
  next_sequence bigint not null default 1
);

create table spike.conversation_events (
  id uuid primary key,
  conversation_id uuid not null references spike.conversations(id) on delete cascade,
  sequence bigint not null,
  kind text not null check (kind in ('customer_message', 'ai_message', 'human_handoff')),
  body jsonb not null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (conversation_id, sequence),
  unique (conversation_id, idempotency_key)
);

create index conversation_events_replay on spike.conversation_events(conversation_id, sequence);
