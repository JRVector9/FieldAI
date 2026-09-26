import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxBytes = 64 * 1024 * 1024;
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');

type MediaRow = { id: string; inquiry_id?: string; message_id?: string; reservation_id?: string; object_key: string;
  byte_size: number; width: number; height: number; sha256: string; created_at: Date };
type InquiryRow = { id: string; state: string; customer_name: string; customer_phone: string;
  service_snapshot: unknown; catalog_revision: number; consent_at: Date | null;
  is_test: boolean; test_site_revision: number | null; visit_region: string | null; created_at: Date };
type MessageRow = { id: string; inquiry_id: string; sender: string; visibility: string;
  body: string; delivery_state: string; created_at: Date };
type InquiryResolutionRow = { inquiry_id: string; event_type: string; revision: number;
  actor_user_id: string | null; source_message_id: string | null; created_at: Date };
type ReservationMessageRow = { id: string; reservation_id: string; sender: string;
  actor_user_id: string | null; body: string; created_at: Date };
type ReservationRow = { id: string; catalog_revision: number; service_snapshot: unknown; booking_mode: string;
  customer_name: string; customer_phone: string; preferred_time_text: string | null;
  request_message: string | null; visit_region: string | null;
  requested_start_at: Date | null; confirmed_start_at: Date | null; confirmed_end_at: Date | null;
  proposal_start_at: Date | null; proposal_end_at: Date | null; proposal_accepted_at: Date | null;
  change_preferred_text: string | null; source: string; timezone: string; state: string;
  revision: number; consent_at: Date | null; created_at: Date; updated_at: Date };
type EventRow = { reservation_id: string; revision: number; actor_type: string; event_type: string;
  previous_state: string | null; next_state: string; detail: unknown; occurred_at: Date };
type NotificationRow = { reservation_id: string; id: string; event_type: string; audience: string;
  channel: string; state: string; created_at: Date };
type SourceRow = { reservation_id: string; id: string; provider: string; connection_id: string;
  action_request_id: string; summary: string; consent_confirmed_at: Date; is_test: boolean; received_at: Date };
type ExternalRequestRow = { id: string; provider: string; connection_id: string;
  action_request_id: string; kind: string; service_snapshot: unknown;
  customer_snapshot: unknown; request_snapshot: unknown; summary: string;
  consent_confirmed_at: Date; is_test: boolean; reservation_id: string | null;
  status: string; received_at: Date };
type ExternalAttachmentRow = { id: string; external_request_id: string; source_attachment_id: string;
  state: string; object_key: string | null; sha256: string | null; byte_size: number | null;
  width: number | null; height: number | null; copied_at: Date | null;
  error_code: string | null; created_at: Date };
type CopiedExternalAttachment = ExternalAttachmentRow & { object_key: string; sha256: string;
  byte_size: number; width: number; height: number };

function copied(row: ExternalAttachmentRow): row is CopiedExternalAttachment {
  return row.state === 'copied' && row.object_key !== null && row.sha256 !== null
    && row.byte_size !== null && row.width !== null && row.height !== null;
}

