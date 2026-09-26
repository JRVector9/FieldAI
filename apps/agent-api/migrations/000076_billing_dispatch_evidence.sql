-- 이전 worker의 started 원장은 실제 호출 여부를 알 수 없어 version0으로 보존한다.
alter table ap.billing_transactions add column dispatch_tracking_version smallint not null default 0 check(dispatch_tracking_version in (0,1));
alter table ap.billing_transactions alter column dispatch_tracking_version set default 1;
alter table ap.billing_transactions add column dispatched_at timestamptz;
alter table ap.billing_transactions add constraint ap_billing_dispatch_started check(dispatched_at is null or started_at is not null);
create function ap.billing_dispatch_guard() returns trigger language plpgsql as $$
begin
 if old.dispatched_at is not null and new.dispatched_at is distinct from old.dispatched_at
  or old.dispatch_tracking_version=1 and new.dispatch_tracking_version<>1
  or old.started_at is not null and new.dispatch_tracking_version is distinct from old.dispatch_tracking_version then
  raise exception 'billing dispatch evidence is immutable' using errcode='PAB05';
 end if;
 return new;
end $$;
create trigger ap_billing_dispatch_guard before update on ap.billing_transactions
 for each row execute function ap.billing_dispatch_guard();
