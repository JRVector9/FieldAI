-- Independent signed account/site deletion decisions survive backups; the binding
-- travels with a backup and rejects a different product or unrelated Field DB.
create table field.account_deletion_journal_binding (
  singleton boolean primary key default true check(singleton),id uuid not null unique default gen_random_uuid()
);
insert into field.account_deletion_journal_binding(singleton) values(true);
create table field.account_deletion_receipts (
  entry_id uuid primary key,entry_sha256 text not null check(entry_sha256~'^[a-f0-9]{64}$'),
  target_kind text not null check(target_kind in ('account','organization')),target_id text not null,
  stage text not null check(stage in ('prepared','applied')),applied_at timestamptz not null default now()
);
create function field.account_deletion_receipt_guard() returns trigger language plpgsql as $$
begin
  if tg_op='TRUNCATE' or tg_op='DELETE' then raise exception 'deletion receipt is immutable' using errcode='PFD01'; end if;
  if (new.entry_id,new.entry_sha256,new.target_kind,new.target_id,new.applied_at)
    is distinct from (old.entry_id,old.entry_sha256,old.target_kind,old.target_id,old.applied_at)
    or old.stage='applied' and new.stage<>'applied' then
    raise exception 'deletion receipt is immutable' using errcode='PFD01';
  end if;
  return new;
end $$;
create trigger account_deletion_receipt_immutable before update or delete on field.account_deletion_receipts
  for each row execute function field.account_deletion_receipt_guard();
create trigger account_deletion_receipt_no_truncate before truncate on field.account_deletion_receipts
  for each statement execute function field.account_deletion_receipt_guard();
create index field_account_deletion_receipts_target on field.account_deletion_receipts(target_kind,target_id);
-- Rollback requires an offline recovery review; retaining receipt proof is deliberate.