async function collect(db: PoolClient, organizationId: string) {
  const organization = (await db.query<{ id: string; name: string; created_at: Date }>(
    `select id,name,created_at from field.organizations where id=$1`, [organizationId])).rows[0];
  const account = (await db.query<{ id: string; name: string; email: string;
    email_verified: boolean; created_at: Date; updated_at: Date }>(
    `select u.id,u.name,u.email,u."emailVerified" as email_verified,
       u."createdAt" as created_at,u."updatedAt" as updated_at
     from "user" u join field.organizations o on o.owner_user_id=u.id where o.id=$1`,
    [organizationId])).rows[0];
  if (!organization || !account) throw new Error('archive_owner_missing');
  const memberships = (await db.query<{ user_id: string; name: string; email: string;
    role: string; created_at: Date }>(
    `select m.user_id,u.name,u.email,m.role,m.created_at from field.memberships m
       join "user" u on u.id=m.user_id where m.organization_id=$1
     order by m.created_at,m.user_id limit 501`, [organizationId])).rows;
  const trialSubscription = (await db.query<{ id: string; consent_version: string;
    started_by: string; started_at: Date; ends_at: Date;
    cancel_requested_at: Date | null; cancel_requested_by: string | null }>(
    `select id,consent_version,started_by,started_at,ends_at,
       cancel_requested_at,cancel_requested_by
     from field.trial_subscriptions where organization_id=$1`, [organizationId])).rows[0] ?? null;
  const apConnections = (await db.query<{ id: string; ap_issuer: string;
    ap_agent_name: string; ap_agent_revision: number; allowed_deployment_ids: string[];
    scopes: string[]; status: string; created_at: Date; updated_at: Date;
    outbound_revocation_state: string | null; outbound_acknowledged_at: Date | null;
    inbound_revoked_at: Date | null }>(
    `select c.id,c.ap_issuer,c.ap_agent_name,c.ap_agent_revision,
       c.allowed_deployment_ids,c.scopes,c.status,c.created_at,c.updated_at,
       r.state as outbound_revocation_state,r.acknowledged_at as outbound_acknowledged_at,
       rr.received_at as inbound_revoked_at
     from field.ap_connections c
       left join field.ap_connection_revocations r on r.connection_id=c.id
       left join field.ap_received_connection_revocations rr on rr.connection_id=c.id
     where c.organization_id=$1 order by c.created_at,c.id limit 501`, [organizationId])).rows;
  const catalogDraft = (await db.query<{ revision: number; content: unknown; updated_at: Date }>(
    `select revision,content,updated_at from field.catalog_drafts where organization_id=$1`, [organizationId])).rows[0] ?? null;
  const catalogReleases = (await db.query<{ revision: number; content: unknown; approved_at: Date }>(
    `select revision,content,approved_at from field.catalog_releases where organization_id=$1 order by revision limit 501`,
    [organizationId])).rows;
  const site = (await db.query<{ id: string; slug: string; created_at: Date }>(
    `select id,slug,created_at from field.sites where organization_id=$1`, [organizationId])).rows[0] ?? null;
  const siteDraft = site ? (await db.query<{ revision: number; content: unknown; updated_at: Date }>(
    `select revision,content,updated_at from field.site_drafts where site_id=$1`, [site.id])).rows[0] ?? null : null;
  const siteReleases = site ? (await db.query<{ revision: number; content: unknown; catalog_revision: number; published_at: Date }>(
    `select revision,content,catalog_revision,published_at from field.site_releases where site_id=$1 order by revision limit 501`,
    [site.id])).rows : [];
  const siteAssets = (await db.query<MediaRow>(
    `select id,object_key,byte_size,width,height,sha256,created_at from field.site_assets
     where organization_id=$1 and state='ready' order by created_at,id limit 501`, [organizationId])).rows;
  const bookingPolicy = (await db.query<{ revision: number; timezone: string; weekly: unknown;
    closed_dates: unknown; special_dates: unknown; before_minutes: number; after_minutes: number;
    min_lead_minutes: number; horizon_days: number; updated_at: Date }>(
      `select revision,timezone,weekly,closed_dates,special_dates,before_minutes,after_minutes,
         min_lead_minutes,horizon_days,updated_at from field.booking_policies where organization_id=$1`,
      [organizationId])).rows[0] ?? null;
  const manualBlocks = (await db.query<{ id: string; label: string | null; start_at: Date; end_at: Date; created_at: Date }>(
    `select id,label,lower(occupied) as start_at,upper(occupied) as end_at,created_at
     from field.occupancies where organization_id=$1 and source='manual' order by created_at,id limit 501`,
    [organizationId])).rows;
  const inquiries = (await db.query<InquiryRow>(
    `select id,state,customer_name,customer_phone,service_snapshot,catalog_revision,consent_at,
       is_test,test_site_revision,visit_region,created_at
     from field.inquiries where organization_id=$1 order by created_at,id limit 501`, [organizationId])).rows;
  const reservations = (await db.query<ReservationRow>(
    `select id,catalog_revision,service_snapshot,booking_mode,customer_name,customer_phone,
       preferred_time_text,request_message,visit_region,requested_start_at,confirmed_start_at,confirmed_end_at,
       proposal_start_at,proposal_end_at,proposal_accepted_at,change_preferred_text,
       source,timezone,state,revision,consent_at,created_at,updated_at
     from field.reservations where organization_id=$1 order by created_at,id limit 501`,
    [organizationId])).rows;
  if ([memberships, apConnections, catalogReleases, siteReleases, siteAssets, manualBlocks, inquiries, reservations]
    .some(rows => rows.length > 500)) return null;
  const sizes = (await db.query<{ message_bytes: string; inquiry_media_bytes: string;
    reservation_media_bytes: string;
    site_media_bytes: string; external_media_bytes: string }>(
    `select
       ((select coalesce(sum(octet_length(m.body)),0) from field.inquiry_messages m
         join field.inquiries i on i.id=m.inquiry_id where i.organization_id=$1)
        + (select coalesce(sum(octet_length(m.body)),0) from field.reservation_messages m
           where m.organization_id=$1))::text as message_bytes,
       (select coalesce(sum(a.byte_size),0)::text from field.inquiry_attachments a
         where a.organization_id=$1 and a.state='ready') as inquiry_media_bytes,
       (select coalesce(sum(a.byte_size),0)::text from field.reservation_attachments a
         where a.organization_id=$1 and a.state='ready') as reservation_media_bytes,
       (select coalesce(sum(a.byte_size),0)::text from field.site_assets a
         where a.organization_id=$1 and a.state='ready') as site_media_bytes,
       (select coalesce(sum(a.byte_size),0)::text from field.external_request_attachments a
         where a.organization_id=$1 and a.state='copied') as external_media_bytes`,
    [organizationId])).rows[0];
  if (Number(sizes?.message_bytes ?? 0) +
    1.34 * (Number(sizes?.inquiry_media_bytes ?? 0) + Number(sizes?.reservation_media_bytes ?? 0)
      + Number(sizes?.site_media_bytes ?? 0)
      + Number(sizes?.external_media_bytes ?? 0)) > maxBytes - 1024 * 1024) return null;
  const messages = (await db.query<MessageRow>(
    `select m.id,m.inquiry_id,m.sender,m.visibility,m.body,m.delivery_state,m.created_at
     from field.inquiry_messages m join field.inquiries i on i.id=m.inquiry_id
     where i.organization_id=$1 order by i.created_at,i.id,m.created_at,m.id limit 10001`, [organizationId])).rows;
  const inquiryResolutions = (await db.query<InquiryResolutionRow>(
    `select e.inquiry_id,e.event_type,e.revision,e.actor_user_id,e.source_message_id,e.created_at
     from field.inquiry_resolution_events e join field.inquiries i on i.id=e.inquiry_id
     where i.organization_id=$1 order by i.created_at,i.id,e.revision limit 10001`, [organizationId])).rows;
  const reservationMessages = (await db.query<ReservationMessageRow>(
    `select id,reservation_id,sender,actor_user_id,body,created_at
     from field.reservation_messages where organization_id=$1
     order by reservation_id,created_at,id limit 10001`, [organizationId])).rows;
  const inquiryPhotos = (await db.query<MediaRow>(
    `select id,inquiry_id,message_id,object_key,byte_size,width,height,sha256,created_at
     from field.inquiry_attachments where organization_id=$1 and state='ready'
     order by created_at,id limit 501`, [organizationId])).rows;
  const reservationPhotos = (await db.query<MediaRow>(
    `select id,reservation_id,object_key,byte_size,width,height,sha256,created_at
     from field.reservation_attachments where organization_id=$1 and state='ready'
     order by created_at,id limit 501`, [organizationId])).rows;
  const events = (await db.query<EventRow>(
    `select e.reservation_id,e.revision,e.actor_type,e.event_type,e.previous_state,
     e.next_state,e.detail,e.occurred_at from field.reservation_events e
     where e.organization_id=$1 order by e.reservation_id,e.revision limit 10001`, [organizationId])).rows;
  const notifications = (await db.query<NotificationRow>(
    `select r.id as reservation_id,n.id,o.event_type,n.audience,n.channel,n.state,n.created_at
     from field.notification_events n join field.outbox o on o.id=n.outbox_id
     join field.reservations r on r.id::text=o.aggregate_id and r.organization_id=$1
     where n.organization_id=$1 and o.organization_id=$1
     order by r.id,n.created_at,n.id limit 10001`, [organizationId])).rows;
  const sources = (await db.query<SourceRow>(
     `select reservation_id,id,provider,connection_id,action_request_id,summary,
       consent_confirmed_at,is_test,received_at from field.external_work_requests
     where organization_id=$1 and reservation_id is not null order by received_at,id limit 501`, [organizationId])).rows;
  const externalRequests = (await db.query<ExternalRequestRow>(
    `select id,provider,connection_id,action_request_id,kind,service_snapshot,
       customer_snapshot,request_snapshot,summary,consent_confirmed_at,is_test,
       reservation_id,status,received_at from field.external_work_requests
     where organization_id=$1 order by received_at,id limit 501`, [organizationId])).rows;
  const externalAttachments = (await db.query<ExternalAttachmentRow>(
    `select id,external_request_id,source_attachment_id,state,object_key,sha256,
       byte_size,width,height,copied_at,error_code,created_at from field.external_request_attachments
     where organization_id=$1 order by created_at,id limit 2501`, [organizationId])).rows;
  if ([messages, inquiryResolutions, reservationMessages, events, notifications].some(rows => rows.length > 10000) ||
      [inquiryPhotos, reservationPhotos, sources, externalRequests].some(rows => rows.length > 500) ||
      externalAttachments.length > 2500) return null;
  return { organization, account, memberships, trialSubscription, apConnections,
    catalogDraft, catalogReleases, site, siteDraft, siteReleases, siteAssets,
    bookingPolicy, manualBlocks, inquiries, messages, inquiryResolutions, reservationMessages,
    inquiryPhotos, reservationPhotos, reservations, events,
    notifications, sources, externalRequests, externalAttachments };
}

