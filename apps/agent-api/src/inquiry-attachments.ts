import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { normalizeInquiryImage } from './inquiry-media.js';
import { integratorGrant } from './integrator-auth.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function receiptHash(request: FastifyRequest) {
  const header = request.headers.authorization;
  const key = header?.startsWith('Bearer ') ? header.slice(7) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(key) ? hash(key) : null;
}

type AttachmentRow = { id: string; message_id: string; byte_size: number; width: number; height: number; created_at: Date };
export async function inquiryAttachments(pool: Pool | PoolClient, inquiryId: string) {
  const result = await pool.query<AttachmentRow>(
    `select id, message_id, byte_size, width, height, created_at
     from ap.inquiry_attachments where inquiry_id = $1 and state = 'ready'
     order by created_at, id`, [inquiryId]);
  return result.rows.map(row => ({ id: row.id, messageId: row.message_id,
    contentType: 'image/webp', byteSize: row.byte_size, width: row.width,
    height: row.height, createdAt: row.created_at.toISOString() }));
}

type PhotoRow = { object_key: string; sha256: string };
type ExistingPhotoRow = { id: string; byte_size: number; width: number; height: number };
function photoReceipt(row: ExistingPhotoRow, messageId: string) {
  return { id: row.id, messageId, state: 'ready', contentType: 'image/webp',
    byteSize: row.byte_size, width: row.width, height: row.height };
}
async function sendPhoto(reply: FastifyReply, runtime: BusinessRuntime, row: PhotoRow) {
  if (!runtime.inquiryMedia) return reply.code(503).send({ error: 'blocked_integration' });
  try {
    const image = await runtime.inquiryMedia.get(row.object_key);
    if (!image || hash(image) !== row.sha256) return reply.code(503).send({ error: 'media_unavailable' });
    return reply.header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff').type('image/webp').send(image);
  } catch { return reply.code(503).send({ error: 'media_unavailable' }); }
}

