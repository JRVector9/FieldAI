-- Independent signed-entry receipt facts survive organization/work deletion.
create table field.retention_journal_receipts (
  entry_id uuid primary key,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default clock_timestamp()
);
create function field.protect_retention_journal_receipt() returns trigger language plpgsql as $$
begin
  raise exception 'retention journal receipt is immutable' using errcode = 'PJR01';
end;
$$;
create trigger immutable_retention_journal_receipt before update or delete on field.retention_journal_receipts
for each row execute function field.protect_retention_journal_receipt();
