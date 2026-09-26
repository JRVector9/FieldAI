-- 67은 이미 적용된 이력이므로 새 migration으로 잠금 경합과 UUID index 조회를 보완한다.
create or replace function ap.protect_revoked_oauth_token() returns trigger language plpgsql as $$
declare selection_revoked_at timestamptz;
begin
  if TG_OP='UPDATE' and OLD.revoked is not null then
    if NEW.revoked is null then raise exception 'revoked AP token cannot be reactivated' using errcode='PAP02'; end if;
    NEW.revoked=OLD.revoked;
  end if;
  -- 이미 회수하는 쓰기는 부모 잠금을 요구하지 않는다. child -> parent 대기는 회수와 교착한다.
  if NEW.revoked is not null then return NEW; end if;
  if NEW."referenceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    if TG_OP='UPDATE' then
      -- 이미 child row를 잠근 update는 부모가 잠겼으면 즉시 실패해 재시도를 요구한다.
      select revoked_at into selection_revoked_at from ap.oauth_selections where id=NEW."referenceId"::uuid for share nowait;
    else
      -- 새 발급은 부모 회수와 직렬화한다. 회수 뒤 늦은 발급은 revoked로 저장한다.
      select revoked_at into selection_revoked_at from ap.oauth_selections where id=NEW."referenceId"::uuid for share;
    end if;
    if selection_revoked_at is not null then NEW.revoked=now(); end if;
  end if;
  return NEW;
end $$;
