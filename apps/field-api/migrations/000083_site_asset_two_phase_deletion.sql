-- 사진 보관함 2단계 삭제(추가). 삭제 요청은 짧은 트랜잭션에서 state='deleting'만 표시하고,
-- 저장소 객체 삭제·부재 확인·행 삭제는 retention 작업자(site-media.ts runSiteAssetDeletionOnce)가 잠금 밖에서 이어서 한다.
-- 'deleting' 사진은 초안 저장·공개·공개 조회에서 쓸 수 없고, 50장 상한에는 행이 지워질 때까지 포함된다.
alter table field.site_assets drop constraint site_assets_state_check,
  add constraint site_assets_state_check check (state in ('ready', 'deleting')),
  add column deletion_requested_at timestamptz,
  add column deletion_attempts integer not null default 0 check (deletion_attempts >= 0),
  add column deletion_error text,
  -- 재시도 시각. 작업자가 잡을 때 임대 시각으로 미루고, 실패하면 backoff 시각, 멈추면 'infinity'(운영자 확인 필요)다.
  add column deletion_next_attempt_at timestamptz,
  add constraint site_assets_deletion_state_check check (
    (state = 'ready' and deletion_requested_at is null and deletion_next_attempt_at is null)
    or (state = 'deleting' and deletion_requested_at is not null and deletion_next_attempt_at is not null));
-- 작업자는 삭제 대기 행만 재시도 시각 순으로 찾는다.
create index site_assets_deleting_idx on field.site_assets(deletion_next_attempt_at) where state = 'deleting';
-- 롤백(삭제 대기 행이 없을 때만):
--   drop index field.site_assets_deleting_idx;
--   alter table field.site_assets drop constraint site_assets_deletion_state_check,
--     drop column deletion_next_attempt_at, drop column deletion_error, drop column deletion_attempts,
--     drop column deletion_requested_at, drop constraint site_assets_state_check,
--     add constraint site_assets_state_check check (state = 'ready');
