-- Native notification events remain the sole source; delivery has its own durable ledger.
create table field.notification_recipients (
 id uuid primary key,
 organization_id uuid not null references field.organizations(id),
 target_kind text not null check(target_kind in ('owner','inquiry','reservation')),
 target_id text not null,
 audience text not null check(audience in ('owner','customer')),
 actor_user_id text references "user"(id),
 recipient_ciphertext text not null,
 kakao boolean not null default false,
 sms boolean not null default false,
 push boolean not null default false,
 consent_version text not null check(consent_version='notification-v1'),
 consented_at timestamptz not null default now(),
 revoked_at timestamptz,
 check((audience='owner' and target_kind='owner' and actor_user_id=target_id and not sms)
    or (audience='customer' and target_kind in ('inquiry','reservation') and actor_user_id is null and not push))
);
create unique index field_notification_recipient_active_idx on field.notification_recipients(organization_id,target_kind,target_id,push) where revoked_at is null;
create table field.notification_limits (
 organization_id uuid primary key references field.organizations(id),
 daily_attempt_limit integer not null check(daily_attempt_limit between 0 and 1000),
 approved_by text not null references "user"(id),
 approved_at timestamptz not null default now()
);
create table field.notification_daily_usage (
 organization_id uuid not null references field.organizations(id),
 day date not null,
 reserved integer not null default 0 check(reserved>=0),
 primary key(organization_id,day)
);
create table field.notification_deliveries (
 id uuid primary key,
 organization_id uuid not null references field.organizations(id),
 notification_id uuid not null references field.notification_events(id),
 recipient_id uuid not null references field.notification_recipients(id),
 channel text not null check(channel in ('kakao','sms','web_push')),
 state text not null check(state in ('pending','processing','accepted','unknown','sent','failed','blocked_integration','blocked_limit','suppressed')),
 error_code text,
 fallback_of uuid unique references field.notification_deliveries(id),
 allow_fallback boolean not null default false,
 provider text,
 account_id text,
 key_fingerprint text check(key_fingerprint ~ '^[a-f0-9]{64}$'),
 provider_id text,
 recipient_ciphertext text not null,
 started_at timestamptz,
 reserved boolean not null default false,
 reserved_day date,
 claim_token uuid,
 lease_expires_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(notification_id,recipient_id,channel),
 check((fallback_of is null and channel<>'sms') or (fallback_of is not null and channel='sms')),
 check((not reserved and reserved_day is null) or (reserved and reserved_day is not null)),
 check(started_at is null or (provider is not null and account_id is not null and key_fingerprint is not null and reserved)),
 check((state='processing' and claim_token is not null and lease_expires_at is not null) or (state<>'processing' and claim_token is null and lease_expires_at is null))
);
create index field_notification_delivery_due_idx on field.notification_deliveries(next_attempt_at) where state in ('pending','processing','accepted','unknown','blocked_integration','blocked_limit');
create table field.notification_callbacks (
 digest text primary key check(digest ~ '^[a-f0-9]{64}$'),
 delivery_id uuid not null references field.notification_deliveries(id),
 provider_id text not null,
 received_at timestamptz not null default now()
);
create function field.notification_delivery_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification delivery ledger is immutable' using errcode='PFN01'; end if;
 if (new.id,new.organization_id,new.notification_id,new.recipient_id,new.channel,new.fallback_of,new.recipient_ciphertext,new.created_at)
    is distinct from (old.id,old.organization_id,old.notification_id,old.recipient_id,old.channel,old.fallback_of,old.recipient_ciphertext,old.created_at)
    or (old.started_at is not null and (new.started_at,new.provider,new.account_id,new.key_fingerprint,new.reserved,new.reserved_day)
      is distinct from (old.started_at,old.provider,old.account_id,old.key_fingerprint,old.reserved,old.reserved_day))
    or (old.provider_id is not null and new.provider_id is distinct from old.provider_id)
    or (old.started_at is not null and new.state in ('pending','blocked_limit','suppressed'))
    or (old.state in ('sent','failed','suppressed') and (new.state,new.allow_fallback) is distinct from (old.state,old.allow_fallback)) then
   raise exception 'notification delivery binding or terminal state is immutable' using errcode='PFN01';
 end if;
 return new;