export function registerInquiryAttachmentRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get<{ Params: { actionId: string; attachmentId: string } }>(
    '/integrations/v1/action-requests/:actionId/attachments/:attachmentId',
    async (request, reply) => {
      const grant = await integratorGrant(request, reply, runtime, 'ap.conversations.read');
      if (!grant) return reply;
      const { actionId, attachmentId } = request.params;
      if (!uuidPattern.test(actionId) || !uuidPattern.test(attachmentId))
        return reply.code(404).send({ error: 'attachment_not_found' });
      const selected = await runtime.pool.query<PhotoRow>(
        `select p.object_key,p.sha256 from ap.field_action_requests a
         join ap.inquiries i on i.id = a.inquiry_id and i.organization_id = a.organization_id
         join ap.field_connections c on c.id = a.connection_id
           and c.ap_organization_id = a.organization_id
         join ap.inquiry_attachments p on p.id = $2
           and p.inquiry_id = i.id and p.organization_id = i.organization_id
         join ap.inquiry_messages m on m.id = p.message_id and m.inquiry_id = i.id
         where a.id = $1 and a.organization_id = $3 and a.state in
           ('sending','delivery_unknown','accepted_external')
           and c.ap_grant_id = $4 and c.ap_agent_id = $5
           and c.initiator_user_id = $6 and c.status = 'review_required'
           and i.deployment_id = any($7::uuid[])
           and a.field_request_body->'attachmentRefs' ? $2::text
           and a.field_request_body->'consent'->'items' ? 'attachments'
           and p.state = 'ready' and m.actor = 'customer'
           and m.visibility = 'customer'
           and m.delivery_state in ('blocked_integration','not_applicable')`,
        [actionId, attachmentId, grant.organization_id, grant.id, grant.agent_id,
          grant.actor_user_id, grant.allowed_deployment_ids]);
      if (!selected.rows[0]) return reply.code(404).send({ error: 'attachment_not_found' });
      return sendPhoto(reply, runtime, selected.rows[0]);
    },
  );
  app.post<{ Params: { id: string; messageId: string } }>(
    '/v1/inquiries/:id/messages/:messageId/attachments', { bodyLimit: 8 * 1024 * 1024 },
    async (request, reply) => {
      const keyHash = receiptHash(request);
      if (!keyHash) return reply.code(401).send({ error: 'receipt_key_required' });
      const { id, messageId } = request.params;
      if (!uuidPattern.test(id) || !uuidPattern.test(messageId))
        return reply.code(404).send({ error: 'message_not_found' });
      const access = await runtime.pool.query<{ organization_id: string }>(
        `select i.organization_id from ap.inquiries i
         join ap.inquiry_messages m on m.inquiry_id = i.id
         where i.id = $1 and m.id = $2 and m.actor = 'customer'
           and m.visibility = 'customer'
           and (m.delivery_state = 'blocked_integration'
             or (i.mode = 'human' and m.delivery_state = 'not_applicable'
               and exists (select 1 from ap.notification_events n where n.inquiry_id = i.id
                 and n.source_message_id = m.id and n.suppression_reason = 'spam'))
             or (i.mode = 'external' and m.delivery_state = 'not_applicable'
               and m.sequence = i.next_sequence - 1))
           and i.consent_at is not null and i.visitor_key_hash = $3`,
        [id, messageId, keyHash]);
      const organizationId = access.rows[0]?.organization_id;
      if (!organizationId) return reply.code(401).send({ error: 'invalid_receipt_key' });
      if (!runtime.inquiryMedia) return reply.code(503).send({ error: 'blocked_integration' });
      if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: 'unsupported_image' });
      const normalized = await normalizeInquiryImage(request.body);
      if (!normalized) return reply.code(415).send({ error: 'unsupported_image' });
      const sha256 = hash(normalized.data);
      const existing = await runtime.pool.query<ExistingPhotoRow>(
        `select id, byte_size, width, height from ap.inquiry_attachments
         where message_id = $1 and sha256 = $2`, [messageId, sha256]);
      if (existing.rows[0]) return reply.header('Cache-Control', 'private, no-store').code(200)
        .send(photoReceipt(existing.rows[0], messageId));
      const attachmentId = randomUUID();
      const objectKey = `${organizationId}/${attachmentId}.webp`;
      try { await runtime.inquiryMedia.put(objectKey, normalized.data); }
      catch { return reply.code(503).send({ error: 'media_unavailable' }); }
      const client = await runtime.pool.connect();
      try {
        await client.query('begin');
        const stillAllowed = await client.query(
          `select i.id from ap.inquiries i join ap.inquiry_messages m on m.inquiry_id = i.id
           where i.id = $1 and m.id = $2 and m.actor = 'customer'
             and m.visibility = 'customer'
             and (m.delivery_state = 'blocked_integration'
               or (i.mode = 'human' and m.delivery_state = 'not_applicable'
                 and exists (select 1 from ap.notification_events n where n.inquiry_id = i.id
                   and n.source_message_id = m.id and n.suppression_reason = 'spam'))
               or (i.mode = 'external' and m.delivery_state = 'not_applicable'
                 and m.sequence = i.next_sequence - 1))
             and i.consent_at is not null and i.visitor_key_hash = $3
           for update of i`, [id, messageId, keyHash]);
        if (!stillAllowed.rows[0]) {
          await client.query('rollback');
          await runtime.inquiryMedia.delete(objectKey).catch(() => undefined);
          return reply.code(401).send({ error: 'invalid_receipt_key' });
        }
        const previous = await client.query<ExistingPhotoRow>(
          `select id, byte_size, width, height from ap.inquiry_attachments
           where message_id = $1 and sha256 = $2`, [messageId, sha256]);
        if (previous.rows[0]) {
          await client.query('rollback');
          await runtime.inquiryMedia.delete(objectKey).catch(() => undefined);
          return reply.header('Cache-Control', 'private, no-store').code(200)
            .send(photoReceipt(previous.rows[0], messageId));
        }
        const count = await client.query<{ count: string }>(
          'select count(*)::text as count from ap.inquiry_attachments where message_id = $1', [messageId]);
        if (Number(count.rows[0]?.count ?? 0) >= 5) {
          await client.query('rollback');
          await runtime.inquiryMedia.delete(objectKey).catch(() => undefined);
          return reply.code(429).send({ error: 'attachment_limit' });
        }
        await client.query(
          `insert into ap.inquiry_attachments
             (id, organization_id, inquiry_id, message_id, object_key, content_type,
              byte_size, width, height, sha256)
           values ($1, $2, $3, $4, $5, 'image/webp', $6, $7, $8, $9)`,
          [attachmentId, organizationId, id, messageId, objectKey, normalized.data.length,
            normalized.width, normalized.height, sha256]);
        await client.query('commit');
        return reply.header('Cache-Control', 'private, no-store').code(201).send({
          id: attachmentId, messageId, state: 'ready', contentType: 'image/webp',
          byteSize: normalized.data.length, width: normalized.width, height: normalized.height,
        });
      } catch (error) {
        await client.query('rollback');
        await runtime.inquiryMedia.delete(objectKey).catch(() => undefined);
        throw error;
      } finally { client.release(); }
    },
  );

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/v1/inquiries/:id/attachments/:attachmentId', async (request, reply) => {
      const keyHash = receiptHash(request);
      if (!keyHash) return reply.code(401).send({ error: 'receipt_key_required' });
      const { id, attachmentId } = request.params;
      if (!uuidPattern.test(id) || !uuidPattern.test(attachmentId))
        return reply.code(404).send({ error: 'attachment_not_found' });
      const result = await runtime.pool.query<PhotoRow>(
        `select a.object_key, a.sha256 from ap.inquiry_attachments a
         join ap.inquiries i on i.id = a.inquiry_id
         where a.id = $1 and a.inquiry_id = $2 and i.visitor_key_hash = $3 and a.state = 'ready'`,
        [attachmentId, id, keyHash]);
      if (!result.rows[0]) return reply.code(401).send({ error: 'invalid_receipt_key' });
      return sendPhoto(reply, runtime, result.rows[0]);
    },
  );

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/v1/owner/inquiries/:id/attachments/:attachmentId', async (request, reply) => {
      const userId = await runtime.resolveUserId(request.headers);
      if (!userId) return reply.code(401).send({ error: 'authentication_required' });
      const { id, attachmentId } = request.params;
      if (!uuidPattern.test(id) || !uuidPattern.test(attachmentId))
        return reply.code(404).send({ error: 'attachment_not_found' });
      const result = await runtime.pool.query<PhotoRow>(
        `select a.object_key, a.sha256 from ap.inquiry_attachments a
         join ap.memberships m on m.organization_id = a.organization_id
         join ap.inquiries i on i.id = a.inquiry_id and i.organization_id = a.organization_id
         where a.id = $1 and a.inquiry_id = $2 and m.user_id = $3
           and m.role in ('owner', 'editor') and a.state = 'ready' and i.mode = 'human'`,
        [attachmentId, id, userId]);
      if (!result.rows[0]) return reply.code(404).send({ error: 'attachment_not_found' });
      return sendPhoto(reply, runtime, result.rows[0]);
    },
  );
}
