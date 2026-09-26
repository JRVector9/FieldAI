alter table field.inquiries add column retention_closed_at timestamptz;
alter table field.reservations add column retention_closed_at timestamptz;
alter table field.external_work_requests
  add column field_work_state text not null default 'open' check(field_work_state in ('open','closed')),
  add column field_work_revision integer not null default 0 check(field_work_revision>=0),
  add column retention_closed_at timestamptz;

-- 현재 상태·revision과 일치하는 실제 종결 사건만 기존 업무의 근거로 사용한다.
update field.inquiries i set retention_closed_at=e.created_at
from field.inquiry_resolution_events e
where i.id=e.inquiry_id and i.state='closed' and e.event_type='closed' and i.revision=e.revision;
update field.reservations r set retention_closed_at=e.occurred_at
from field.reservation_events e where r.id=e.reservation_id and r.revision=e.revision
  and r.state=e.next_state and r.state in ('completed','canceled','rejected','expired','no_show');

create function field.record_retention_closure() returns trigger language plpgsql as $$
declare was_closed boolean; is_closed boolean;
begin
  if tg_table_name='inquiries' then
    was_closed := old.state='closed'; is_closed := new.state='closed';
  elsif tg_table_name='reservations' then
    was_closed := old.state in ('completed','canceled','rejected','expired','no_show');
    is_closed := new.state in ('completed','canceled','rejected','expired','no_show');
  else
    was_closed := old.field_work_state='closed'; is_closed := new.field_work_state='closed';
  end if;
  if is_closed and not was_closed then new.retention_closed_at := clock_timestamp();
  elsif not is_closed then new.retention_closed_at := null;
  end if;
  return new;
end $$;
create trigger field_inquiry_retention_closure before update of state on field.inquiries
  for each row execute function field.record_retention_closure();
create trigger field_reservation_retention_closure before update of state on field.reservations
  for each row execute function field.record_retention_closure();
create trigger field_received_retention_closure before update of field_work_state on field.external_work_requests
  for each row execute function field.record_retention_closure();

create table field.work_retention_policies (
  id uuid primary key,
  work_days integer not null check(work_days between 1 and 3650),
  photo_days integer not null check(photo_days between 1 and work_days),
  reference text not null check(length(reference) between 1 and 160),
  reason text not null check(length(reason) between 10 and 500),
  requested_by text not null,
  submission_key_hash text not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  approval_reason text check(length(approval_reason) between 10 and 500),
  retired_by text,
  retired_at timestamptz,
  retirement_reason text check(length(retirement_reason) between 10 and 500),
  unique(requested_by,submission_key_hash),
  check(approved_by is null or approved_by<>requested_by),
  check((approved_by is null and approved_at is null and approval_reason is null)
    or(approved_by is not null and approved_at is not null and approval_reason is not null)),
  check((retired_by is null and retired_at is null and retirement_reason is null)
    or(retired_by is not null and retired_at is not null and retirement_reason is not null))
);
create function field.protect_retention_policy() returns trigger language plpgsql as $$
begin
  if (new.id,new.work_days,new.photo_days,new.reference,new.reason,new.requested_by,new.submission_key_hash,new.request_hash,new.created_at)
    is distinct from (old.id,old.work_days,old.photo_days,old.reference,old.reason,old.requested_by,old.submission_key_hash,old.request_hash,old.created_at)
    or (old.approved_at is not null and (new.approved_by,new.approved_at,new.approval_reason) is distinct from (old.approved_by,old.approved_at,old.approval_reason))
    or (old.retired_at is not null and (new.retired_by,new.retired_at,new.retirement_reason) is distinct from (old.retired_by,old.retired_at,old.retirement_reason)) then
    raise exception 'retention policy is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger field_retention_policy_immutable before update on field.work_retention_policies
  for each row execute function field.protect_retention_policy();

create table field.work_retention_holds (
  id uuid primary key,
  organization_id uuid not null,
  target_kind text not null check(target_kind in ('inquiry','reservation','external_request')),
  target_id uuid not null,
  inquiry_id uuid, reservation_id uuid, external_request_id uuid,
  reason_code text not null check(reason_code in ('dispute','legal_record','investigation')),
  reason text not null check(length(reason) between 10 and 500),
  reference text not null check(length(reference) between 1 and 160),
  review_due_at timestamptz not null,
  created_by text not null,
  submission_key_hash text not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  released_by text,
  released_at timestamptz,
  release_reason text check(length(release_reason) between 10 and 500),
  unique(created_by,submission_key_hash),
  foreign key(inquiry_id,organization_id) references field.inquiries(id,organization_id) on delete cascade,
  foreign key(reservation_id,organization_id) references field.reservations(id,organization_id) on delete cascade,
  foreign key(external_request_id,organization_id) references field.external_work_requests(id,organization_id) on delete cascade,
  check(case target_kind
    when 'inquiry' then inquiry_id is not null and inquiry_id=target_id and reservation_id is null and external_request_id is null
    when 'reservation' then reservation_id is not null and reservation_id=target_id and inquiry_id is null and external_request_id is null
    when 'external_request' then external_request_id is not null and external_request_id=target_id and inquiry_id is null and reservation_id is null
    else false end),
  check(released_by is null or released_by<>created_by),
  check((released_by is null and released_at is null and release_reason is null)
    or(released_by is not null and released_at is not null and release_reason is not null))
);
create index field_retention_active_holds on field.work_retention_holds(organization_id,target_kind,target_id) where released_at is null;

create table field.work_retention_audit (
  id bigint generated always as identity primary key,
  policy_id uuid references field.work_retention_policies(id) on delete cascade,
  hold_id uuid references field.work_retention_holds(id) on delete cascade,
  organization_id uuid references field.organizations(id) on delete cascade,
  target_kind text, target_id uuid,
  actor_user_id text not null,
  action text not null check(action in ('policy_requested','policy_approved','policy_retired','hold_created','hold_released','preview_read','received_work_closed')),
  reason text not null,
  submission_key_hash text, request_hash text, result jsonb,
  created_at timestamptz not null default now(),
  unique(actor_user_id,submission_key_hash)
);
