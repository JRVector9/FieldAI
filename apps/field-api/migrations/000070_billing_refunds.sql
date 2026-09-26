-- 환불은 구독 해지와 별도이며 원 결제/정책/승인/거래를 보존한다.
create table field.billing_refunds (
 id uuid primary key, organization_id uuid not null references field.organizations(id) on delete restrict,
 subscription_id uuid not null references field.paid_subscriptions(id) on delete restrict,
 period_id uuid not null references field.billing_periods(id) on delete restrict,
 transaction_id uuid not null references field.billing_transactions(id) on delete restrict,
 request_key uuid not null unique, amount integer not null check(amount between 1 and 1000000000),
 tax_free_amount integer check(tax_free_amount between 0 and amount),
 reason text not null check(length(reason) between 10 and 500),
 requested_by text not null, requested_role text not null check(requested_role in ('owner','operator')),
 session_id text, reference text, reviewed_by text, review_reason text, reviewed_at timestamptz,
 approved_by text, approval_reason text, approved_at timestamptz,
 rejected_by text, rejection_reason text, rejected_at timestamptz,
 refund_version text not null, terms_version text not null,
 mode text not null check(mode in ('test','live')), provider_mid text not null,
 provider_key_fingerprint text not null check(provider_key_fingerprint ~ '^[a-f0-9]{64}$'),
 cancel_reason text not null check(length(cancel_reason) between 1 and 200),
 state text not null default 'requested' check(state in ('requested','reviewed','pending','processing','unknown','succeeded','rejected','blocked_integration')),
 payment_key_ciphertext text, baseline_keys jsonb, baseline_amount integer, baseline_tax_free_amount integer,
 provider_transaction_hash text unique check(provider_transaction_hash ~ '^[a-f0-9]{64}$'),
 provider_transaction_ciphertext text, provider_canceled_at timestamptz,
 started_at timestamptz, dispatched_at timestamptz, completed_at timestamptz,
 claim_token uuid, lease_expires_at timestamptz, next_attempt_at timestamptz not null default now(),
 error_code text, created_at timestamptz not null default now(),
 check(requested_role='operator' or session_id is not null),
 check((reviewed_by is null and reviewed_at is null) or (reviewed_by is not null and reviewed_at is not null and tax_free_amount is not null and reference is not null and review_reason is not null)),
 check((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null and reviewed_by is not null and approved_by<>reviewed_by and (requested_role='owner' or approved_by<>requested_by))),
 check(dispatched_at is null or started_at is not null and payment_key_ciphertext is not null and baseline_keys is not null and baseline_amount is not null and baseline_tax_free_amount is not null),
 check(state not in ('pending','processing','unknown','succeeded','blocked_integration') or approved_at is not null),
 check(state<>'succeeded' or provider_transaction_hash is not null and provider_transaction_ciphertext is not null and provider_canceled_at is not null and completed_at is not null and dispatched_at is not null),
 check(state<>'unknown' or dispatched_at is not null)
);
create unique index field_refund_one_unresolved_payment on field.billing_refunds(transaction_id)
 where state not in ('succeeded','rejected');
create index field_refund_work on field.billing_refunds(next_attempt_at) where state in ('pending','processing','unknown','blocked_integration');
create function field.billing_refund_guard() returns trigger language plpgsql as $$
declare p field.billing_periods; t field.billing_transactions; s field.paid_subscriptions; c field.billing_consents;
begin
 if tg_op='DELETE' then raise exception 'refund record is retained' using errcode='PFB06'; end if;
 if tg_op='UPDATE' and ((new.id,new.organization_id,new.subscription_id,new.period_id,new.transaction_id,new.request_key,new.amount,new.reason,new.requested_by,new.requested_role,new.session_id,new.refund_version,new.terms_version,new.mode,new.provider_mid,new.provider_key_fingerprint,new.cancel_reason,new.created_at)
 is distinct from (old.id,old.organization_id,old.subscription_id,old.period_id,old.transaction_id,old.request_key,old.amount,old.reason,old.requested_by,old.requested_role,old.session_id,old.refund_version,old.terms_version,old.mode,old.provider_mid,old.provider_key_fingerprint,old.cancel_reason,old.created_at)
 or old.reviewed_at is not null and (new.reviewed_by,new.reviewed_at,new.review_reason,new.reference,new.tax_free_amount) is distinct from (old.reviewed_by,old.reviewed_at,old.review_reason,old.reference,old.tax_free_amount)
 or old.approved_at is not null and (new.approved_by,new.approved_at,new.approval_reason) is distinct from (old.approved_by,old.approved_at,old.approval_reason)
 or old.started_at is not null and (new.started_at,new.payment_key_ciphertext) is distinct from (old.started_at,old.payment_key_ciphertext)
 or old.dispatched_at is not null and (new.dispatched_at,new.baseline_keys,new.baseline_amount,new.baseline_tax_free_amount) is distinct from (old.dispatched_at,old.baseline_keys,old.baseline_amount,old.baseline_tax_free_amount)
 or old.dispatched_at is not null and new.state in ('requested','reviewed','pending','blocked_integration','rejected')
 or old.state in ('succeeded','rejected') and to_jsonb(new) is distinct from to_jsonb(old)) then
 raise exception 'refund binding is immutable' using errcode='PFB06'; end if;
 select * into p from field.billing_periods where id=new.period_id;
 select * into t from field.billing_transactions where id=new.transaction_id;
 select * into s from field.paid_subscriptions where id=p.subscription_id;
 select * into c from field.billing_consents where id=p.consent_id;
 if (t.period_id=p.id and t.state='succeeded' and t.payment_key_ciphertext is not null and p.paid_at is not null
 and p.subscription_id=new.subscription_id and s.organization_id=new.organization_id and t.mode=new.mode
 and t.provider_mid=new.provider_mid and t.provider_key_fingerprint=new.provider_key_fingerprint
 and c.refund_version=new.refund_version and c.terms_version=new.terms_version and new.amount<=p.total_amount) is not true then
 raise exception 'refund original transaction mismatch' using errcode='PFB06'; end if;
 return new;
end $$;
create trigger field_billing_refund_guard before insert or update or delete on field.billing_refunds
 for each row execute function field.billing_refund_guard();
create function field.billing_refunded_amount_guard() returns trigger language plpgsql as $$
declare verified integer;
begin
 if new.refunded_amount is distinct from old.refunded_amount then
 select coalesce(sum(amount),0) into verified from field.billing_refunds where period_id=new.id and state='succeeded';
 if new.refunded_amount<>verified or new.refunded_amount<old.refunded_amount then
 raise exception 'refund total requires verified retained transactions' using errcode='PFB06'; end if;
 end if;
 return new;
end $$;
create trigger field_billing_refunded_amount_guard before update on field.billing_periods
 for each row execute function field.billing_refunded_amount_guard();
