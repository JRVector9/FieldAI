import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { messageAttempt, submissionAttempt, type MessageAttempt } from './submission-attempt.js';
import { inquiryAttachments } from './inquiry-attachments.js';
import { consumePublicSubmission } from './public-submission-limit.js';
import { rejectExpiredTrial } from './trial-access.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function decodeOwnerInquiryCursor(value: unknown, userId: string): { timestamp: string; id: string } | null {
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const cursor = parsed as Record<string, unknown>;
    const timestamp = cursor.timestamp;
    if (cursor.userId !== userId || cursor.kind !== 'owner_inquiry'
      || typeof cursor.id !== 'string' || !uuidPattern.test(cursor.id)
      || typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(timestamp))
      return null;
    const instant = new Date(timestamp);
    return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 19) === timestamp.slice(0, 19)
      ? { timestamp, id: cursor.id } : null;
  } catch { return null; }
}
function encodeOwnerInquiryCursor(userId: string, timestamp: string, id: string) {
  return Buffer.from(JSON.stringify({ userId, kind: 'owner_inquiry', timestamp, id })).toString('base64url');
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}
function keyHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function visitorKey(request: FastifyRequest) {
  const header = request.headers.authorization;
  const key = header?.startsWith('Bearer ') ? header.slice(7) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(key) ? key : null;
}
type InquiryEvent = 'ap.inquiry.created' | 'ap.inquiry.customer_message' | 'ap.inquiry.owner_reply';
export async function recordInquiryEvent(client: PoolClient, organizationId: string, eventType: InquiryEvent,
  inquiryId: string, sourceMessageId: string) {
  const outboxId = randomUUID();
  await client.query(
    'insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
    [outboxId, organizationId, eventType, inquiryId, JSON.stringify({ inquiryId, sourceMessageId })],
  );
  const customer = eventType === 'ap.inquiry.owner_reply';
  await client.query(
    `insert into ap.notification_events(id, organization_id, outbox_id, inquiry_id, source_message_id,
       audience, channel, state) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), organizationId, outboxId, inquiryId, sourceMessageId,
      customer ? 'customer' : 'owner', customer ? 'kakao' : 'in_app',
      customer ? 'blocked_integration' : 'available'],
  );
}
async function ownerUser(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) reply.code(401).send({ error: 'authentication_required' });
  return userId;
}

type InquiryRow = {
  id: string;
  organization_id: string;
  state: string;
  revision: number;
  next_sequence: string;
  customer_name: string;
  customer_phone: string;
  service_snapshot: unknown;
  knowledge_revision: number;
};
async function messages(client: PoolClient | BusinessRuntime['pool'], id: string, customerOnly: boolean) {
  const result = await client.query<{
    id: string; sequence: string; actor: string; visibility: string; body: string; delivery_state: string; created_at: string;
  }>(
    `select id, sequence, actor, visibility, body, delivery_state, created_at from ap.inquiry_messages
     where inquiry_id = $1 and ($2::boolean = false or visibility = 'customer') order by sequence`,
    [id, customerOnly],
  );
  return result.rows;
}
export async function insertMessage(client: PoolClient, inquiryId: string, sequence: string,
  actor: 'customer' | 'owner', visibility: 'customer' | 'internal', body: string,
  attempt?: MessageAttempt, external?: { actorUserId: string; clientId: string; grantId: string },
  suppressNotification = false) {
  const id = randomUUID();
  await client.query(
    `insert into ap.inquiry_messages(id, inquiry_id, sequence, actor, visibility, body, delivery_state,
       submission_key_hash, submission_request_hash,
       external_actor_user_id, external_client_id, external_grant_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, inquiryId, sequence, actor, visibility, body,
      visibility === 'internal' || suppressNotification ? 'not_applicable' : 'blocked_integration',
      attempt?.keyHash ?? null, attempt?.requestHash ?? null,
      external?.actorUserId ?? null, external?.clientId ?? null, external?.grantId ?? null],
  );
  await client.query('update ap.inquiries set next_sequence = next_sequence + 1, revision = revision + 1, updated_at = now() where id = $1', [inquiryId]);
  return id;
}

