-- 승인된 기존 가격/동의에 면세 정책을 추정해 넣지 않는다.
alter table ap.billing_plans add column tax_free_amount integer check(tax_free_amount between 0 and total_amount);
alter table ap.billing_plans add constraint ap_billing_plan_explicit_tax check(
 tax_free_amount is null or vat_amount=round((total_amount-tax_free_amount)::numeric/11)::integer);
alter table ap.billing_consents add column tax_free_amount integer check(tax_free_amount between 0 and total_amount);
alter table ap.billing_periods add column tax_free_amount integer check(tax_free_amount between 0 and total_amount);
alter table ap.billing_periods alter column starts_at drop not null;
alter table ap.billing_periods alter column ends_at drop not null;
alter table ap.billing_periods add constraint ap_billing_period_dates check(
 (starts_at is null and ends_at is null and billing_period=0 and state in ('pending','failed','canceled'))
 or (starts_at is not null and ends_at is not null and ends_at>starts_at));
alter table ap.billing_periods drop constraint billing_periods_subscription_id_tstzrange_excl;
alter table ap.billing_periods add constraint ap_billing_period_no_overlap exclude using gist
 (subscription_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(starts_at is not null);

create or replace function ap.billing_consent_guard() returns trigger language plpgsql as $$
declare s ap.paid_subscriptions; p ap.billing_plans;
begin
 select * into s from ap.paid_subscriptions where id=new.subscription_id for share;
 select * into p from ap.billing_plans where id=new.plan_id for share;
 if p.id is null or p.approved_at is null or p.retired_at is not null or s.plan_id is distinct from p.id
  or (new.total_amount,new.supply_amount,new.vat_amount,new.tax_free_amount,new.currency,new.terms_version,new.refund_version,new.included_ai_units,new.grace_days)
   is distinct from (p.total_amount,p.supply_amount,p.vat_amount,p.tax_free_amount,p.currency,p.terms_version,p.refund_version,p.included_ai_units,p.grace_days) then
  raise exception 'billing consent must match an approved available plan' using errcode='PAB01';
 end if;
 return new;
end $$;

create or replace function ap.billing_period_guard() returns trigger language plpgsql as $$
declare s ap.paid_subscriptions; c ap.billing_consents;
begin
 if tg_op='DELETE' then raise exception 'billing period is retained' using errcode='PAB01'; end if;
 if tg_op='UPDATE' and (new.id,new.subscription_id,new.billing_period,new.consent_id,new.plan_id,new.total_amount,new.supply_amount,new.vat_amount,new.tax_free_amount,new.currency)
  is distinct from (old.id,old.subscription_id,old.billing_period,old.consent_id,old.plan_id,old.total_amount,old.supply_amount,old.vat_amount,old.tax_free_amount,old.currency) then
  raise exception 'billing period economics are immutable' using errcode='PAB01';
 end if;
 select * into s from ap.paid_subscriptions where id=new.subscription_id;
 select * into c from ap.billing_consents where id=new.consent_id;
 if c.subscription_id is distinct from s.id or c.plan_id is distinct from new.plan_id or s.plan_id is distinct from new.plan_id
  or (new.total_amount,new.supply_amount,new.vat_amount,new.tax_free_amount,new.currency)
   is distinct from (c.total_amount,c.supply_amount,c.vat_amount,c.tax_free_amount,c.currency) then
  raise exception 'billing period consent mismatch' using errcode='PAB01';
 end if;
 if tg_op='UPDATE' and (new.starts_at,new.ends_at) is distinct from (old.starts_at,old.ends_at) then
  if (old.billing_period=0 and old.starts_at is null and old.ends_at is null and new.state='paid'
    and new.starts_at is not null and new.ends_at is not null and new.paid_at=new.starts_at
    and s.anchor_at is not null and new.starts_at=s.anchor_at
    and new.ends_at=((s.anchor_at at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul') is not true then
   raise exception 'billing period dates are immutable after approval' using errcode='PAB01';
  end if;
 end if;
 if tg_op='UPDATE' and old.paid_at is not null and new.paid_at is distinct from old.paid_at then
  raise exception 'billing approval date is retained' using errcode='PAB01';
 end if;
 return new;
end $$;

alter table ap.billing_transactions add column provider_mid text check(length(provider_mid) between 1 and 14);
alter table ap.billing_transactions add column provider_key_fingerprint text check(provider_key_fingerprint ~ '^[a-f0-9]{64}$');
alter table ap.billing_transactions add column claim_token uuid;
alter table ap.billing_transactions add column customer_key text;
alter table ap.billing_transactions add column order_name text;
alter table ap.billing_transactions add column billing_key_ciphertext text;
create function ap.billing_transaction_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'billing transaction is retained' using errcode='PAB04'; end if;
 if (new.id,new.period_id,new.order_id,new.request_key,new.provider,new.mode,new.provider_mid,new.customer_key,new.order_name,new.created_at)
  is distinct from (old.id,old.period_id,old.order_id,old.request_key,old.provider,old.mode,old.provider_mid,old.customer_key,old.order_name,old.created_at)
  or old.started_at is not null and (new.started_at,new.provider_key_fingerprint) is distinct from (old.started_at,old.provider_key_fingerprint)
  or old.started_at is not null and new.billing_key_ciphertext is distinct from old.billing_key_ciphertext
   and not(new.billing_key_ciphertext is null and new.state in ('succeeded','failed'))
  or old.started_at is not null and new.state in ('pending','blocked_integration','canceled')
  or old.state in ('succeeded','failed','canceled') and new.state is distinct from old.state
  or old.payment_key_ciphertext is not null and new.payment_key_ciphertext is distinct from old.payment_key_ciphertext then
  raise exception 'billing transaction binding is immutable' using errcode='PAB04';
 end if;
 return new;
end $$;
create trigger ap_billing_transaction_guard before update or delete on ap.billing_transactions
 for each row execute function ap.billing_transaction_guard();
