-- 1) Field 전달 결과 미상(delivery_unknown) 운영자 종결(추가).
-- 동의 24시간이 지나면 reconcile이 상태를 바꾸지 않으므로, 운영자가 사유와 함께 종결 상태(unresolved)로 닫는다.
-- unresolved는 Field 쪽 업무가 생겼는지 끝내 확인하지 못한 종결이며 rejected(Field 거절 확인)와 구분한다.
-- 같은 문의·연결·서비스·종류의 새 전달 금지(중복 업무 방지 계약)는 unresolved에도 유지한다.
alter table ap.field_action_requests drop constraint field_action_requests_state_check;
alter table ap.field_action_requests add constraint field_action_requests_state_check
  check (state in ('sending', 'accepted_external', 'delivery_unknown', 'rejected', 'unresolved'));
alter table ap.field_action_requests add column closed_by text references "user"(id);
alter table ap.field_action_requests add column closed_at timestamptz;
alter table ap.field_action_requests add column close_reason text;
alter table ap.field_action_requests add constraint field_action_requests_unresolved_close_check
  check ((state = 'unresolved') = (closed_by is not null and closed_at is not null and close_reason is not null)
    and (close_reason is null or char_length(close_reason) between 10 and 500));
drop index ap.ap_field_action_one_unknown_work_idx;
create unique index ap_field_action_one_unknown_work_idx
  on ap.field_action_requests(inquiry_id, connection_id, service_id, kind)
  where state in ('sending', 'delivery_unknown', 'unresolved');

-- 2) 인증 메일 수신자별 중복 발송 생략(추가). 같은 주소·목적으로 10분 안에 이미 보낸(또는 보내는 중인) 메일이 있으면
-- 공급사 호출 없이 suppressed_duplicate로만 남긴다. 조회용 색인을 둔다.
alter table ap.email_outbox drop constraint email_outbox_state_check;
alter table ap.email_outbox add constraint email_outbox_state_check
  check (state in ('pending', 'sent', 'blocked_integration', 'failed', 'suppressed_duplicate'));
create index email_outbox_recipient_purpose_idx on ap.email_outbox (lower("to"), purpose, created_at desc);

-- 3) better-auth 1.7.5 rateLimit(storage: 'database') 표. 설치본 @better-auth/core dist/db/get-tables.mjs의
-- rateLimit 정의(key string unique required, count number required, lastRequest number bigint required)와
-- better-auth dist/db/get-migration.mjs의 생성 규칙(id text primary key, string→text, number→integer, bigint→bigint)을 따른다.
create table "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);
create index "rateLimit_lastRequest_idx" on "rateLimit" ("lastRequest");

-- 롤백(가역, 순서대로):
--   drop table "rateLimit";
--   drop index ap.email_outbox_recipient_purpose_idx;
--   suppressed_duplicate 행을 보관·삭제한 뒤 email_outbox_state_check를 000084 값(pending,sent,blocked_integration,failed)으로 다시 만든다;
--   unresolved 행을 delivery_unknown으로 되돌리거나 보관한 뒤(closed_* 값은 운영 감사로 따로 보관)
--   drop index ap.ap_field_action_one_unknown_work_idx; 000037 정의(state in ('sending','delivery_unknown'))로 다시 만들고,
--   alter table ap.field_action_requests drop constraint field_action_requests_unresolved_close_check,
--     drop column close_reason, drop column closed_at, drop column closed_by;
--   field_action_requests_state_check를 000036 값(sending,accepted_external,delivery_unknown,rejected)으로 다시 만든다.
