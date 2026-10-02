-- 공개 문의·예약·고객 메시지의 접속 IP별 15분 창(조직별). 기존 번호 창은 attempts 상한이 6이라 재사용할 수 없다.
create table field.public_submission_ip_windows (
  organization_id uuid not null references field.organizations(id) on delete cascade,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null check (attempts between 1 and 1001),
  window_started_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (organization_id, subject_hash)
);
create index field_public_submission_ip_windows_cleanup_idx on field.public_submission_ip_windows(updated_at);
