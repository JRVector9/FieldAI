-- Field 공개 계약 preview.9 소비: AP 고객의 제안 결정 원장, AP→Field 서명 사건 발신함, 알림 경로 생략 사유.

-- 고객이 AP 화면에서 Field 제안에 내린 결정. 결정(종류·제안 revision)마다 한 행이며 UUID 멱등 키·고객 기록 ID를
-- 처음 만든 그대로 재시도에 쓴다. 결과 미상(pending)은 새 키를 만들지 않는다. AP는 예약을 확정하지 않는다.
create table ap.field_customer_decisions (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  action_request_id uuid not null references ap.field_action_requests(id) on delete cascade,
  external_request_id uuid not null,
  decision text not null check (decision in ('accept', 'withdraw')),
  proposal_revision integer not null check (proposal_revision > 0),
  idempotency_key uuid not null unique,
  customer_record_id uuid not null unique,
  customer_confirmed_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'recorded', 'rejected')),
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  field_decision_id uuid,
  result_state text check (result_state in ('customer_accepted', 'change_accepted', 'canceled')),
  result_revision integer check (result_revision > proposal_revision),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_request_id, decision, proposal_revision),
  check ((state = 'recorded') = (field_decision_id is not null and result_state is not null
    and result_revision is not null)),
  check (state <> 'rejected' or error_code is not null)
);
create index ap_field_customer_decisions_pending_idx
  on ap.field_customer_decisions(action_request_id) where state = 'pending';

-- AP→Field 서명 사건 발신함. body는 서명한 원문 그대로 보관해 같은 event_id 재시도가 같은 바이트가 되게 한다.
-- 원문 대화·연락처는 넣지 않는다(식별자·상태만).
create table ap.field_agent_event_outbox (
  id uuid primary key,
  organization_id uuid not null references ap.organizations(id) on delete cascade,
  connection_id uuid not null references ap.field_connections(id) on delete cascade,
  event_type text not null check (event_type in ('agent.action.delivery_updated')),
  aggregate_id uuid not null,
  aggregate_version integer not null check (aggregate_version >= 1),
  correlation_id uuid not null,
  body text not null check (octet_length(body) <= 65536),
  state text not null default 'pending'
    check (state in ('pending', 'sending', 'retry', 'acked', 'blocked')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  acknowledged_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_type, aggregate_id, aggregate_version)
);
create index ap_field_agent_event_outbox_due_idx on ap.field_agent_event_outbox(next_attempt_at)
  where state in ('pending', 'sending', 'retry');

-- Field 알림 경로가 Field 담당이거나 AP 발송이 허용되지 않거나(전환 대기) 확인할 수 없으면 AP 고객 알림을
-- 만들지 않고 생략 사유를 남긴다. 최신 정의(000074)에 이 네 사유만 더한다.
alter table ap.notification_events drop constraint notification_events_check;
alter table ap.notification_events add constraint notification_events_check check(
 (audience='owner' and channel='in_app' and state='available' and suppression_reason is null)
 or (audience='customer' and channel='kakao' and state in ('blocked_integration','pending','accepted','unknown','sent','failed','blocked_limit') and suppression_reason is null)
 or (state='not_applicable' and suppression_reason='spam')
 or (audience='customer' and channel='kakao' and state='not_applicable' and field_reservation_event_id is not null
   and suppression_reason in ('field_route_active','field_route_suspended','route_transfer_pending','route_unknown')));
-- 롤백: 새 생략 사유 행을 보관·삭제한 뒤 000074의 notification_events_check를 다시 만들고 두 표를 지운다.
