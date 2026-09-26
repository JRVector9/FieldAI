alter table ap.inquiries add column retention_closed_at timestamptz;
-- 현재 state/revision과 일치하는 실제 종결 사건만 사용한다.
update ap.inquiries i set retention_closed_at=e.created_at from ap.inquiry_resolution_events e
where i.id=e.inquiry_id and i.state='closed' and e.event_type='closed' and i.revision=e.revision;
create function ap.record_retention_closure() returns trigger language plpgsql as $$
begin
  if NEW.state='closed' and OLD.state<>'closed' then NEW.retention_closed_at=clock_timestamp();
  elsif NEW.state<>'closed' then NEW.retention_closed_at=null;
  end if;
  return NEW;
end $$;
create trigger ap_inquiry_retention_closure before update of state on ap.inquiries
  for each row execute function ap.record_retention_closure();

create table ap.work_retention_policies (
  id uuid primary key,
  anonymous_days integer not null check(anonymous_days between 1 and 3650),
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
create function ap.protect_retention_policy() returns trigger language plpgsql as $$
begin
  if (new.id,new.anonymous_days,new.work_days,new.photo_days,new.reference,new.reason,new.requested_by,new.submission_key_hash,new.request_hash,new.created_at)
    is distinct from (old.id,old.anonymous_days,old.work_days,old.photo_days,old.reference,old.reason,old.requested_by,old.submission_key_hash,old.request_hash,old.created_at)
    or (old.approved_at is not null and (new.approved_by,new.approved_at,new.approval_reason) is distinct from (old.approved_by,old.approved_at,old.approval_reason))
    or (old.retired_at is not null and (new.retired_by,new.retired_at,new.retirement_reason) is distinct from (old.retired_by,old.retired_at,old.retirement_reason)) then
    raise exception 'retention policy is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger ap_retention_policy_immutable before update on ap.work_retention_policies
  for each row execute function ap.protect_retention_policy();

create table ap.work_retention_holds (
 id uuid primary key, organization_id uuid not null, target_kind text not null check(target_kind='inquiry'),
 target_id uuid not null, inquiry_id uuid not null,
 reason_code text not null check(reason_code in ('dispute','legal_record','investigation')),
 reason text not null check(length(reason) between 10 and 500), reference text not null check(length(reference) between 1 and 160),
 review_due_at timestamptz not null, created_by text not null, submission_key_hash text not null, request_hash text not null,
 created_at timestamptz not null default now(), released_by text, released_at timestamptz,
 release_reason text check(length(release_reason) between 10 and 500),
 unique(created_by,submission_key_hash), foreign key(inquiry_id,organization_id) references ap.inquiries(id,organization_id) on delete cascade,
 check(inquiry_id=target_id), check(released_by is null or released_by<>created_by),
 check((released_by is null and released_at is null and release_reason is null)
 or(released_by is not null and released_at is not null and release_reason is not null))
);
create index ap_retention_active_holds on ap.work_retention_holds(organization_id,target_id) where released_at is null;
create function ap.protect_retention_hold() returns trigger language plpgsql as $$
begin
  if (new.id,new.organization_id,new.target_kind,new.target_id,new.inquiry_id,new.reason_code,new.reason,new.reference,new.review_due_at,
      new.created_by,new.submission_key_hash,new.request_hash,new.created_at)
    is distinct from (old.id,old.organization_id,old.target_kind,old.target_id,old.inquiry_id,old.reason_code,old.reason,old.reference,old.review_due_at,
      old.created_by,old.submission_key_hash,old.request_hash,old.created_at)
    or (old.released_at is not null and (new.released_by,new.released_at,new.release_reason)
      is distinct from (old.released_by,old.released_at,old.release_reason)) then
    raise exception 'retention hold is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger ap_retention_hold_immutable before update on ap.work_retention_holds
  for each row execute function ap.protect_retention_hold();
create table ap.work_retention_audit (
  id bigint generated always as identity primary key,
  policy_id uuid references ap.work_retention_policies(id) on delete cascade,
  hold_id uuid references ap.work_retention_holds(id) on delete cascade,
  organization_id uuid references ap.organizations(id) on delete cascade,
  target_kind text, target_id uuid,
  actor_user_id text not null,
  action text not null check(action in ('policy_requested','policy_approved','policy_retired','hold_created','hold_released','preview_read')),
  reason text not null,
  submission_key_hash text, request_hash text, result jsonb,
  created_at timestamptz not null default now(),
  unique(actor_user_id,submission_key_hash)
);
