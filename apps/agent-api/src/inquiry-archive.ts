import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { retainReadGuardThroughResponse } from './retention-read-guard.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxArchiveBytes = 64 * 1024 * 1024;
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');

type InquiryRow = { id: string; state: string; customer_name: string; customer_phone: string;
  retention_work_purged_at: Date | null; retention_photos_purged_at: Date | null;
  service_snapshot: unknown; knowledge_revision: number; consent_at: Date; created_at: Date };
type MessageRow = { id: string; inquiry_id: string; sequence: string; actor: string;
  visibility: string; body: string; delivery_state: string; created_at: Date };
type AttachmentRow = { id: string; inquiry_id: string; message_id: string; object_key: string;
  byte_size: number; width: number; height: number; sha256: string; created_at: Date };
type ResolutionRow = { inquiry_id: string; event_type: string; revision: number;
  actor_user_id: string | null; source_message_id: string | null; created_at: Date };
type AccountRow = { id: string; name: string; email: string; email_verified: boolean;
  created_at: Date; updated_at: Date };
type MembershipRow = { user_id: string; name: string; email: string; role: string; created_at: Date };
type TrialRow = { id: string; consent_version: string; started_by: string;
  started_at: Date; ends_at: Date; cancel_requested_at: Date | null;
  cancel_requested_by: string | null };
type DraftRow = { revision: number; content: unknown; updated_at: Date };
type ReleaseRow = { id: string; revision: number; content: unknown;
  approved_at: Date };
type AgentDraftRow = DraftRow & { agent_id: string };
type AgentReleaseRow = ReleaseRow & { agent_id: string; knowledge_revision: number };
type DeploymentRow = { id: string; public_id: string; kind: string;
  allowed_origin: string | null; verified_at: Date | null; status: string;
  agent_release_id: string | null; knowledge_revision: number | null;
  created_at: Date; updated_at: Date };