end $$;
create trigger field_notification_delivery_guard before update or delete on field.notification_deliveries for each row execute function field.notification_delivery_guard();

alter table field.notification_events drop constraint notification_events_state_check;
alter table field.notification_events drop constraint notification_events_check;
alter table field.notification_events add constraint notification_events_state_check check(state in ('available','blocked_integration','pending','accepted','unknown','sent','failed','blocked_limit'));
alter table field.notification_events add constraint notification_events_check check((audience='owner' and channel='in_app' and state='available') or (audience='customer' and channel='kakao' and state<>'available'));
alter table field.notification_events add column delivery_source_message_id uuid references field.inquiry_messages(id);
alter table field.notification_events add column delivery_owner_product text not null default 'field' check(delivery_owner_product in ('ap','field','none'));
create function field.capture_notification_delivery_source() returns trigger language plpgsql as $$
declare kind text; detail jsonb; reservation_source text; route_state text; pending uuid; owner_product text;
begin
 select event_type,payload into kind,detail from field.outbox where id=new.outbox_id;
 if kind='field.inquiry.owner_reply' then
   select m.id into new.delivery_source_message_id from field.inquiry_messages m
   where m.id::text=detail->>'sourceMessageId' and m.inquiry_id::text=new.target_id
     and m.sender='owner' and m.visibility='customer';
 elsif new.audience='customer' then
   select r.source,n.state,n.pending_transfer_id into reservation_source,route_state,pending
   from field.reservations r left join field.external_reservation_notification_routes n on n.reservation_id=r.id
   where r.id::text=new.target_id for share of r;
   if kind like 'field.reservation.%' and detail->>'revision' is not null then
     select notification_owner_product into owner_product from field.reservation_events
     where reservation_id::text=new.target_id and revision=(detail->>'revision')::integer;
   end if;
   new.delivery_owner_product:=coalesce(owner_product,case when reservation_source='owner_manual' then 'none'
    when reservation_source='external_ap' then case when route_state='active' then 'field' when route_state='suspended' or pending is not null then 'none' else 'ap' end
    when reservation_source='public' then 'field' else 'none' end);
 end if;
 return new;
end $$;
create trigger field_capture_notification_delivery_source before insert on field.notification_events for each row execute function field.capture_notification_delivery_source();

alter table field.inquiry_messages drop constraint inquiry_messages_delivery_state_check;
alter table field.inquiry_messages add constraint inquiry_messages_delivery_state_check check(delivery_state in ('pending','sent','unknown','failed','not_applicable','blocked_integration'));

alter table field.notification_recipients alter column recipient_ciphertext drop not null;
alter table field.notification_recipients add column retention_purged_at timestamptz;
alter table field.notification_recipients add check((recipient_ciphertext is null)=(retention_purged_at is not null));
alter table field.notification_deliveries alter column recipient_ciphertext drop not null;
alter table field.notification_deliveries add column retention_purged_at timestamptz;
alter table field.notification_deliveries add check((recipient_ciphertext is null)=(retention_purged_at is not null));
create or replace function field.notification_delivery_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification delivery ledger is immutable' using errcode='PFN01'; end if;
 if (new.id,new.organization_id,new.notification_id,new.recipient_id,new.channel,new.fallback_of,new.created_at)
    is distinct from (old.id,old.organization_id,old.notification_id,old.recipient_id,old.channel,old.fallback_of,old.created_at)
    or (old.started_at is not null and (new.started_at,new.provider,new.account_id,new.key_fingerprint,new.reserved,new.reserved_day)
      is distinct from (old.started_at,old.provider,old.account_id,old.key_fingerprint,old.reserved,old.reserved_day))
    or (old.provider_id is not null and new.provider_id is distinct from old.provider_id)
    or (new.recipient_ciphertext is distinct from old.recipient_ciphertext and not (new.recipient_ciphertext is null and new.retention_purged_at is not null and exists(select 1 from field.notification_recipients r left join field.inquiries i on i.id::text=r.target_id and r.target_kind='inquiry' left join field.reservations b on b.id::text=r.target_id and r.target_kind='reservation' where r.id=new.recipient_id and coalesce(i.retention_work_purged_at,b.retention_work_purged_at) is not null)))
    or (old.retention_purged_at is not null and new.retention_purged_at is distinct from old.retention_purged_at)
    or (old.started_at is not null and new.state in ('pending','blocked_limit','suppressed'))
    or (old.state in ('sent','failed','suppressed') and (new.state,new.allow_fallback) is distinct from (old.state,old.allow_fallback)) then
   raise exception 'notification delivery binding or terminal state is immutable' using errcode='PFN01';
 end if;
 return new;
