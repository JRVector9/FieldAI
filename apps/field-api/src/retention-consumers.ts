import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { RETENTION_TABLES, type RetentionKind } from './work-retention.js';

const pattern = /^\/v1\/(owner\/)?(inquiries|reservations|external-requests)\/([0-9a-f-]{36})(?:\/|$)/i;
export function registerFieldRetentionConsumers(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  async function retainedWork(request: FastifyRequest) {
    const path = request.url.split('?', 1)[0]!, match = pattern.exec(path);
    if (!match) return null;
    const kind: RetentionKind = match[2] === 'inquiries' ? 'inquiry' : match[2] === 'reservations' ? 'reservation' : 'external_request';
    const id = match[3]!;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
    const row = (await runtime.pool.query<{ organization_id: string; visitor_key_hash?: string; retention_work_purged_at: Date | null; retention_photos_purged_at: Date | null }>(
      `select organization_id,retention_work_purged_at,retention_photos_purged_at${kind === 'external_request' ? '' : ',visitor_key_hash'}
        from ${RETENTION_TABLES[kind]} where id=$1`, [id])).rows[0];
    if (!row || !row.retention_work_purged_at && !row.retention_photos_purged_at) return null;
    if (match[1]) {
      if (request.headers['x-organization-id'] !== undefined && request.headers['x-organization-id'] !== row.organization_id) return null;
      const user = await runtime.resolveUserId(request.headers);
      if (!user || !(await runtime.pool.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role in ('owner','editor')", [row.organization_id, user])).rowCount) return null;
    } else {
      const key = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : null;
      if (!key || !/^[A-Za-z0-9_-]{43}$/.test(key) || createHash('sha256').update(key).digest('hex') !== row.visitor_key_hash) return null;
    }
    return { workPurgedAt: row.retention_work_purged_at?.toISOString() ?? null, photosPurgedAt: row.retention_photos_purged_at?.toISOString() ?? null };
  }
  app.addHook('preHandler', async (request, reply) => {
    if (['GET','HEAD','OPTIONS'].includes(request.method) || request.url.split('?', 1)[0]?.endsWith('/receipt-key/rotate')) return;
    if ((await retainedWork(request))?.workPurgedAt) return reply.header('Cache-Control', 'private, no-store').code(410).send({ error: 'retention_work_ended' });
  });
  app.addHook('preSerialization', async (request, reply, payload) => {
    if (reply.statusCode !== 200 || !payload || typeof payload !== 'object' || Buffer.isBuffer(payload) || Array.isArray(payload)) return payload;
    const retention = await retainedWork(request);
    return retention ? { ...payload, retention } : payload;
  });
  app.setErrorHandler((error, _request, reply) => {
    if ((error as { code?: string }).code === 'PFR01') return reply.header('Cache-Control', 'private, no-store').code(410).send({ error: 'retention_work_ended' });
    return reply.send(error);
  });
}
