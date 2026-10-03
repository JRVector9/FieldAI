-- F-O16 Field 사업자 조직·계정 삭제(추가). 조직 행은 청구 원장·감사·보존 중인 문의 원본이 FK로 참조하므로 지우지 않고
-- deleted_at으로 표시한다. 문의·예약 원본은 기존 보존 정책(work_retention_*) 경로로만 나중에 정리한다.
alter table field.organizations add column deleted_at timestamptz;

-- 조직 삭제 요청: owner 명시 확인 → 14일 유예(scheduled) → 작업자 실행(executed). 유예 중 취소(canceled) 가능.
-- 요청 행 자체가 감사 기록이며 steps에 실행 단계별 시각·건수를 남긴다. 사용자 FK는 두지 않는다(계정 삭제 뒤에도 감사 유지).
create table field.organization_deletion_requests (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id),
  requested_by text not null,
  reason text check (reason is null or char_length(reason) between 1 and 1000),
  confirmation jsonb not null,
  status text not null check (status in ('scheduled', 'canceled', 'executed')),
  requested_at timestamptz not null default now(),
  scheduled_at timestamptz not null,
  next_attempt_at timestamptz not null,
  canceled_at timestamptz,
  canceled_by text,
  executed_at timestamptz,
  steps jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  check (scheduled_at > requested_at),
  check ((status = 'canceled') = (canceled_at is not null and canceled_by is not null)),
  check ((status = 'executed') = (executed_at is not null))
);
create unique index field_organization_deletion_open on field.organization_deletion_requests(organization_id)
  where status in ('scheduled', 'executed');
create index field_organization_deletion_due on field.organization_deletion_requests(next_attempt_at) where status = 'scheduled';

-- 계정 삭제 감사. "user" 행은 보존 원장 FK 때문에 지우지 않고 식별정보를 익명화한 tombstone으로 남긴다.
create table field.account_deletion_audit (
  id uuid primary key,
  user_id text not null unique,
  mode text not null check (mode = 'anonymized'),
  removed jsonb not null,
  executed_at timestamptz not null default now()
);
-- 조직 삭제 실행(organizations.deleted_at 기록 뒤)에서 owner 알림 연락처 암호문을 지울 수 있게 000068 guard를 넓힌다.
-- 기존 조건(문의·예약 보존 정리)은 그대로 두고 'owner 대상 + 삭제된 조직' 경우만 추가한다. 연락처 외 binding은 계속 불변이다.
create or replace function field.notification_delivery_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification delivery ledger is immutable' using errcode='PFN01'; end if;
 if (new.id,new.organization_id,new.notification_id,new.recipient_id,new.channel,new.fallback_of,new.created_at)
    is distinct from (old.id,old.organization_id,old.notification_id,old.recipient_id,old.channel,old.fallback_of,old.created_at)
    or (old.started_at is not null and (new.started_at,new.provider,new.account_id,new.key_fingerprint,new.reserved,new.reserved_day)
      is distinct from (old.started_at,old.provider,old.account_id,old.key_fingerprint,old.reserved,old.reserved_day))
    or (old.provider_id is not null and new.provider_id is distinct from old.provider_id)
    or (new.recipient_ciphertext is distinct from old.recipient_ciphertext and not (new.recipient_ciphertext is null and new.retention_purged_at is not null and (exists(select 1 from field.notification_recipients r left join field.inquiries i on i.id::text=r.target_id and r.target_kind='inquiry' left join field.reservations b on b.id::text=r.target_id and r.target_kind='reservation' where r.id=new.recipient_id and coalesce(i.retention_work_purged_at,b.retention_work_purged_at) is not null)
      or exists(select 1 from field.notification_recipients r join field.organizations o on o.id=r.organization_id
        where r.id=new.recipient_id and r.target_kind='owner' and o.deleted_at is not null))))
    or (old.retention_purged_at is not null and new.retention_purged_at is distinct from old.retention_purged_at)
    or (old.started_at is not null and new.state in ('pending','blocked_limit','suppressed'))
    or (old.state in ('sent','failed','suppressed') and (new.state,new.allow_fallback) is distinct from (old.state,old.allow_fallback)) then
   raise exception 'notification delivery binding or terminal state is immutable' using errcode='PFN01';
 end if;
 return new;
end $$;
create or replace function field.notification_recipient_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification consent is immutable' using errcode='PFN01'; end if;
 if (to_jsonb(new)-array['revoked_at','recipient_ciphertext','retention_purged_at']) is distinct from (to_jsonb(old)-array['revoked_at','recipient_ciphertext','retention_purged_at'])
  or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
  or (old.retention_purged_at is not null and new.retention_purged_at is distinct from old.retention_purged_at)
  or (new.recipient_ciphertext is distinct from old.recipient_ciphertext and not(new.recipient_ciphertext is null and new.retention_purged_at is not null
    and (exists(select 1 from field.inquiries i where i.id::text=new.target_id and new.target_kind='inquiry' and i.retention_work_purged_at is not null) or exists(select 1 from field.reservations r where r.id::text=new.target_id and new.target_kind='reservation' and r.retention_work_purged_at is not null)
    or (new.target_kind='owner' and exists(select 1 from field.organizations o where o.id=new.organization_id and o.deleted_at is not null))))) then
   raise exception 'notification consent binding is immutable' using errcode='PFN01';
 end if;return new;
end $$;

-- 계정 삭제 비밀번호 재확인 시도 창(사용자별 15분 5회). 실패 시도도 남도록 삭제 트랜잭션과 별도로 commit한다.
-- 삭제 트랜잭션이 "user" 행을 for update로 잠그므로 FK(for key share)를 두지 않는다. 만료 창은 보존 작업자가 지운다.
create table field.account_deletion_password_windows (
  user_id text primary key,
  attempts integer not null check (attempts between 1 and 6),
  window_started_at timestamptz not null,
  updated_at timestamptz not null
);
create index field_account_deletion_password_windows_cleanup_idx on field.account_deletion_password_windows(updated_at);
-- 롤백(가역): 000068의 두 guard 함수 본문을 다시 적용; drop table field.account_deletion_password_windows; drop table field.account_deletion_audit; drop table field.organization_deletion_requests;
--   alter table field.organizations drop column deleted_at (실행된 삭제 기록이 있으면 먼저 백업).
