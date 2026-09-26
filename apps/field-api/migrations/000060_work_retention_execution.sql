alter table field.inquiries add column retention_work_purged_at timestamptz, add column retention_photos_purged_at timestamptz;
alter table field.reservations add column retention_work_purged_at timestamptz, add column retention_photos_purged_at timestamptz;
alter table field.external_work_requests add column retention_work_purged_at timestamptz, add column retention_photos_purged_at timestamptz;

alter table field.inquiry_attachments drop constraint inquiry_attachments_state_check,
  alter column object_key drop not null, alter column sha256 drop not null,
  alter column byte_size drop not null, alter column width drop not null, alter column height drop not null,
  add column purged_at timestamptz,
  add check(state in ('ready','purged')),
  add check((state='ready' and object_key is not null and sha256 is not null and byte_size is not null and width is not null and height is not null and purged_at is null)
    or(state='purged' and object_key is null and sha256 is null and byte_size is null and width is null and height is null and purged_at is not null));
alter table field.reservation_attachments drop constraint reservation_attachments_state_check,
  alter column object_key drop not null, alter column sha256 drop not null,
  alter column byte_size drop not null, alter column width drop not null, alter column height drop not null,
  add column purged_at timestamptz,
  add check(state in ('ready','purged')),
  add check((state='ready' and object_key is not null and sha256 is not null and byte_size is not null and width is not null and height is not null and purged_at is null)
    or(state='purged' and object_key is null and sha256 is null and byte_size is null and width is null and height is null and purged_at is not null));
alter table field.external_request_attachments drop constraint external_request_attachments_state_check,
  drop constraint external_request_attachments_check, add column purged_at timestamptz,
  add check(state in ('pending','copying','copied','copy_failed','purged')),
  add check((state='copied' and object_key is not null and sha256 is not null and byte_size is not null and width is not null and height is not null and copied_at is not null and purged_at is null)
    or(state in ('pending','copying','copy_failed') and copied_at is null and purged_at is null)
    or(state='purged' and object_key is null and sha256 is null and byte_size is null and width is null and height is null and purged_at is not null));

create table field.work_retention_jobs (
  id uuid primary key,
  organization_id uuid not null,
  target_kind text not null check(target_kind in ('inquiry','reservation','external_request')),
  target_id uuid not null,
  inquiry_id uuid, reservation_id uuid, external_request_id uuid,
  policy_id uuid not null references field.work_retention_policies(id),
  scope text not null check(scope in ('photos','work')),
  expected_revision integer not null,
  expected_anchor_at timestamptz not null,
  basis_hash text not null check(basis_hash ~ '^[a-f0-9]{64}$'),
  requested_by text not null,
  reason text not null check(length(reason) between 10 and 500),
  submission_key_hash text not null,
  request_hash text not null,
  state text not null default 'pending' check(state in ('pending','approved','retry','blocked','stale','canceled','completed')),
  approved_by text,
  approved_at timestamptz,
  approval_reason text check(length(approval_reason) between 10 and 500),
  canceled_by text,
  canceled_at timestamptz,
  cancellation_reason text check(length(cancellation_reason) between 10 and 500),
  attempt_count integer not null default 0 check(attempt_count>=0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(requested_by,submission_key_hash),
  foreign key(inquiry_id,organization_id) references field.inquiries(id,organization_id) on delete cascade,
  foreign key(reservation_id,organization_id) references field.reservations(id,organization_id) on delete cascade,
  foreign key(external_request_id,organization_id) references field.external_work_requests(id,organization_id) on delete cascade,
  check(case target_kind
    when 'inquiry' then inquiry_id is not null and inquiry_id=target_id and reservation_id is null and external_request_id is null
    when 'reservation' then reservation_id is not null and reservation_id=target_id and inquiry_id is null and external_request_id is null
    when 'external_request' then external_request_id is not null and external_request_id=target_id and inquiry_id is null and reservation_id is null
    else false end),
  check(approved_by is null or approved_by<>requested_by),
  check((approved_by is null and approved_at is null and approval_reason is null)
    or(approved_by is not null and approved_at is not null and approval_reason is not null)),
  check((canceled_by is null and canceled_at is null and cancellation_reason is null)
    or(canceled_by is not null and canceled_at is not null and cancellation_reason is not null)),
  check((state='completed')=(completed_at is not null)),
  check(state not in ('approved','retry','completed') or approved_at is not null)
);
create index field_retention_jobs_due on field.work_retention_jobs(next_attempt_at,created_at) where state in ('approved','retry');
create table field.work_retention_job_audit (
  id bigint generated always as identity primary key,
  job_id uuid not null references field.work_retention_jobs(id) on delete cascade,
  actor_user_id text,
  action text not null check(action in ('requested','approved','canceled','blocked','stale','retry','file_deleted','completed')),
  reason text not null,
  attachment_id uuid,
  created_at timestamptz not null default now()
);

-- 승인한 대상/기준과 최초 승인·취소 사실은 실행 재시도에도 변경하지 않는다.
create function field.protect_retention_job() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new)-array['state','approved_by','approved_at','approval_reason','canceled_by','canceled_at','cancellation_reason','attempt_count','next_attempt_at','last_error','completed_at'])
    is distinct from (to_jsonb(old)-array['state','approved_by','approved_at','approval_reason','canceled_by','canceled_at','cancellation_reason','attempt_count','next_attempt_at','last_error','completed_at'])
    or (old.approved_at is not null and (new.approved_by,new.approved_at,new.approval_reason) is distinct from (old.approved_by,old.approved_at,old.approval_reason))
    or (old.canceled_at is not null and (new.canceled_by,new.canceled_at,new.cancellation_reason) is distinct from (old.canceled_by,old.canceled_at,old.cancellation_reason))
    or (old.state in ('completed','canceled') and (new.state,new.completed_at) is distinct from (old.state,old.completed_at)) then
    raise exception 'retention job basis is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger field_retention_job_immutable before update on field.work_retention_jobs
  for each row execute function field.protect_retention_job();

