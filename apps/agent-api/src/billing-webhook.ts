import { createHash, createHmac, randomUUID } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';

// 토스 웹훅 수신 IP별 15분 한도(토스 재전송 최대 7회를 충분히 수용).
const WEBHOOK_IP_LIMIT = 120;
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

// IP 창의 묶음 단위(추가, 보안 #4). IPv6는 한 가입자가 /64 안의 주소를 마음대로 바꿀 수 있으므로 /64 접두로 묶고,
// IPv4 매핑 IPv6(::ffff:a.b.c.d)는 IPv4 주소로 본다. 그 밖의 값은 그대로 쓴다.
export function webhookIpBucket(ip: string) {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)?.[1];
  if (mapped && isIPv4(mapped)) return mapped;
  if (!isIPv6(ip)) return ip;
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [], right = tail ? tail.split(':') : [];
  // IPv4 꼬리(::1.2.3.4 등)는 /64 접두에 영향이 없으므로 그룹 수만 맞춘다
  const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map(group => group.padStart(4, '0')).join(':')}::/64`;
}

// IP 창을 1 증가시키고 한도를 넘으면 남은 초를 돌려준다. 원문 IP는 저장하지 않는다.
async function consumeWebhookWindow(db: PoolClient, ip: string): Promise<number | null> {
  const secret = process.env.AP_AUTH_SECRET;
  if (!secret) throw new Error('AP_AUTH_SECRET is required for billing webhook limits');
  const subject = createHmac('sha256', secret).update('ap-billing-webhook-ip-v1\0').update(webhookIpBucket(ip)).digest('hex');
  const row = (await db.query<{ attempts: number; retry_after: number }>(
    `insert into ap.billing_webhook_ip_windows(subject_hash, attempts, window_started_at, updated_at)
     values ($1, 1, clock_timestamp(), clock_timestamp())
     on conflict (subject_hash) do update set
       attempts = case when ap.billing_webhook_ip_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then 1 else least(ap.billing_webhook_ip_windows.attempts + 1, $2::integer + 1) end,
       window_started_at = case when ap.billing_webhook_ip_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then clock_timestamp() else ap.billing_webhook_ip_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from (window_started_at + interval '15 minutes' - clock_timestamp())))::integer) as retry_after`,
    [subject, WEBHOOK_IP_LIMIT])).rows[0]!;
  return row.attempts > WEBHOOK_IP_LIMIT ? row.retry_after : null;
}

export function registerAgentBillingWebhookRoute(app: FastifyInstance, runtime: BusinessRuntime) {
  app.post('/v1/billing/webhooks/toss', { bodyLimit: 65_536 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const provider = runtime.billing?.provider;
    // 공급사 미설정: mock만 수신 기록을 남기고, 그 외 환경은 차단 상태를 그대로 알린다.
    if (!provider && process.env.AP_PROFILE !== 'mock') return reply.code(503).send({ error: 'blocked_integration' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const retryAfter = await consumeWebhookWindow(db, request.ip);
      if (retryAfter !== null) {
        await db.query('commit');
        return reply.header('Retry-After', retryAfter).code(429).send({ error: 'webhook_rate_limited' });
      }
      const hint = parseTossWebhook(request.body);
      if (!hint) { await db.query('commit'); return reply.code(400).send({ error: 'invalid_webhook' }); }
      let outcome: 'reconcile_scheduled' | 'no_pending_reconciliation' | 'blocked_integration' = 'blocked_integration';
      if (provider) {
        // 결과 미상(unknown) 건의 다음 lookup만 앞당긴다. 상태·금액·원장은 워커의 lookup 결과로만 바뀐다.
        // 다음 시도가 60초 넘게 남은 경우에만 당겨 웹훅 반복으로 공급사 lookup 간격(backoff)을 우회하지 못하게 한다.
        const charges = hint.orderId ? (await db.query(
          `update ap.billing_transactions set next_attempt_at = now()
           where order_id = $1 and state = 'unknown' and next_attempt_at > now() + interval '60 seconds'
             and (lease_expires_at is null or lease_expires_at <= now())`, [hint.orderId])).rowCount ?? 0 : 0;
        const refunds = hint.orderId ? (await db.query(
          `update ap.billing_refunds r set next_attempt_at = now() from ap.billing_transactions t
           where t.id = r.transaction_id and t.order_id = $1 and r.state = 'unknown'
             and r.next_attempt_at > now() + interval '60 seconds'
             and (r.lease_expires_at is null or r.lease_expires_at <= now())`, [hint.orderId])).rowCount ?? 0 : 0;
        outcome = charges + refunds > 0 ? 'reconcile_scheduled' : 'no_pending_reconciliation';
      }
      // 미인증 원문은 저장하지 않는다. paymentKey도 평문 대신 sha256 hex만 남긴다.
      const paymentKeyHash = hint.paymentKey ? createHash('sha256').update(hint.paymentKey).digest('hex') : null;
      await db.query(
        `insert into ap.billing_webhook_events(id, event_type, payment_key_hash, order_id, processed_at, outcome)
         values ($1, $2, $3, $4, now(), $5)`,
        [randomUUID(), hint.eventType, paymentKeyHash, hint.orderId, outcome]);
      await db.query('commit');
      // 미상 건 존재 여부가 드러나지 않도록 처리 결과와 무관하게 같은 본문을 돌려준다.
      return reply.code(200).send({ received: true });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}

// 보존 작업자 단계: 30일 지난 웹훅 수신 기록과 15분 창이 끝난 IP 창을 지운다(한 번에 최대 1000건씩).
export async function purgeBillingWebhookRecords(pool: Pool) {
  const events = (await pool.query(
    `delete from ap.billing_webhook_events where id in (select id from ap.billing_webhook_events
       where received_at < now() - interval '30 days' order by received_at limit 1000)`)).rowCount ?? 0;
  const windows = (await pool.query(
    `delete from ap.billing_webhook_ip_windows where subject_hash in (select subject_hash from ap.billing_webhook_ip_windows
       where updated_at < clock_timestamp() - interval '15 minutes' order by updated_at limit 1000)`)).rowCount ?? 0;
  return { events, windows };
}