function group<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    if (!result.has(id)) result.set(id, []);
    result.get(id)!.push(row);
  }
  return result;
}

export function registerOperationsArchiveRoute(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get<{ Params: { id: string } }>('/v1/owner/organizations/:id/operations/export', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const organizationId = request.params.id;
    if (!uuid.test(organizationId)) return reply.code(404).send({ error: 'organization_not_found' });
    const db = await runtime.pool.connect();
    let snapshot: Awaited<ReturnType<typeof collect>>;
    try {
      await db.query('begin isolation level repeatable read read only');
      const owner = await db.query(`select 1 from field.memberships
        where organization_id=$1 and user_id=$2 and role='owner'`, [organizationId, userId]);
      if (!owner.rowCount) {
        await db.query('rollback');
        return reply.code(404).send({ error: 'organization_not_found' });
      }
      snapshot = await collect(db, organizationId);
      await db.query('commit');
    } catch (error) {
      await db.query('rollback');
      throw error;
    } finally { db.release(); }
    if (!snapshot) return reply.code(413).send({ error: 'archive_too_large', limit: '500 records / 64 MiB' });
    const copiedExternalPhotos = snapshot.externalAttachments.filter(copied);
    if (((snapshot.inquiryPhotos.length || snapshot.reservationPhotos.length || copiedExternalPhotos.length)
        && !runtime.inquiryMedia) ||
        (snapshot.siteAssets.length && !runtime.siteMedia))
      return reply.code(503).send({ error: 'blocked_integration' });
    const photos = new Map<string, string>();
    for (const [kind, rows, media] of [
      ['inquiry', snapshot.inquiryPhotos, runtime.inquiryMedia],
      ['reservation', snapshot.reservationPhotos, runtime.inquiryMedia],
      ['site', snapshot.siteAssets, runtime.siteMedia],
      ['external', copiedExternalPhotos, runtime.inquiryMedia],
    ] as const) {
      for (const item of rows) {
        let file: Buffer | null;
        try { file = await media!.get(item.object_key); }
        catch { return reply.code(503).send({ error: 'media_unavailable' }); }
        if (!file || file.length !== item.byte_size || hash(file) !== item.sha256)
          return reply.code(503).send({ error: 'media_unavailable' });
        photos.set(`${kind}:${item.id}`, file.toString('base64'));
      }
    }
    const byInquiryMessages = group(snapshot.messages, row => row.inquiry_id);
    const byInquiryResolutions = group(snapshot.inquiryResolutions, row => row.inquiry_id);
    const byReservationMessages = group(snapshot.reservationMessages, row => row.reservation_id);
    const byInquiryPhotos = group(snapshot.inquiryPhotos, row => row.inquiry_id!);
    const byReservationPhotos = group(snapshot.reservationPhotos, row => row.reservation_id!);
    const byReservationEvents = group(snapshot.events, row => row.reservation_id);
    const byReservationNotifications = group(snapshot.notifications, row => row.reservation_id);
    const byReservationSources = group(snapshot.sources, row => row.reservation_id);
    const byExternalAttachments = group(snapshot.externalAttachments, row => row.external_request_id);
    const archive = Buffer.from(JSON.stringify({
      formatVersion: 'field-operations-archive.v1', product: 'field', exportedAt: new Date().toISOString(),
      organization: snapshot.organization,
      account: { id: snapshot.account.id, name: snapshot.account.name,
        email: snapshot.account.email, emailVerified: snapshot.account.email_verified,
        createdAt: snapshot.account.created_at, updatedAt: snapshot.account.updated_at },
      memberships: snapshot.memberships.map(item => ({ userId: item.user_id,
        name: item.name, email: item.email, role: item.role, createdAt: item.created_at })),
      trialSubscription: snapshot.trialSubscription ? { id: snapshot.trialSubscription.id,
        consentVersion: snapshot.trialSubscription.consent_version,
        startedBy: snapshot.trialSubscription.started_by,
        startedAt: snapshot.trialSubscription.started_at, endsAt: snapshot.trialSubscription.ends_at,
        cancelRequestedAt: snapshot.trialSubscription.cancel_requested_at,
        cancelRequestedBy: snapshot.trialSubscription.cancel_requested_by } : null,
      apConnections: snapshot.apConnections.map(item => ({ id: item.id,
        issuer: item.ap_issuer, agentName: item.ap_agent_name,
        agentRevision: item.ap_agent_revision,
        allowedDeploymentIds: item.allowed_deployment_ids, scopes: item.scopes,
        status: item.status, createdAt: item.created_at, updatedAt: item.updated_at,
        outboundRevocationState: item.outbound_revocation_state,
        outboundAcknowledgedAt: item.outbound_acknowledged_at,
        inboundRevokedAt: item.inbound_revoked_at })),
      catalog: { draft: snapshot.catalogDraft, releases: snapshot.catalogReleases },
      site: snapshot.site ? { id: snapshot.site.id, slug: snapshot.site.slug,
        createdAt: snapshot.site.created_at, draft: snapshot.siteDraft,
        releases: snapshot.siteReleases } : null,
      siteAssets: snapshot.siteAssets.map(item => ({ id: item.id, contentType: 'image/webp',
        byteSize: item.byte_size, width: item.width, height: item.height,
        sha256: item.sha256, createdAt: item.created_at, dataBase64: photos.get(`site:${item.id}`) })),
      bookingPolicy: snapshot.bookingPolicy,
      manualBlocks: snapshot.manualBlocks,
      inquiries: snapshot.inquiries.map(row => ({ id: row.id, state: row.state,
        customerName: row.customer_name, customerPhone: row.customer_phone,
        serviceSnapshot: row.service_snapshot, catalogRevision: row.catalog_revision,
        consentAt: row.consent_at, isTest: row.is_test, visitRegion: row.visit_region,
        testSiteRevision: row.test_site_revision, createdAt: row.created_at,
        messages: (byInquiryMessages.get(row.id) ?? []).map(message => ({ id: message.id,
          sender: message.sender, visibility: message.visibility, body: message.body,
          deliveryState: message.delivery_state, createdAt: message.created_at })),
        resolutionEvents: (byInquiryResolutions.get(row.id) ?? []).map(event => ({
          eventType: event.event_type, revision: event.revision,
          actorUserId: event.actor_user_id, sourceMessageId: event.source_message_id,
          createdAt: event.created_at,
        })),
        attachments: (byInquiryPhotos.get(row.id) ?? []).map(item => ({ id: item.id,
          messageId: item.message_id, contentType: 'image/webp', byteSize: item.byte_size,
          width: item.width, height: item.height, sha256: item.sha256,
          createdAt: item.created_at, dataBase64: photos.get(`inquiry:${item.id}`) })),
      })),
      reservations: snapshot.reservations.map(row => ({ id: row.id,
        catalogRevision: row.catalog_revision, serviceSnapshot: row.service_snapshot,
        bookingMode: row.booking_mode, customerName: row.customer_name, customerPhone: row.customer_phone,
        preferredTimeText: row.preferred_time_text, requestMessage: row.request_message,
        visitRegion: row.visit_region, requestedStartAt: row.requested_start_at,
        confirmedStartAt: row.confirmed_start_at, confirmedEndAt: row.confirmed_end_at,
        proposalStartAt: row.proposal_start_at, proposalEndAt: row.proposal_end_at,
        proposalAcceptedAt: row.proposal_accepted_at, changePreferredText: row.change_preferred_text,
        source: row.source, timezone: row.timezone, state: row.state, revision: row.revision,
        consentAt: row.consent_at, createdAt: row.created_at, updatedAt: row.updated_at,
        messages: (byReservationMessages.get(row.id) ?? []).map(message => ({ id: message.id,
          sender: message.sender, actorUserId: message.actor_user_id,
          body: message.body, createdAt: message.created_at })),
        events: byReservationEvents.get(row.id) ?? [],
        notifications: byReservationNotifications.get(row.id) ?? [],
        attachments: (byReservationPhotos.get(row.id) ?? []).map(item => ({ id: item.id,
          contentType: 'image/webp', byteSize: item.byte_size, width: item.width,
          height: item.height, sha256: item.sha256,
          createdAt: item.created_at, dataBase64: photos.get(`reservation:${item.id}`) })),
        externalSources: byReservationSources.get(row.id) ?? [],
      })),
      externalRequests: snapshot.externalRequests.map(row => ({ id: row.id,
        provider: row.provider, connectionId: row.connection_id,
        actionRequestId: row.action_request_id, kind: row.kind,
        serviceSnapshot: row.service_snapshot, customerSnapshot: row.customer_snapshot,
        requestSnapshot: row.request_snapshot, summary: row.summary,
        consentConfirmedAt: row.consent_confirmed_at, isTest: row.is_test,
        reservationId: row.reservation_id, status: row.status, receivedAt: row.received_at,
        attachments: (byExternalAttachments.get(row.id) ?? []).map(item => ({
          id: item.id, sourceAttachmentId: item.source_attachment_id, state: item.state,
          errorCode: item.error_code,
          contentType: item.state === 'copied' ? 'image/webp' : null,
          byteSize: item.byte_size, width: item.width, height: item.height,
          sha256: item.sha256, copiedAt: item.copied_at, createdAt: item.created_at,
          ...(item.state === 'copied' ? { dataBase64: photos.get(`external:${item.id}`) } : {}),
        })),
      })),
    }));
    if (archive.length > maxBytes)
      return reply.code(413).send({ error: 'archive_too_large', limit: '64 MiB' });
    const recorded = await runtime.pool.query(
      `insert into field.operations_archive_audit
       (id,organization_id,actor_user_id,inquiry_count,reservation_count,media_count,byte_size,sha256)
       select $1,$2,$3,$4,$5,$6,$7,$8 from field.memberships
         where organization_id=$2 and user_id=$3 and role='owner' returning id`,
      [randomUUID(), organizationId, userId, snapshot.inquiries.length, snapshot.reservations.length,
        snapshot.inquiryPhotos.length + snapshot.reservationPhotos.length
          + snapshot.siteAssets.length + copiedExternalPhotos.length,
        archive.length, hash(archive)]);
    if (!recorded.rowCount) return reply.code(404).send({ error: 'organization_not_found' });
    return reply.header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', `attachment; filename="field-operations-${organizationId}.json"`)
      .type('application/json; charset=utf-8').send(archive);
  });
}
