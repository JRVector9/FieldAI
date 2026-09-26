-- Native notification events remain the sole source; delivery has its own durable ledger.
create table ap.notification_recipients (
 id uuid primary key,
 organization_id uuid not null references ap.organizations(id),
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
create unique index ap_notification_recipient_active_idx on ap.notification_recipients(organization_id,target_kind,target_id,push) where revoked_at is null;
create table ap.notification_limits (
 organization_id uuid primary key references ap.organizations(id),
 daily_attempt_limit integer not null check(daily_attempt_limit between 0 and 1000),
 approved_by text not null references "user"(id),
 approved_at timestamptz not null default now()
);
create table ap.notification_daily_usage (
 organization_id uuid not null references ap.organizations(id),
 day date not null,
 reserved integer not null default 0 check(reserved>=0),
 primary key(organization_id,day)
);
create table ap.notification_deliveries (
 id uuid primary key,
 organization_id uuid not null references ap.organizations(id),
 notification_id uuid not null references ap.notification_events(id),
 recipient_id uuid not null references ap.notification_recipients(id),
 channel text not null check(channel in ('kakao','sms','web_push')),
 state text not null check(state in ('pending','processing','accepted','unknown','sent','failed','blocked_integration','blocked_limit','suppressed')),
 error_code text,
 fallback_of uuid unique references ap.notification_deliveries(id),
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
create index ap_notification_delivery_due_idx on ap.notification_deliveries(next_attempt_at) where state in ('pending','processing','accepted','unknown','blocked_integration','blocked_limit');
create table ap.notification_callbacks (
 digest text primary key check(digest ~ '^[a-f0-9]{64}$'),
 delivery_id uuid not null references ap.notification_deliveries(id),
 provider_id text not null,
 received_at timestamptz not null default now()
);
create function ap.notification_delivery_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification delivery ledger is immutable' using errcode='PAN01'; end if;
 if (new.id,new.organization_id,new.notification_id,new.recipient_id,new.channel,new.fallback_of,new.recipient_ciphertext,new.created_at)
    is distinct from (old.id,old.organization_id,old.notification_id,old.recipient_id,old.channel,old.fallback_of,old.recipient_ciphertext,old.created_at)
    or (old.started_at is not null and (new.started_at,new.provider,new.account_id,new.key_fingerprint,new.reserved,new.reserved_day)
      is distinct from (old.started_at,old.provider,old.account_id,old.key_fingerprint,old.reserved,old.reserved_day))
    or (old.provider_id is not null and new.provider_id is distinct from old.provider_id)
    or (old.started_at is not null and new.state in ('pending','blocked_limit','suppressed'))
    or (old.state in ('sent','failed','suppressed') and (new.state,new.allow_fallback) is distinct from (old.state,old.allow_fallback)) then
   raise exception 'notification delivery binding or terminal state is immutable' using errcode='PAN01';
 end if;
 return new;
end $$;
create trigger ap_notification_delivery_guard before update or delete on ap.notification_deliveries for each row execute function ap.notification_delivery_guard();

alter table ap.notification_events drop constraint notification_events_state_check;
alter table ap.notification_events drop constraint notification_events_check;
alter table ap.notification_events add constraint notification_events_state_check check(state in ('available','blocked_integration','not_applicable','pending','accepted','unknown','sent','failed','blocked_limit'));
alter table ap.notification_events add constraint notification_events_check check(
 (audience='owner' and channel='in_app' and state='available' and suppression_reason is null)
 or (audience='customer' and channel='kakao' and state in ('blocked_integration','pending','accepted','unknown','sent','failed','blocked_limit') and suppression_reason is null)
 or (state='not_applicable' and suppression_reason='spam'));
