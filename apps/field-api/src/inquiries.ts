import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { inquiryAttachments } from './inquiry-attachments.js';
import { consumePublicMessage, consumePublicSubmission } from './public-submission-limit.js';
import { rejectExpiredTrial } from './trial-access.js';
import { decodeOwnerListCursor, encodeOwnerListCursor } from './owner-list-cursor.js';
import { parseRequestFallback, requestFallback, reviewRequestFallback, type FallbackRow } from './public-request-fallback.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}
function receiptHash(key: string) { return createHash('sha256').update(key).digest('hex'); }
function receiptKey(request: FastifyRequest) {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
type MessageAttempt = { keyHash: string; requestHash: string };
function messageAttempt(request: FastifyRequest, details: Record<string, unknown>): MessageAttempt | null | undefined {
  const key = request.headers['idempotency-key'];
  if (key === undefined) return undefined;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key)) return null;
  return { keyHash: receiptHash(key), requestHash: receiptHash(JSON.stringify(details)) };
}
async function replayMessage(client: PoolClient, inquiryId: string, currentState: string, attempt?: MessageAttempt) {
  if (!attempt) return null;
  const result = await client.query<{ id: string; sender: string; visibility: string; delivery_state: string;
    submission_request_hash: string }>(
    `select id, sender, visibility, delivery_state, submission_request_hash from field.inquiry_messages
     where inquiry_id = $1 and submission_key_hash = $2`, [inquiryId, attempt.keyHash]);
  const row = result.rows[0];
  if (!row) return null;
  return row.submission_request_hash === attempt.requestHash
    ? { messageId: row.id, state: row.visibility === 'internal' ? currentState
      : row.sender === 'customer' ? 'needs_owner' : 'waiting_customer',
      delivery: row.delivery_state }
    : { error: 'idempotency_conflict' };
}
async function outbox(client: PoolClient, organizationId: string, eventType: string, aggregateId: string, sourceMessageId?: string) {
  await client.query(
    'insert into field.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
    [randomUUID(), organizationId, eventType, aggregateId, JSON.stringify({ inquiryId: aggregateId, ...(sourceMessageId ? { sourceMessageId } : {}) })],
  );
}
async function ownerUser(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) reply.code(401).send({ error: 'authentication_required' });
  return userId;
}
async function ownerOrganization(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime, userId: string) {
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuidPattern.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' });
    return null;
  }
  const result = await runtime.pool.query<{ organization_id: string }>(
    `select organization_id from field.memberships
     where user_id = $1 and role in ('owner', 'editor')
       and ($2::uuid is null or organization_id = $2::uuid)
     order by created_at limit 1`, [userId, header ?? null],
  );
  const id = result.rows[0]?.organization_id;
  if (!id) reply.code(404).send({ error: 'organization_not_found' });
  return id ?? null;
}

