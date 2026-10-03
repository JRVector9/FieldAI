import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { BusinessRuntime } from './business.js';
import { customerNoticeEvents, readFieldNotificationRoute, recordFieldReservationEvent,
  type FieldNotificationRoute, type ReservationEvent } from './field-actions.js';
import { unsealFieldEventSecret, type FieldConnectorConfig } from './field-connector.js';
import { acceptsV1FieldSignature, fieldToApSignaturePrefix } from './field-signature.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const topKeys = new Set(['spec_version', 'event_id', 'event_type', 'source_product', 'connection_id',
  'aggregate_type', 'aggregate_id', 'aggregate_version', 'occurred_at', 'correlation_id',
  'notification_owner_product', 'route_generation', 'data']);
const dataKeys = new Set(['resource_id', 'status', 'start_at', 'end_at']);
const factsDataKeys = new Set(['resource_id', 'status', 'source_revision']);
type EventEnvelope = { event_id: string; event_type: string; connection_id: string;
  aggregate_id: string; aggregate_version: number; occurred_at: string; correlation_id: string;
  route_generation: number; data: { status: string; start_at?: string; end_at?: string } };
type FactsChangedEnvelope = { event_id: string; connection_id: string; aggregate_id: string;
  aggregate_version: number; occurred_at: string; route_generation: number };
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function instant(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function parseEnvelope(raw: Buffer): EventEnvelope | null {
  let value: unknown;
  try { value = JSON.parse(raw.toString('utf8')); } catch { return null; }
  const body = object(value);
  const data = object(body?.data);
  if (!body || !data || Object.keys(body).some(key => !topKeys.has(key))
    || Object.keys(data).some(key => !dataKeys.has(key))
    || body.spec_version !== '1.0' || body.source_product !== 'field'
    || body.aggregate_type !== 'reservation' || body.notification_owner_product !== 'ap'
    || !uuid.test(String(body.event_id)) || !uuid.test(String(body.connection_id))
    || !uuid.test(String(body.aggregate_id)) || !uuid.test(String(body.correlation_id))
    || typeof body.event_type !== 'string' || !/^field\.reservation\.[a-z_]+$/.test(body.event_type)
    || !Number.isSafeInteger(body.aggregate_version) || Number(body.aggregate_version) < 0
    || !Number.isSafeInteger(body.route_generation) || Number(body.route_generation) < 1
    || !instant(body.occurred_at) || data.resource_id !== body.aggregate_id
    || typeof data.status !== 'string' || data.status.length < 1 || data.status.length > 60
    || (data.start_at !== undefined && !instant(data.start_at))
    || (data.end_at !== undefined && !instant(data.end_at))) return null;
  return { event_id: body.event_id as string, event_type: body.event_type,
    connection_id: body.connection_id as string, aggregate_id: body.aggregate_id as string,
    aggregate_version: body.aggregate_version as number, occurred_at: body.occurred_at as string,
    correlation_id: body.correlation_id as string, route_generation: body.route_generation as number,
    data: { status: data.status,
      ...(typeof data.start_at === 'string' ? { start_at: data.start_at } : {}),
      ...(typeof data.end_at === 'string' ? { end_at: data.end_at } : {}) } };
}

function parseFactsEnvelope(raw: Buffer): FactsChangedEnvelope | null {
  let value: unknown;
  try { value = JSON.parse(raw.toString('utf8')); } catch { return null; }
  const body = object(value);
  const data = object(body?.data);
  if (!body || !data || Object.keys(body).some(key => !topKeys.has(key))
    || Object.keys(data).some(key => !factsDataKeys.has(key))
    || body.spec_version !== '1.0' || body.source_product !== 'field'
    || body.event_type !== 'field.facts.changed' || body.aggregate_type !== 'facts'
    || body.notification_owner_product !== undefined
    || !uuid.test(String(body.event_id)) || !uuid.test(String(body.connection_id))
    || !uuid.test(String(body.aggregate_id)) || !uuid.test(String(body.correlation_id))
    || !Number.isSafeInteger(body.aggregate_version) || Number(body.aggregate_version) < 1
    || body.route_generation !== 1 || !instant(body.occurred_at)
    || data.resource_id !== body.aggregate_id || data.status !== 'approved'
    || data.source_revision !== body.aggregate_version) return null;
  return { event_id: body.event_id as string, connection_id: body.connection_id as string,
    aggregate_id: body.aggregate_id as string, aggregate_version: body.aggregate_version as number,
    occurred_at: body.occurred_at as string, route_generation: 1 };
}

export function registerFieldEventInboxRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  // 시작 시 v1 서명 전환 모드를 남긴다. 잘못된 설정값은 여기서 부팅을 멈춘다.
  app.log.info({ acceptV1: acceptsV1FieldSignature() },
    'field event signature: v2 direction-bound required; v1 accepted only in transition mode');
  app.post('/integrations/v1/field-events', async (request, reply) => {
    const raw = request.body;
    if (!Buffer.isBuffer(raw) || raw.length > 65_536)
      return reply.code(400).send({ error: 'invalid_event_body' });
    const reservationEvent = parseEnvelope(raw);
    const factsEvent = reservationEvent ? null : parseFactsEnvelope(raw);
    const event = reservationEvent ?? factsEvent;
    if (!event) return reply.code(400).send({ error: 'invalid_event_body' });
    const eventId = request.headers['x-event-id'];
    const keyId = request.headers['x-key-id'];
    const timestamp = request.headers['x-timestamp'];
    const signature = request.headers['x-signature'];
    const signaturePrefix = fieldToApSignaturePrefix(request.headers['x-signature-version']);
    if (signaturePrefix === null || typeof eventId !== 'string' || eventId !== event.event_id
      || typeof keyId !== 'string' || !uuid.test(keyId)
      || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)
      || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
      || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature))
      return reply.code(401).send({ error: 'invalid_event_signature' });
    const config = runtime.fieldConnector;
    if (!config) return reply.code(503).send({ error: 'blocked_integration' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const selected = await db.query<{ event_secret_cipher: Buffer; route_generation: number;
        requested_scopes: string[]; has_refresh_consent: boolean; valid_fact_actor: boolean }>(
        `select c.event_secret_cipher,c.route_generation,s.requested_scopes,
           exists(select 1 from "oauthConsent" oc where oc."referenceId" = s.id::text
             and oc."clientId" = s.client_id and oc."userId" = s.actor_user_id
             and oc.scopes @> '["ap.sources.refresh"]'::jsonb) as has_refresh_consent,
           (s.organization_id = c.ap_organization_id and s.agent_id = c.ap_agent_id
             and s.actor_user_id = c.initiator_user_id
             and exists(select 1 from ap.memberships m where m.organization_id = c.ap_organization_id
               and m.user_id = c.initiator_user_id and m.role = 'owner')
             and exists(select 1 from "oauthRefreshToken" t where t."referenceId" = s.id::text
               and t."clientId" = s.client_id and t."userId" = s.actor_user_id
               and t.revoked is null and t."expiresAt" > now())) as valid_fact_actor
         from ap.field_connections c
         join ap.oauth_selections s on s.id = c.ap_grant_id
         where c.id = $1 and c.event_key_id = $2 and c.status = 'review_required'
           and s.revoked_at is null and c.event_secret_cipher is not null for share of c`,
        [event.connection_id, keyId]);
      const route = selected.rows[0];
      if (!route || route.route_generation !== event.route_generation
        || (factsEvent && (!route.requested_scopes.includes('ap.sources.refresh')
          || !route.has_refresh_consent || !route.valid_fact_actor))) {
        await db.query('rollback');
        return reply.code(401).send({ error: 'invalid_event_signature' });
      }
      let secret: Buffer;
      try { secret = Buffer.from(unsealFieldEventSecret(route.event_secret_cipher, config.tokenKey), 'base64url'); }
      catch {
        await db.query('rollback'); return reply.code(503).send({ error: 'event_route_unavailable' });
      }
      if (secret.length !== 32) {
        await db.query('rollback'); return reply.code(503).send({ error: 'event_route_unavailable' });
      }
      // v2 원문은 `v2:field->ap.` 방향 접두사로 시작해 AP가 보낸 서명의 반사를 거부한다.
      const signed = Buffer.concat([Buffer.from(`${signaturePrefix}${timestamp}.${eventId}.`), raw]);
      const expected = createHmac('sha256', secret).update(signed).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
        await db.query('rollback'); return reply.code(401).send({ error: 'invalid_event_signature' });
      }
      const bodyHash = createHash('sha256').update(raw).digest('hex');
      const kind = factsEvent ? 'facts' : 'reservation';
      const receipt = await db.query(`insert into ap.field_event_receipts
        (source_event_id,connection_id,event_kind,body_hash) values ($1,$2,$3,$4)
        on conflict (source_event_id) do nothing returning source_event_id`,
      [event.event_id, event.connection_id, kind, bodyHash]);
      if (!receipt.rowCount) {
        const prior = await db.query<{ body_hash: string; connection_id: string;
          event_kind: string }>(`select body_hash,connection_id,event_kind
          from ap.field_event_receipts where source_event_id = $1`, [event.event_id]);
        if (prior.rows[0]?.body_hash !== bodyHash || prior.rows[0]?.connection_id !== event.connection_id
          || prior.rows[0]?.event_kind !== kind) {
          await db.query('rollback'); return reply.code(409).send({ error: 'event_id_conflict' });
        }
      }
      if (factsEvent) {
        await db.query(`insert into ap.field_facts_event_inbox
          (id,source_event_id,connection_id,release_id,source_revision,occurred_at)
          values ($1,$2,$3,$4,$5,$6::timestamptz)
          on conflict (source_event_id) do nothing`,
        [randomUUID(), factsEvent.event_id, factsEvent.connection_id,
          factsEvent.aggregate_id, factsEvent.aggregate_version, factsEvent.occurred_at]);
      } else if (reservationEvent) {
        await db.query(`insert into ap.field_event_inbox(id,source_product,source_event_id,
          connection_id,action_request_id,reservation_id,revision,event_type,
          reservation_state,occurred_at,route_generation,start_at,end_at,body_hash)
          values ($1,'field',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          on conflict (source_product,source_event_id) do nothing`,
        [randomUUID(), reservationEvent.event_id, reservationEvent.connection_id,
          reservationEvent.correlation_id, reservationEvent.aggregate_id,
          reservationEvent.aggregate_version, reservationEvent.event_type,
          reservationEvent.data.status, reservationEvent.occurred_at,
          reservationEvent.route_generation, reservationEvent.data.start_at ?? null,
          reservationEvent.data.end_at ?? null, bodyHash]);
      }
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').code(202).send({ received: true });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}

type InboxRow = { id: string; source_event_id: string; connection_id: string;
  action_request_id: string; reservation_id: string; revision: number; event_type: string;
  reservation_state: string; occurred_at: Date; route_generation: number;
  start_at: Date | null; end_at: Date | null };
type ActionRow = { id: string; organization_id: string; inquiry_id: string;
  connection_id: string; reservation_id: string | null; state: string;
  route_generation: number | null; connection_status: string; revoked_at: Date | null;
  route_closed: boolean; external_request_id: string | null; scopes: string[];
  visitor_key_hash: string | null };
type MirrorRow = { field_event_id: string; revision: number; event_type: string;
  state: string; occurred_at: Date; route_generation: number;
  start_at: Date | null; end_at: Date | null };

// (연결, 외부 요청)별 Field 알림 경로 조회 결과와 조회 시각. 일시 장애 결과는 담지 않는다.
// 항목은 10초 안에서만 재사용한다(같은 배치의 연속 사건용). 그 사이 Field 경로가 바뀌어도 오래된 값으로 기록하지 않기 위해서다.
// inboxId가 있는 항목은 그 수신함 행에만 쓴다(미루기 기한이 지나 route_unresolved로 닫는 경우)
export type FieldRouteCache = Map<string, { route: FieldNotificationRoute | null; at: number; inboxId?: string }>;
const ROUTE_CACHE_TTL_MS = 10_000;
const ROUTE_CACHE_MAX_ENTRIES = 1000;
// 확인키가 없는 상담은 연결 조회 자체가 성립하지 않으므로 조회 없이 생략(route_unknown)으로 기록한다
const KEYLESS_ROUTE: FieldNotificationRoute = { owner: null, allowed: false, reason: 'route_unknown' };
// 미루기 기한(24시간) 안에 경로를 확인하지 못한 사건은 AP 알림을 만들지 않고 이 사유로 닫는다
const UNRESOLVED_ROUTE: FieldNotificationRoute = { owner: null, allowed: false, reason: 'route_unresolved' };
function cacheRoute(cache: FieldRouteCache, key: string,
  entry: { route: FieldNotificationRoute | null; at: number; inboxId?: string }) {
  cache.delete(key);
  // 크기 상한: 가장 오래 넣은 항목부터 버린다(Map은 넣은 순서를 유지한다)
  if (cache.size >= ROUTE_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, entry);
}
type RouteLookup = { inboxId: string; key: string; inquiryId: string; visitorKeyHash: string;
  action: Pick<ActionRow, 'connection_id' | 'external_request_id' | 'reservation_id'> };

// 고객 알림을 만드는 Field 사건은 sync 경로처럼 기록 직전에 Field 알림 경로를 확인한다.
// 조회는 DB 잠금·트랜잭션 밖에서 하고, 결과를 캐시에 둔 뒤 사건을 잠금 아래에서 처음부터 다시 검사한다
export async function processFieldEventInboxOnce(pool: Pool, fieldConnector?: FieldConnectorConfig,
  routeCache: FieldRouteCache = new Map()): Promise<'empty' | 'processed' | 'deferred' | 'rejected'> {
  for (let lookups = 0; ; lookups++) {
    const result = await processFieldEventInboxRow(pool, routeCache);
    if (typeof result === 'string') return result;
    // 한 호출의 경로 조회는 한 번으로 제한한다. 남은 사건은 다음 호출이 처리한다
    if (lookups > 0) return 'deferred';
    const route = await readFieldNotificationRoute({ pool, resolveUserId: async () => null, fieldConnector },
      result.inquiryId, result.visitorKeyHash, result.action);
    // 일시 장애·커넥터 미설정·AP 연결 조건 불충족(배포 일시중지·동의 없음·owner 멤버십 변경·refresh token 만료 등의 404)은
    // 영구 생략으로 기록하지 않고, 사건을 claim·미러링하지 않은 채 상태를 그대로 두고 미룬다(오류 코드는 실제 원인).
    // 간격은 수신 뒤 지난 시간만큼(30초부터 약 2배씩, 최대 1시간)이고, 기한은 수신 시각(received_at)부터 24시간이다.
    // 첫 미루기 시각 대신 received_at을 쓰는 이유: 새 열 없이 기한을 정하고, 앞 revision을 기다린 시간까지 포함해
    // 오래된 사건이 기한 없이 남지 않게 하기 위해서다. 기한이 지나면 AP 알림 없이 route_unresolved로 닫는다
    if (route?.transient || route?.cause === 'connection_not_available') {
      const deferred = await pool.query(`update ap.field_event_inbox set error_code = $2,
        next_attempt_at = now() + least(greatest(now() - received_at, interval '30 seconds'), interval '1 hour')
        where id = $1 and state in ('received','pending_gap') and received_at > now() - interval '24 hours'`,
      [result.inboxId, route.cause ?? 'route_unknown']);
      if (deferred.rowCount) return 'deferred';
      cacheRoute(routeCache, result.key, { route: UNRESOLVED_ROUTE, at: Date.now(), inboxId: result.inboxId });
      continue;
    }
    cacheRoute(routeCache, result.key, { route, at: Date.now() });
  }
}

async function processFieldEventInboxRow(pool: Pool, routeCache: FieldRouteCache):
  Promise<'empty' | 'processed' | 'deferred' | 'rejected' | RouteLookup> {
  const db = await pool.connect();
  let claimedId: string | undefined;
  try {
    await db.query('begin');
    const pending = await db.query<InboxRow>(
      `select id,source_event_id,connection_id,action_request_id,reservation_id,revision,
        event_type,reservation_state,occurred_at,route_generation,start_at,end_at
       from ap.field_event_inbox where state in ('received','pending_gap')
         and next_attempt_at <= now()
       order by revision,received_at for update skip locked limit 1`);
    const row = pending.rows[0];
    if (!row) { await db.query('commit'); return 'empty'; }
    claimedId = row.id;
    const action = await db.query<ActionRow>(
      `select a.id,a.organization_id,a.inquiry_id,a.connection_id,a.reservation_id,a.state,
        c.route_generation,c.status as connection_status,s.revoked_at,
        exists(select 1 from ap.field_notification_route_closures x
          where x.action_request_id = a.id) as route_closed,
        a.external_request_id,c.scopes,
        (select q.visitor_key_hash from ap.inquiries q where q.id = a.inquiry_id) as visitor_key_hash
       from ap.field_action_requests a
       join ap.field_connections c on c.id = a.connection_id
       join ap.oauth_selections s on s.id = c.ap_grant_id
       where a.id = $1 for update of a`, [row.action_request_id]);
    const target = action.rows[0];
    if (!target || target.state !== 'accepted_external' || !target.reservation_id
      || (target.connection_status !== 'revoked'
        && (target.connection_status !== 'review_required' || target.revoked_at))
      || target.route_generation !== row.route_generation) {
      await db.query(`update ap.field_event_inbox set state = 'pending_gap',
        error_code = 'action_or_route_unavailable',next_attempt_at = now() + interval '30 seconds'
        where id = $1`, [row.id]);
      await db.query('commit'); return 'deferred';
    }
    if (target.route_closed) {
      await db.query(`update ap.field_event_inbox set state = 'rejected',
        error_code = 'route_closed',processed_at = now() where id = $1`, [row.id]);
      await db.query('commit'); return 'rejected';
    }
    if (target.connection_id !== row.connection_id || target.reservation_id !== row.reservation_id) {
      await db.query(`update ap.field_event_inbox set state = 'rejected',
        error_code = 'event_target_mismatch',processed_at = now() where id = $1`, [row.id]);
      await db.query('commit'); return 'rejected';
    }
    const prior = await db.query<MirrorRow>(
      `select field_event_id,revision,event_type,state,occurred_at,route_generation,start_at,end_at
       from ap.field_reservation_events where action_request_id = $1
       order by revision desc limit 1`, [target.id]);
    const latest = prior.rows[0];
    if (row.revision > (latest?.revision ?? -1) + 1) {
      await db.query(`update ap.field_event_inbox set state = 'pending_gap',
        error_code = 'revision_gap',next_attempt_at = now() + interval '5 seconds'
        where id = $1`, [row.id]);
      await db.query('commit'); return 'deferred';
    }
    if (row.revision === 0 && row.event_type !== 'field.reservation.requested') {
      await db.query(`update ap.field_event_inbox set state = 'rejected',
        error_code = 'invalid_initial_event',processed_at = now() where id = $1`, [row.id]);
      await db.query('commit'); return 'rejected';
    }
    if (row.revision <= (latest?.revision ?? -1)) {
      const existing = await db.query<MirrorRow>(
        `select field_event_id,revision,event_type,state,occurred_at,route_generation,start_at,end_at
         from ap.field_reservation_events where action_request_id = $1 and revision = $2`,
        [target.id, row.revision]);
      const matched = existing.rows[0];
      if (!matched || matched.field_event_id !== row.source_event_id
        || matched.event_type !== row.event_type || matched.state !== row.reservation_state
        || matched.route_generation !== row.route_generation
        || matched.occurred_at.getTime() !== row.occurred_at.getTime()
        || matched.start_at?.getTime() !== row.start_at?.getTime()
        || matched.end_at?.getTime() !== row.end_at?.getTime()) {
        await db.query(`update ap.field_event_inbox set state = 'rejected',
          error_code = 'event_revision_conflict',processed_at = now() where id = $1`, [row.id]);
        await db.query('commit'); return 'rejected';
      }
    } else {
      // 새 고객 알림 사건이고 알림 경로 scope를 가진 활성 연결이면 확인한 Field 경로로만 기록한다(잠금을 놓고 먼저 조회).
      // scope가 없거나 해제된 연결은 기존 규칙(세대 일치·종료 원장)을 따르며 경로를 조회하지 않는다
      const routeKey = `${target.connection_id}:${target.external_request_id}`;
      const routeRequired = customerNoticeEvents.has(row.event_type)
        && target.connection_status === 'review_required'
        && target.scopes.includes('field.notification_route.read');
      let route: FieldNotificationRoute | null = null;
      if (routeRequired) {
        const cached = routeCache.get(routeKey);
        if (target.visitor_key_hash === null) route = KEYLESS_ROUTE;
        else if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS
          && (!cached.inboxId || cached.inboxId === row.id)) route = cached.route;
        else {
          await db.query('rollback');
          return { inboxId: row.id, key: routeKey, inquiryId: target.inquiry_id,
            visitorKeyHash: target.visitor_key_hash, action: target };
        }
      }
      const event: ReservationEvent = { eventId: row.source_event_id, revision: row.revision,
        eventType: row.event_type, state: row.reservation_state,
        occurredAt: row.occurred_at.toISOString(), customerNotificationOwnerProduct: 'ap',
        routeGeneration: row.route_generation,
        ...(row.start_at ? { startAt: row.start_at.toISOString() } : {}),
        ...(row.end_at ? { endAt: row.end_at.toISOString() } : {}) };
      await recordFieldReservationEvent(db, target, event, route);
    }
    await db.query(`update ap.field_event_inbox set state = 'processed',
      error_code = null,processed_at = now() where id = $1`, [row.id]);
    await db.query('commit'); return 'processed';
  } catch (error) {
    await db.query('rollback');
    // 처리 중 예외가 난 행은 2초마다 같은 행을 다시 집어 전체 수신함을 멈추지 않도록 별도 커넥션으로 미룬다(추가, P2-4).
    // 간격은 수신 뒤 지난 시간만큼(30초~1시간). 원인은 작업자 로그로 남기고 행에는 processing_failed만 기록한다
    if (claimedId) await pool.query(`update ap.field_event_inbox set error_code = 'processing_failed',
      next_attempt_at = now() + least(greatest(now() - received_at, interval '30 seconds'), interval '1 hour')
      where id = $1 and state in ('received','pending_gap')`, [claimedId]).catch(() => undefined);
    throw error;
  } finally { db.release(); }
}
