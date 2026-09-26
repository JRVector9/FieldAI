alter table ap.inquiries add column retention_work_purged_at timestamptz, add column retention_photos_purged_at timestamptz;
alter table ap.inquiries drop constraint ap_inquiries_automation_paused_check;
alter table ap.inquiries add constraint ap_inquiries_automation_paused_check check(
  (mode='ai' and not automation_paused and state='ai_assisting')
  or(mode='external' and automation_paused and state='external_ready')
  or(mode='human' and automation_paused and state in ('needs_owner','human_active','waiting_customer','closed','spam'))
  or(retention_work_purged_at is not null and automation_paused and state='closed'));
alter table ap.inquiry_attachments drop constraint inquiry_attachments_state_check,
  alter column object_key drop not null, alter column sha256 drop not null,
  alter column byte_size drop not null, alter column width drop not null, alter column height drop not null,
  add column purged_at timestamptz,
  add check(state in ('ready','purged')),
  add check((state='ready' and object_key is not null and sha256 is not null and byte_size is not null and width is not null and height is not null and purged_at is null)
    or(state='purged' and object_key is null and sha256 is null and byte_size is null and width is null and height is null and purged_at is not null));
create table ap.work_retention_jobs (
  id uuid primary key, organization_id uuid not null, target_kind text not null check(target_kind='inquiry'), target_id uuid not null,
  inquiry_id uuid not null, policy_id uuid not null references ap.work_retention_policies(id),
  scope text not null check(scope in ('photos','work')), expected_revision integer not null, expected_anchor_at timestamptz not null,
  basis_hash text not null check(basis_hash ~ '^[a-f0-9]{64}$'), requested_by text not null, reason text not null check(length(reason) between 10 and 500),
  submission_key_hash text not null, request_hash text not null, unique(requested_by,submission_key_hash),
  state text not null default 'pending' check(state in ('pending','approved','retry','blocked','stale','canceled','completed')),
  approved_by text,approved_at timestamptz,approval_reason text check(length(approval_reason) between 10 and 500),
  canceled_by text,canceled_at timestamptz,cancellation_reason text check(length(cancellation_reason) between 10 and 500),
  attempt_count integer not null default 0 check(attempt_count>=0),next_attempt_at timestamptz not null default now(),last_error text,completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(inquiry_id,organization_id) references ap.inquiries(id,organization_id) on delete cascade,check(inquiry_id=target_id),
  check(approved_by is null or approved_by<>requested_by),
  check((approved_by is null and approved_at is null and approval_reason is null) or(approved_by is not null and approved_at is not null and approval_reason is not null)),
  check((canceled_by is null and canceled_at is null and cancellation_reason is null) or(canceled_by is not null and canceled_at is not null and cancellation_reason is not null)),
  check((state='completed')=(completed_at is not null)),check(state not in ('approved','retry','completed') or approved_at is not null)
);
create index ap_retention_jobs_due on ap.work_retention_jobs(next_attempt_at,created_at) where state in ('approved','retry');
create table ap.work_retention_job_audit (
 id bigint generated always as identity primary key,job_id uuid not null references ap.work_retention_jobs(id) on delete cascade,
 actor_user_id text, action text not null check(action in ('requested','approved','canceled','blocked','stale','retry','file_deleted','completed')),
 reason text not null,attachment_id uuid,created_at timestamptz not null default now()
);
create function ap.protect_retention_job() returns trigger language plpgsql as $$
begin
 if (to_jsonb(new)-array['state','approved_by','approved_at','approval_reason','canceled_by','canceled_at','cancellation_reason','attempt_count','next_attempt_at','last_error','completed_at'])
   is distinct from (to_jsonb(old)-array['state','approved_by','approved_at','approval_reason','canceled_by','canceled_at','cancellation_reason','attempt_count','next_attempt_at','last_error','completed_at'])
   or(old.approved_at is not null and (new.approved_by,new.approved_at,new.approval_reason) is distinct from (old.approved_by,old.approved_at,old.approval_reason))
   or(old.canceled_at is not null and (new.canceled_by,new.canceled_at,new.cancellation_reason) is distinct from (old.canceled_by,old.canceled_at,old.cancellation_reason))
   or(old.state in ('completed','canceled') and (new.state,new.completed_at) is distinct from (old.state,old.completed_at)) then
   raise exception 'retention job basis is immutable' using errcode='23514';
 end if;return new;
