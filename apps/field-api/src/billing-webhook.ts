import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { ipLimitBucket } from './ip-bucket.js';

// Shared provider sender IPs aggregate many merchants/transactions; operators can
// increase this finite 15-minute cap after measuring inbound volume.
export function billingWebhookIpLimit(value=process.env.FIELD_BILLING_WEBHOOK_IP_LIMIT) {
  if(value===undefined||value.trim()==='')return 120;
  if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>100_000)
    throw new Error('FIELD_BILLING_WEBHOOK_IP_LIMIT must be an integer from 1 to 100000');
  return Number(value);
}
const EVENT_TYPE = /^[A-Z][A-Z0-9_]{0,63}$/;
const ORDER_ID = /^[A-Za-z0-9_-]{6,64}$/;
const PAYMENT_KEY = /^[A-Za-z0-9_-]{1,200}$/;

export type TossWebhookHint = { eventType: string; paymentKey: string | null; orderId: string | null };

// 토스 웹훅은 서명이 없으므로 식별자만 힌트로 꺼낸다. 금액·상태 값은 해석하지 않는다.
export function parseTossWebhook(body: unknown): TossWebhookHint | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (value.data !== undefined && (!value.data || typeof value.data !== 'object' || Array.isArray(value.data))) return null;
  const data = (value.data ?? value) as Record<string, unknown>;
  // 가상계좌 입금 콜백(DEPOSIT_CALLBACK)은 eventType 없이 orderId를 최상위에 둔다.
  const eventType = value.eventType === undefined && value.data === undefined && typeof value.orderId === 'string'
    ? 'DEPOSIT_CALLBACK' : value.eventType;
  if (typeof eventType !== 'string' || !EVENT_TYPE.test(eventType)) return null;
  const { paymentKey, orderId } = data;
  if (paymentKey !== undefined && paymentKey !== null && (typeof paymentKey !== 'string' || !PAYMENT_KEY.test(paymentKey))) return null;
  if (orderId !== undefined && orderId !== null && (typeof orderId !== 'string' || !ORDER_ID.test(orderId))) return null;
  return { eventType, paymentKey: typeof paymentKey === 'string' ? paymentKey : null,
    orderId: typeof orderId === 'string' ? orderId : null };
}

// IP 창을 1 증가시키고 한도를 넘으면 남은 초를 돌려준다. 원문 IP는 저장하지 않는다.
async function consumeWebhookWindow(db: PoolClient, ip: string,limit:number): Promise<number | null> {
  const secret = process.env.FIELD_AUTH_SECRET;
  if (!secret) throw new Error('FIELD_AUTH_SECRET is required for billing webhook limits');
  // IPv6는 /64로 묶어 주소만 바꿔 창을 늘리지 못하게 한다(ip-bucket.ts).
  const subject = createHmac('sha256', secret).update('field-billing-webhook-ip-v1\0').update(ipLimitBucket(ip)).digest('hex');
  const row = (await db.query<{ attempts: number; retry_after: number }>(
    `insert into field.billing_webhook_ip_windows(subject_hash, attempts, window_started_at, updated_at)
     values ($1, 1, clock_timestamp(), clock_timestamp())
     on conflict (subject_hash) do update set
       attempts = case when field.billing_webhook_ip_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then 1 else least(field.billing_webhook_ip_windows.attempts + 1, $2::integer + 1) end,
       window_started_at = case when field.billing_webhook_ip_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then clock_timestamp() else field.billing_webhook_ip_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from (window_started_at + interval '15 minutes' - clock_timestamp())))::integer) as retry_after`,
    [subject, limit])).rows[0]!;
  return row.attempts > limit ? row.retry_after : null;
}

export function registerFieldBillingWebhookRoute(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  const ipLimit=billingWebhookIpLimit();
  app.post('/v1/billing/webhooks/toss', { bodyLimit: 65_536 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const provider = runtime.billing?.provider;
    // 공급사 미설정: mock만 수신 기록을 남기고, 그 외 환경은 차단 상태를 그대로 알린다.
    if (!provider && process.env.FIELD_PROFILE !== 'mock') return reply.code(503).send({ error: 'blocked_integration' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const retryAfter = await consumeWebhookWindow(db, request.ip,ipLimit);
      if (retryAfter !== null) {
        await db.query('commit');
        return reply.header('Retry-After', retryAfter).code(429).send({ error: 'webhook_rate_limited' });
      }
      const hint = parseTossWebhook(request.body);
      if (!hint) { await db.query('commit'); return reply.code(400).send({ error: 'invalid_webhook' }); }
      let outcome: 'reconcile_scheduled' | 'no_pending_reconciliation' | 'blocked_integration' = 'blocked_integration';
      if (provider) {
        // 결과 미상(unknown) 건의 다음 lookup만 앞당긴다. 상태·금액·원장은 워커의 lookup 결과로만 바뀐다.
        // 반복 웹훅으로 공급사 lookup을 몰아치지 않도록 60초보다 먼 예약만 앞당긴다(워커 기본 재시도 간격 60초).
        const charges = hint.orderId ? (await db.query(
          `update field.billing_transactions set next_attempt_at = now()
           where order_id = $1 and state = 'unknown' and next_attempt_at > now() + interval '60 seconds'
             and (lease_expires_at is null or lease_expires_at <= now())`, [hint.orderId])).rowCount ?? 0 : 0;
        const refunds = hint.orderId ? (await db.query(
          `update field.billing_refunds r set next_attempt_at = now() from field.billing_transactions t
           where t.id = r.transaction_id and t.order_id = $1 and r.state = 'unknown'
             and r.next_attempt_at > now() + interval '60 seconds'
             and (r.lease_expires_at is null or r.lease_expires_at <= now())`, [hint.orderId])).rowCount ?? 0 : 0;
        outcome = charges + refunds > 0 ? 'reconcile_scheduled' : 'no_pending_reconciliation';
      }
      // 미인증 원문은 저장하지 않는다. 힌트(유형·주문번호·결제키 sha256)만 남기고, 응답은 처리 결과를 드러내지 않게 고정한다.
      const paymentKeyHash = hint.paymentKey ? createHash('sha256').update(hint.paymentKey).digest('hex') : null;
      await db.query(
        `insert into field.billing_webhook_events(id, event_type, payment_key_hash, order_id, processed_at, outcome)
         values ($1, $2, $3, $4, now(), $5)`,
        [randomUUID(), hint.eventType, paymentKeyHash, hint.orderId, outcome]);
      await db.query('commit');
      return reply.code(200).send({ received: true });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
