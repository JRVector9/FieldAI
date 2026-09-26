import { createHmac } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';

const pathPattern = /^\/v1\/(inquiries|reservations)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/i;
const receiptErrors = new Set(['receipt_key_required', 'receipt_required', 'invalid_receipt_key',
  'inquiry_not_found', 'reservation_not_found']);

function target(request: FastifyRequest) {
  const match = pathPattern.exec(request.url.split('?', 1)[0]!);
  return match ? { kind: match[1] === 'inquiries' ? 'inquiry' : 'reservation', id: match[2]!.toLowerCase() } : null;
}

export function registerFieldReceiptAbuseGuard(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  const secret = process.env.FIELD_AUTH_SECRET;
  if (!secret) throw new Error('FIELD_AUTH_SECRET is required for receipt abuse protection');
  let lastCleanup = 0;
  const subject = (request: FastifyRequest, kind: string, id: string) => createHmac('sha256', secret)
    .update('field-receipt-abuse-v1\0').update(kind).update('\0').update(id).update('\0').update(request.ip)
    .digest('hex');

  app.addHook('onRequest', async (request, reply) => {
    const route = target(request);
    if (!route) return;
    const now = Date.now();
    if (now - lastCleanup >= 3_600_000) {
      lastCleanup = now;
      await runtime.pool.query("delete from field.receipt_attempts where updated_at < now() - interval '1 day'");
    }
    const found = await runtime.pool.query<{ retry_after: number }>(
      `select greatest(1, ceil(extract(epoch from blocked_until - now()))::integer) as retry_after
       from field.receipt_attempts where target_kind = $1 and target_id = $2 and subject_hash = $3
         and blocked_until > now()`, [route.kind, route.id, subject(request, route.kind, route.id)]);
    if (found.rows[0]) return reply.header('Retry-After', found.rows[0].retry_after)
      .header('Cache-Control', 'no-store').code(429).send({ error: 'receipt_rate_limited' });
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const route = target(request);
    if (!route) return payload;
    const key = subject(request, route.kind, route.id);
    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      await runtime.pool.query(
        'delete from field.receipt_attempts where target_kind = $1 and target_id = $2 and subject_hash = $3',
        [route.kind, route.id, key]);
      return payload;
    }
    if ((reply.statusCode !== 401 && reply.statusCode !== 404) || typeof payload !== 'string') return payload;
    let error: unknown;
    try { error = (JSON.parse(payload) as { error?: unknown }).error; } catch { return payload; }
    if (!receiptErrors.has(error as string)) return payload;
    await runtime.pool.query(
      `insert into field.receipt_attempts
        (target_kind, target_id, subject_hash, failures, window_started_at, blocked_until, updated_at)
       values ($1, $2, $3, 1, now(), null, now())
       on conflict (target_kind, target_id, subject_hash) do update set
         failures = case when field.receipt_attempts.window_started_at <= now() - interval '15 minutes'
           then 1 else least(field.receipt_attempts.failures + 1, 5) end,
         window_started_at = case when field.receipt_attempts.window_started_at <= now() - interval '15 minutes'
           then now() else field.receipt_attempts.window_started_at end,
         blocked_until = case when field.receipt_attempts.window_started_at <= now() - interval '15 minutes'
           then null when field.receipt_attempts.failures >= 4 then now() + interval '15 minutes'
           else field.receipt_attempts.blocked_until end,
         updated_at = now()`, [route.kind, route.id, key]);
    return payload;
  });
}
