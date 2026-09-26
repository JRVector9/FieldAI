alter table ap.billing_authorizations add column claim_token uuid;
alter table ap.billing_authorizations add column next_attempt_at timestamptz not null default now();
create index ap_billing_authorization_work on ap.billing_authorizations(next_attempt_at,created_at,id)
 where state in ('pending','processing','unknown','blocked_integration');

create function ap.billing_authorization_execution_guard() returns trigger language plpgsql as $$
begin
 if old.started_at is not null and new.started_at is distinct from old.started_at then
  raise exception 'billing authorization first start is immutable' using errcode='PAB03';
 end if;
 if old.started_at is not null and new.state in ('pending','awaiting','blocked_integration','canceled') then
  raise exception 'started billing authorization must be reconciled' using errcode='PAB03';
 end if;
 return new;
end $$;
create trigger ap_billing_authorization_execution_guard before update on ap.billing_authorizations
 for each row execute function ap.billing_authorization_execution_guard();
