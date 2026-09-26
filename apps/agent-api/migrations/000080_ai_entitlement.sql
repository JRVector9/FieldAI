-- Own AP approved-consent snapshot and model-call accounting, independent of Field.
alter table ap.billing_periods add column included_ai_units integer;
update ap.billing_periods p set included_ai_units=c.included_ai_units from ap.billing_consents c where c.id=p.consent_id;
alter table ap.billing_periods alter column included_ai_units set not null;
alter table ap.billing_periods add constraint ap_period_ai_units_check check(included_ai_units between 1 and 10000000);
create function ap.protect_period_ai_snapshot() returns trigger language plpgsql as $$
declare expected integer;
begin
 if TG_OP='UPDATE' then
  if new.included_ai_units is distinct from old.included_ai_units then raise exception 'immutable AI entitlement' using errcode='PAA01';end if;
 else
  select included_ai_units into expected from ap.billing_consents where id=new.consent_id;
  if new.included_ai_units is null then new.included_ai_units=expected;end if;
  if new.included_ai_units is distinct from expected then raise exception 'unapproved AI entitlement' using errcode='PAA01';end if;
 end if;return new;
end $$;
create trigger ap_period_ai_snapshot before insert or update on ap.billing_periods for each row execute function ap.protect_period_ai_snapshot();
create table ap.ai_usage_ledger(
 run_id uuid primary key,organization_id uuid not null references ap.organizations(id),
 lane text not null check(lane in('customer_message','owner_test')),
 period_id uuid references ap.billing_periods(id),included_units integer,
 unit_policy text not null default 'model_call_v1' check(unit_policy='model_call_v1'),
 state text not null check(state in('reserved','dispatched','consumed','released','unknown')),
 provider_model text not null,response_hash text,input_tokens integer,output_tokens integer,
 reserved_at timestamptz not null default now(),dispatched_at timestamptz,settled_at timestamptz,
 check((period_id is null and included_units is null) or (period_id is not null and included_units between 1 and 10000000 and lane='customer_message')),
 check(response_hash is null or response_hash ~ '^[a-f0-9]{64}$'),
 check(input_tokens is null or input_tokens>=0),check(output_tokens is null or output_tokens>=0),
 check(state<>'consumed' or (response_hash is not null and input_tokens is not null and output_tokens is not null and settled_at is not null))
);
create index ap_ai_usage_period_idx on ap.ai_usage_ledger(period_id,state);
-- Preserve already sent legacy runs before capacity enforcement. No old credits reset.
insert into ap.ai_usage_ledger(run_id,organization_id,lane,period_id,included_units,state,provider_model,response_hash,input_tokens,output_tokens,reserved_at,dispatched_at,settled_at)
select r.id,r.organization_id,r.kind,p.id,p.included_ai_units,
 case when length(btrim(r.provider_response_id)) between 1 and 200 and r.input_tokens>=0 and r.output_tokens>=0 then 'consumed' else 'unknown' end,
 coalesce(r.provider_model,'legacy_unrecorded'),case when nullif(r.provider_response_id,'') is not null then encode(sha256(convert_to(r.provider_response_id,'UTF8')),'hex') end,
 case when r.input_tokens>=0 then r.input_tokens end,case when r.output_tokens>=0 then r.output_tokens end,r.started_at,r.started_at,coalesce(r.finished_at,r.started_at)
from ap.ai_runs r left join lateral(
 select p.id,p.included_ai_units from ap.billing_periods p join ap.paid_subscriptions s on s.id=p.subscription_id
 join ap.billing_consents c on c.id=p.consent_id
 where r.kind='customer_message' and s.organization_id=r.organization_id and p.paid_at<=r.started_at and p.starts_at<=r.started_at
 and (r.started_at<p.ends_at or (r.started_at<p.ends_at+make_interval(days=>c.grace_days)
 and (s.cancel_requested_at is null or s.cancel_requested_at>r.started_at) and (s.terminated_at is null or s.terminated_at>r.started_at)
 and not exists(select 1 from ap.billing_periods next where next.subscription_id=s.id and next.billing_period>p.billing_period and next.paid_at<=r.started_at)))
 order by p.starts_at desc,p.id desc limit 1
) p on true;
create function ap.protect_ai_usage_ledger() returns trigger language plpgsql as $$
declare run ap.ai_runs;expected integer;owner_org uuid;used bigint;
begin
 if TG_OP='DELETE' then raise exception 'AI usage retained' using errcode='PAA02';end if;
 perform id from ap.organizations where id=new.organization_id for update;
 if TG_OP='INSERT' then
  select * into run from ap.ai_runs where id=new.run_id;
  if run.organization_id is distinct from new.organization_id or run.kind is distinct from new.lane or run.provider_model is distinct from new.provider_model then raise exception 'AI usage binding mismatch' using errcode='PAA02';end if;
  if new.state<>'reserved' then raise exception 'new usage must reserve first' using errcode='PAA02';end if;
  if new.period_id is not null then
   select p.included_ai_units,s.organization_id into expected,owner_org from ap.billing_periods p join ap.paid_subscriptions s on s.id=p.subscription_id where p.id=new.period_id;
   if expected is distinct from new.included_units or owner_org is distinct from new.organization_id then raise exception 'AI period binding mismatch' using errcode='PAA02';end if;
   select count(*) into used from ap.ai_usage_ledger where period_id=new.period_id and state<>'released';
   if used>=expected then raise exception 'AI included units exhausted' using errcode='PAA03';end if;
  end if;
 else
  if (new.run_id,new.organization_id,new.lane,new.period_id,new.included_units,new.unit_policy,new.provider_model,new.reserved_at) is distinct from (old.run_id,old.organization_id,old.lane,old.period_id,old.included_units,old.unit_policy,old.provider_model,old.reserved_at) then raise exception 'immutable AI usage binding' using errcode='PAA02';end if;
  if old.state in('consumed','released') and new is distinct from old then raise exception 'immutable settled AI usage' using errcode='PAA02';end if;
  if not(new.state=old.state or (old.state='reserved' and new.state in('dispatched','released')) or (old.state='dispatched' and new.state in('consumed','released','unknown')) or (old.state='unknown' and new.state='consumed')) then raise exception 'invalid AI usage transition' using errcode='PAA02';end if;
  if old.dispatched_at is not null and new.dispatched_at is distinct from old.dispatched_at then raise exception 'immutable AI dispatch' using errcode='PAA02';end if;
 end if;return new;
end $$;
create trigger ap_ai_usage_guard before insert or update or delete on ap.ai_usage_ledger for each row execute function ap.protect_ai_usage_ledger();
