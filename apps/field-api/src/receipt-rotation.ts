import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type Kind = 'inquiry' | 'reservation';
const locations = {
  inquiry: { source: 'field.inquiries', audit: 'field.inquiry_receipt_rotations', column: 'inquiry_id' },
  reservation: { source: 'field.reservations', audit: 'field.reservation_receipt_rotations', column: 'reservation_id' },
} as const;

async function rotate(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply,
  runtime: FieldBusinessRuntime, kind: Kind) {
  const location = locations[kind];
  const missingError = kind === 'inquiry' ? 'invalid_receipt_key' : 'reservation_not_found';
  const requiredError = kind === 'inquiry' ? 'receipt_key_required' : 'receipt_required';
  const oldHeader = request.headers.authorization;
  const oldKey = oldHeader?.startsWith('Bearer ') ? oldHeader.slice(7) : '';
  if (!keyPattern.test(oldKey)) return reply.code(401).send({ error: requiredError });
  if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: missingError });
  const body = request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body as Record<string, unknown> : null;
  const next = body?.nextReceiptKey;
  const attempt = request.headers['idempotency-key'];
  if (typeof next !== 'string' || !keyPattern.test(next) || next === oldKey
      || typeof attempt !== 'string' || !keyPattern.test(attempt))
    return reply.code(400).send({ error: 'invalid_receipt_rotation' });
  const oldHash = hash(oldKey);
  const newHash = hash(next);
  const attemptHash = hash(attempt);
  const client = await runtime.pool.connect();
  try {
    await client.query('begin');
    const found = await client.query<{ visitor_key_hash: string | null }>(
      `select visitor_key_hash from ${location.source} where id = $1 for update`, [request.params.id]);
    const current = found.rows[0]?.visitor_key_hash;
    if (!current) {
      await client.query('rollback');
      return reply.code(404).send({ error: missingError });
    }
    const prior = await client.query<{ old_key_hash: string; new_key_hash: string }>(
      `select old_key_hash, new_key_hash from ${location.audit}
       where ${location.column} = $1 and attempt_hash = $2`, [request.params.id, attemptHash]);
    const replay = prior.rows[0];
    if (current !== oldHash) {
      await client.query('rollback');
      if (replay?.old_key_hash === oldHash && replay.new_key_hash === newHash)
        return current === newHash
          ? reply.header('Cache-Control', 'no-store').code(200).send({ state: 'rotated' })
          : reply.code(409).send({ error: 'receipt_rotation_superseded' });
      return reply.code(kind === 'inquiry' ? 401 : 404).send({ error: missingError });
    }
    if (replay) {
      await client.query('rollback');
      return reply.code(409).send({ error: 'idempotency_conflict' });
    }
    const used = await client.query(
      `select 1 from ${location.audit} where ${location.column} = $1
         and (old_key_hash = $2 or new_key_hash = $2) limit 1`, [request.params.id, newHash]);
    if (used.rows[0]) {
      await client.query('rollback');
      return reply.code(409).send({ error: 'receipt_key_reused' });
    }
    await client.query(`update ${location.source} set visitor_key_hash = $2, updated_at = now() where id = $1`,
      [request.params.id, newHash]);
    await client.query(
      `insert into ${location.audit}(${location.column}, attempt_hash, old_key_hash, new_key_hash)
       values ($1,$2,$3,$4)`, [request.params.id, attemptHash, oldHash, newHash]);
    await client.query('commit');
    return reply.header('Cache-Control', 'no-store').code(200).send({ state: 'rotated' });
  } catch (error) {
    await client.query('rollback');
    if ((error as { code?: string }).code === '23505') return reply.code(409).send({ error: 'receipt_key_conflict' });
    throw error;
  } finally { client.release(); }
}

export function registerFieldReceiptRotationRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.post<{ Params: { id: string } }>('/v1/inquiries/:id/receipt-key/rotate',
    (request, reply) => rotate(request, reply, runtime, 'inquiry'));
  app.post<{ Params: { id: string } }>('/v1/reservations/:id/receipt-key/rotate',
    (request, reply) => rotate(request, reply, runtime, 'reservation'));
}
