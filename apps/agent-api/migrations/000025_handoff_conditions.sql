alter table ap.embed_handoffs
  add column conditions text not null default '' check (char_length(conditions) <= 1000);

alter table ap.first_party_handoffs
  add column conditions text not null default '' check (char_length(conditions) <= 1000);
