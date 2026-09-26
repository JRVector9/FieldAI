import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { receivedWorkRecord, type ReceivedWorkRow } from './received-work-record.js';
import { requestFallback, type FallbackRow } from './public-request-fallback.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');

type ReservationRow = FallbackRow & {
  id: string; organization_id: string; catalog_revision: number; service_snapshot: unknown;
  booking_mode: string; customer_name: string; customer_phone: string;
  preferred_time_text: string | null; request_message: string | null; visit_region: string | null;
  requested_start_at: Date | null;
  confirmed_start_at: Date | null; confirmed_end_at: Date | null;
  proposal_start_at: Date | null; proposal_end_at: Date | null; proposal_accepted_at: Date | null;
  change_preferred_text: string | null; source: string; timezone: string; state: string;
  revision: number; consent_at: Date | null; created_at: Date; updated_at: Date;
};

export function registerReservationExportRoute(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get<{ Params: { id: string } }>('/v1/owner/reservations/:id/export', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'reservation_not_found' });
    const organizationId = request.headers['x-organization-id'];
    if (organizationId !== undefined && (typeof organizationId !== 'string' || !uuid.test(organizationId))) {
      return reply.code(400).send({ error: 'invalid_organization_id' });
    }
    const client = await runtime.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const found = await client.query<ReservationRow>(
        `select r.id, r.organization_id, r.catalog_revision, r.service_snapshot, r.booking_mode,
          r.customer_name, r.customer_phone, r.preferred_time_text, r.request_message,
          r.visit_region, r.requested_start_at,
          r.confirmed_start_at, r.confirmed_end_at, r.proposal_start_at, r.proposal_end_at,
          r.proposal_accepted_at, r.change_preferred_text, r.source, r.timezone, r.state,
          r.revision, r.consent_at, r.created_at, r.updated_at,
          r.fallback_origin,r.fallback_action_request_id,r.fallback_declared_at
         from field.reservations r
         join field.memberships m on m.organization_id = r.organization_id
         where r.id = $1 and m.user_id = $2 and m.role = 'owner'
           and ($3::uuid is null or r.organization_id = $3::uuid)`,
        [request.params.id, userId, organizationId ?? null],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'reservation_not_found' });
      }
      const events = await client.query<{
        revision: number; actor_type: string; event_type: string; previous_state: string | null;
        next_state: string; detail: unknown; occurred_at: Date;
      }>(
        `select revision, actor_type, event_type, previous_state, next_state, detail, occurred_at
         from field.reservation_events
         where reservation_id = $1 and organization_id = $2 order by revision`,
        [row.id, row.organization_id],
      );
      const messages = await client.query<{
        id: string; sender: string; actor_user_id: string | null; body: string; created_at: Date;
      }>(
        `select id,sender,actor_user_id,body,created_at from field.reservation_messages
         where reservation_id = $1 and organization_id = $2 order by created_at,id`,
        [row.id, row.organization_id],
      );
      const notifications = await client.query<{
        id: string; event_type: string; audience: string; channel: string; state: string; created_at: Date;
      }>(
        `select n.id, o.event_type, n.audience, n.channel, n.state, n.created_at
         from field.notification_events n join field.outbox o on o.id = n.outbox_id
         where n.organization_id = $1 and o.organization_id = $1 and o.aggregate_id = $2
         order by n.created_at, n.id`,
        [row.organization_id, row.id],
      );
      const external = await client.query<ReceivedWorkRow & {
        id: string; provider: string; connection_id: string; action_request_id: string;
        summary: string; consent_confirmed_at: Date; is_test: boolean; received_at: Date;
      }>(
        `select id, provider, connection_id, action_request_id, summary,
          consent_confirmed_at, is_test, received_at, consent_record_id, processing_policy
         from field.external_work_requests
         where reservation_id = $1 and organization_id = $2`,
        [row.id, row.organization_id],
      );
      const attachments = await client.query<{
        id: string; object_key: string; byte_size: number; width: number; height: number;
        sha256: string; created_at: Date;
      }>(
        `select id, object_key, byte_size, width, height, sha256, created_at
         from field.reservation_attachments where reservation_id = $1 and organization_id = $2
           and state = 'ready' order by created_at, id`, [row.id, row.organization_id],
      );
      await client.query('commit');
      if (attachments.rows.length && !runtime.inquiryMedia)
        return reply.code(503).send({ error: 'blocked_integration' });
      const photoData = new Map<string, string>();
      for (const attachment of attachments.rows) {
        let image: Buffer | null;
        try { image = await runtime.inquiryMedia!.get(attachment.object_key); }
        catch { return reply.code(503).send({ error: 'media_unavailable' }); }
        if (!image || image.length !== attachment.byte_size || hash(image) !== attachment.sha256)
          return reply.code(503).send({ error: 'media_unavailable' });
        photoData.set(attachment.id, image.toString('base64'));
      }
      const source = external.rows[0];
      return reply.header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename="field-reservation-${row.id}.json"`)
        .send({
          formatVersion: 'field-reservation-export.v1', product: 'field', exportedAt: new Date().toISOString(),
          reservation: {
            id: row.id, organizationId: row.organization_id, catalogRevision: row.catalog_revision,
            serviceSnapshot: row.service_snapshot, bookingMode: row.booking_mode,
            customerName: row.customer_name, customerPhone: row.customer_phone,
            preferredTimeText: row.preferred_time_text, requestMessage: row.request_message,
            visitRegion: row.visit_region, requestedStartAt: row.requested_start_at,
            fallback: requestFallback(row),
            confirmedStartAt: row.confirmed_start_at, confirmedEndAt: row.confirmed_end_at,
            proposalStartAt: row.proposal_start_at, proposalEndAt: row.proposal_end_at,
            proposalAcceptedAt: row.proposal_accepted_at, changePreferredText: row.change_preferred_text,
            source: row.source, timezone: row.timezone, state: row.state, revision: row.revision,
            consentAt: row.consent_at, createdAt: row.created_at, updatedAt: row.updated_at,
          },
          events: events.rows.map(event => ({ revision: event.revision, actorType: event.actor_type,
            eventType: event.event_type, previousState: event.previous_state, nextState: event.next_state,
            detail: event.detail, occurredAt: event.occurred_at })),
          messages: messages.rows.map(message => ({ id: message.id, sender: message.sender,
            actorUserId: message.actor_user_id, body: message.body, createdAt: message.created_at })),
          notifications: notifications.rows.map(notification => ({ id: notification.id,
            eventType: notification.event_type, audience: notification.audience,
            channel: notification.channel, state: notification.state, createdAt: notification.created_at })),
          attachments: attachments.rows.map(attachment => ({ id: attachment.id,
            contentType: 'image/webp', byteSize: attachment.byte_size, width: attachment.width,
            height: attachment.height, sha256: attachment.sha256,
            createdAt: attachment.created_at, dataBase64: photoData.get(attachment.id) })),
          externalSource: source ? { id: source.id, provider: source.provider,
            connectionId: source.connection_id, actionRequestId: source.action_request_id,
            summary: source.summary, consentConfirmedAt: source.consent_confirmed_at,
            isTest: source.is_test, receivedAt: source.received_at,
            receivedRecord: receivedWorkRecord(source) } : null,
        });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });
}
