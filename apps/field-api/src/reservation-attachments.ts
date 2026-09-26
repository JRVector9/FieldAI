import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { normalizeSiteImage } from './site-media.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function receiptHash(request: FastifyRequest) {
  const header = request.headers.authorization;
  const key = header?.startsWith('Bearer ') ? header.slice(7) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(key) ? hash(key) : null;
}
type AttachmentRow = { id: string; byte_size: number; width: number; height: number; created_at: Date };
type ExistingRow = Omit<AttachmentRow, 'created_at'>;
type PhotoRow = { object_key: string; sha256: string };

export async function reservationAttachments(pool: Pool | PoolClient, reservationId: string) {
  const result = await pool.query<AttachmentRow>(
    `select id, byte_size, width, height, created_at from field.reservation_attachments
     where reservation_id = $1 and state = 'ready' order by created_at, id`, [reservationId]);
  return result.rows.map(row => ({ id: row.id, contentType: 'image/webp', byteSize: row.byte_size,
    width: row.width, height: row.height, createdAt: row.created_at.toISOString() }));
}
function photoReceipt(row: ExistingRow) {
  return { id: row.id, state: 'ready', contentType: 'image/webp',
    byteSize: row.byte_size, width: row.width, height: row.height };
}
async function sendPhoto(reply: FastifyReply, runtime: FieldBusinessRuntime, row: PhotoRow) {
  if (!runtime.inquiryMedia) return reply.code(503).send({ error: 'blocked_integration' });
  try {
    const image = await runtime.inquiryMedia.get(row.object_key);
    if (!image || hash(image) !== row.sha256) return reply.code(503).send({ error: 'media_unavailable' });
    return reply.header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff').type('image/webp').send(image);
  } catch { return reply.code(503).send({ error: 'media_unavailable' }); }
}

export function registerReservationAttachmentRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.post<{ Params: { id: string } }>(
    '/v1/reservations/:id/attachments', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
      const keyHash = receiptHash(request);
      if (!keyHash) return reply.code(401).send({ error: 'receipt_key_required' });
      const reservationId = request.params.id;
      if (!uuid.test(reservationId)) return reply.code(404).send({ error: 'reservation_not_found' });
      const access = await runtime.pool.query<{ organization_id: string }>(
        `select organization_id from field.reservations
         where id = $1 and visitor_key_hash = $2`, [reservationId, keyHash]);
      const organizationId = access.rows[0]?.organization_id;
      if (!organizationId) return reply.code(404).send({ error: 'reservation_not_found' });
      if (!runtime.inquiryMedia) return reply.code(503).send({ error: 'blocked_integration' });
      if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: 'unsupported_image' });
      const normalized = await normalizeSiteImage(request.body);
      if (!normalized) return reply.code(415).send({ error: 'unsupported_image' });
      const sha256 = hash(normalized.data);
      const existing = await runtime.pool.query<ExistingRow>(
        `select id, byte_size, width, height from field.reservation_attachments
         where reservation_id = $1 and sha256 = $2`, [reservationId, sha256]);
      if (existing.rows[0]) return reply.header('Cache-Control', 'private, no-store').code(200)
        .send(photoReceipt(existing.rows[0]));
      const attachmentId = randomUUID();
      const objectKey = `${organizationId}/${attachmentId}.webp`;
      try { await runtime.inquiryMedia.put(objectKey, normalized.data); }
      catch { return reply.code(503).send({ error: 'media_unavailable' }); }
      const client = await runtime.pool.connect();
      try {
        await client.query('begin');
        const allowed = await client.query(
          `select id from field.reservations where id = $1 and visitor_key_hash = $2 for update`,
          [reservationId, keyHash]);
        if (!allowed.rows[0]) {
          await client.query('rollback');
          await runtime.inquiryMedia.delete(objectKey).catch(() => undefined);
          return reply.code(404).send({ error: 'reservation_not_found' });
        }
        const previous = await client.query<ExistingRow>(
          `select id, byte_size, width, height from field.reservation_attachments
           where reservation_id = $1 and sha256 = $2`, [reservationId, sha256]);
        if (previous.rows[0]) {
          await client.query('rollback');
          await runtime.inquiryMedia.delete(objectKey).catch(() => undefined);
          return reply.header('Cache-Control', 'private, no-store').code(200)
            .send(photoReceipt(previous.rows[0]));
        }
        const count = await client.query<{ count: string }>(
          'select count(*)::text as count from field.reservation_attachments where reservation_id = $1',
          [reservationId]);
        if (Number(count.rows[0]?.count ?? 0) >= 5) {
          await client.query('rollback');
          await runtime.inquiryMedia.delete(objectKey).catch(() => undefined);
          return reply.code(429).send({ error: 'attachment_limit' });
        }
        await client.query(
          `insert into field.reservation_attachments
             (id, organization_id, reservation_id, object_key, content_type,
              byte_size, width, height, sha256)
           values ($1, $2, $3, $4, 'image/webp', $5, $6, $7, $8)`,
          [attachmentId, organizationId, reservationId, objectKey, normalized.data.length,
            normalized.width, normalized.height, sha256]);
        await client.query('commit');
        return reply.header('Cache-Control', 'private, no-store').code(201)
          .send(photoReceipt({ id: attachmentId, byte_size: normalized.data.length,
            width: normalized.width, height: normalized.height }));
      } catch (error) {
        await client.query('rollback');
        await runtime.inquiryMedia.delete(objectKey).catch(() => undefined);
        throw error;
      } finally { client.release(); }
    },
  );

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/v1/reservations/:id/attachments/:attachmentId', async (request, reply) => {
      const keyHash = receiptHash(request);
      if (!keyHash) return reply.code(401).send({ error: 'receipt_key_required' });
      const { id, attachmentId } = request.params;
      if (!uuid.test(id) || !uuid.test(attachmentId))
        return reply.code(404).send({ error: 'attachment_not_found' });
      const result = await runtime.pool.query<PhotoRow>(
        `select a.object_key, a.sha256 from field.reservation_attachments a
         join field.reservations r on r.id = a.reservation_id
         where a.id = $1 and a.reservation_id = $2 and r.visitor_key_hash = $3 and a.state = 'ready'`,
        [attachmentId, id, keyHash]);
      if (!result.rows[0]) return reply.code(404).send({ error: 'attachment_not_found' });
      return sendPhoto(reply, runtime, result.rows[0]);
    },
  );

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/v1/owner/reservations/:id/attachments/:attachmentId', async (request, reply) => {
      const userId = await runtime.resolveUserId(request.headers);
      if (!userId) return reply.code(401).send({ error: 'authentication_required' });
      const { id, attachmentId } = request.params;
      if (!uuid.test(id) || !uuid.test(attachmentId))
        return reply.code(404).send({ error: 'attachment_not_found' });
      const result = await runtime.pool.query<PhotoRow>(
        `select a.object_key, a.sha256 from field.reservation_attachments a
         join field.memberships m on m.organization_id = a.organization_id
         where a.id = $1 and a.reservation_id = $2 and m.user_id = $3
           and m.role in ('owner', 'editor') and a.state = 'ready'`, [attachmentId, id, userId]);
      if (!result.rows[0]) return reply.code(404).send({ error: 'attachment_not_found' });
      return sendPhoto(reply, runtime, result.rows[0]);
    },
  );
}
