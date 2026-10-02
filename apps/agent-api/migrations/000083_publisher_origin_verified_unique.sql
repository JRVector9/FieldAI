-- 매체 origin 선점 방지: DNS 검증 전 등록만으로 origin을 전역 점유하지 않는다.
-- 검증된 행(verified_at is not null)만 origin 전역 unique로 두고, 같은 매체 안에서는 origin을 한 번만 등록한다.
-- 다른 매체의 미검증 등록이 24시간 안이면 앱이 409로 막고, 그 뒤에는 실제 소유자가 새로 등록·검증할 수 있다.
-- 기존 행은 삭제·변경하지 않는다(기존 unique(origin) 아래에서는 중복 행이 없으므로 새 제약을 바로 만족한다).
-- 롤백(설계상 가역): 같은 origin의 미검증 중복 행과 그 슬롯을 운영 확인 후 정리한 다음
--   drop index ap.publisher_domains_verified_origin_unique;
--   alter table ap.publisher_domains drop constraint publisher_domains_publisher_origin_key;
--   alter table ap.publisher_domains add constraint publisher_domains_origin_key unique (origin);
alter table ap.publisher_domains drop constraint publisher_domains_origin_key;
alter table ap.publisher_domains add constraint publisher_domains_publisher_origin_key unique (publisher_id, origin);
create unique index publisher_domains_verified_origin_unique on ap.publisher_domains(origin) where verified_at is not null;
