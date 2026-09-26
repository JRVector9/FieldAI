import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Photo = { id: string; source_attachment_id: string; state: string;
  object_key: string | null; sha256: string | null; byte_size: number | null;
  width: number | null; height: number | null; error_code: string | null; created_at: Date };

export function registerExternalRequestAttachmentRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  async function permitted(requestId: string, userId: string) {
    const found = await runtime.pool.query<{ organization_id: string }>(
      `select w.organization_id from field.external_work_requests w
       join field.memberships m on m.organization_id = w.organization_id
         and m.user_id = $2 and m.role in ('owner','editor')
       where w.id = $1`, [requestId, userId]);
    return found.rows[0]?.organization_id ?? null;
  }
  app.get<{ Params: { id: string } }>('/v1/owner/external-requests/:id/attachments',
    async (request, reply) => {
      const userId = await runtime.resolveUserId(request.headers);
      if (!userId) return reply.code(401).send({ error: 'authentication_required' });
      if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'external_request_not_found' });
      const organizationId = await permitted(request.params.id, userId);
      if (!organizationId) return reply.code(404).send({ error: 'external_request_not_found' });
      const found = await runtime.pool.query<Photo>(
        `select id,source_attachment_id,state,object_key,sha256,byte_size,width,height,error_code,created_at
         from field.external_request_attachments
         where external_request_id = $1 and organization_id = $2 order by created_at,id`,
        [request.params.id, organizationId]);
      return reply.header('Cache-Control', 'private, no-store').send({
        externalRequestId: request.params.id,
        attachments: found.rows.map(row => ({ id: row.id, sourceAttachmentId: row.source_attachment_id,
          state: row.state, byteSize: row.byte_size, width: row.width, height: row.height,
          error: row.error_code, createdAt: row.created_at.toISOString() })),
      });
    });

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/v1/owner/external-requests/:id/attachments/:attachmentId', async (request, reply) => {
      const userId = await runtime.resolveUserId(request.headers);
      if (!userId) return reply.code(401).send({ error: 'authentication_required' });
      if (!uuid.test(request.params.id) || !uuid.test(request.params.attachmentId))
        return reply.code(404).send({ error: 'attachment_not_found' });
      const organizationId = await permitted(request.params.id, userId);
      if (!organizationId) return reply.code(404).send({ error: 'attachment_not_found' });
      const found = await runtime.pool.query<Photo>(
        `select id,source_attachment_id,state,object_key,sha256,byte_size,width,height,error_code,created_at
         from field.external_request_attachments where id = $1
           and external_request_id = $2 and organization_id = $3 and state = 'copied'`,
        [request.params.attachmentId, request.params.id, organizationId]);
      const row = found.rows[0];
      if (!row?.object_key || !row.sha256) return reply.code(404).send({ error: 'attachment_not_found' });
      if (!runtime.inquiryMedia) return reply.code(503).send({ error: 'blocked_integration' });
      try {
        const data = await runtime.inquiryMedia.get(row.object_key);
        if (!data || createHash('sha256').update(data).digest('hex') !== row.sha256)
          return reply.code(503).send({ error: 'media_unavailable' });
        return reply.header('Cache-Control', 'private, no-store')
          .header('X-Content-Type-Options', 'nosniff').type('image/webp').send(data);
      } catch { return reply.code(503).send({ error: 'media_unavailable' }); }
    });
}
