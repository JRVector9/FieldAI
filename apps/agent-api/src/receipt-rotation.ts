import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BusinessRuntime } from './business.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function oldKey(request: FastifyRequest) {
  const header = request.headers.authorization;
  const key = header?.startsWith('Bearer ') ? header.slice(7) : '';
  return keyPattern.test(key) ? key : null;
}

export function registerAgentReceiptRotationRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.post<{ Params: { id: string } }>('/v1/inquiries/:id/receipt-key/rotate', async (request, reply) => {
    const key = oldKey(request);
    if (!key) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const body = request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body)
      ? request.body as Record<string, unknown> : null;
    const next = body?.nextReceiptKey;
    const attempt = request.headers['idempotency-key'];
    if (typeof next !== 'string' || !keyPattern.test(next) || next === key
        || typeof attempt !== 'string' || !keyPattern.test(attempt))
      return reply.code(400).send({ error: 'invalid_receipt_rotation' });
    const oldHash = hash(key);
    const newHash = hash(next);
    const attemptHash = hash(attempt);
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const found = await client.query<{ visitor_key_hash: string | null }>(
        'select visitor_key_hash from ap.inquiries where id = $1 for update', [request.params.id]);
      const current = found.rows[0]?.visitor_key_hash;
      if (!current) {
        await client.query('rollback');
        return reply.code(401).send({ error: 'invalid_receipt_key' });
      }
      const prior = await client.query<{ old_key_hash: string; new_key_hash: string }>(
        'select old_key_hash, new_key_hash from ap.inquiry_receipt_rotations where inquiry_id = $1 and attempt_hash = $2',
        [request.params.id, attemptHash]);
      const replay = prior.rows[0];
      if (current !== oldHash) {
        await client.query('rollback');
        if (replay?.old_key_hash === oldHash && replay.new_key_hash === newHash)
          return current === newHash
            ? reply.header('Cache-Control', 'no-store').code(200).send({ state: 'rotated' })
            : reply.code(409).send({ error: 'receipt_rotation_superseded' });
        return reply.code(401).send({ error: 'invalid_receipt_key' });
      }
      if (replay) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'idempotency_conflict' });
      }
      const used = await client.query(
        'select 1 from ap.inquiry_receipt_rotations where inquiry_id = $1 and (old_key_hash = $2 or new_key_hash = $2) limit 1',
        [request.params.id, newHash]);
      if (used.rows[0]) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'receipt_key_reused' });
      }
      await client.query('update ap.inquiries set visitor_key_hash = $2, updated_at = now() where id = $1',
        [request.params.id, newHash]);
      await client.query(
        'insert into ap.inquiry_receipt_rotations(inquiry_id, attempt_hash, old_key_hash, new_key_hash) values ($1,$2,$3,$4)',
        [request.params.id, attemptHash, oldHash, newHash]);
      await client.query('commit');
      return reply.header('Cache-Control', 'no-store').code(200).send({ state: 'rotated' });
    } catch (error) {
      await client.query('rollback');
      if ((error as { code?: string }).code === '23505') return reply.code(409).send({ error: 'receipt_key_conflict' });
      throw error;
    } finally { client.release(); }
  });
}
