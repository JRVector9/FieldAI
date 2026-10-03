-- AP-O09 사업자 조직·계정 삭제(추가). 조직 행은 청구 원장·감사·보존 중인 문의 원본이 FK로 참조하므로 지우지 않고
-- deleted_at으로 표시한다. 문의·상담 원본은 기존 보존 정책(work_retention_*) 경로로만 나중에 정리한다.
alter table ap.organizations add column deleted_at timestamptz;

-- 조직 삭제 요청: owner 명시 확인 → 14일 유예(scheduled) → 작업자 실행(executed). 유예 중 취소(canceled) 가능.
-- 요청 행 자체가 감사 기록이며 steps에 실행 단계별 시각·건수를 남긴다. 사용자 FK는 두지 않는다(계정 삭제 뒤에도 감사 유지).
create table ap.organization_deletion_requests (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id),
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
create unique index ap_organization_deletion_open on ap.organization_deletion_requests(organization_id)
  where status in ('scheduled', 'executed');
create index ap_organization_deletion_due on ap.organization_deletion_requests(next_attempt_at) where status = 'scheduled';

-- 계정 삭제 감사. "user" 행은 보존 원장 FK 때문에 지우지 않고 식별정보를 익명화한 tombstone으로 남긴다.
create table ap.account_deletion_audit (
  id uuid primary key,
  user_id text not null unique,
  mode text not null check (mode = 'anonymized'),
  removed jsonb not null,
  executed_at timestamptz not null default now()
);
-- 계정 삭제 비밀번호 재입력 시도 창(사용자별 15분 5회). 사용자 id 원문 대신 HMAC만 저장한다.
-- 보존 작업자가 창이 끝난 행을 지운다(account-deletion.ts purgeAccountDeletionPasswordWindows).
create table ap.account_deletion_password_windows (
  subject_hash text primary key check (subject_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null check (attempts between 1 and 6),
  window_started_at timestamptz not null,
  updated_at timestamptz not null
);
create index ap_account_deletion_password_windows_cleanup_idx on ap.account_deletion_password_windows(updated_at);

-- 조직 삭제 실행 시 owner 알림 수신처의 연락처 암호문도 지운다(000078 가드에 owner 예외 추가).
-- 조건: owner 수신처이고 철회·보존정리 시각을 함께 기록하며 조직이 이미 deleted_at 처리된 경우만 허용한다.
create or replace function ap.notification_recipient_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification consent is immutable' using errcode='PAN01'; end if;
 if (to_jsonb(new)-array['revoked_at','recipient_ciphertext','retention_purged_at']) is distinct from (to_jsonb(old)-array['revoked_at','recipient_ciphertext','retention_purged_at'])
  or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
  or (old.retention_purged_at is not null and new.retention_purged_at is distinct from old.retention_purged_at)
  or (new.recipient_ciphertext is distinct from old.recipient_ciphertext and not(new.recipient_ciphertext is null and new.retention_purged_at is not null
    and (exists(select 1 from ap.inquiries i where i.id::text=new.target_id and new.target_kind='inquiry' and i.retention_work_purged_at is not null)
      or (new.target_kind='owner' and new.revoked_at is not null
        and exists(select 1 from ap.organizations o where o.id=new.organization_id and o.deleted_at is not null))))) then
   raise exception 'notification consent binding is immutable' using errcode='PAN01';
 end if;return new;
end $$;
-- 롤백(가역): drop table ap.account_deletion_password_windows; drop table ap.account_deletion_audit;
--   drop table ap.organization_deletion_requests; ap.notification_recipient_guard()를 000078 정의로 되돌린다;
--   alter table ap.organizations drop column deleted_at (실행된 삭제 기록이 있으면 먼저 백업).
