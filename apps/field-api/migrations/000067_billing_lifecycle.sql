-- 기존 승인/결제 원장은 유지하고 구독 기준일과 갱신 유예만 보호한다.
create function field.billing_subscription_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'paid subscription is retained' using errcode='PFB05'; end if;
 if (new.id,new.organization_id,new.plan_id,new.customer_key,new.created_by,new.created_at)
   is distinct from (old.id,old.organization_id,old.plan_id,old.customer_key,old.created_by,old.created_at)
   or old.anchor_at is not null and new.anchor_at is distinct from old.anchor_at
   or old.cancel_requested_at is not null and (new.cancel_requested_at,new.cancel_requested_by) is distinct from (old.cancel_requested_at,old.cancel_requested_by)
   or old.terminated_at is not null and new.terminated_at is distinct from old.terminated_at then
  raise exception 'subscription basis and stop requests are immutable' using errcode='PFB05';
 end if;
 return new;
end $$;
create trigger field_billing_subscription_guard before update or delete on field.paid_subscriptions
 for each row execute function field.billing_subscription_guard();

create function field.billing_month_boundary(anchor timestamptz,period_index integer) returns timestamptz
 language plpgsql immutable strict as $$
declare local_anchor timestamp; month_base timestamp; day_number integer;
begin
 if period_index<0 or period_index>1201 then raise exception 'invalid billing period' using errcode='PFB05'; end if;
 local_anchor=anchor at time zone 'Asia/Seoul';
 month_base=date_trunc('month',local_anchor)+make_interval(months=>period_index);
 day_number=least(extract(day from local_anchor)::integer,extract(day from month_base+interval '1 month - 1 day')::integer);
 return ((month_base::date+(day_number-1))+local_anchor::time) at time zone 'Asia/Seoul';
end $$;
create function field.billing_lifecycle_period_guard() returns trigger language plpgsql as $$
declare s field.paid_subscriptions; c field.billing_consents; expected_start timestamptz; expected_end timestamptz;
begin
 if tg_op='UPDATE' and new.grace_ends_at is distinct from old.grace_ends_at then
  raise exception 'billing grace is not extended by retries' using errcode='PFB05';
 end if;
 if new.billing_period>0 and (new.grace_ends_at is not null or new.paid_at is not null) then
  select * into s from field.paid_subscriptions where id=new.subscription_id;
  select * into c from field.billing_consents where id=new.consent_id;
  expected_start=field.billing_month_boundary(s.anchor_at,new.billing_period);
  expected_end=field.billing_month_boundary(s.anchor_at,new.billing_period+1);
  if (new.starts_at=expected_start and new.ends_at=expected_end
    and (new.grace_ends_at is null or new.grace_ends_at=least(expected_end,expected_start+make_interval(days=>c.grace_days)))) is not true then
   raise exception 'renewal dates must preserve the original monthly basis' using errcode='PFB05';
  end if;
 end if;
 return new;
end $$;
create trigger field_billing_lifecycle_period_guard before insert or update on field.billing_periods
 for each row execute function field.billing_lifecycle_period_guard();

-- 이전 worker의 started 원장은 실제 호출 여부를 알 수 없어 version0으로 보존한다.
alter table field.billing_transactions add column dispatch_tracking_version smallint not null default 0 check(dispatch_tracking_version in (0,1));
alter table field.billing_transactions alter column dispatch_tracking_version set default 1;
alter table field.billing_transactions add column dispatched_at timestamptz;
alter table field.billing_transactions add constraint field_billing_dispatch_started check(dispatched_at is null or started_at is not null);
create function field.billing_dispatch_guard() returns trigger language plpgsql as $$
begin
 if old.dispatched_at is not null and new.dispatched_at is distinct from old.dispatched_at
  or old.dispatch_tracking_version=1 and new.dispatch_tracking_version<>1
  or old.started_at is not null and new.dispatch_tracking_version is distinct from old.dispatch_tracking_version then
  raise exception 'billing dispatch evidence is immutable' using errcode='PFB05';
 end if;
 return new;
end $$;
create trigger field_billing_dispatch_guard before update on field.billing_transactions
 for each row execute function field.billing_dispatch_guard();
