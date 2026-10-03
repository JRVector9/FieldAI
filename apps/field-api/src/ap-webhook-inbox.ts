import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { unsealApEventSecret } from './integrator-routes.js';
import { commitReceivedApRevocation } from './ap-connection-revoke-receiver.js';
import { acceptsV1ApSignature, apToFieldSignaturePrefix } from './ap-signature.js';
// L1: occurred_at은 PG timestamptz가 받는 RFC 3339만 허용한다(Date.parse만 통과하는 "1" 같은 값은 서명 확인 뒤 500이 됐다).
import { isRfc3339 } from './external-request-public-routes.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENT_BYTES = 65_536;
const topKeys = new Set(['spec_version', 'event_id', 'event_type', 'source_product', 'connection_id',
  'aggregate_type', 'aggregate_id', 'aggregate_version', 'occurred_at', 'correlation_id', 'data']);
// 사건 종류마다 허용하는 aggregate 종류는 하나뿐이다.
const aggregateFor: Record<string, string> = { 'agent.conversation.updated': 'conversation',
  'agent.action.delivery_updated': 'action', 'agent.notification.updated': 'notification',
  'connection.revoked': 'connection' };
type AgentEvent = { event_id: string; event_type: string; connection_id: string; aggregate_type: string;
  aggregate_id: string; aggregate_version: number; occurred_at: string; correlation_id: string;
  status: string };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
// AP의 Field 사건 수신과 같은 규칙: 원문·연락처 없는 envelope만, 정해진 키 외에는 거부한다.
function parseAgentEvent(raw: Buffer): AgentEvent | null {
  let value: unknown;
  try { value = JSON.parse(raw.toString('utf8')); } catch { return null; }
  const body = object(value);
  const data = object(body?.data);
  if (!body || !data || Object.keys(body).some(key => !topKeys.has(key))
    || Object.keys(data).some(key => key !== 'resource_id' && key !== 'status')
    || body.spec_version !== '1.0' || body.source_product !== 'agent_platform'
    || typeof body.event_type !== 'string' || !(body.event_type in aggregateFor)
    || body.aggregate_type !== aggregateFor[body.event_type]
    || !uuid.test(String(body.event_id)) || !uuid.test(String(body.connection_id))
    || !uuid.test(String(body.aggregate_id)) || !uuid.test(String(body.correlation_id))
    || !Number.isSafeInteger(body.aggregate_version) || Number(body.aggregate_version) < 1
    || typeof body.occurred_at !== 'string' || !isRfc3339(body.occurred_at)
    || data.resource_id !== body.aggregate_id
    || typeof data.status !== 'string' || data.status.length < 1 || data.status.length > 80
    || (body.event_type === 'connection.revoked'
      && (body.aggregate_id !== body.connection_id || data.status !== 'revoked'))) return null;
  return { event_id: body.event_id as string, event_type: body.event_type,
    connection_id: body.connection_id as string, aggregate_type: body.aggregate_type as string,
    aggregate_id: body.aggregate_id as string, aggregate_version: body.aggregate_version as number,
    occurred_at: body.occurred_at, correlation_id: body.correlation_id as string, status: data.status };
}

