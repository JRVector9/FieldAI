-- 사진 사용 여부 조회(sites.ts ASSET_IN_USE_SQL)는 site_release_assets를 asset_id만으로 찾는다.
-- PK가 (release_id, asset_id)라 asset_id 단독 조건은 인덱스를 쓰지 못하므로 따로 만든다.
create index site_release_assets_asset_id_idx on field.site_release_assets(asset_id);

-- OAuth lifecycle 증명(tombstone·receipt)은 row 트리거(000073, before update/delete)로 불변이지만
-- TRUNCATE는 row 트리거를 타지 않는다. 서빙 검사 캐시는 receipt 수만 비교하므로 statement 트리거로 TRUNCATE도 거절한다(AP와 같은 보호).
create function field.protect_oauth_lifecycle_truncate() returns trigger language plpgsql as $$
begin raise exception 'OAuth lifecycle proof cannot be truncated' using errcode='POL04'; end $$;
create trigger lifecycle_tombstone_no_truncate before truncate on field.oauth_lifecycle_tombstones
  for each statement execute function field.protect_oauth_lifecycle_truncate();
create trigger lifecycle_receipt_no_truncate before truncate on field.oauth_lifecycle_receipts
  for each statement execute function field.protect_oauth_lifecycle_truncate();
-- 롤백:
--   drop trigger lifecycle_receipt_no_truncate on field.oauth_lifecycle_receipts;
--   drop trigger lifecycle_tombstone_no_truncate on field.oauth_lifecycle_tombstones;
--   drop function field.protect_oauth_lifecycle_truncate(); drop index field.site_release_assets_asset_id_idx;
