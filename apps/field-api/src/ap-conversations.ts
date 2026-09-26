import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { authorizedApConversationAccess, type ApConnectorConfig } from './ap-connector.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const submissionKey = /^[A-Za-z0-9_-]{32,128}$/;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
type ReplyDraft = { id: string; request_hmac: string; body_cipher: Buffer | null;
  expected_revision: number; submission_key: string; state: string;
  ap_message_id: string | null; ap_revision: number | null; ap_delivery: string | null };
type ReplySource = { organizationId: string; userId: string; connection_id: string;
  origin_conversation_id: string; source_deployment_id: string };

function draftKey(config: ApConnectorConfig) {
  return createHash('sha256').update(config.tokenKey).update('field-ap-reply-draft-v1').digest();
}
function draftHash(key: Buffer, source: ReplySource, body: string, expectedRevision: number) {
  return createHmac('sha256', key).update(JSON.stringify({ conversationId: source.origin_conversation_id,
    actorUserId: source.userId, body, expectedRevision })).digest('hex');
}
function encryptDraft(key: Buffer, requestId: string, actorId: string, body: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${requestId}:${actorId}`));
  return Buffer.concat([iv, cipher.update(body, 'utf8'), cipher.final(), cipher.getAuthTag()]);
}
function decryptDraft(key: Buffer, requestId: string, actorId: string, data: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${requestId}:${actorId}`));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString('utf8');
}
async function openDraft(db: PoolClient, requestId: string) {
  const found = await db.query<ReplyDraft>(
    `select id,request_hmac,body_cipher,expected_revision,submission_key,state,
      ap_message_id,ap_revision,ap_delivery from field.ap_reply_drafts
     where external_request_id = $1 and state <> 'accepted' for update`, [requestId]);
  return found.rows[0] ?? null;
}
async function prepareDraft(runtime: FieldBusinessRuntime, source: ReplySource, requestId: string,
  body: string, expectedRevision: number, proposedKey?: string): Promise<
    { id: string; key: string; body: string; expectedRevision: number }
    | { accepted: true; messageId: string; revision: number; delivery: string }
    | { error: string; status: number }> {
  const config = runtime.apConnector;
  if (!config) return { error: 'blocked_integration', status: 503 };
  const key = draftKey(config);
  const requestHmac = draftHash(key, source, body, expectedRevision);
  const db = await runtime.pool.connect();
  try {
    await db.query('begin');
    await db.query('select id from field.external_work_requests where id = $1 for update', [requestId]);
    const accepted = await db.query<ReplyDraft>(
      `select id,request_hmac,body_cipher,expected_revision,submission_key,state,
        ap_message_id,ap_revision,ap_delivery from field.ap_reply_drafts
       where external_request_id = $1 and expected_revision = $2
         and state = 'accepted' limit 1`, [requestId, expectedRevision]);
    const receipt = accepted.rows[0];
    if (receipt && receipt.request_hmac !== requestHmac) {
      await db.query('rollback');
      return { error: 'reply_revision_already_accepted', status: 409 };
    }
    if (receipt?.ap_message_id && receipt.ap_revision !== null && receipt.ap_delivery) {
      await db.query('commit');
      return { accepted: true, messageId: receipt.ap_message_id,
        revision: receipt.ap_revision, delivery: receipt.ap_delivery };
    }
    const current = await openDraft(db, requestId);
    if (current) {
      if (current.request_hmac === requestHmac && current.expected_revision === expectedRevision) {
        await db.query('commit');
        return { id: current.id, key: current.submission_key, body, expectedRevision };
      }
      if (current.state !== 'revision_conflict') {
        await db.query('rollback');
        return { error: 'reply_pending_review', status: 409 };
      }
      const nextKey = proposedKey ?? randomBytes(32).toString('base64url');
      await db.query(`update field.ap_reply_drafts set submission_key = $2,request_hmac = $3,
        body_cipher = $4,expected_revision = $5,state = 'pending',updated_at = now()
        where id = $1`, [current.id, nextKey, requestHmac,
        encryptDraft(key, requestId, source.userId, body), expectedRevision]);
      await db.query('commit');
      return { id: current.id, key: nextKey, body, expectedRevision };
    }
    const id = randomUUID();
    const nextKey = proposedKey ?? randomBytes(32).toString('base64url');
    await db.query(`insert into field.ap_reply_drafts(id,external_request_id,organization_id,
      actor_user_id,submission_key,request_hmac,body_cipher,expected_revision,state)
      values($1,$2,$3,$4,$5,$6,$7,$8,'pending')`, [id, requestId, source.organizationId,
      source.userId, nextKey, requestHmac, encryptDraft(key, requestId, source.userId, body), expectedRevision]);
    await db.query('commit');
    return { id, key: nextKey, body, expectedRevision };
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}
async function markDraft(runtime: FieldBusinessRuntime, id: string, state: 'delivery_unknown' | 'revision_conflict') {
  await runtime.pool.query(`update field.ap_reply_drafts set state = $2,updated_at = now()
    where id = $1 and state <> 'accepted'`, [id, state]);
}
async function acceptDraft(runtime: FieldBusinessRuntime, id: string,
  saved: { messageId: string; revision: number; delivery: string }) {
  await runtime.pool.query(`update field.ap_reply_drafts set state = 'accepted',body_cipher = null,
    ap_message_id = $2,ap_revision = $3,ap_delivery = $4,updated_at = now()
    where id = $1 and state <> 'accepted'`, [id, saved.messageId, saved.revision, saved.delivery]);
}

async function sourceFor(request: FastifyRequest<{ Params: { id: string } }>, runtime: FieldBusinessRuntime) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) return { error: 'authentication_required', status: 401 } as const;
  const organizationId = request.headers['x-organization-id'];
  if (typeof organizationId !== 'string' || !uuid.test(organizationId))
    return { error: 'invalid_organization_id', status: 400 } as const;
  if (!uuid.test(request.params.id)) return { error: 'external_request_not_found', status: 404 } as const;
  const found = await runtime.pool.query<{ connection_id: string; origin_conversation_id: string;
    source_deployment_id: string }>(
    `select e.connection_id,e.origin_conversation_id,e.source_deployment_id
     from field.external_work_requests e join field.ap_connections c on c.id = e.connection_id
     join field.memberships m on m.organization_id = e.organization_id
     where e.id = $1 and e.organization_id = $2 and e.kind = 'inquiry'
       and m.user_id = $3 and m.role = 'owner' and c.initiator_user_id = $3
       and c.field_actor_user_id = $3 and e.field_grant_id::text = c.field_grant_id
       and e.client_id = c.field_client_id`, [request.params.id, organizationId, userId]);
  const row = found.rows[0];
  return row ? { ...row, organizationId, userId }
    : { error: 'external_request_not_found', status: 404 } as const;
}