export function registerApWebhookInbox(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  // 시작 시 v1 서명 전환 모드를 남긴다. 잘못된 설정값은 여기서 부팅을 멈춘다.
  app.log.info({ acceptV1: acceptsV1ApSignature() },
    'AP event signature: v2 direction-bound required; v1 accepted only in transition mode');
  // 서명은 원문 바이트에 대해 계산하므로 이 경로에서만 전용 content type을 버퍼로 받는다.
  app.register(async scope => {
    scope.addContentTypeParser('application/vnd.agent-event+json',
      { parseAs: 'buffer', bodyLimit: MAX_EVENT_BYTES }, (_request, body, done) => done(null, body));
    scope.post('/integrations/v1/webhooks/agent', async (request, reply) => {
      const raw = request.body;
      if (!Buffer.isBuffer(raw) || raw.length > MAX_EVENT_BYTES)
        return reply.code(400).send({ error: 'invalid_event_body' });
      const event = parseAgentEvent(raw);
      if (!event) return reply.code(400).send({ error: 'invalid_event_body' });
      const eventId = request.headers['x-event-id'];
      const keyId = request.headers['x-key-id'];
      const timestamp = request.headers['x-timestamp'];
      const signature = request.headers['x-signature'];
      const signaturePrefix = apToFieldSignaturePrefix(request.headers['x-signature-version']);
      if (signaturePrefix === null || typeof eventId !== 'string' || eventId !== event.event_id
        || typeof keyId !== 'string' || !uuid.test(keyId)
        || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)
        || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
        || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature))
        return reply.code(401).send({ error: 'invalid_event_signature' });
      const config = runtime.apConnector;
      if (!config) return reply.code(503).send({ error: 'blocked_integration' });
      const db = await runtime.pool.connect();
      try {
        await db.query('begin');
        // 서명 확인 전에는 잠그지 않는다. 연결·키 ID만 아는 비인증 호출자가 연결 행 잠금 경합을 만들 수 없게 한다.
        const selected = await db.query<{ id: string; organization_id: string; status: string;
          field_grant_id: string | null; event_secret_cipher: Buffer }>(
          `select id,organization_id,status,field_grant_id,event_secret_cipher
           from field.ap_connections where id = $1 and event_key_id = $2
             and event_secret_cipher is not null`, [event.connection_id, keyId]);
        const unverified = selected.rows[0];
        if (!unverified) {
          await db.query('rollback'); return reply.code(401).send({ error: 'invalid_event_signature' });
        }
        let secret: Buffer;
        try { secret = Buffer.from(unsealApEventSecret(unverified.event_secret_cipher, config.tokenKey), 'base64url'); }
        catch {
          await db.query('rollback'); return reply.code(503).send({ error: 'event_route_unavailable' });
        }
        if (secret.length !== 32) {
          await db.query('rollback'); return reply.code(503).send({ error: 'event_route_unavailable' });
        }
        // v2 원문은 `v2:ap->field.` 방향 접두사로 시작해 Field가 보낸 서명의 반사를 거부한다.
        const expected = createHmac('sha256', secret)
          .update(Buffer.concat([Buffer.from(`${signaturePrefix}${timestamp}.${eventId}.`), raw])).digest();
        if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
          await db.query('rollback'); return reply.code(401).send({ error: 'invalid_event_signature' });
        }
        // 서명 확인 뒤 같은 키·비밀값인지 다시 확인하며 잠근다. 해제 사건만 상태를 바꾸므로 for update, 나머지는 for share.
        const locked = await db.query<{ id: string; organization_id: string; status: string; field_grant_id: string | null }>(
          `select id,organization_id,status,field_grant_id from field.ap_connections
           where id = $1 and event_key_id = $2 and event_secret_cipher = $3
           ${event.event_type === 'connection.revoked' ? 'for update' : 'for share'}`,
          [event.connection_id, keyId, unverified.event_secret_cipher]);
        const connection = locked.rows[0];
        if (!connection) {
          await db.query('rollback'); return reply.code(401).send({ error: 'invalid_event_signature' });
        }
        const bodyHash = createHash('sha256').update(raw).digest('hex');
        const prior = await db.query<{ body_hash: string; connection_id: string }>(
          `select body_hash,connection_id from field.ap_webhook_inbox
           where source_product = 'agent_platform' and source_event_id = $1`, [event.event_id]);
        if (prior.rows[0]) {
          await db.query('rollback');
          // 같은 사건의 재전송은 처리 결과와 무관하게 이미 내구 저장된 수신으로 응답한다.
          return prior.rows[0].body_hash === bodyHash && prior.rows[0].connection_id === event.connection_id
            ? reply.header('Cache-Control', 'no-store').code(202).send({ received: true })
            : reply.code(409).send({ error: 'event_id_conflict' });
        }
        // 해제된 연결은 해제 사건만 받는다. 그 외 새 사건은 서명 경로가 닫힌 것으로 본다.
        if (connection.status !== 'review_required' && event.event_type !== 'connection.revoked') {
          await db.query('rollback'); return reply.code(401).send({ error: 'invalid_event_signature' });
        }
        let state: 'recorded' | 'processed' | 'rejected' = 'recorded';
        let errorCode: string | null = null;
        if (event.event_type === 'connection.revoked') {
          // correlation_id는 AP 해제 ID다. 서명 해제 경로와 같은 로컬 회수를 같은 트랜잭션에 반영한다.
          const outcome = await commitReceivedApRevocation(db, runtime, connection, event.correlation_id);
          state = outcome === 'conflict' ? 'rejected' : 'processed';
          errorCode = outcome === 'conflict' ? 'revocation_id_conflict' : null;
        }
        const inserted = await db.query(`insert into field.ap_webhook_inbox
          (source_product,source_event_id,connection_id,organization_id,event_type,aggregate_type,
           aggregate_id,aggregate_version,correlation_id,occurred_at,data_status,body_hash,state,
           error_code,processed_at)
          values ('agent_platform',$1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10,$11,$12,$13,
            case when $12 = 'recorded' then null else now() end)
          on conflict (source_product,source_event_id) do nothing`,
        [event.event_id, event.connection_id, connection.organization_id, event.event_type,
          event.aggregate_type, event.aggregate_id, event.aggregate_version, event.correlation_id,
          event.occurred_at, event.status, bodyHash, state, errorCode]);
        if (!inserted.rowCount) {
          await db.query('rollback'); return reply.code(409).send({ error: 'event_id_conflict' });
        }
        await db.query('commit');
        return reply.header('Cache-Control', 'no-store').code(202).send({ received: true });
      } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    });
  });
}
