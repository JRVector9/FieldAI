import { createHmac, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { unsealFieldEventSecret, type FieldConnectorConfig } from './field-connector.js';
import { apToFieldSigning } from './field-signature.js';

type Claim = { id: string; connection_id: string; body: string; attempts: number };
// Field 401은 시계 오차(±5분)·서명 버전 불일치(구버전 수신자)로도 날 수 있어 이 횟수까지는 백오프 재시도하고, 넘으면 blocked로 멈춘다.
// v2 발신이 401을 받아도 v1로 자동 전환하지 않는다(운영자가 AP_EVENT_SIGNATURE_SEND_VERSION으로만 정한다)
export const AUTH_REJECT_RETRY_LIMIT = 5;
// degraded·결과 미상 연결의 사건은 복구를 기다려 재시도하되 이 횟수(백오프 최대 256초 기준 약 20시간)를 넘으면 blocked로 멈춘다(추가, P2-8)
export const NOT_READY_RETRY_LIMIT = 288;
type Route = { field_issuer: string; status: string; event_key_id: string | null;
  event_secret_cipher: Buffer | null };

// AP→Field 서명 사건을 발신함에 넣는다. 호출자의 트랜잭션 안에서 상태 변경과 함께 저장한다.
// Field 수신함(preview.9)이 받는 종류만 쓴다. 연결 해제는 전용 서명 해제 경로가 담당하므로 여기서 보내지 않는다.
export async function enqueueFieldAgentEvent(db: PoolClient, input: { organizationId: string;
  connectionId: string; actionRequestId: string; correlationId: string; status: string;
  occurredAt: Date }) {
  const version = await db.query<{ next: number }>(
    `select coalesce(max(aggregate_version), 0) + 1 as next from ap.field_agent_event_outbox
     where event_type = 'agent.action.delivery_updated' and aggregate_id = $1`, [input.actionRequestId]);
  const eventId = randomUUID();
  const aggregateVersion = version.rows[0]!.next;
  const body = JSON.stringify({ spec_version: '1.0', event_id: eventId,
    event_type: 'agent.action.delivery_updated', source_product: 'agent_platform',
    connection_id: input.connectionId, aggregate_type: 'action', aggregate_id: input.actionRequestId,
    aggregate_version: aggregateVersion, occurred_at: input.occurredAt.toISOString(),
    correlation_id: input.correlationId,
    data: { resource_id: input.actionRequestId, status: input.status } });
  await db.query(`insert into ap.field_agent_event_outbox
    (id,organization_id,connection_id,event_type,aggregate_id,aggregate_version,correlation_id,body)
    values ($1,$2,$3,'agent.action.delivery_updated',$4,$5,$6,$7)`,
  [eventId, input.organizationId, input.connectionId, input.actionRequestId, aggregateVersion,
    input.correlationId, body]);
  return eventId;
}

// Field 수신함 검증과 같은 서명: HMAC-SHA256(연결 비밀, `${prefix}${timestamp}.${event_id}.` + 원문 바이트).
// prefix는 v2면 `v2:ap->field.`, 전환 기간 v1이면 빈 문자열이다(AP_EVENT_SIGNATURE_SEND_VERSION)
function signFieldAgentEvent(secret: Buffer, prefix: string, timestamp: string, eventId: string, raw: Buffer) {
  return createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${prefix}${timestamp}.${eventId}.`), raw])).digest('hex');
}

// 발신함 한 건을 보낸다. 202 수신 영수증만 acked이며, 일시 장애는 같은 event_id·본문으로 재시도한다.
export async function deliverFieldAgentEventOnce(pool: Pool, config: FieldConnectorConfig):
  Promise<'empty' | 'acked' | 'retry' | 'blocked'> {
  const selected = await pool.query<Claim>(
    `with candidate as (
       select id from ap.field_agent_event_outbox
       where (state in ('pending','retry') and next_attempt_at <= now())
          or (state = 'sending' and lease_until <= now())
       order by next_attempt_at,created_at for update skip locked limit 1
     )
     update ap.field_agent_event_outbox o set state = 'sending',attempts = o.attempts + 1,
       lease_until = now() + interval '30 seconds',updated_at = now()
     from candidate where o.id = candidate.id
     returning o.id,o.connection_id,o.body,o.attempts`);
  const claim = selected.rows[0];
  if (!claim) return 'empty';
  const finish = async (state: 'acked' | 'retry' | 'blocked', status: number | null,
    error: string | null) => {
    const seconds = Math.min(300, 2 ** Math.min(claim.attempts, 8));
    await pool.query(`update ap.field_agent_event_outbox set state = $3,
      next_attempt_at = case when $3 = 'retry'
        then now() + ($6::text || ' seconds')::interval else next_attempt_at end,
      lease_until = null,acknowledged_at = case when $3 = 'acked' then now() else acknowledged_at end,
      last_http_status = $4,last_error = $5,updated_at = now()
      where id = $1 and attempts = $2 and state = 'sending'`,
    [claim.id, claim.attempts, state, status, error, seconds]);
    return state;
  };
  const found = await pool.query<Route>(
    `select field_issuer,status,event_key_id,event_secret_cipher
     from ap.field_connections where id = $1`, [claim.connection_id]);
  const connection = found.rows[0];
  if (!connection || connection.status === 'revoked' || !connection.event_key_id
    || !connection.event_secret_cipher || connection.field_issuer !== config.issuer)
    return finish('blocked', null, 'route_unavailable');
  // degraded·결과 미상 연결은 Field가 서명 경로를 닫아 두므로 복구까지 기다린다. 상한을 넘으면 blocked로 멈춘다
  if (connection.status !== 'review_required') return claim.attempts >= NOT_READY_RETRY_LIMIT
    ? finish('blocked', null, 'connection_not_ready_limit') : finish('retry', null, 'connection_not_ready');
  const target = new URL('/integrations/v1/webhooks/agent', config.issuer);
  if (target.protocol !== 'https:' && process.env.AP_PROFILE !== 'mock')
    return finish('blocked', null, 'insecure_event_route');
  let secret: Buffer;
  try { secret = Buffer.from(unsealFieldEventSecret(connection.event_secret_cipher,
    config.tokenKey), 'base64url'); }
  catch { return finish('blocked', null, 'route_key_unreadable'); }
  if (secret.length !== 32) return finish('blocked', null, 'invalid_route_key');
  const raw = Buffer.from(claim.body, 'utf8');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signing = apToFieldSigning();
  let response: Response;
  try {
    response = await (config.fetcher ?? fetch)(target, { method: 'POST',
      headers: { 'content-type': 'application/vnd.agent-event+json', 'x-event-id': claim.id,
        'x-key-id': connection.event_key_id, 'x-timestamp': timestamp, ...signing.headers,
        'x-signature': signFieldAgentEvent(secret, signing.prefix, timestamp, claim.id, raw) },
      body: raw, signal: AbortSignal.timeout(8000) });
  } catch { return finish('retry', null, 'delivery_unknown'); }
  if (response.status === 202) {
    const body: unknown = await response.json().catch(() => null);
    return body && typeof body === 'object' && 'received' in body && body.received === true
      ? finish('acked', 202, null) : finish('retry', 202, 'invalid_receiver_receipt');
  }
  if (response.status === 401 && claim.attempts < AUTH_REJECT_RETRY_LIMIT)
    return finish('retry', 401, 'receiver_auth_rejected');
  if ([400, 401, 403, 404, 409].includes(response.status))
    return finish('blocked', response.status, 'receiver_rejected');
  return finish('retry', response.status, 'receiver_unavailable');
}

// 수신 확인(acked)된 발신함 행은 30일 뒤, 차단(blocked)된 행은 마지막 변경 30일 뒤 지운다(본문은 ID·상태뿐이지만 보존 기간을 둔다).
// 한 주기에 1000행씩 처리한다. 다음 사건 순번(max+1)이 이미 보낸 순번을 재사용하지 않도록 같은 대상의 최신 행은 남긴다.
export async function purgeAckedFieldAgentEvents(pool: Pool) {
  return (await pool.query(`delete from ap.field_agent_event_outbox where id in (
      select o.id from ap.field_agent_event_outbox o
      where ((o.state = 'acked' and o.acknowledged_at < now() - interval '30 days')
          or (o.state = 'blocked' and o.updated_at < now() - interval '30 days'))
        and exists (select 1 from ap.field_agent_event_outbox newer where newer.event_type = o.event_type
          and newer.aggregate_id = o.aggregate_id and newer.aggregate_version > o.aggregate_version)
      order by coalesce(o.acknowledged_at, o.updated_at) limit 1000)`)).rowCount ?? 0;
}