export function registerInquiryRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get('/v1/owner/site-inquiry-test', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    const organizationId = await ownerOrganization(request, reply, runtime, userId);
    if (!organizationId) return reply;
    const release = await runtime.pool.query<{ revision: number; catalog_revision: number; visibility_restricted: boolean }>(
      `select sr.revision, cr.revision as catalog_revision,
         exists(select 1 from field.site_visibility_holds h where h.site_id=s.id and h.released_at is null) as visibility_restricted
       from field.site_releases sr
       join field.sites s on s.id=sr.site_id
       join lateral (select revision from field.catalog_releases
         where organization_id=s.organization_id order by revision desc limit 1) cr on true
       where s.organization_id=$1 order by sr.revision desc limit 1`, [organizationId]);
    if (!release.rows[0]) return reply.code(409).send({ error: 'site_not_published' });
    const existing = await runtime.pool.query<{ id: string; state: string }>(
      `select id,state from field.inquiries where organization_id=$1
       and is_test=true and test_site_revision=$2`, [organizationId, release.rows[0].revision]);
    if (release.rows[0].visibility_restricted && !existing.rows[0])
      return reply.header('Cache-Control', 'private, no-store').code(409).send({ error: 'site_visibility_restricted' });
    return reply.header('Cache-Control', 'private, no-store').send({
      organizationId, siteRevision: release.rows[0].revision,
      catalogRevision: release.rows[0].catalog_revision,
      existingTest: existing.rows[0] ? { id: existing.rows[0].id, state: existing.rows[0].state } : null,
    });
  });

  app.post('/v1/owner/site-inquiry-test', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    const organizationId = await ownerOrganization(request, reply, runtime, userId);
    if (!organizationId) return reply;
    const body = object(request.body);
    const name = text(body?.name, 80);
    const message = text(body?.message, 5000);
    const serviceId = body?.serviceId;
    const siteRevision = body?.siteRevision;
    if (!name || !message || typeof serviceId !== 'string' || !uuidPattern.test(serviceId)
      || !Number.isSafeInteger(siteRevision) || (siteRevision as number) < 1)
      return reply.code(400).send({ error: 'invalid_site_test_inquiry' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      // Moderation holds the site row while changing visibility; read its hold after that transaction commits.
      await client.query('select id from field.sites where organization_id = $1 for share', [organizationId]);
      await client.query('select id from field.organizations where id = $1 for update', [organizationId]);
      const release = await client.query<{ revision: number; catalog_revision: number; visibility_restricted: boolean;
        services: { id: string; name: string }[] }>(
        `select sr.revision, cr.revision as catalog_revision, cr.content->'services' as services,
           exists(select 1 from field.site_visibility_holds h where h.site_id=s.id and h.released_at is null) as visibility_restricted
         from field.site_releases sr
         join field.sites s on s.id = sr.site_id
         join lateral (select revision,content from field.catalog_releases
           where organization_id=s.organization_id order by revision desc limit 1) cr on true
         where s.organization_id = $1 order by sr.revision desc limit 1`, [organizationId]);
      const published = release.rows[0];
      if (!published) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'site_not_published' });
      }
      if (published.revision !== siteRevision) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'site_revision_changed', siteRevision: published.revision });
      }
      const service = published.services?.find(item => item.id === serviceId);
      if (!service) {
        await client.query('rollback');
        return reply.code(400).send({ error: 'published_service_not_found' });
      }
      const existing = await client.query<{ id: string; state: string; service_id: string;
        customer_name: string; first_body: string | null }>(
        `select i.id,i.state,i.service_id,i.customer_name,m.first_body
         from field.inquiries i
         left join lateral (
           select body as first_body from field.inquiry_messages
           where inquiry_id=i.id and sender='customer' order by created_at,id limit 1
         ) m on true
         where i.organization_id=$1 and i.is_test=true and i.test_site_revision=$2`,
        [organizationId, published.revision]);
      if (existing.rows[0]) {
        await client.query('rollback');
        if (existing.rows[0].service_id !== serviceId
          || existing.rows[0].customer_name !== name || existing.rows[0].first_body !== message)
          return reply.code(409).send({ error: 'test_already_exists', id: existing.rows[0].id });
        return reply.header('Cache-Control', 'private, no-store').code(200).send({
          id: existing.rows[0].id, state: existing.rows[0].state,
          siteRevision: published.revision, isTest: true, delivery: 'not_applicable',
        });
      }
      if (published.visibility_restricted) {
        await client.query('rollback');
        return reply.header('Cache-Control', 'private, no-store').code(409).send({ error: 'site_visibility_restricted' });
      }
      if (await rejectExpiredTrial(reply, client, organizationId)) {
        await client.query('rollback');
        return reply;
      }
      const id = randomUUID();
      await client.query(
        `insert into field.inquiries
          (id,organization_id,catalog_revision,service_id,service_snapshot,customer_name,
           customer_phone,visitor_key_hash,state,consent_at,is_test,test_site_revision)
         values ($1,$2,$3,$4,$5::jsonb,$6,'',$7,'needs_owner',null,true,$8)`,
        [id, organizationId, published.catalog_revision, serviceId,
          JSON.stringify(service), name, receiptHash(randomBytes(32).toString('base64url')),
          published.revision]);
      await client.query(
        `insert into field.inquiry_messages(id,inquiry_id,sender,body,delivery_state)
         values ($1,$2,'customer',$3,'not_applicable')`,
        [randomUUID(), id, message]);
      await client.query('commit');
      return reply.header('Cache-Control', 'private, no-store').code(201).send({
        id, state: 'needs_owner', siteRevision: published.revision,
        isTest: true, delivery: 'not_applicable',
      });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/public/catalog/:id/inquiries/recover', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const submittedKey = request.headers['idempotency-key'];
    const submittedReceipt = request.headers['x-receipt-key'];
    if (typeof submittedKey !== 'string' || typeof submittedReceipt !== 'string'
      || !/^[A-Za-z0-9_-]{43}$/.test(submittedKey) || !/^[A-Za-z0-9_-]{43}$/.test(submittedReceipt))
      return reply.code(400).send({ error: 'invalid_submission_key' });
    const found = await runtime.pool.query<{ id: string; state: string }>(
      `select id, state from field.inquiries where organization_id = $1 and submission_key_hash = $2
       and visitor_key_hash = $3 and consent_at is not null and is_test = false`,
      [request.params.id, receiptHash(submittedKey), receiptHash(submittedReceipt)]);
    if (!found.rows[0]) return reply.header('Cache-Control', 'no-store')
      .code(404).send({ error: 'inquiry_not_found' });
    return reply.header('Cache-Control', 'no-store').send({ id: found.rows[0].id,
      receiptKey: submittedReceipt, state: found.rows[0].state, delivery: 'pending' });
  });

  app.post<{ Params: { id: string } }>('/v1/public/catalog/:id/inquiries', async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'catalog_not_found' });
    const body = object(request.body);
    const name = text(body?.name, 80);
    const phone = text(body?.phone, 30);
    const message = text(body?.message, 5000);
    if (body?.visitRegion !== undefined
        && (typeof body.visitRegion !== 'string' || body.visitRegion.length > 200))
      return reply.code(400).send({ error: 'invalid_inquiry' });
    const visitRegion = body?.visitRegion === undefined ? null : body.visitRegion.trim() || null;
    const fallback = parseRequestFallback(body?.fallback);
    if (fallback === undefined) return reply.code(400).send({ error: 'invalid_fallback' });
    const serviceId = body?.serviceId;
    if (!name || !phone || !/^[+\d()\-\s]{9,30}$/.test(phone) || phone.replace(/\D/g, '').length < 9
        || !message || body?.consent !== true || typeof serviceId !== 'string' || !uuidPattern.test(serviceId)) {
      return reply.code(400).send({ error: 'invalid_inquiry' });
    }
    const submittedKey = request.headers['idempotency-key'];
    const submittedReceipt = request.headers['x-receipt-key'];
    const hasSubmissionKey = submittedKey !== undefined || submittedReceipt !== undefined;
    if (hasSubmissionKey && (typeof submittedKey !== 'string' || typeof submittedReceipt !== 'string'
        || !/^[A-Za-z0-9_-]{43}$/.test(submittedKey) || !/^[A-Za-z0-9_-]{43}$/.test(submittedReceipt)))
      return reply.code(400).send({ error: 'invalid_submission_key' });
    const submissionKeyHash = hasSubmissionKey ? receiptHash(submittedKey as string) : null;
    const requestPayload: Record<string, unknown> = { serviceId, name, phone, message };
    if (body?.visitRegion !== undefined) requestPayload.visitRegion = visitRegion;
    if (fallback) requestPayload.fallback = fallback;
    const requestHash = hasSubmissionKey ? receiptHash(JSON.stringify(requestPayload)) : null;
    const replay = async () => {
      if (!submissionKeyHash) return null;
      const existing = await runtime.pool.query<{
        id: string; state: string; visitor_key_hash: string; submission_request_hash: string;
      }>(
        `select id, state, visitor_key_hash, submission_request_hash from field.inquiries
         where organization_id = $1 and submission_key_hash = $2`,
        [request.params.id, submissionKeyHash]);
      const row = existing.rows[0];
      if (!row) return null;
      if (row.submission_request_hash !== requestHash || row.visitor_key_hash !== receiptHash(submittedReceipt as string))
        return reply.code(409).send({ error: 'idempotency_conflict' });
      return reply.header('Cache-Control', 'no-store').code(200)
        .send({ id: row.id, receiptKey: submittedReceipt, state: row.state, delivery: 'pending' });
    };
    const previous = await replay();
    if (previous) return previous;
    const catalog = await runtime.pool.query<{ revision: number; content: { services: { id: string }[] } }>(
      `select revision, content from field.catalog_releases
       where organization_id = $1 order by revision desc limit 1`, [request.params.id],
    );
    if (!catalog.rows[0]) return reply.code(404).send({ error: 'catalog_not_found' });
    const service = catalog.rows[0].content.services.find(item => item.id === serviceId);
    if (!service) return reply.code(400).send({ error: 'service_not_found' });
    const id = randomUUID();
    const key = hasSubmissionKey ? submittedReceipt as string : randomBytes(32).toString('base64url');
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      if (await rejectExpiredTrial(reply, client, request.params.id)) {
        await client.query('rollback');
        return reply;
      }
      const submissionLimit = await consumePublicSubmission(client, request.params.id, phone, request.ip);
      if (submissionLimit !== null) {
        await client.query('rollback');
        return reply.header('Retry-After', submissionLimit.retryAfter).header('Cache-Control', 'no-store')
          .code(429).send({ error: 'submission_rate_limited', scope: submissionLimit.scope });
      }
      const inserted = await client.query<{ id: string }>(
        `insert into field.inquiries
          (id, organization_id, catalog_revision, service_id, service_snapshot,
           customer_name, customer_phone, visitor_key_hash, state, consent_at,
           submission_key_hash, submission_request_hash, visit_region,
           fallback_origin, fallback_action_request_id, fallback_declared_at)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'needs_owner', now(), $9, $10, $11,
           $12, $13, case when $12::text is null then null else now() end)
         on conflict (organization_id, submission_key_hash) do nothing returning id`,
        [id, request.params.id, catalog.rows[0].revision, serviceId, JSON.stringify(service),
          name, phone, receiptHash(key), submissionKeyHash, requestHash, visitRegion,
          fallback?.origin ?? null, fallback?.actionRequestId ?? null],
      );
      if (!inserted.rows[0]) {
        await client.query('rollback');
        const result = await replay();
        if (result) return result;
        return reply.code(409).send({ error: 'submission_retry_failed' });
      }
      await client.query(
        `insert into field.inquiry_messages(id, inquiry_id, sender, body, delivery_state)
         values ($1, $2, 'customer', $3, 'pending')`, [randomUUID(), id, message],
      );
      await outbox(client, request.params.id, 'field.inquiry.created', id);
      await client.query('commit');
      return reply.header('Cache-Control', 'no-store').code(201)
        .send({ id, receiptKey: key, state: 'needs_owner', delivery: 'pending' });
    } catch (error) {
      await client.query('rollback');
      if (submissionKeyHash && (error as { code?: string }).code === '23505') {
        const result = await replay();
        if (result) return result;
        return reply.code(409).send({ error: 'idempotency_conflict' });
      }
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/inquiries/:id', async (request, reply) => {
    const key = receiptKey(request);
    if (!key) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const inquiry = await runtime.pool.query<FallbackRow & {
      id: string; state: string; organization_id: string; business_name: string;
      customer_name: string; service_snapshot: unknown; catalog_revision: number;
      visit_region: string | null;
    }>(
      `select i.id, i.state, i.organization_id, coalesce(r.content->>'businessName', o.name) as business_name,
              i.customer_name, i.service_snapshot, i.catalog_revision, i.visit_region,
              i.fallback_origin,i.fallback_action_request_id,i.fallback_declared_at
       from field.inquiries i
       join field.organizations o on o.id = i.organization_id
       left join field.catalog_releases r on r.organization_id = i.organization_id and r.revision = i.catalog_revision
       where i.id = $1 and i.visitor_key_hash = $2`, [request.params.id, receiptHash(key)],
    );
    if (!inquiry.rows[0]) return reply.code(401).send({ error: 'invalid_receipt_key' });
    const messages = await runtime.pool.query<{ id: string; sender: string; body: string; delivery_state: string; created_at: string }>(
      `select id, sender, visibility, body, delivery_state, created_at from field.inquiry_messages
       where inquiry_id = $1 and visibility = 'customer' order by created_at, id`,
      [request.params.id],
    );
    return { id: inquiry.rows[0].id, state: inquiry.rows[0].state,
      organizationId: inquiry.rows[0].organization_id, businessName: inquiry.rows[0].business_name,
      customerName: inquiry.rows[0].customer_name,
      service: inquiry.rows[0].service_snapshot, catalogRevision: inquiry.rows[0].catalog_revision,
      visitRegion: inquiry.rows[0].visit_region,
      fallback: requestFallback(inquiry.rows[0]),
      messages: messages.rows, attachments: await inquiryAttachments(runtime.pool, request.params.id) };
  });

  app.get<{ Params: { id: string } }>('/v1/inquiries/:id/messages/recover', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const key = receiptKey(request);
    if (!key) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const attempt = messageAttempt(request, {});
    if (!attempt) return reply.code(400).send({ error: 'invalid_submission_key' });
    const inquiry = await runtime.pool.query<{ id: string }>(
      'select id from field.inquiries where id = $1 and visitor_key_hash = $2',
      [request.params.id, receiptHash(key)],
    );
    if (!inquiry.rows[0]) return reply.code(401).send({ error: 'invalid_receipt_key' });
    const message = await runtime.pool.query<{ id: string; delivery_state: string }>(
      `select id, delivery_state from field.inquiry_messages where inquiry_id = $1
       and submission_key_hash = $2 and sender = 'customer' and visibility = 'customer'`,
      [request.params.id, attempt.keyHash],
    );
    if (!message.rows[0]) return reply.code(404).send({ error: 'message_not_found' });
    return { messageId: message.rows[0].id, delivery: message.rows[0].delivery_state };
  });

  app.post<{ Params: { id: string } }>('/v1/inquiries/:id/messages', async (request, reply) => {
    const key = receiptKey(request);
    if (!key) return reply.code(401).send({ error: 'receipt_key_required' });
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const body = text(object(request.body)?.body, 5000);
    if (!body) return reply.code(400).send({ error: 'invalid_message' });
    const attempt = messageAttempt(request, { sender: 'customer', body });
    if (attempt === null) return reply.code(400).send({ error: 'invalid_submission_key' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const inquiry = await client.query<{ organization_id: string; state: string; revision: number }>(
        'select organization_id, state, revision from field.inquiries where id = $1 and visitor_key_hash = $2 for update',
        [request.params.id, receiptHash(key)],
      );
      if (!inquiry.rows[0]) {
        await client.query('rollback');
        return reply.code(401).send({ error: 'invalid_receipt_key' });
      }
      const replay = await replayMessage(client, request.params.id, inquiry.rows[0].state, attempt);
      if (replay) {
        await client.query('rollback');
        if ('error' in replay) return reply.code(409).send(replay);
        return reply.code(200).send(replay);
      }
      // 재전송(replay)은 세지 않고 새 메시지만 IP별 창에 기록한다.
      const messageLimit = await consumePublicMessage(client, inquiry.rows[0].organization_id, request.ip);
      if (messageLimit !== null) {
        await client.query('rollback');
        return reply.header('Retry-After', messageLimit.retryAfter).header('Cache-Control', 'no-store')
          .code(429).send({ error: 'message_rate_limited', scope: messageLimit.scope });
      }
      const messageId = randomUUID();
      await client.query(
        `insert into field.inquiry_messages(id, inquiry_id, sender, body, delivery_state,
           submission_key_hash, submission_request_hash)
         values ($1, $2, 'customer', $3, 'pending', $4, $5)`,
        [messageId, request.params.id, body, attempt?.keyHash ?? null, attempt?.requestHash ?? null],
      );
      await client.query("update field.inquiries set state = 'needs_owner', revision = revision + 1, updated_at = now() where id = $1", [request.params.id]);
      if (inquiry.rows[0].state === 'closed') await client.query(
        `insert into field.inquiry_resolution_events(id, inquiry_id, event_type, revision, source_message_id)
         values ($1, $2, 'reopened', $3, $4)`,
        [randomUUID(), request.params.id, inquiry.rows[0].revision + 1, messageId]);
      await outbox(client, inquiry.rows[0].organization_id, 'field.inquiry.customer_message', request.params.id);
      await client.query('commit');
      return reply.code(201).send({ messageId, state: 'needs_owner', delivery: 'pending' });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Querystring: { cursor?: string } }>('/v1/owner/inquiries', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    const organizationId = await ownerOrganization(request, reply, runtime, userId);
    if (!organizationId) return reply;
    const rawCursor = request.query.cursor;
    const cursor = rawCursor === undefined ? null
      : decodeOwnerListCursor(rawCursor, organizationId, 'inquiry');
    if (rawCursor !== undefined && !cursor)
      return reply.code(400).send({ error: 'invalid_inquiry_cursor' });
    const result = await runtime.pool.query<{
      id: string; state: string; customer_name: string; customer_phone: string; service_snapshot: unknown;
      is_test: boolean; test_site_revision: number | null; created_at: Date; updated_at: Date; cursor_timestamp: string;
    }>(
      `select id, state, customer_name, customer_phone, service_snapshot, is_test, test_site_revision,
         created_at, updated_at,
         to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_timestamp
       from field.inquiries where organization_id = $1
       ${cursor ? 'and (updated_at,id) < ($2::timestamptz,$3::uuid)' : ''}
       order by updated_at desc,id desc limit 101`,
      cursor ? [organizationId, cursor.timestamp, cursor.id] : [organizationId],
    );
    const page = result.rows.slice(0, 100);
    return reply.header('Cache-Control', 'private, no-store').send({
      inquiries: page.map(row => ({ id: row.id, state: row.state,
        customer_name: row.customer_name, customer_phone: row.customer_phone,
        service_snapshot: row.service_snapshot, is_test: row.is_test,
        test_site_revision: row.test_site_revision,
        created_at: row.created_at, updated_at: row.updated_at })),
      nextCursor: result.rows.length > 100
        ? encodeOwnerListCursor(organizationId, 'inquiry', page[page.length - 1]!.cursor_timestamp,
          page[page.length - 1]!.id) : null,
    });
  });

  app.get<{ Params: { id: string } }>('/v1/owner/inquiries/:id', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const inquiry = await runtime.pool.query<FallbackRow & {
      id: string; state: string; revision: number; customer_name: string; customer_phone: string; service_snapshot: unknown;
      organization_id: string;
      catalog_revision: number; is_test: boolean; test_site_revision: number | null;
      visit_region: string | null;
    }>(
      `select i.id, i.state, i.revision, i.customer_name, i.customer_phone, i.service_snapshot, i.catalog_revision,
          i.is_test, i.test_site_revision, i.visit_region, i.organization_id,
          i.fallback_origin,i.fallback_action_request_id,i.fallback_declared_at
       from field.inquiries i join field.memberships m on m.organization_id = i.organization_id
       where i.id = $1 and m.user_id = $2 and m.role in ('owner', 'editor')`,
      [request.params.id, userId],
    );
    if (!inquiry.rows[0]) return reply.code(404).send({ error: 'inquiry_not_found' });
    const messages = await runtime.pool.query<{ id: string; sender: string; body: string; delivery_state: string; created_at: string }>(
      'select id, sender, visibility, body, delivery_state, created_at from field.inquiry_messages where inquiry_id = $1 order by created_at, id',
      [request.params.id],
    );
    return { id: inquiry.rows[0].id, state: inquiry.rows[0].state, revision: inquiry.rows[0].revision,
      customerName: inquiry.rows[0].customer_name,
      customerPhone: inquiry.rows[0].customer_phone, service: inquiry.rows[0].service_snapshot,
      visitRegion: inquiry.rows[0].visit_region,
      catalogRevision: inquiry.rows[0].catalog_revision, isTest: inquiry.rows[0].is_test,
      testSiteRevision: inquiry.rows[0].test_site_revision, messages: messages.rows,
      fallback: requestFallback(inquiry.rows[0]),
      fallbackReview: await reviewRequestFallback(runtime.pool, inquiry.rows[0].organization_id, inquiry.rows[0]),
      attachments: await inquiryAttachments(runtime.pool, request.params.id) };
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
      const found = await client.query<{ id: string; state: string; revision: number }>(
        `select i.id, i.state, i.revision from field.inquiries i
         join field.memberships m on m.organization_id = i.organization_id
         where i.id = $1 and m.user_id = $2 and m.role in ('owner', 'editor') for update of i`,
        [request.params.id, userId]);
      const row = found.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'inquiry_not_found' }); }
      if (row.state === 'closed' && row.revision === expectedRevision + 1) {
        await client.query('rollback');
        return { id: row.id, state: row.state, revision: row.revision };
      }
      if (row.revision !== expectedRevision || row.state === 'closed') {
        await client.query('rollback');
        return reply.code(409).send({ error: 'inquiry_changed', state: row.state, revision: row.revision });
      }
      await client.query("update field.inquiries set state = 'closed', revision = revision + 1, updated_at = now() where id = $1", [row.id]);
      await client.query(
        `insert into field.inquiry_resolution_events(id, inquiry_id, event_type, revision, actor_user_id)
         values ($1, $2, 'closed', $3, $4)`,
        [randomUUID(), row.id, row.revision + 1, userId]);
      await client.query('commit');
      return { id: row.id, state: 'closed', revision: row.revision + 1 };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/owner/inquiries/:id/export', async (request, reply) => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const found = await client.query<FallbackRow & {
        id: string; organization_id: string; state: string; customer_name: string; customer_phone: string;
        service_snapshot: unknown; catalog_revision: number; consent_at: Date | null;
        is_test: boolean; test_site_revision: number | null; created_at: Date;
        visit_region: string | null;
      }>(
        `select i.id, i.organization_id, i.state, i.customer_name, i.customer_phone,
           i.service_snapshot, i.catalog_revision, i.consent_at, i.is_test, i.test_site_revision,
           i.visit_region, i.created_at, i.fallback_origin,i.fallback_action_request_id,i.fallback_declared_at
         from field.inquiries i join field.memberships m on m.organization_id = i.organization_id
         where i.id = $1 and m.user_id = $2 and m.role in ('owner', 'editor')`,
        [request.params.id, userId],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'inquiry_not_found' });
      }
      const transcript = await client.query<{
        id: string; sender: string; visibility: string; body: string; delivery_state: string; created_at: Date;
      }>(
        `select id, sender, visibility, body, delivery_state, created_at
         from field.inquiry_messages where inquiry_id = $1 order by created_at, id`, [row.id],
      );
      const attachments = await inquiryAttachments(client, row.id);
      const resolutionEvents = (await client.query(
        `select event_type as "eventType", revision, actor_user_id as "actorUserId",
           source_message_id as "sourceMessageId", created_at as "createdAt"
         from field.inquiry_resolution_events where inquiry_id = $1 order by revision`, [row.id])).rows;
      await client.query('commit');
      return reply.header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename="field-inquiry-${row.id}.json"`)
        .send({ formatVersion: 'field-inquiry-export.v1', product: 'field', exportedAt: new Date().toISOString(),
          inquiry: { id: row.id, organizationId: row.organization_id, state: row.state,
            customerName: row.customer_name, customerPhone: row.customer_phone,
            visitRegion: row.visit_region,
            fallback: requestFallback(row),
            serviceSnapshot: row.service_snapshot, catalogRevision: row.catalog_revision,
            consentAt: row.consent_at, isTest: row.is_test,
            testSiteRevision: row.test_site_revision, createdAt: row.created_at },
          messages: transcript.rows,
          resolutionEvents,
          attachments: attachments.map(item => ({ ...item,
            downloadPath: `/v1/owner/inquiries/${row.id}/attachments/${item.id}` })) });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  const ownerMessage = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply,
    visibility: 'customer' | 'internal') => {
    const userId = await ownerUser(request, reply, runtime);
    if (!userId) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'inquiry_not_found' });
    const body = text(object(request.body)?.body, 5000);
    if (!body) return reply.code(400).send({ error: 'invalid_message' });
    const attempt = messageAttempt(request, visibility === 'internal'
      ? { sender: 'owner', userId, visibility, body } : { sender: 'owner', userId, body });
    if (attempt === null) return reply.code(400).send({ error: 'invalid_submission_key' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const inquiry = await client.query<{ organization_id: string; state: string; is_test: boolean }>(
        `select i.organization_id, i.state, i.is_test from field.inquiries i
         join field.memberships m on m.organization_id = i.organization_id
         where i.id = $1 and m.user_id = $2 and m.role in ('owner', 'editor') for update of i`,
        [request.params.id, userId],
      );
      if (!inquiry.rows[0]) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'inquiry_not_found' });
      }
      const replay = await replayMessage(client, request.params.id, inquiry.rows[0].state, attempt);
      if (replay) {
        await client.query('rollback');
        if ('error' in replay) return reply.code(409).send(replay);
        return reply.code(200).send(replay);
      }
      if (inquiry.rows[0].state === 'closed') {
        await client.query('rollback');
        return reply.code(409).send({ error: 'inquiry_closed' });
      }
      const messageId = randomUUID();
      await client.query(
        `insert into field.inquiry_messages(id, inquiry_id, sender, visibility, body, delivery_state,
           submission_key_hash, submission_request_hash)
         values ($1, $2, 'owner', $3, $4, $5, $6, $7)`,
        [messageId, request.params.id, visibility, body,
          visibility === 'internal' || inquiry.rows[0].is_test ? 'not_applicable' : 'pending',
          attempt?.keyHash ?? null, attempt?.requestHash ?? null],
      );
      if (visibility === 'customer') {
        await client.query("update field.inquiries set state = 'waiting_customer', revision = revision + 1, updated_at = now() where id = $1", [request.params.id]);
        if (!inquiry.rows[0].is_test)
          await outbox(client, inquiry.rows[0].organization_id, 'field.inquiry.owner_reply', request.params.id, messageId);
      } else await client.query('update field.inquiries set revision = revision + 1, updated_at = now() where id = $1', [request.params.id]);
      await client.query('commit');
      return reply.code(201).send({ messageId,
        state: visibility === 'customer' ? 'waiting_customer' : inquiry.rows[0].state,
        delivery: visibility === 'customer' && !inquiry.rows[0].is_test ? 'pending' : 'not_applicable' });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  };
  app.post<{ Params: { id: string } }>('/v1/owner/inquiries/:id/replies',
    (request, reply) => ownerMessage(request, reply, 'customer'));
  app.post<{ Params: { id: string } }>('/v1/owner/inquiries/:id/notes',
    (request, reply) => ownerMessage(request, reply, 'internal'));
}