async function apCall(config: FieldBusinessRuntime['apConnector'], url: string, token: string,
  options: { method?: 'POST'; body?: string; key?: string } = {}) {
  return (config?.fetcher ?? fetch)(url, {
    method: options.method ?? 'GET', headers: {
      authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.key ? { 'idempotency-key': options.key } : {}),
    }, body: options.body, signal: AbortSignal.timeout(8000),
  });
}

export function registerApConversationRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get<{ Params: { id: string } }>('/v1/owner/external-requests/:id/reply-draft', async (request, reply) => {
    const source = await sourceFor(request, runtime);
    if ('error' in source) return reply.code(source.status ?? 500).send({ error: source.error });
    const config = runtime.apConnector;
    if (!config) return reply.code(503).send({ error: 'blocked_integration' });
    const found = await runtime.pool.query<ReplyDraft>(
      `select id,request_hmac,body_cipher,expected_revision,submission_key,state,
        ap_message_id,ap_revision,ap_delivery from field.ap_reply_drafts
       where external_request_id = $1 and organization_id = $2 and actor_user_id = $3
         and state <> 'accepted'`, [request.params.id, source.organizationId, source.userId]);
    const row = found.rows[0];
    if (!row) {
      const accepted = await runtime.pool.query<ReplyDraft>(
        `select id,request_hmac,body_cipher,expected_revision,submission_key,state,
          ap_message_id,ap_revision,ap_delivery from field.ap_reply_drafts
         where external_request_id = $1 and organization_id = $2 and actor_user_id = $3
           and state = 'accepted' order by updated_at desc limit 1`,
        [request.params.id, source.organizationId, source.userId]);
      const latest = accepted.rows[0];
      return reply.header('Cache-Control', 'private, no-store').send({ draft: null,
        lastAccepted: latest?.ap_message_id ? { expectedRevision: latest.expected_revision,
          messageId: latest.ap_message_id, delivery: latest.ap_delivery } : null });
    }
    try {
      if (!row.body_cipher) throw new Error('missing_draft_cipher');
      return reply.header('Cache-Control', 'private, no-store').send({ draft: {
        body: decryptDraft(draftKey(config), request.params.id, source.userId, row.body_cipher),
        expectedRevision: row.expected_revision, state: row.state,
      } });
    } catch { return reply.code(503).send({ error: 'reply_draft_unavailable' }); }
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    '/v1/owner/external-requests/:id/conversation', async (request, reply) => {
      const source = await sourceFor(request, runtime);
      if ('error' in source) return reply.code(source.status ?? 500).send({ error: source.error });
      const after = request.query.after ?? '0';
      if (typeof after !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(after)
        || BigInt(after) > 9223372036854775807n)
        return reply.code(400).send({ error: 'invalid_cursor' });
      const access = await authorizedApConversationAccess(runtime, source.organizationId, source.userId,
        source.connection_id, source.source_deployment_id, 'ap.conversations.read');
      if ('error' in access) return reply.code(access.status).send({ error: access.error });
      const path = `${access.resource}/conversations/${source.origin_conversation_id}`;
      let conversationResponse: Response;
      let messagesResponse: Response;
      try {
        [conversationResponse, messagesResponse] = await Promise.all([
          apCall(runtime.apConnector, path, access.token),
          apCall(runtime.apConnector, `${path}/messages?after=${after}&limit=100`, access.token),
        ]);
      } catch { return reply.code(503).send({ error: 'ap_conversation_unavailable' }); }
      if (conversationResponse.status === 404 || messagesResponse.status === 404)
        return reply.code(404).send({ error: 'ap_conversation_not_found' });
      if (!conversationResponse.ok || !messagesResponse.ok)
        return reply.code(503).send({ error: 'ap_conversation_unavailable' });
      const conversation = object(await conversationResponse.json().catch(() => null));
      const page = object(await messagesResponse.json().catch(() => null));
      if (conversation?.id !== source.origin_conversation_id
        || conversation.deploymentId !== source.source_deployment_id
        || typeof conversation.state !== 'string' || !Number.isSafeInteger(conversation.revision)
        || page?.conversationId !== source.origin_conversation_id || !Array.isArray(page.messages)
        || typeof page.nextAfter !== 'string'
        || page.messages.some(message => {
          const value = object(message);
          return !value || typeof value.id !== 'string' || !uuid.test(value.id)
            || typeof value.sequence !== 'string' || !/^[1-9][0-9]*$/.test(value.sequence)
            || (value.actor !== 'customer' && value.actor !== 'owner')
            || typeof value.body !== 'string' || typeof value.createdAt !== 'string';
        })) return reply.code(502).send({ error: 'invalid_ap_conversation' });
      return reply.header('Cache-Control', 'private, no-store').send({
        conversation, messages: page.messages, nextAfter: page.nextAfter,
      });
    });

  app.post<{ Params: { id: string } }>('/v1/owner/external-requests/:id/replies', async (request, reply) => {
    const source = await sourceFor(request, runtime);
    if ('error' in source) return reply.code(source.status ?? 500).send({ error: source.error });
    const input = object(request.body);
    const body = input?.body;
    const expectedRevision = input?.expectedRevision;
    const key = request.headers['idempotency-key'];
    if (typeof body !== 'string' || !body.trim() || body.length > 5000
      || typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision)
      || expectedRevision < 0 || (key !== undefined && (typeof key !== 'string' || !submissionKey.test(key))))
      return reply.code(400).send({ error: 'invalid_reply' });
    const draft = await prepareDraft(runtime, source, request.params.id,
      body.trim(), expectedRevision, key);
    if ('error' in draft) return reply.code(draft.status).send({ error: draft.error });
    if ('accepted' in draft) return reply.header('Cache-Control', 'no-store').code(200).send({
      messageId: draft.messageId, state: 'waiting_customer', revision: draft.revision,
      delivery: draft.delivery, replayed: true,
    });
    const access = await authorizedApConversationAccess(runtime, source.organizationId, source.userId,
      source.connection_id, source.source_deployment_id, 'ap.conversations.reply');
    if ('error' in access) return reply.code(access.status).send({ error: access.error });
    let response: Response;
    try {
      response = await apCall(runtime.apConnector,
        `${access.resource}/conversations/${source.origin_conversation_id}/replies`, access.token,
        { method: 'POST', body: JSON.stringify({ body: draft.body,
          expectedRevision: draft.expectedRevision }), key: draft.key });
    } catch {
      await markDraft(runtime, draft.id, 'delivery_unknown');
      return reply.code(503).send({ error: 'reply_delivery_unknown' });
    }
    if (response.status === 409) {
      const conflict = object(await response.json().catch(() => null));
      await markDraft(runtime, draft.id, conflict?.error === 'revision_conflict'
        ? 'revision_conflict' : 'delivery_unknown');
      return reply.code(409).send({ error: typeof conflict?.error === 'string'
        ? conflict.error : 'ap_reply_conflict',
      ...(Number.isSafeInteger(conflict?.currentRevision)
        ? { currentRevision: conflict?.currentRevision } : {}) });
    }
    if (response.status === 401 || response.status === 403)
      return reply.code(403).send({ error: 'ap_reply_scope_unavailable' });
    if (response.status === 404) return reply.code(404).send({ error: 'ap_conversation_not_found' });
    if (!response.ok) {
      await markDraft(runtime, draft.id, 'delivery_unknown');
      return reply.code(503).send({ error: 'reply_delivery_unknown' });
    }
    const saved = object(await response.json().catch(() => null));
    if (!saved || typeof saved.messageId !== 'string' || !uuid.test(saved.messageId)
      || saved.state !== 'waiting_customer' || !Number.isSafeInteger(saved.revision)
      || typeof saved.delivery !== 'string' || typeof saved.replayed !== 'boolean') {
      await markDraft(runtime, draft.id, 'delivery_unknown');
      return reply.code(503).send({ error: 'reply_delivery_unknown' });
    }
    await acceptDraft(runtime, draft.id, { messageId: saved.messageId,
      revision: saved.revision as number, delivery: saved.delivery });
    return reply.header('Cache-Control', 'no-store').code(response.status).send({
      messageId: saved.messageId, state: saved.state, revision: saved.revision,
      delivery: saved.delivery, replayed: saved.replayed,
    });
  });
}
