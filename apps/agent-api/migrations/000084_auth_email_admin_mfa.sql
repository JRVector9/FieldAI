-- 인증 메일 감사 outbox: 메일 공급사(mock·SMTP·미연결)와 무관하게 모든 인증 메일 요청을 남긴다.
-- mock이 아니면 text/html의 일회용 토큰은 앱에서 [redacted]로 가린 뒤 저장한다.
create table ap.email_outbox (
  id uuid primary key default gen_random_uuid(),
  "to" text not null check (length("to") between 3 and 320),
  subject text not null check (length(subject) between 1 and 300),
  text text not null,
  html text,
  purpose text not null check (purpose in ('verify_email', 'reset_password')),
  state text not null default 'pending' check (state in ('pending', 'sent', 'blocked_integration', 'failed')),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((state = 'sent') = (sent_at is not null))
);
create index email_outbox_created_at_idx on ap.email_outbox (created_at desc);
create index email_outbox_state_idx on ap.email_outbox (state, created_at desc) where state <> 'sent';

-- better-auth 1.7.5 twoFactor 플러그인 스키마(dist/plugins/two-factor/schema.mjs 기준).
alter table "user" add column "twoFactorEnabled" boolean default false;
create table "twoFactor" (
  "id" text not null primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "verified" boolean default true,
  "failedVerificationCount" integer default 0,
  "lockedUntil" timestamptz
);
create index "twoFactor_secret_idx" on "twoFactor" ("secret");
create index "twoFactor_userId_idx" on "twoFactor" ("userId");

-- 관리자 게이트용 세션 표시: TOTP·백업코드 검증 요청에서 만들어진 세션만 true(auth.ts databaseHooks).
-- 기존 세션은 모두 false로 시작하므로 비mock 관리자는 2FA 등록·재로그인 후에만 접근한다.
alter table "session" add column "twoFactorVerified" boolean not null default false;
-- 롤백(가역): drop index·table "twoFactor", alter table "user" drop column "twoFactorEnabled",
--   alter table "session" drop column "twoFactorVerified", drop table ap.email_outbox (감사 행 보존 필요 시 먼저 백업).