end $$;
create trigger ap_retention_job_immutable before update on ap.work_retention_jobs for each row execute function ap.protect_retention_job();
create function ap.protect_retention_tombstone() returns trigger language plpgsql as $$
begin
 if old.retention_work_purged_at is not null and (to_jsonb(new)-array['visitor_key_hash','updated_at']) is distinct from (to_jsonb(old)-array['visitor_key_hash','updated_at']) then
   raise exception 'retention work ended' using errcode='PAP01';end if;
 if old.retention_photos_purged_at is not null and new.retention_photos_purged_at is null then
   raise exception 'retention photos cannot be restored' using errcode='PAP01';end if;
 return new;
end $$;
create trigger ap_inquiry_retention_tombstone before update on ap.inquiries for each row execute function ap.protect_retention_tombstone();
create function ap.retention_work_is_purged(work_id uuid,org uuid) returns boolean language plpgsql as $$
declare purged timestamptz;
begin
 select retention_work_purged_at into purged from ap.inquiries where id=work_id and(org is null or organization_id=org) for share;
 return purged is not null;
end $$;
create function ap.protect_retention_child() returns trigger language plpgsql as $$
declare ended boolean;allowed text[];
begin
 ended:=ap.retention_work_is_purged(new.inquiry_id,(to_jsonb(new)->>'organization_id')::uuid);
 if tg_argv[0]='photo' then
   if tg_op='UPDATE' and old.state='purged' and new is distinct from old then raise exception 'retention photo ended' using errcode='PAP01';end if;
   allowed:=array['state','object_key','sha256','byte_size','width','height','purged_at'];
   if ended and not(tg_op='UPDATE' and new.state='purged' and new.object_key is null and new.sha256 is null
     and new.byte_size is null and new.width is null and new.height is null and new.purged_at is not null
     and(to_jsonb(new)-allowed) is not distinct from(to_jsonb(old)-allowed)) then raise exception 'retention work ended' using errcode='PAP01';end if;
 elsif ended then
   if tg_argv[0]='message' and tg_op='UPDATE' and to_jsonb(new)->>'body'='[보존 기간 종료]'
     and(to_jsonb(new)-'body') is not distinct from(to_jsonb(old)-'body') then return new;
   elsif tg_argv[0]='ai' and tg_op='UPDATE' and to_jsonb(new)->>'question'='[보존 기간 종료]' and to_jsonb(new)->>'answer' is null
     and(to_jsonb(new)-array['question','answer','status','error_code','provider_response_id','input_tokens','output_tokens','finished_at'])
       is not distinct from(to_jsonb(old)-array['question','answer','status','error_code','provider_response_id','input_tokens','output_tokens','finished_at']) then return new;
   elsif tg_argv[0]='action' and tg_op='UPDATE' and to_jsonb(new)->'field_request_body'='{}'::jsonb and to_jsonb(new)->'service_snapshot'='{}'::jsonb
     and(to_jsonb(new)-array['field_request_body','service_snapshot']) is not distinct from(to_jsonb(old)-array['field_request_body','service_snapshot']) then return new;
   end if;
   raise exception 'retention work ended' using errcode='PAP01';
 end if;return new;
end $$;
create trigger ap_inquiry_message_retention before insert or update on ap.inquiry_messages for each row execute function ap.protect_retention_child('message');
create trigger ap_inquiry_photo_retention before insert or update on ap.inquiry_attachments for each row execute function ap.protect_retention_child('photo');
create trigger ap_customer_ai_retention before insert or update on ap.ai_runs for each row when(new.inquiry_id is not null) execute function ap.protect_retention_child('ai');
create trigger ap_field_action_retention before insert or update on ap.field_action_requests for each row execute function ap.protect_retention_child('action');
create function ap.protect_retention_access() returns trigger language plpgsql as $$
begin
 if (tg_op='INSERT' or(tg_table_name='customer_support_access_requests' and to_jsonb(old)->>'approved_at' is null and to_jsonb(new)->>'approved_at' is not null))
   and ap.retention_work_is_purged(new.inquiry_id,new.organization_id) then raise exception 'retention work ended' using errcode='PAP01';end if;
 return new;
end $$;
create trigger ap_support_retention before insert or update on ap.customer_support_access_requests for each row execute function ap.protect_retention_access();
create trigger ap_hold_retention before insert on ap.work_retention_holds for each row execute function ap.protect_retention_access();
create table ap.retention_restore_audit (
 journal_entry_id uuid primary key,job_id uuid not null,organization_id uuid not null,target_kind text not null check(target_kind='inquiry'),target_id uuid not null,
 action text not null check(action in ('file_deleted','purge_prepared','completed')),outcome text not null check(outcome in ('applied','work_absent')),
 applied_at timestamptz not null default clock_timestamp()
);