end $$;
create function field.notification_recipient_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification consent is immutable' using errcode='PFN01'; end if;
 if (to_jsonb(new)-array['revoked_at','recipient_ciphertext','retention_purged_at']) is distinct from (to_jsonb(old)-array['revoked_at','recipient_ciphertext','retention_purged_at'])
  or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
  or (old.retention_purged_at is not null and new.retention_purged_at is distinct from old.retention_purged_at)
  or (new.recipient_ciphertext is distinct from old.recipient_ciphertext and not(new.recipient_ciphertext is null and new.retention_purged_at is not null
    and (exists(select 1 from field.inquiries i where i.id::text=new.target_id and new.target_kind='inquiry' and i.retention_work_purged_at is not null) or exists(select 1 from field.reservations r where r.id::text=new.target_id and new.target_kind='reservation' and r.retention_work_purged_at is not null)))) then
   raise exception 'notification consent binding is immutable' using errcode='PFN01';
 end if;return new;
end $$;
create trigger field_notification_recipient_guard before update or delete on field.notification_recipients for each row execute function field.notification_recipient_guard();
create function field.notification_retention_guard() returns trigger language plpgsql as $$
begin
 if old.retention_work_purged_at is null and new.retention_work_purged_at is not null then
  if exists(select 1 from field.notification_deliveries d join field.notification_recipients r on r.id=d.recipient_id
    where r.target_kind=case when tg_table_name='inquiries' then 'inquiry' else 'reservation' end and r.target_id=new.id::text and d.started_at is not null and d.state not in ('sent','failed')) then
   raise exception 'notification result unresolved; retain for reconciliation' using errcode='PFN02';end if;
 end if;return new;
end $$;
create trigger field_notification_retention_guard before update of retention_work_purged_at on field.inquiries for each row execute function field.notification_retention_guard();
create function field.purge_notification_recipient_payload() returns trigger language plpgsql as $$
begin
 if old.retention_work_purged_at is null and new.retention_work_purged_at is not null then
  update field.notification_deliveries d set recipient_ciphertext=null,retention_purged_at=new.retention_work_purged_at,
   state=case when started_at is null then 'suppressed' else state end,error_code=case when started_at is null then 'source_retention_ended' else error_code end,
   claim_token=null,lease_expires_at=null
  where recipient_id in(select id from field.notification_recipients where target_kind=case when tg_table_name='inquiries' then 'inquiry' else 'reservation' end and target_id=new.id::text) and retention_purged_at is null;
  update field.notification_recipients set recipient_ciphertext=null,retention_purged_at=new.retention_work_purged_at,revoked_at=coalesce(revoked_at,now())
    where target_kind=case when tg_table_name='inquiries' then 'inquiry' else 'reservation' end and target_id=new.id::text and retention_purged_at is null;
 end if;return new;
end $$;
create trigger field_purge_notification_recipient_payload after update of retention_work_purged_at on field.inquiries for each row execute function field.purge_notification_recipient_payload();
create trigger field_reservation_notification_retention_guard before update of retention_work_purged_at on field.reservations for each row execute function field.notification_retention_guard();
create trigger field_reservation_purge_notification_recipient_payload after update of retention_work_purged_at on field.reservations for each row execute function field.purge_notification_recipient_payload();
