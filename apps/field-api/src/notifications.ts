import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerFieldNotificationRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get('/v1/owner/notifications', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const result = await runtime.pool.query<{
      id: string; organization_id: string; target_id: string; event_type: string;
      created_at: Date; read_at: Date | null;
    }>(
      `select n.id, n.organization_id, n.target_id, o.event_type, n.created_at, r.read_at
       from field.notification_events n
       join field.outbox o on o.id = n.outbox_id
       join field.memberships m on m.organization_id = n.organization_id
       left join field.notification_reads r on r.notification_id = n.id and r.user_id = $1
       where m.user_id = $1 and m.role in ('owner', 'editor') and n.audience = 'owner'
       order by n.created_at desc, n.id desc limit 100`, [userId]);
    const count = await runtime.pool.query<{ unread_count: string }>(
      `select count(*)::text as unread_count from field.notification_events n
       join field.memberships m on m.organization_id = n.organization_id
       left join field.notification_reads r on r.notification_id = n.id and r.user_id = $1
       where m.user_id = $1 and m.role in ('owner', 'editor') and n.audience = 'owner'
         and r.notification_id is null`, [userId]);
    return { notifications: result.rows.map(row => ({ id: row.id, organizationId: row.organization_id,
      targetId: row.target_id,
      targetKind: row.event_type === 'field.external_request.accepted' ? 'external_request'
        : row.event_type.startsWith('field.inquiry.') ? 'inquiry'
          : row.event_type.startsWith('field.moderation.') ? 'moderation_report' : 'reservation',
      eventType: row.event_type, createdAt: row.created_at.toISOString(),
      readAt: row.read_at?.toISOString() ?? null })),
    unreadCount: Number(count.rows[0]?.unread_count ?? 0) };
  });

  app.post<{ Params: { id: string } }>('/v1/owner/notifications/:id/read', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'notification_not_found' });
    const event = await runtime.pool.query<{ id: string }>(
      `select n.id from field.notification_events n
       join field.memberships m on m.organization_id = n.organization_id
       where n.id = $1 and n.audience = 'owner' and m.user_id = $2
         and m.role in ('owner', 'editor')`, [request.params.id, userId]);
    if (!event.rows[0]) return reply.code(404).send({ error: 'notification_not_found' });
    await runtime.pool.query(
      'insert into field.notification_reads(notification_id, user_id) values ($1, $2) on conflict do nothing',
      [request.params.id, userId]);
    return { id: request.params.id, read: true };
  });
}