export async function messageReplay(client: PoolClient, inquiryId: string, attempt?: MessageAttempt) {
  if (!attempt) return null;
  const result = await client.query<{ id: string; submission_request_hash: string; actor: string;
    visibility: string; delivery_state: string }>(
    `select id, submission_request_hash, actor, visibility, delivery_state from ap.inquiry_messages
     where inquiry_id = $1 and submission_key_hash = $2`, [inquiryId, attempt.keyHash]);
  const row = result.rows[0];
  if (!row) return null;
  return row.submission_request_hash === attempt.requestHash
    ? { messageId: row.id, state: row.actor === 'customer' ? row.delivery_state === 'not_applicable' ? 'spam' : 'needs_owner'
      : row.visibility === 'internal' ? null : 'waiting_customer', delivery: row.delivery_state }
    : { error: 'idempotency_conflict' };
}

export function registerAgentInquiryRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get<{ Params: { id: string } }>('/v1/public/organizations/:id/inquiries/recover', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const attempt = submissionAttempt(request.headers, {});
    if (!attempt) return reply.code(400).send({ error: 'invalid_submission_key' });
    const found = await runtime.pool.query<{ id: string; state: string }>(
      `select id, state from ap.inquiries where organization_id = $1
       and submission_key_hash = $2 and visitor_key_hash = $3 and consent_at is not null`,
      [request.params.id, attempt.keyHash, attempt.receiptHash]);
    if (!found.rows[0]) return reply.header('Cache-Control', 'no-store')
      .code(404).send({ error: 'inquiry_not_found' });
    return reply.header('Cache-Control', 'no-store').send({
      id: found.rows[0].id, receiptKey: attempt.receiptKey,
      state: found.rows[0].state, delivery: 'blocked_integration',
    });
  });

  app.post<{ Params: { id: string } }>('/v1/public/organizations/:id/inquiries', async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'organization_not_found' });
    const body = object(request.body);
    const name = text(body?.name, 80);
    const phone = text(body?.phone, 30);
    const message = text(body?.message, 5000);
    const serviceName = body?.serviceName;
    if (!name || !phone || !/^[+\d()\-\s]{9,30}$/.test(phone) || phone.replace(/\D/g, '').length < 9
        || !message || body?.consent !== true
        || (serviceName !== undefined && (typeof serviceName !== 'string' || serviceName.length > 160))) {
      return reply.code(400).send({ error: 'invalid_inquiry' });
    }
    const attempt = submissionAttempt(request.headers, { name: name.trim(), phone: phone.trim(),
      message: message.trim(), serviceName: serviceName ?? null });
    if (attempt === null) return reply.code(400).send({ error: 'invalid_submission_key' });
    const replay = async () => {
      if (!attempt) return null;
      const existing = await runtime.pool.query<{
        id: string; state: string; submission_request_hash: string; visitor_key_hash: string;
      }>(
        'select id, state, submission_request_hash, visitor_key_hash from ap.inquiries where organization_id = $1 and submission_key_hash = $2',
        [request.params.id, attempt.keyHash]);
      const row = existing.rows[0];
      if (!row) return null;
      if (row.submission_request_hash !== attempt.requestHash || row.visitor_key_hash !== attempt.receiptHash)
        return reply.code(409).send({ error: 'idempotency_conflict' });
      return reply.header('Cache-Control', 'no-store').code(200).send({ id: row.id,
        receiptKey: attempt.receiptKey, state: row.state, delivery: 'blocked_integration' });
    };
    const previous = await replay();
    if (previous) return previous;
    const release = await runtime.pool.query<{
      id: string; revision: number; content: { services: { name: string; description: string }[] };
    }>(
      'select id, revision, content from ap.knowledge_releases where organization_id = $1 order by revision desc limit 1',
      [request.params.id],
    );
    if (!release.rows[0]) return reply.code(404).send({ error: 'organization_not_found' });
    const service = serviceName ? release.rows[0].content.services.find(item => item.name === serviceName) : null;
    if (serviceName && !service) return reply.code(400).send({ error: 'service_not_found' });
    const id = randomUUID();
    const key = attempt?.receiptKey ?? randomBytes(32).toString('base64url');
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      if (await rejectExpiredTrial(reply, client, request.params.id)) {
        await client.query('rollback');
        return reply;
      }
      const submissionLimit = await consumePublicSubmission(client, request.params.id, phone);
      if (submissionLimit !== null) {
        await client.query('rollback');
        return reply.header('Retry-After', submissionLimit.retryAfter).header('Cache-Control', 'no-store')
          .code(429).send({ error: 'submission_rate_limited', scope: submissionLimit.scope });
      }
      const inserted = await client.query<{ id: string }>(
        `insert into ap.inquiries
          (id, organization_id, knowledge_release_id, knowledge_revision, service_snapshot,
           customer_name, customer_phone, visitor_key_hash, state, consent_at,
           submission_key_hash, submission_request_hash)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'needs_owner', now(), $9, $10)
         on conflict (organization_id, submission_key_hash) do nothing returning id`,
        [id, request.params.id, release.rows[0].id, release.rows[0].revision,
          service ? JSON.stringify(service) : null, name.trim(), phone.trim(), keyHash(key),
          attempt?.keyHash ?? null, attempt?.requestHash ?? null],
      );
      if (!inserted.rows[0]) {
        await client.query('rollback');
        const result = await replay();
        if (result) return result;
        return reply.code(409).send({ error: 'submission_retry_failed' });
      }
      const messageId = await insertMessage(client, id, '1', 'customer', 'customer', message);
      await recordInquiryEvent(client, request.params.id, 'ap.inquiry.created', id, messageId);
      await client.query('commit');
      return reply.header('Cache-Control', 'no-store').code(201)
        .send({ id, receiptKey: key, state: 'needs_owner', delivery: 'blocked_integration' });
    } catch (error) {
      await client.query('rollback');
      if (attempt && (error as { code?: string }).code === '23505') {
        const result = await replay();
        if (result) return result;
        return reply.code(409).send({ error: 'idempotency_conflict' });
      }
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/inquiries/:id', async (request, reply) => {
    const key = visitorKey(request);
    if (!key) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const result = await runtime.pool.query<InquiryRow>(
      'select id, state, customer_name, service_snapshot, knowledge_revision from ap.inquiries where id = $1 and visitor_key_hash = $2',
      [request.params.id, keyHash(key)],
    );
    const row = result.rows[0];
    if (!row) return reply.code(401).send({ error: 'invalid_receipt_key' });
    return { id: row.id, state: row.state, customerName: row.customer_name,
      service: row.service_snapshot, knowledgeRevision: row.knowledge_revision,
      messages: await messages(runtime.pool, row.id, true),
      attachments: await inquiryAttachments(runtime.pool, row.id) };
  });

  app.get<{ Params: { id: string } }>('/v1/inquiries/:id/messages/recover', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const key = visitorKey(request);
    if (!key) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const attempt = messageAttempt(request.headers, {});
    if (!attempt) return reply.code(400).send({ error: 'invalid_submission_key' });
    const inquiry = await runtime.pool.query<{ id: string }>(
      'select id from ap.inquiries where id = $1 and visitor_key_hash = $2',
      [request.params.id, keyHash(key)],
    );
    if (!inquiry.rows[0]) return reply.code(401).send({ error: 'invalid_receipt_key' });
    const message = await runtime.pool.query<{ id: string; delivery_state: string }>(
      `select id, delivery_state from ap.inquiry_messages where inquiry_id = $1
       and submission_key_hash = $2 and actor = 'customer' and visibility = 'customer'`,
      [request.params.id, attempt.keyHash],
    );
    if (!message.rows[0]) return reply.code(404).send({ error: 'message_not_found' });
    return { messageId: message.rows[0].id, delivery: message.rows[0].delivery_state };
  });

  app.post<{ Params: { id: string } }>('/v1/inquiries/:id/messages', async (request, reply) => {
    const key = visitorKey(request);
    if (!key) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const body = text(object(request.body)?.body, 5000);
    if (!body) return reply.code(400).send({ error: 'invalid_message' });
    const attempt = messageAttempt(request.headers, { actor: 'customer', visibility: 'customer', body });
    if (attempt === null) return reply.code(400).send({ error: 'invalid_submission_key' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<InquiryRow>(
        'select organization_id, state, revision, next_sequence from ap.inquiries where id = $1 and visitor_key_hash = $2 for update',
        [request.params.id, keyHash(key)],
      );
      const row = result.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(401).send({ error: 'invalid_receipt_key' }); }
      const replay = await messageReplay(client, request.params.id, attempt);
      if (replay) {
        await client.query('rollback');
        if ('error' in replay) return reply.code(409).send(replay);
        return reply.code(200).send(replay);
      }
      const isSpam = row.state === 'spam';
      const messageId = await insertMessage(client, request.params.id, row.next_sequence, 'customer', 'customer', body,
        attempt, undefined, isSpam);
      const nextState = isSpam ? 'spam' : 'needs_owner';
      await client.query("update ap.inquiries set state = $2, mode = 'human' where id = $1", [request.params.id, nextState]);
      if (row.state === 'closed') await client.query(
        `insert into ap.inquiry_resolution_events(id, inquiry_id, event_type, revision, source_message_id)
         values ($1, $2, 'reopened', $3, $4)`,
        [randomUUID(), request.params.id, row.revision + 1, messageId]);
      await recordInquiryEvent(client, row.organization_id, 'ap.inquiry.customer_message', request.params.id, messageId);
      await client.query('commit');
      return reply.code(201).send({ messageId, state: nextState, delivery: isSpam ? 'not_applicable' : 'blocked_integration' });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Querystring: { cursor?: string } }>('/v1/owner/inquiries', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    const rawCursor = request.query.cursor;
    const cursor = rawCursor === undefined ? null : decodeOwnerInquiryCursor(rawCursor, userId);
    if (rawCursor !== undefined && !cursor) return reply.code(400).send({ error: 'invalid_inquiry_cursor' });
    const result = await runtime.pool.query<{
      id: string; state: string; customer_name: string; service_snapshot: unknown; created_at: string; updated_at: string;
      cursor_timestamp: string; source_kind: string; has_ai_history: boolean;
    }>(
      `select i.id, i.state, i.customer_name, i.service_snapshot, i.created_at, i.updated_at,
         coalesce(d.kind, 'direct') as source_kind,
         exists (select 1 from ap.inquiry_messages msg where msg.inquiry_id = i.id
           and msg.actor = 'assistant') as has_ai_history,
         to_char(i.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_timestamp
       from ap.inquiries i join ap.memberships m on m.organization_id = i.organization_id
       left join ap.deployments d on d.id = i.deployment_id and d.organization_id = i.organization_id
       where m.user_id = $1 and m.role in ('owner', 'editor') and i.consent_at is not null
         and i.mode = 'human'
         ${cursor ? 'and (i.updated_at, i.id) < ($2::timestamptz, $3::uuid)' : ''}
       order by i.updated_at desc, i.id desc limit 101`,
      cursor ? [userId, cursor.timestamp, cursor.id] : [userId],
    );
    const page = result.rows.slice(0, 100);
    return { inquiries: page.map(item => ({ id: item.id, state: item.state,
      customer_name: item.customer_name, service_snapshot: item.service_snapshot,
      created_at: item.created_at, updated_at: item.updated_at,
      source_kind: item.source_kind, has_ai_history: item.has_ai_history })),
      nextCursor: result.rows.length > 100
        ? encodeOwnerInquiryCursor(userId, page[page.length - 1]!.cursor_timestamp, page[page.length - 1]!.id)
        : null };
  });

  app.get('/v1/owner/notifications', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    const result = await runtime.pool.query<{
      id: string; inquiry_id: string; event_type: string; created_at: string; read_at: string | null;
    }>(
      `select n.id, n.inquiry_id, o.event_type, n.created_at, r.read_at
       from ap.notification_events n
       join ap.outbox o on o.id = n.outbox_id
       join ap.memberships m on m.organization_id = n.organization_id
       left join ap.notification_reads r on r.notification_id = n.id and r.user_id = $1
       where m.user_id = $1 and m.role in ('owner', 'editor') and n.audience = 'owner' and n.state = 'available'
       order by n.created_at desc, n.id desc limit 100`, [userId]);
    const count = await runtime.pool.query<{ unread_count: string }>(
      `select count(*)::text as unread_count from ap.notification_events n
       join ap.memberships m on m.organization_id = n.organization_id
       left join ap.notification_reads r on r.notification_id = n.id and r.user_id = $1
       where m.user_id = $1 and m.role in ('owner', 'editor') and n.audience = 'owner' and n.state = 'available'
         and r.notification_id is null`, [userId]);
    return { notifications: result.rows.map(row => ({ id: row.id, inquiryId: row.inquiry_id,
      eventType: row.event_type, createdAt: row.created_at, readAt: row.read_at })),
    unreadCount: Number(count.rows[0]?.unread_count ?? 0) };
  });

  app.post<{ Params: { id: string } }>('/v1/owner/notifications/:id/read', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'notification_not_found' });
    const result = await runtime.pool.query<{ id: string }>(
      `select n.id from ap.notification_events n join ap.memberships m on m.organization_id = n.organization_id
       where n.id = $1 and n.audience = 'owner' and m.user_id = $2 and m.role in ('owner', 'editor')`,
      [request.params.id, userId]);
    if (!result.rows[0]) return reply.code(404).send({ error: 'notification_not_found' });
    await runtime.pool.query(
      'insert into ap.notification_reads(notification_id, user_id) values ($1,$2) on conflict do nothing',
      [request.params.id, userId]);
    return { id: request.params.id, read: true };
  });

  app.get<{ Params: { id: string } }>('/v1/owner/inquiries/:id', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const result = await runtime.pool.query<InquiryRow & { source_kind: string }>(
      `select i.id, i.state, i.revision, i.customer_name, i.customer_phone, i.service_snapshot, i.knowledge_revision,
         coalesce(d.kind, 'direct') as source_kind
       from ap.inquiries i join ap.memberships m on m.organization_id = i.organization_id
       left join ap.deployments d on d.id = i.deployment_id and d.organization_id = i.organization_id
       where i.id = $1 and m.user_id = $2 and m.role in ('owner', 'editor')
         and i.consent_at is not null and i.mode = 'human'`,
      [request.params.id, userId],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: 'inquiry_not_found' });
    return { id: row.id, state: row.state, revision: row.revision,
      customerName: row.customer_name, customerPhone: row.customer_phone,
      sourceKind: row.source_kind,
      service: row.service_snapshot, knowledgeRevision: row.knowledge_revision,
      messages: await messages(runtime.pool, row.id, false),
      attachments: await inquiryAttachments(runtime.pool, row.id) };
  });

  app.post<{ Params: { id: string } }>('/v1/owner/inquiries/:id/close', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const expectedRevision = object(request.body)?.expectedRevision;
    if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      return reply.code(400).send({ error: 'invalid_expected_revision' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const found = await client.query<InquiryRow>(
        `select i.id, i.state, i.revision from ap.inquiries i
         join ap.memberships m on m.organization_id = i.organization_id
         where i.id = $1 and m.user_id = $2 and m.role in ('owner', 'editor')
           and i.consent_at is not null and i.mode = 'human' for update of i`,
        [request.params.id, userId]);
      const row = found.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'inquiry_not_found' }); }
      if (row.state === 'closed' && row.revision === expectedRevision + 1) {
        await client.query('rollback');
        return { id: row.id, state: row.state, revision: row.revision };
      }
      if (row.revision !== expectedRevision || row.state === 'closed' || row.state === 'spam') {
        await client.query('rollback');
        return reply.code(409).send({ error: 'inquiry_changed', state: row.state, revision: row.revision });
      }
      await client.query("update ap.inquiries set state = 'closed', revision = revision + 1, updated_at = now() where id = $1", [row.id]);
      await client.query(
        `insert into ap.inquiry_resolution_events(id, inquiry_id, event_type, revision, actor_user_id)
         values ($1, $2, 'closed', $3, $4)`,
        [randomUUID(), row.id, row.revision + 1, userId]);
      await client.query('commit');
      return { id: row.id, state: 'closed', revision: row.revision + 1 };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.post<{ Params: { id: string } }>('/v1/owner/inquiries/:id/spam', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const body = object(request.body);
    const expectedRevision = body?.expectedRevision;
    if (typeof body?.spam !== 'boolean' || typeof expectedRevision !== 'number'
      || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      return reply.code(400).send({ error: 'invalid_spam_request' });
    const targetState = body.spam ? 'spam' : 'needs_owner';
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const found = await client.query<InquiryRow>(
        `select i.id, i.state, i.revision from ap.inquiries i
         join ap.memberships m on m.organization_id = i.organization_id
         where i.id = $1 and m.user_id = $2 and m.role in ('owner', 'editor')
           and i.consent_at is not null and i.mode = 'human' for update of i`,
        [request.params.id, userId]);
      const row = found.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'inquiry_not_found' }); }
      if (row.state === targetState && (row.revision === expectedRevision || row.revision === expectedRevision + 1)) {
        await client.query('rollback');
        return { id: row.id, state: row.state, revision: row.revision };
      }
      if (row.revision !== expectedRevision || (!body.spam && row.state !== 'spam')) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'inquiry_changed', state: row.state, revision: row.revision });
      }
      await client.query('update ap.inquiries set state = $2, revision = revision + 1, updated_at = now() where id = $1',
        [row.id, targetState]);
      if (body.spam) await client.query(
        `update ap.notification_events set state = 'not_applicable', suppression_reason = 'spam'
         where inquiry_id = $1 and state in ('available', 'blocked_integration')`, [row.id]);
      await client.query(
        `insert into ap.inquiry_resolution_events(id, inquiry_id, event_type, revision, actor_user_id)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), row.id, body.spam ? 'spam' : 'unspammed', row.revision + 1, userId]);
      await client.query('commit');
      return { id: row.id, state: targetState, revision: row.revision + 1 };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/owner/inquiries/:id/export', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const found = await client.query<{
        id: string; organization_id: string; state: string; customer_name: string; customer_phone: string;
        service_snapshot: unknown; knowledge_revision: number; consent_at: Date; created_at: Date;
      }>(
        `select i.id, i.organization_id, i.state, i.customer_name, i.customer_phone,
           i.service_snapshot, i.knowledge_revision, i.consent_at, i.created_at
         from ap.inquiries i join ap.memberships m on m.organization_id = i.organization_id
         where i.id = $1 and i.consent_at is not null and i.mode = 'human' and m.user_id = $2
           and m.role in ('owner', 'editor')`,
        [request.params.id, userId],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'inquiry_not_found' });
      }
      const transcript = await messages(client, row.id, false);
      const attachments = await inquiryAttachments(client, row.id);
      const resolutionEvents = (await client.query(
        `select event_type as "eventType", revision, actor_user_id as "actorUserId",
           source_message_id as "sourceMessageId", created_at as "createdAt"
         from ap.inquiry_resolution_events where inquiry_id = $1 order by revision`, [row.id])).rows;
      await client.query('commit');
      return reply.header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename="ap-inquiry-${row.id}.json"`)
        .send({ formatVersion: 'ap-inquiry-export.v1', product: 'agent', exportedAt: new Date().toISOString(),
          inquiry: { id: row.id, organizationId: row.organization_id, state: row.state,
            customerName: row.customer_name, customerPhone: row.customer_phone,
            serviceSnapshot: row.service_snapshot, knowledgeRevision: row.knowledge_revision,
            consentAt: row.consent_at, createdAt: row.created_at },
          messages: transcript,
          resolutionEvents,
          attachments: attachments.map(item => ({ ...item,
            downloadPath: `/v1/owner/inquiries/${row.id}/attachments/${item.id}` })) });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  const ownerMessage = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, visibility: 'customer' | 'internal') => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const body = text(object(request.body)?.body, 5000);
    if (!body) return reply.code(400).send({ error: 'invalid_message' });
    const attempt = messageAttempt(request.headers, { actor: 'owner', userId, visibility, body });
    if (attempt === null) return reply.code(400).send({ error: 'invalid_submission_key' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<InquiryRow>(
        `select i.organization_id, i.state, i.next_sequence from ap.inquiries i
         join ap.memberships m on m.organization_id = i.organization_id
         where i.id = $1 and m.user_id = $2 and m.role in ('owner', 'editor')
           and i.consent_at is not null and i.mode = 'human' for update of i`,
        [request.params.id, userId],
      );
      const row = result.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'inquiry_not_found' }); }
      const replay = await messageReplay(client, request.params.id, attempt);
      if (replay) {
        await client.query('rollback');
        if ('error' in replay) return reply.code(409).send(replay);
        return reply.code(200).send({ ...replay, state: replay.state ?? row.state });
      }
      if (row.state === 'closed') { await client.query('rollback'); return reply.code(409).send({ error: 'inquiry_closed' }); }
      if (row.state === 'spam' && visibility === 'customer') {
        await client.query('rollback'); return reply.code(409).send({ error: 'inquiry_spam' });
      }
      const messageId = await insertMessage(client, request.params.id, row.next_sequence, 'owner', visibility, body, attempt);
      if (visibility === 'customer') {
        await client.query("update ap.inquiries set state = 'waiting_customer' where id = $1", [request.params.id]);
        await recordInquiryEvent(client, row.organization_id, 'ap.inquiry.owner_reply', request.params.id, messageId);
      }
      await client.query('commit');
      return reply.code(201).send({ messageId, state: visibility === 'customer' ? 'waiting_customer' : row.state,
        delivery: visibility === 'customer' ? 'blocked_integration' : 'not_applicable' });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  };
  app.post<{ Params: { id: string } }>('/v1/owner/inquiries/:id/replies', (request, reply) => ownerMessage(request, reply, 'customer'));
  app.post<{ Params: { id: string } }>('/v1/owner/inquiries/:id/notes', (request, reply) => ownerMessage(request, reply, 'internal'));
}
