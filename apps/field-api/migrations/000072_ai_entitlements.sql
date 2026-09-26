-- Field의 승인 제공량은 달력월 또는 AP 크레딧과 공유하지 않는다.
alter table field.billing_periods add column included_ai_units integer;
update field.billing_periods p set included_ai_units=c.included_ai_units
 from field.billing_consents c where c.id=p.consent_id;
alter table field.billing_periods alter column included_ai_units set not null;
alter table field.billing_periods add constraint field_period_ai_units_range check(included_ai_units between 1 and 10000000);
create function field.period_ai_units_snapshot() returns trigger language plpgsql as $$
declare units integer;
begin
 select included_ai_units into units from field.billing_consents where id=new.consent_id;
 if tg_op='INSERT' then
  if new.included_ai_units is not null and new.included_ai_units is distinct from units then
   raise exception 'AI units must match the approved consent' using errcode='PFB07';
  end if;
  new.included_ai_units=units;
 elsif new.included_ai_units is distinct from old.included_ai_units then
  raise exception 'period AI units are immutable' using errcode='PFB07';
 end if;
 return new;
end $$;
create trigger field_period_ai_units_snapshot before insert or update on field.billing_periods
 for each row execute function field.period_ai_units_snapshot();

create table field.ai_entitlements (
 -- Cost evidence retains only the opaque job ID; it does not extend the prompt/catalog retention.
 job_id uuid primary key,
 organization_id uuid not null,
 period_id uuid references field.billing_periods(id) on delete restrict,
 unit_policy text not null default 'model_call_v1' check(unit_policy='model_call_v1'),
 state text not null check(state in ('reserved','dispatched','consumed','released','unknown')),
 reserved_at timestamptz not null default now(), dispatched_at timestamptz,
 completed_at timestamptz, provider_response_id text,
 input_tokens integer check(input_tokens>=0), output_tokens integer check(output_tokens>=0),
 reason text, check(state<>'consumed' or (provider_response_id is not null
  and length(provider_response_id) between 1 and 200 and input_tokens is not null and output_tokens is not null)),
 check(state not in ('dispatched','unknown') or dispatched_at is not null)
);
create index field_ai_entitlements_period on field.ai_entitlements(period_id,state);

-- 공급사 실적이 이미 기록된 유료 호출과 미상 실행을 새 제공량으로 초기화하지 않는다.
insert into field.ai_entitlements(job_id,organization_id,period_id,state,reserved_at,dispatched_at,
 completed_at,provider_response_id,input_tokens,output_tokens,reason)
select j.id,j.organization_id,p.id,
 case when j.provider_response_id is not null and length(j.provider_response_id) between 1 and 200
   and j.input_tokens is not null and j.output_tokens is not null then 'consumed'
  when j.status='queued' then 'reserved'
  when j.started_at is not null then 'unknown' else 'released' end,
 j.created_at,j.started_at,j.completed_at,j.provider_response_id,j.input_tokens,j.output_tokens,'legacy_usage_snapshot'
from field.site_generation_jobs j
left join lateral (
 select bp.id from field.billing_periods bp join field.paid_subscriptions s on s.id=bp.subscription_id
 join field.billing_consents c on c.id=bp.consent_id
 where s.organization_id=j.organization_id and bp.paid_at<=coalesce(j.started_at,j.created_at)
 and bp.starts_at<=coalesce(j.started_at,j.created_at)
 and (coalesce(j.started_at,j.created_at)<bp.ends_at or (
  coalesce(j.started_at,j.created_at)<bp.ends_at+make_interval(days=>c.grace_days)
  and not exists(select 1 from field.billing_periods later where later.subscription_id=s.id
   and later.billing_period>bp.billing_period and later.paid_at is not null
   and later.starts_at<=coalesce(j.started_at,j.created_at)
   and later.paid_at<=coalesce(j.started_at,j.created_at))))
 order by bp.starts_at desc,bp.id desc limit 1
) p on true where j.status<>'queued';

create function field.ai_entitlement_guard() returns trigger language plpgsql as $$
declare job_org uuid; period_org uuid;
begin
 if tg_op='DELETE' then raise exception 'AI usage is retained' using errcode='PFB07'; end if;
 if tg_op='INSERT' then
  select organization_id into job_org from field.site_generation_jobs where id=new.job_id;
  select s.organization_id into period_org from field.billing_periods p
   join field.paid_subscriptions s on s.id=p.subscription_id where p.id=new.period_id;
  if job_org is distinct from new.organization_id or (new.period_id is not null and period_org is distinct from new.organization_id) then
   raise exception 'AI entitlement organization mismatch' using errcode='PFB07';
  end if;
 elsif (new.job_id,new.organization_id,new.period_id,new.unit_policy,new.reserved_at)
  is distinct from (old.job_id,old.organization_id,old.period_id,old.unit_policy,old.reserved_at)
  or old.dispatched_at is not null and new.dispatched_at is distinct from old.dispatched_at
  or old.state in ('consumed','released') and to_jsonb(new) is distinct from to_jsonb(old)
  or old.state='reserved' and new.state not in ('reserved','dispatched','released')
  or old.state='dispatched' and new.state not in ('dispatched','consumed','unknown','released')
  or old.state='unknown' and new.state not in ('unknown','consumed') then
  raise exception 'AI entitlement binding and terminal evidence are immutable' using errcode='PFB07';
 end if;
 return new;
end $$;
create trigger field_ai_entitlement_guard before insert or update or delete on field.ai_entitlements
 for each row execute function field.ai_entitlement_guard();

create table field.ai_entitlement_events (
 id bigserial primary key, job_id uuid not null references field.ai_entitlements(job_id),
 event_type text not null check(event_type in ('reserved','dispatched','consumed','released','unknown')),
 reason text, occurred_at timestamptz not null default now()
);
create trigger field_ai_entitlement_events_immutable before update or delete on field.ai_entitlement_events
 for each row execute function field.billing_immutable_record();