export function registerInquiryArchiveRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get<{ Params: { id: string } }>('/v1/owner/organizations/:id/inquiries/export', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const organizationId = request.params.id;
    if (!uuidPattern.test(organizationId)) return reply.code(404).send({ error: 'organization_not_found' });

    const db = await runtime.pool.connect();
    let inquiries: InquiryRow[];
    let messages: MessageRow[];
    let attachments: AttachmentRow[];
    let resolutionEvents: ResolutionRow[];
    let account: AccountRow;
    let organization: { id: string; name: string; created_at: Date };
    let memberships: MembershipRow[];
    let trialSubscription: TrialRow | null;
    let knowledgeDraft: DraftRow | null;
    let knowledgeReleases: ReleaseRow[];
    let agentDraft: AgentDraftRow | null;
    let agentReleases: AgentReleaseRow[];
    let deployments: DeploymentRow[];
    try {
      await db.query('begin isolation level repeatable read read only');
      const member = await db.query(
        `select 1 from ap.memberships where organization_id = $1 and user_id = $2 and role = 'owner'`,
        [organizationId, userId]);
      if (!member.rowCount) {
        await db.query('rollback');
        return reply.code(404).send({ error: 'organization_not_found' });
      }
      const owner = (await db.query<{ organization_id: string; organization_name: string;
        organization_created_at: Date } & AccountRow>(
        `select o.id as organization_id,o.name as organization_name,
           o.created_at as organization_created_at,u.id,u.name,u.email,
           u."emailVerified" as email_verified,u."createdAt" as created_at,
           u."updatedAt" as updated_at
         from ap.organizations o join "user" u on u.id=o.owner_user_id where o.id=$1`,
        [organizationId])).rows[0];
      if (!owner) throw new Error('archive_owner_missing');
      organization = { id: owner.organization_id, name: owner.organization_name,
        created_at: owner.organization_created_at };
      account = owner;
      memberships = (await db.query<MembershipRow>(
        `select m.user_id,u.name,u.email,m.role,m.created_at from ap.memberships m
           join "user" u on u.id=m.user_id where m.organization_id=$1
         order by m.created_at,m.user_id limit 501`, [organizationId])).rows;
      trialSubscription = (await db.query<TrialRow>(
        `select id,consent_version,started_by,started_at,ends_at,
           cancel_requested_at,cancel_requested_by from ap.trial_subscriptions
         where organization_id=$1`, [organizationId])).rows[0] ?? null;
      knowledgeDraft = (await db.query<DraftRow>(
        `select revision,content,updated_at from ap.knowledge_drafts where organization_id=$1`,
        [organizationId])).rows[0] ?? null;
      knowledgeReleases = (await db.query<ReleaseRow>(
        `select id,revision,content,approved_at from ap.knowledge_releases
         where organization_id=$1 order by revision limit 501`, [organizationId])).rows;
      agentDraft = (await db.query<AgentDraftRow>(
        `select agent_id,revision,content,updated_at from ap.agent_drafts where organization_id=$1`,
        [organizationId])).rows[0] ?? null;
      agentReleases = (await db.query<AgentReleaseRow>(
        `select id,agent_id,revision,content,knowledge_revision,approved_at
         from ap.agent_releases where organization_id=$1 order by revision limit 501`,
        [organizationId])).rows;
      deployments = (await db.query<DeploymentRow>(
        `select id,public_id,kind,allowed_origin,verified_at,status,
           agent_release_id,knowledge_revision,created_at,updated_at
         from ap.deployments where organization_id=$1 order by created_at,id limit 501`,
        [organizationId])).rows;
      if ([memberships, knowledgeReleases, agentReleases, deployments]
        .some(rows => rows.length > 500)) {
        await db.query('rollback');
        return reply.code(413).send({ error: 'archive_too_large', limit: '500 records per type' });
      }
      inquiries = (await db.query<InquiryRow>(
        `select id, state, customer_name, customer_phone, service_snapshot, knowledge_revision,
           consent_at, created_at, retention_work_purged_at, retention_photos_purged_at from ap.inquiries where organization_id = $1 and consent_at is not null
         order by created_at, id limit 501`, [organizationId])).rows;
      if (inquiries.length > 500) {
        await db.query('rollback');
        return reply.code(413).send({ error: 'archive_too_large', limit: '500 inquiries' });
      }
      const sizes = await db.query<{ message_bytes: string; attachment_bytes: string }>(
        `select
           (select coalesce(sum(octet_length(m.body)),0)::text from ap.inquiry_messages m
             join ap.inquiries i on i.id = m.inquiry_id where i.organization_id = $1 and i.consent_at is not null) as message_bytes,
           (select coalesce(sum(a.byte_size),0)::text from ap.inquiry_attachments a
             join ap.inquiries i on i.id = a.inquiry_id where i.organization_id = $1 and i.consent_at is not null
               and a.state = 'ready') as attachment_bytes`, [organizationId]);
      if (Number(sizes.rows[0]?.message_bytes ?? 0) + Number(sizes.rows[0]?.attachment_bytes ?? 0) * 1.34 > maxArchiveBytes - 1024 * 1024) {
        await db.query('rollback');
        return reply.code(413).send({ error: 'archive_too_large', limit: '64 MiB' });
      }
      messages = (await db.query<MessageRow>(
        `select m.id, m.inquiry_id, m.sequence, m.actor, m.visibility, m.body, m.delivery_state, m.created_at
         from ap.inquiry_messages m join ap.inquiries i on i.id = m.inquiry_id
         where i.organization_id = $1 and i.consent_at is not null
         order by i.created_at, i.id, m.sequence`, [organizationId])).rows;
      attachments = (await db.query<AttachmentRow>(
        `select a.id, a.inquiry_id, a.message_id, a.object_key, a.byte_size, a.width, a.height,
           a.sha256, a.created_at from ap.inquiry_attachments a
         join ap.inquiries i on i.id = a.inquiry_id
         where i.organization_id = $1 and i.consent_at is not null and a.state = 'ready'
         order by i.created_at, i.id, a.created_at, a.id`, [organizationId])).rows;
      resolutionEvents = (await db.query<ResolutionRow>(
        `select e.inquiry_id, e.event_type, e.revision, e.actor_user_id, e.source_message_id, e.created_at
         from ap.inquiry_resolution_events e join ap.inquiries i on i.id = e.inquiry_id
         where i.organization_id = $1 and i.consent_at is not null
         order by i.created_at, i.id, e.revision`, [organizationId])).rows;
      await db.query('commit');
    } catch (error) {
      await db.query('rollback');
      throw error;
    } finally { db.release(); }

    if (attachments.length && !runtime.inquiryMedia)
      return reply.code(503).send({ error: 'blocked_integration' });
    const photos = new Map<string, string>();
    for (const attachment of attachments) {
      let file: Buffer | null;
      try { file = await runtime.inquiryMedia!.get(attachment.object_key); }
      catch { return reply.code(503).send({ error: 'media_unavailable' }); }
      if (!file || file.length !== attachment.byte_size || sha256(file) !== attachment.sha256)
        return reply.code(503).send({ error: 'media_unavailable' });
      photos.set(attachment.id, file.toString('base64'));
    }
    const messageGroups = new Map<string, MessageRow[]>();
    for (const message of messages) {
      if (!messageGroups.has(message.inquiry_id)) messageGroups.set(message.inquiry_id, []);
      messageGroups.get(message.inquiry_id)!.push(message);
    }
    const attachmentGroups = new Map<string, AttachmentRow[]>();
    for (const attachment of attachments) {
      if (!attachmentGroups.has(attachment.inquiry_id)) attachmentGroups.set(attachment.inquiry_id, []);
      attachmentGroups.get(attachment.inquiry_id)!.push(attachment);
    }
    const resolutionGroups = new Map<string, ResolutionRow[]>();
    for (const event of resolutionEvents) {
      if (!resolutionGroups.has(event.inquiry_id)) resolutionGroups.set(event.inquiry_id, []);
      resolutionGroups.get(event.inquiry_id)!.push(event);
    }
    const archive = Buffer.from(JSON.stringify({
      formatVersion: 'ap-inquiries-archive.v1', product: 'agent', organizationId,
      exportedAt: new Date().toISOString(),
      scope: 'AP owner account, organization settings, trial, deployments and direct inquiries',
      organization,
      account: { id: account.id, name: account.name, email: account.email,
        emailVerified: account.email_verified, createdAt: account.created_at,
        updatedAt: account.updated_at },
      memberships: memberships.map(item => ({ userId: item.user_id,
        name: item.name, email: item.email, role: item.role, createdAt: item.created_at })),
      trialSubscription: trialSubscription ? { id: trialSubscription.id,
        consentVersion: trialSubscription.consent_version,
        startedBy: trialSubscription.started_by, startedAt: trialSubscription.started_at,
        endsAt: trialSubscription.ends_at,
        cancelRequestedAt: trialSubscription.cancel_requested_at,
        cancelRequestedBy: trialSubscription.cancel_requested_by } : null,
      knowledge: { draft: knowledgeDraft, releases: knowledgeReleases },
      agent: { draft: agentDraft, releases: agentReleases },
      deployments: deployments.map(row => ({ id: row.id, publicId: row.public_id,
        kind: row.kind, allowedOrigin: row.allowed_origin, verifiedAt: row.verified_at,
        status: row.status, agentReleaseId: row.agent_release_id,
        knowledgeRevision: row.knowledge_revision, createdAt: row.created_at,
        updatedAt: row.updated_at })),
      inquiries: inquiries.map(row => ({
        id: row.id, state: row.state, customerName: row.customer_name,
        customerPhone: row.customer_phone, serviceSnapshot: row.service_snapshot,
        retention: { workPurgedAt: row.retention_work_purged_at?.toISOString() ?? null,
          photosPurgedAt: row.retention_photos_purged_at?.toISOString() ?? null },
        knowledgeRevision: row.knowledge_revision, consentAt: row.consent_at, createdAt: row.created_at,
        messages: (messageGroups.get(row.id) ?? []).map(message => ({
          id: message.id, sequence: message.sequence, actor: message.actor,
          visibility: message.visibility, body: message.body,
          deliveryState: message.delivery_state, createdAt: message.created_at,
        })),
        resolutionEvents: (resolutionGroups.get(row.id) ?? []).map(event => ({
          eventType: event.event_type, revision: event.revision,
          actorUserId: event.actor_user_id, sourceMessageId: event.source_message_id,
          createdAt: event.created_at,
        })),
        attachments: (attachmentGroups.get(row.id) ?? []).map(attachment => ({
          id: attachment.id, messageId: attachment.message_id, contentType: 'image/webp',
          byteSize: attachment.byte_size, width: attachment.width, height: attachment.height,
          sha256: attachment.sha256, createdAt: attachment.created_at,
          dataBase64: photos.get(attachment.id),
        })),
      })),
    }));
    if (archive.length > maxArchiveBytes)
      return reply.code(413).send({ error: 'archive_too_large', limit: '64 MiB' });
    const guard = await runtime.pool.connect();
    let retained = false;
    try {
      await guard.query('begin');
    // File reads can outlive a cleanup transaction; never send its earlier private snapshot.
    const current = await guard.query<Pick<InquiryRow, 'id' | 'retention_work_purged_at' | 'retention_photos_purged_at'>>(
      `select id,retention_work_purged_at,retention_photos_purged_at from ap.inquiries
       where organization_id=$1 and id=any($2::uuid[]) order by id for share`,
      [organizationId,inquiries.map(row=>row.id)]);
    const original = new Map(inquiries.map(row=>[row.id,row]));
    if (current.rows.length !== inquiries.length || current.rows.some(row=>{
      const before=original.get(row.id)!;
      return row.retention_work_purged_at?.getTime() !== before.retention_work_purged_at?.getTime()
        || row.retention_photos_purged_at?.getTime() !== before.retention_photos_purged_at?.getTime();
    })) return reply.header('Cache-Control','private, no-store').code(409).send({error:'archive_changed_retry'});
    await guard.query("select 1 from ap.memberships where organization_id=$1 and user_id=$2 and role='owner' for share",[organizationId,userId]);
    const recorded = await runtime.pool.query(
      `insert into ap.inquiry_archive_audit
       (id, organization_id, actor_user_id, inquiry_count, attachment_count, byte_size, sha256)
       select $1,$2,$3,$4,$5,$6,$7 from ap.memberships
         where organization_id = $2 and user_id = $3 and role = 'owner'
       returning id`,
      [randomUUID(), organizationId, userId, inquiries.length, attachments.length,
        archive.length, sha256(archive)]);
    if (!recorded.rowCount) return reply.code(404).send({ error: 'organization_not_found' });
    retainReadGuardThroughResponse(reply,guard); retained=true;
    return reply.header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', `attachment; filename="ap-inquiries-${organizationId}.json"`)
      .type('application/json; charset=utf-8').send(archive);
    } finally { if (!retained) { try { await guard.query('rollback'); } finally { guard.release(); } } }
  });
}
