-- 전체 감사 후속(2026-10-03). 인증 메일 중복 억제·better-auth DB 비율 제한·멈춘 사진 삭제 운영자 재개.

-- M5: 같은 주소·목적의 인증 메일을 10분 안에 다시 요청하면 보내지 않고 suppressed_duplicate로만 남긴다.
alter table field.email_outbox drop constraint email_outbox_state_check,
  add constraint email_outbox_state_check
    check (state in ('pending', 'sent', 'blocked_integration', 'failed', 'suppressed_duplicate'));
-- 같은 주소·목적의 최근 요청을 찾는다(대소문자 무시).
create index email_outbox_recent_recipient_idx on field.email_outbox (lower("to"), purpose, created_at desc);

-- better-auth 1.7.5 rateLimit storage='database' 스키마(@better-auth/core db/get-tables.mjs 기준).
-- 비mock 프로필에서 로그인·가입·메일 요청 한도를 프로세스 재시작·다중 인스턴스와 무관하게 유지한다.
create table "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

-- L10: 사진 2단계 삭제가 멈춘 시각(운영자 목록용). 'deleting' 행에만 둔다. 이 마이그레이션 이전에 멈춘 행은 null이다.
alter table field.site_assets add column deletion_stopped_at timestamptz,
  add constraint site_assets_deletion_stopped_check check (state = 'deleting' or deletion_stopped_at is null);
-- 멈춘 사진 삭제 운영자 재개 감사. 사진 행은 삭제가 끝나면 지워지므로 사진 FK를 두지 않는다.
create table field.site_asset_deletion_resumes (
  id uuid primary key,
  asset_id uuid not null,
  organization_id uuid not null references field.organizations(id),
  actor_user_id text not null references "user"(id),
  reason text not null check (char_length(reason) between 10 and 500),
  previous_error text,
  previous_attempts integer not null check (previous_attempts >= 0),
  created_at timestamptz not null default now()
);
create index site_asset_deletion_resumes_asset_idx on field.site_asset_deletion_resumes(asset_id, created_at desc);

-- 롤백(가역):
--   drop table field.site_asset_deletion_resumes;
--   alter table field.site_assets drop constraint site_assets_deletion_stopped_check, drop column deletion_stopped_at;
--   drop table "rateLimit";  -- auth.ts rateLimit.storage를 memory로 되돌린 뒤
--   drop index field.email_outbox_recent_recipient_idx;
--   update field.email_outbox set state='failed', error_code='suppressed_duplicate' where state='suppressed_duplicate';
--   alter table field.email_outbox drop constraint email_outbox_state_check,
--     add constraint email_outbox_state_check check (state in ('pending', 'sent', 'blocked_integration', 'failed'));
