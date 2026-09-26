-- 000074 was applied to the own local AP mock during an incorrectly selected fixture migration.
-- Preserve its original content; this follow-up integrates new ciphertext copies with approved native retention.
alter table ap.notification_recipients alter column recipient_ciphertext drop not null;
alter table ap.notification_recipients add column retention_purged_at timestamptz;
alter table ap.notification_recipients add check((recipient_ciphertext is null)=(retention_purged_at is not null));
alter table ap.notification_deliveries alter column recipient_ciphertext drop not null;
alter table ap.notification_deliveries add column retention_purged_at timestamptz;
alter table ap.notification_deliveries add check((recipient_ciphertext is null)=(retention_purged_at is not null));
create or replace function ap.notification_delivery_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification delivery ledger is immutable' using errcode='PAN01'; end if;
 if (new.id,new.organization_id,new.notification_id,new.recipient_id,new.channel,new.fallback_of,new.created_at)
    is distinct from (old.id,old.organization_id,old.notification_id,old.recipient_id,old.channel,old.fallback_of,old.created_at)
    or (old.started_at is not null and (new.started_at,new.provider,new.account_id,new.key_fingerprint,new.reserved,new.reserved_day)
      is distinct from (old.started_at,old.provider,old.account_id,old.key_fingerprint,old.reserved,old.reserved_day))
    or (old.provider_id is not null and new.provider_id is distinct from old.provider_id)
    or (new.recipient_ciphertext is distinct from old.recipient_ciphertext and not (new.recipient_ciphertext is null and new.retention_purged_at is not null and exists(select 1 from ap.notification_recipients r join ap.inquiries i on i.id::text=r.target_id where r.id=new.recipient_id and r.target_kind='inquiry' and i.retention_work_purged_at is not null)))
    or (old.retention_purged_at is not null and new.retention_purged_at is distinct from old.retention_purged_at)
    or (old.started_at is not null and new.state in ('pending','blocked_limit','suppressed'))
    or (old.state in ('sent','failed','suppressed') and (new.state,new.allow_fallback) is distinct from (old.state,old.allow_fallback)) then
   raise exception 'notification delivery binding or terminal state is immutable' using errcode='PAN01';
 end if;
 return new;
end $$;
create function ap.notification_recipient_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification consent is immutable' using errcode='PAN01'; end if;
 if (to_jsonb(new)-array['revoked_at','recipient_ciphertext','retention_purged_at']) is distinct from (to_jsonb(old)-array['revoked_at','recipient_ciphertext','retention_purged_at'])
  or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
  or (old.retention_purged_at is not null and new.retention_purged_at is distinct from old.retention_purged_at)
  or (new.recipient_ciphertext is distinct from old.recipient_ciphertext and not(new.recipient_ciphertext is null and new.retention_purged_at is not null
    and exists(select 1 from ap.inquiries i where i.id::text=new.target_id and new.target_kind='inquiry' and i.retention_work_purged_at is not null))) then
   raise exception 'notification consent binding is immutable' using errcode='PAN01';
 end if;return new;
end $$;
create trigger ap_notification_recipient_guard before update or delete on ap.notification_recipients for each row execute function ap.notification_recipient_guard();
create function ap.notification_retention_guard() returns trigger language plpgsql as $$
begin
 if old.retention_work_purged_at is null and new.retention_work_purged_at is not null then
  if exists(select 1 from ap.notification_deliveries d join ap.notification_recipients r on r.id=d.recipient_id
    where r.target_kind='inquiry' and r.target_id=new.id::text and d.started_at is not null and d.state not in ('sent','failed')) then
   raise exception 'notification result unresolved; retain for reconciliation' using errcode='PAN02';end if;
 end if;return new;
end $$;
create trigger ap_notification_retention_guard before update of retention_work_purged_at on ap.inquiries for each row execute function ap.notification_retention_guard();
create function ap.purge_notification_recipient_payload() returns trigger language plpgsql as $$
begin
 if old.retention_work_purged_at is null and new.retention_work_purged_at is not null then
  update ap.notification_deliveries d set recipient_ciphertext=null,retention_purged_at=new.retention_work_purged_at,
   state=case when started_at is null then 'suppressed' else state end,error_code=case when started_at is null then 'source_retention_ended' else error_code end,
   claim_token=null,lease_expires_at=null
  where recipient_id in(select id from ap.notification_recipients where target_kind='inquiry' and target_id=new.id::text) and retention_purged_at is null;
  update ap.notification_recipients set recipient_ciphertext=null,retention_purged_at=new.retention_work_purged_at,revoked_at=coalesce(revoked_at,now())
    where target_kind='inquiry' and target_id=new.id::text and retention_purged_at is null;
 end if;return new;
end $$;
create trigger ap_purge_notification_recipient_payload after update of retention_work_purged_at on ap.inquiries for each row execute function ap.purge_notification_recipient_payload();
