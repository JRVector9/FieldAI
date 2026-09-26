create extension if not exists btree_gist;

create table ap.billing_plans (
 id uuid primary key, mode text not null check(mode in ('test','live')),
 name text not null check(length(name) between 1 and 100), currency text not null default 'KRW' check(currency='KRW'),
 total_amount integer not null check(total_amount between 1 and 1000000000),
 supply_amount integer not null check(supply_amount>=0), vat_amount integer not null check(vat_amount>=0),
 included_ai_units integer not null check(included_ai_units between 1 and 10000000),
 grace_days integer not null check(grace_days between 0 and 30),
 terms_version text not null, terms_text text not null, refund_version text not null, refund_text text not null,
 reference text not null, requested_by text not null, created_at timestamptz not null default now(),
 approved_by text, approved_at timestamptz, retired_at timestamptz,
 check(total_amount=supply_amount+vat_amount),
 check((approved_at is null and approved_by is null) or (approved_at is not null and approved_by is not null and approved_by<>requested_by))
);
create table ap.paid_subscriptions (
 id uuid primary key, organization_id uuid not null references ap.organizations(id) on delete restrict,
 plan_id uuid not null references ap.billing_plans(id), customer_key text not null unique,
 state text not null default 'awaiting_authorization' check(state in ('awaiting_authorization','active','past_due','canceled','ended')),
 created_by text not null, created_at timestamptz not null default now(), anchor_at timestamptz,
 cancel_requested_at timestamptz, cancel_requested_by text, terminated_at timestamptz
);
create unique index ap_paid_subscription_open_org on ap.paid_subscriptions(organization_id) where terminated_at is null;
create table ap.billing_consents (
 id uuid primary key, subscription_id uuid not null unique references ap.paid_subscriptions(id),
 plan_id uuid not null references ap.billing_plans(id), accepted_by text not null, accepted_at timestamptz not null default now(),
 terms_version text not null, refund_version text not null, total_amount integer not null,
 supply_amount integer not null, vat_amount integer not null, currency text not null check(currency='KRW'),
 included_ai_units integer not null, grace_days integer not null, auto_renew boolean not null check(auto_renew)
);
create table ap.billing_periods (
 id uuid primary key, subscription_id uuid not null references ap.paid_subscriptions(id),
 billing_period integer not null check(billing_period>=0), consent_id uuid not null references ap.billing_consents(id),
 plan_id uuid not null references ap.billing_plans(id), starts_at timestamptz not null, ends_at timestamptz not null,
 total_amount integer not null check(total_amount>0), supply_amount integer not null, vat_amount integer not null,
 currency text not null check(currency='KRW'), state text not null default 'pending' check(state in ('pending','paid','failed','refunded','canceled')),
 paid_at timestamptz, grace_ends_at timestamptz, refunded_amount integer not null default 0,
 created_at timestamptz not null default now(), unique(subscription_id,billing_period),
 check(ends_at>starts_at), check(total_amount=supply_amount+vat_amount), check(refunded_amount between 0 and total_amount),
 exclude using gist (subscription_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
);
create table ap.billing_transactions (
 id uuid primary key, period_id uuid not null references ap.billing_periods(id),
 order_id text not null unique, request_key uuid not null unique,
 state text not null default 'pending' check(state in ('pending','processing','unknown','succeeded','failed','canceled','blocked_integration')),
 provider text not null default 'toss', mode text not null check(mode in ('test','live')),
 payment_key_ciphertext text, error_code text, started_at timestamptz, completed_at timestamptz,
 lease_expires_at timestamptz, next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create unique index ap_billing_one_unresolved_period on ap.billing_transactions(period_id)
 where state in ('pending','processing','unknown','succeeded','blocked_integration');
create index ap_billing_transaction_work on ap.billing_transactions(next_attempt_at) where state in ('pending','unknown','processing');
create table ap.billing_authorizations (
 id uuid primary key, subscription_id uuid not null unique references ap.paid_subscriptions(id), request_key uuid not null unique,
 callback_token_hash text not null, callback_token_ciphertext text not null, auth_key_ciphertext text,
 state text not null default 'awaiting' check(state in ('awaiting','pending','processing','unknown','completed','failed','canceled','blocked_integration')),
 started_at timestamptz, lease_expires_at timestamptz, expires_at timestamptz not null, error_code text,
 created_at timestamptz not null default now()
);
create table ap.billing_credentials (
 subscription_id uuid primary key references ap.paid_subscriptions(id), billing_key_ciphertext text,
 created_at timestamptz not null default now(), deleted_at timestamptz
);
create table ap.billing_requests (
 actor_user_id text not null, key_hash text not null, request_hash text not null,
 result jsonb not null, created_at timestamptz not null default now(), primary key(actor_user_id,key_hash)
);
create table ap.billing_events (
 id bigserial primary key, organization_id uuid references ap.organizations(id) on delete restrict,
 subscription_id uuid references ap.paid_subscriptions(id), plan_id uuid references ap.billing_plans(id),
 actor_user_id text, event_type text not null, payload jsonb not null default '{}', occurred_at timestamptz not null default now()
);
create index ap_billing_org_events on ap.billing_events(organization_id,occurred_at desc,id desc);

create function ap.billing_immutable_record() returns trigger language plpgsql as $$
begin raise exception 'billing record is immutable' using errcode='PAB01'; end $$;
create trigger ap_billing_consents_immutable before update or delete on ap.billing_consents for each row execute function ap.billing_immutable_record();
create trigger ap_billing_events_immutable before update or delete on ap.billing_events for each row execute function ap.billing_immutable_record();
create trigger ap_billing_requests_immutable before update or delete on ap.billing_requests for each row execute function ap.billing_immutable_record();

create function ap.billing_plan_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'billing plan must be retired' using errcode='PAB01'; end if;
 if old.approved_at is not null and (to_jsonb(new)-'retired_at') is distinct from (to_jsonb(old)-'retired_at') then
   raise exception 'approved billing plan is immutable' using errcode='PAB01';
 end if;
 if old.retired_at is not null and new.retired_at is distinct from old.retired_at then
   raise exception 'retired billing plan cannot be reactivated' using errcode='PAB01';
 end if;
 return new;
end $$;
create trigger ap_billing_plan_guard before update or delete on ap.billing_plans for each row execute function ap.billing_plan_guard();

create function ap.billing_consent_guard() returns trigger language plpgsql as $$
declare s ap.paid_subscriptions; p ap.billing_plans;
begin
 select * into s from ap.paid_subscriptions where id=new.subscription_id for share;
 select * into p from ap.billing_plans where id=new.plan_id for share;
 if p.id is null or p.approved_at is null or p.retired_at is not null or s.plan_id is distinct from p.id
  or (new.total_amount,new.supply_amount,new.vat_amount,new.currency,new.terms_version,new.refund_version,new.included_ai_units,new.grace_days)
    is distinct from (p.total_amount,p.supply_amount,p.vat_amount,p.currency,p.terms_version,p.refund_version,p.included_ai_units,p.grace_days) then
   raise exception 'billing consent must match an approved available plan' using errcode='PAB01';
 end if;
 return new;
end $$;
create trigger ap_billing_consent_guard before insert on ap.billing_consents for each row execute function ap.billing_consent_guard();

create function ap.billing_period_guard() returns trigger language plpgsql as $$
declare s ap.paid_subscriptions; c ap.billing_consents;
begin
 if tg_op='DELETE' then raise exception 'billing period is retained' using errcode='PAB01'; end if;
 if tg_op='UPDATE' and (new.id,new.subscription_id,new.billing_period,new.consent_id,new.plan_id,new.starts_at,new.ends_at,new.total_amount,new.supply_amount,new.vat_amount,new.currency)
  is distinct from (old.id,old.subscription_id,old.billing_period,old.consent_id,old.plan_id,old.starts_at,old.ends_at,old.total_amount,old.supply_amount,old.vat_amount,old.currency) then
   raise exception 'billing period economics are immutable' using errcode='PAB01';
 end if;
 select * into s from ap.paid_subscriptions where id=new.subscription_id;
 select * into c from ap.billing_consents where id=new.consent_id;
 if c.subscription_id is distinct from s.id or c.plan_id is distinct from new.plan_id or s.plan_id is distinct from new.plan_id
  or (new.total_amount,new.supply_amount,new.vat_amount,new.currency) is distinct from (c.total_amount,c.supply_amount,c.vat_amount,c.currency) then
   raise exception 'billing period consent mismatch' using errcode='PAB01';
 end if;
 return new;
end $$;
create trigger ap_billing_period_guard before insert or update or delete on ap.billing_periods for each row execute function ap.billing_period_guard();
