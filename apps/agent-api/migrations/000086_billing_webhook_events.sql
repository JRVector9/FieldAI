-- 토스 웹훅 수신함. 웹훅에는 서명이 없으므로 결제·환불 확정 근거로 쓰지 않고 힌트로만 보관한다.
-- 확정은 기존 결제/환불 워커가 공급사 lookup(GET)으로만 수행한다.
-- 미인증 원문(고객 정보 포함 가능)은 저장하지 않고 파싱한 식별 힌트만 남긴다. paymentKey는 sha256 hex만 보관한다.
-- 보존: 보존 작업자가 30일 지난 수신 기록과 만료된 IP 창을 지운다(billing-webhook.ts purgeBillingWebhookRecords).
create table ap.billing_webhook_events (
  id uuid primary key,
  event_type text not null check (event_type ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  payment_key_hash text check (payment_key_hash is null or payment_key_hash ~ '^[0-9a-f]{64}$'),
  order_id text check (order_id is null or order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text check (outcome in ('reconcile_scheduled', 'no_pending_reconciliation', 'blocked_integration')),
  check ((processed_at is null) = (outcome is null))
);
create index ap_billing_webhook_events_received_idx on ap.billing_webhook_events(received_at);
create index ap_billing_webhook_events_order_idx on ap.billing_webhook_events(order_id) where order_id is not null;

-- 웹훅 접속 IP별 15분 창. 원문 IP는 저장하지 않는다.
create table ap.billing_webhook_ip_windows (
  subject_hash text primary key check (subject_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null check (attempts between 1 and 1001),
  window_started_at timestamptz not null,
  updated_at timestamptz not null
);
create index ap_billing_webhook_ip_windows_cleanup_idx on ap.billing_webhook_ip_windows(updated_at);
