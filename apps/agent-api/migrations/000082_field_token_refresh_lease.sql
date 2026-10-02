-- Field 토큰 갱신을 행 잠금 없이 한 요청만 수행하도록 짧은 임대 시각을 둔다.
-- 같은 refresh token을 두 번 쓰면 Field가 토큰 계열 전체를 무효화하므로, 네트워크 호출 전 이 값을 CAS로 선점한다.
alter table ap.field_connections add column token_refresh_lease_until timestamptz;