-- 업무 원문 정리 뒤에도 기존 확인키 회수/교체는 허용하고 원문·업무 상태의 부활은 거부한다.
create function field.protect_retention_tombstone() returns trigger language plpgsql as $$
begin
  if old.retention_work_purged_at is not null
    and (to_jsonb(new)-array['visitor_key_hash','updated_at']) is distinct from (to_jsonb(old)-array['visitor_key_hash','updated_at']) then
    raise exception 'retention work ended' using errcode='PFR01';
  end if;
  if old.retention_photos_purged_at is not null and new.retention_photos_purged_at is null then
    raise exception 'retention photos cannot be restored' using errcode='PFR01';
  end if;
  return new;
end $$;
create trigger field_inquiry_retention_tombstone before update on field.inquiries
  for each row execute function field.protect_retention_tombstone();
create trigger field_reservation_retention_tombstone before update on field.reservations
  for each row execute function field.protect_retention_tombstone();
create trigger field_received_retention_tombstone before update on field.external_work_requests
  for each row execute function field.protect_retention_tombstone();

create function field.retention_work_is_purged(kind text, work_id uuid, org uuid) returns boolean language plpgsql as $$
declare purged timestamptz;
begin
  if kind='inquiry' then select retention_work_purged_at into purged from field.inquiries where id=work_id and (org is null or organization_id=org) for share;
  elsif kind='reservation' then select retention_work_purged_at into purged from field.reservations where id=work_id and (org is null or organization_id=org) for share;
  elsif kind='external_request' then select retention_work_purged_at into purged from field.external_work_requests where id=work_id and (org is null or organization_id=org) for share;
  else raise exception 'invalid retention work kind'; end if;
  return purged is not null;
end $$;

