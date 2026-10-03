-- OAuth lifecycle 서빙 검사(oauth-lifecycle-journal.ts assertLifecycleServing)의 token 항목은 토큰 원문 지문으로
-- "oauthAccessToken"/"oauthRefreshToken"을 찾는다. 기존 식 encode(sha256(convert_to(token,'UTF8')),'hex')는 인덱스가 없어 전체 스캔했다.
-- convert_to가 STABLE이라 그 식으로는 인덱스를 만들 수 없다. DB 인코딩은 생성 후 바뀌지 않으므로 같은 계산을 IMMUTABLE 함수로 감싸고
-- 조회도 이 함수를 그대로 쓴다(식이 정확히 같아야 인덱스를 탄다).
create function ap.oauth_token_sha256(value text) returns text language sql immutable strict parallel safe
  as $$ select encode(sha256(convert_to(value,'UTF8')),'hex') $$;
create index oauth_access_token_sha256_idx on "oauthAccessToken"(ap.oauth_token_sha256(token));
create index oauth_refresh_token_sha256_idx on "oauthRefreshToken"(ap.oauth_token_sha256(token));
-- 롤백(조회 코드를 원래 식으로 되돌린 뒤):
--   drop index oauth_refresh_token_sha256_idx; drop index oauth_access_token_sha256_idx; drop function ap.oauth_token_sha256(text);
