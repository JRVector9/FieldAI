-- 공개 계약 preview.9: 고객 제안 결정·알림 경로 읽기 scope를 기존 Field 통합 resource에 추가한다.
-- allowedScopes가 null(제한 없음)인 행은 목록으로 바꾸면 기존 scope가 막히므로 배열인 행만 갱신한다.
update "oauthResource"
set "allowedScopes" = "allowedScopes" || '["field.proposals.respond"]'::jsonb,
    "updatedAt" = now()
where "identifier" ~ '^https?://[^/]+/integrations/v1$'
  and jsonb_typeof("allowedScopes") = 'array'
  and not "allowedScopes" ? 'field.proposals.respond';
update "oauthResource"
set "allowedScopes" = "allowedScopes" || '["field.notification_route.read"]'::jsonb,
    "updatedAt" = now()
where "identifier" ~ '^https?://[^/]+/integrations/v1$'
  and jsonb_typeof("allowedScopes") = 'array'
  and not "allowedScopes" ? 'field.notification_route.read';

-- AP 대화 중인 고객이 사업자 제안에 내린 결정 원장. 같은 멱등 키·본문은 저장 결과로 재응답한다.
-- 결정은 Field 고객 수락/취소 요청 전이만 실행하며 예약 확정은 포함하지 않는다.
create table field.external_request_customer_decisions (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id) on delete cascade,
  external_request_id uuid not null references field.external_work_requests(id) on delete cascade,
  reservation_id uuid not null references field.reservations(id) on delete cascade,
  connection_id uuid not null references field.ap_connections(id),
  client_id text not null,
  field_grant_id text not null,
  idempotency_key uuid not null,
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  decision text not null check (decision in ('accept', 'withdraw')),
  proposal_revision integer not null check (proposal_revision > 0),
  customer_record_id uuid not null,
  customer_confirmed_at timestamptz not null,
  result_state text not null check (result_state in ('customer_accepted', 'change_accepted', 'canceled')),
  result_revision integer not null check (result_revision > proposal_revision),
  created_at timestamptz not null default now(),
  unique (external_request_id, idempotency_key),
  unique (external_request_id, customer_record_id)
);

-- AP→Field 서명 사건 내구 수신함. 202는 저장만 뜻하고 처리 결과는 state로 구분한다.
-- 원문·연락처는 저장하지 않고 envelope 식별값과 본문 hash만 남긴다.
create table field.ap_webhook_inbox (
  source_product text not null check (source_product = 'agent_platform'),
  source_event_id uuid not null,
  connection_id uuid not null references field.ap_connections(id),
  organization_id uuid not null references field.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('agent.conversation.updated',
    'agent.action.delivery_updated', 'agent.notification.updated', 'connection.revoked')),
  aggregate_type text not null check (aggregate_type in ('conversation', 'action', 'notification', 'connection')),
  aggregate_id uuid not null,
  aggregate_version integer not null check (aggregate_version >= 1),
  correlation_id uuid not null,
  occurred_at timestamptz not null,
  data_status text not null check (char_length(data_status) between 1 and 80),
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  state text not null check (state in ('recorded', 'processed', 'rejected')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (source_product, source_event_id),
  check ((state = 'recorded') = (processed_at is null)),
  check ((state = 'rejected') = (error_code is not null))
);
create index field_ap_webhook_inbox_connection_idx
  on field.ap_webhook_inbox(connection_id, received_at desc);
-- 처리 작업자가 없는 recorded 사건은 30일 뒤 보존 작업자(retention-purge-worker) 정리 단계에서 지운다.
-- 서명 시각 창(±300초)이 재전송을 막으므로 오래된 event_id 기록이 사라져도 재사용은 거부된다.
create index field_ap_webhook_inbox_recorded_cleanup_idx
  on field.ap_webhook_inbox(received_at) where state = 'recorded';
-- 롤백(주의): §4.12 경로(external-request-public-routes.ts)·수신함(ap-webhook-inbox.ts)을 먼저 끈 뒤
--   drop table field.ap_webhook_inbox; drop table field.external_request_customer_decisions;
--   update "oauthResource" set "allowedScopes" = "allowedScopes" - 'field.proposals.respond' - 'field.notification_route.read',
--     "updatedAt" = now() where "identifier" ~ '^https?://[^/]+/integrations/v1$' and jsonb_typeof("allowedScopes") = 'array';
--   이미 발급된 두 scope의 토큰·동의는 위 갱신으로 회수되지 않으므로 해당 referenceId 토큰을 따로 revoke한다.