create function field.protect_retention_child() returns trigger language plpgsql as $$
declare ended boolean; work_id uuid; org uuid; allowed text[];
begin
  work_id := (to_jsonb(new)->>tg_argv[1])::uuid;
  org := (to_jsonb(new)->>'organization_id')::uuid;
  ended := field.retention_work_is_purged(tg_argv[0],work_id,org);
  if tg_argv[2]='photo' then
    if tg_op='UPDATE' and old.state='purged' and new is distinct from old then
      raise exception 'retention photo ended' using errcode='PFR01';
    end if;
    allowed := array['state','object_key','sha256','byte_size','width','height','purged_at'];
    if ended and not (tg_op='UPDATE' and new.state='purged' and new.object_key is null and new.sha256 is null
      and new.byte_size is null and new.width is null and new.height is null and new.purged_at is not null
      and (to_jsonb(new)-allowed) is not distinct from (to_jsonb(old)-allowed)) then
      raise exception 'retention work ended' using errcode='PFR01';
    end if;
  elsif ended then
    if tg_argv[2]='message' and tg_op='UPDATE' and to_jsonb(new)->>'body'='[보존 기간 종료]'
      and (to_jsonb(new)-'body') is not distinct from (to_jsonb(old)-'body') then return new;
    elsif tg_argv[2]='event' and tg_op='UPDATE' and to_jsonb(new)->'detail'='{"retention":"purged"}'::jsonb
      and (to_jsonb(new)-'detail') is not distinct from (to_jsonb(old)-'detail') then return new;
    elsif tg_argv[2]='occupancy' and tg_op='UPDATE' and to_jsonb(new)->>'label' is null
      and (to_jsonb(new)-'label') is not distinct from (to_jsonb(old)-'label') then return new;
    end if;
    raise exception 'retention work ended' using errcode='PFR01';
  end if;
  return new;
end $$;
create trigger field_inquiry_message_retention before insert or update on field.inquiry_messages
  for each row execute function field.protect_retention_child('inquiry','inquiry_id','message');
create trigger field_reservation_message_retention before insert or update on field.reservation_messages
  for each row execute function field.protect_retention_child('reservation','reservation_id','message');
create trigger field_inquiry_photo_retention before insert or update on field.inquiry_attachments
  for each row execute function field.protect_retention_child('inquiry','inquiry_id','photo');
create trigger field_reservation_photo_retention before insert or update on field.reservation_attachments
  for each row execute function field.protect_retention_child('reservation','reservation_id','photo');
create trigger field_received_photo_retention before insert or update on field.external_request_attachments
  for each row execute function field.protect_retention_child('external_request','external_request_id','photo');
create trigger field_received_reply_retention before insert or update on field.ap_reply_drafts
  for each row execute function field.protect_retention_child('external_request','external_request_id','opaque');
create trigger field_reservation_event_retention before insert or update on field.reservation_events
  for each row execute function field.protect_retention_child('reservation','reservation_id','event');
create trigger field_reservation_occupancy_retention before insert or update on field.occupancies
  for each row execute function field.protect_retention_child('reservation','reservation_id','occupancy');

-- 지원 신청/승인·보류 생성은 worker의 업무 잠금과 직렬화한다. 종료 뒤 회수/해제는 유지한다.
create function field.protect_retention_access() returns trigger language plpgsql as $$
begin
  if (tg_op='INSERT' or (tg_table_name='customer_support_access_requests' and to_jsonb(old)->>'approved_at' is null and to_jsonb(new)->>'approved_at' is not null))
    and field.retention_work_is_purged(new.target_kind,new.target_id,new.organization_id) then
    raise exception 'retention work ended' using errcode='PFR01';
  end if;
  return new;
end $$;
create trigger field_support_retention before insert or update on field.customer_support_access_requests
  for each row execute function field.protect_retention_access();
create trigger field_hold_retention before insert on field.work_retention_holds
  for each row execute function field.protect_retention_access();

-- 독립 서명 원장 재적용은 기존 업무/감사 ID를 유지하고 적용한 entry ID만 기록한다.
create table field.retention_restore_audit (
  journal_entry_id uuid primary key,
  job_id uuid not null,
  organization_id uuid not null,
  target_kind text not null check(target_kind in ('inquiry','reservation','external_request')),
  target_id uuid not null,
  action text not null check(action in ('file_deleted','purge_prepared','completed')),
  outcome text not null check(outcome in ('applied','work_absent')),
  applied_at timestamptz not null default clock_timestamp()
);
