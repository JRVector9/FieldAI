import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { fieldIntegratorGrant, type FieldGrant } from './integrator-auth.js';
import { acceptReservationProposal, requestReservationCancellation } from './bookings.js';

// RFC 3339 date-time(시간대 필수). JS Date.parse만 통과하고 PG timestamptz가 거부하는 문자열은 400으로 막는다.
const RFC3339 = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/i;
export function isRfc3339(value: string) {
  const match = RFC3339.exec(value);
  // 월별 일수(윤년 포함)를 넘는 날짜는 PG가 거부하므로 여기서 거른다.
  return !!match && Number(match[3]) <= new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate()
    && Number.isFinite(Date.parse(value));
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const canonical = (value: unknown): string => JSON.stringify(value,
  (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
const bodyHash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
// 제안이 고객 결정을 기다리거나 고객이 수락만 한(아직 미확정) 예약 상태
const proposalStates = new Set(['proposed', 'change_proposed', 'customer_accepted', 'change_accepted']);
const WITHDRAW_REASON = '고객이 연결된 상담에서 제안 요청을 철회했습니다.';

type ExternalRow = { id: string; action_request_id: string; connection_id: string; kind: string;
  status: string; reservation_id: string | null; origin_conversation_id: string;
  field_work_state: string; field_work_revision: number; received_at: Date };
type ReservationRow = NonNullable<Parameters<typeof acceptReservationProposal>[1]>;
type DecisionRow = { id: string; body_hash: string; decision: string; proposal_revision: number;
  result_state: string; result_revision: number; reservation_id: string; external_request_id: string };

// by-source 조회와 같은 연결 범위(현재 연결·client·actor·grant)에서만 Field ID로 외부 요청을 찾는다.
async function boundRequest(db: Pick<PoolClient, 'query'>, grant: FieldGrant, id: string, lock = false) {
  const found = await db.query<ExternalRow>(
    `select e.id,e.action_request_id,e.connection_id,e.kind,e.status,e.reservation_id,
       e.origin_conversation_id,e.field_work_state,e.field_work_revision,e.received_at
     from field.external_work_requests e
     join field.ap_connections c on c.id = e.connection_id
     where e.id = $1 and e.organization_id = $2 and e.client_id = $3
       and c.organization_id = e.organization_id
       and c.field_grant_id = $4 and c.field_actor_user_id = $5
       and c.status = 'review_required'
     ${lock ? 'for share of c' : ''}`,
    [id, grant.organization_id, grant.client_id, grant.id, grant.actor_user_id]);
  return found.rows[0] ?? null;
}
function decisionResult(row: DecisionRow) {
  return { decisionId: row.id, externalRequestId: row.external_request_id,
    reservationId: row.reservation_id, decision: row.decision,
    proposalRevision: row.proposal_revision, state: row.result_state,
    revision: row.result_revision, retryable: false };
}

export function registerExternalRequestPublicRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get<{ Params: { id: string } }>('/integrations/v1/external-requests/:id', async (request, reply) => {
    const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.requests.read');
    if (!grant) return reply;
    if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'external_request_not_found' });
    const row = await boundRequest(runtime.pool, grant, request.params.id);
    if (!row) return reply.code(404).send({ error: 'external_request_not_found' });
    let state = row.field_work_state;
    let revision = row.field_work_revision;
    let proposal: Record<string, unknown> | null = null;
    if (row.reservation_id) {
      const found = await runtime.pool.query<{ state: string; revision: number;
        proposal_start_at: Date | null; proposal_end_at: Date | null; proposal_accepted_at: Date | null;
        proposal_revision: number | null }>(
        `select r.state,r.revision,r.proposal_start_at,r.proposal_end_at,r.proposal_accepted_at,
           (select max(e.revision) from field.reservation_events e where e.reservation_id = r.id
             and e.event_type = 'field.reservation.proposed') as proposal_revision
         from field.reservations r where r.id = $1 and r.organization_id = $2`,
        [row.reservation_id, grant.organization_id]);
      const reservation = found.rows[0];
      if (!reservation) return reply.code(404).send({ error: 'external_request_not_found' });
      state = reservation.state;
      revision = reservation.revision;
      if (proposalStates.has(reservation.state) && reservation.proposal_start_at
        && reservation.proposal_end_at && reservation.proposal_revision !== null)
        proposal = { revision: reservation.proposal_revision,
          startAt: reservation.proposal_start_at.toISOString(),
          endAt: reservation.proposal_end_at.toISOString(),
          state: reservation.proposal_accepted_at ? 'customer_accepted' : 'awaiting_customer' };
    }
    return reply.headers({ 'Cache-Control': 'private, no-store', ETag: `"${revision}"` }).send({
      externalRequestId: row.id, actionRequestId: row.action_request_id,
      connectionId: row.connection_id, organizationId: grant.organization_id, kind: row.kind,
      status: row.status, reservationId: row.reservation_id, state, revision, proposal,
      receivedAt: row.received_at.toISOString() });
  });

  app.post<{ Params: { id: string } }>('/integrations/v1/external-requests/:id/customer-decisions',
    async (request, reply) => {
      const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.proposals.respond');
      if (!grant) return reply;
      const body = object(request.body);
      const proof = object(body?.customerProof);
      if (body?.decision === 'decline')
        return reply.code(400).send({ error: 'decision_not_supported' });
      if (!uuid.test(request.params.id) || !body || !proof
        || Object.keys(body).some(key => !['decision', 'proposalRevision', 'customerProof',
          'idempotencyKey'].includes(key))
        || (body.decision !== 'accept' && body.decision !== 'withdraw')
        || typeof body.proposalRevision !== 'number' || !Number.isSafeInteger(body.proposalRevision)
        || body.proposalRevision < 1 || body.proposalRevision > 1_000_000_000
        || !uuid.test(String(body.idempotencyKey))
        || Object.keys(proof).some(key => !['recordId', 'confirmedAt', 'originConversationId'].includes(key))
        || !uuid.test(String(proof.recordId)) || !uuid.test(String(proof.originConversationId))
        || typeof proof.confirmedAt !== 'string' || !isRfc3339(proof.confirmedAt))
        return reply.code(400).send({ error: 'invalid_customer_decision' });
      const digest = bodyHash(body);
      const db = await runtime.pool.connect();
      try {
        await db.query('begin');
        const external = await boundRequest(db, grant, request.params.id, true);
        if (!external?.reservation_id || external.kind !== 'reservation_request') {
          await db.query('rollback'); return reply.code(404).send({ error: 'external_reservation_not_found' });
        }
        // 같은 예약의 결정은 예약 행 잠금으로 직렬화한 뒤 저장된 멱등 결과를 먼저 확인한다.
        const locked = await db.query<ReservationRow>(
          `select * from field.reservations where id = $1 and organization_id = $2
             and source = 'external_ap' for update`, [external.reservation_id, grant.organization_id]);
        const reservation = locked.rows[0];
        if (!reservation) {
          await db.query('rollback'); return reply.code(404).send({ error: 'external_reservation_not_found' });
        }
        const prior = await db.query<DecisionRow>(
          `select id,body_hash,decision,proposal_revision,result_state,result_revision,
             reservation_id,external_request_id
           from field.external_request_customer_decisions
           where external_request_id = $1 and idempotency_key = $2`, [external.id, body.idempotencyKey]);
        if (prior.rows[0]) {
          await db.query('rollback');
          return prior.rows[0].body_hash === digest
            ? reply.header('Cache-Control', 'private, no-store').code(200).send(decisionResult(prior.rows[0]))
            : reply.code(409).send({ error: 'idempotency_conflict', retryable: false });
        }
        if (proof.originConversationId !== external.origin_conversation_id) {
          await db.query('rollback'); return reply.code(409).send({ error: 'customer_proof_mismatch' });
        }
        const confirmedAt = Date.parse(proof.confirmedAt as string);
        if (confirmedAt > Date.now() + 5 * 60_000 || confirmedAt < Date.now() - 24 * 60 * 60_000) {
          await db.query('rollback'); return reply.code(409).send({ error: 'customer_proof_expired' });
        }
        const reused = await db.query(
          `select 1 from field.external_request_customer_decisions
           where external_request_id = $1 and customer_record_id = $2`, [external.id, proof.recordId]);
        if (reused.rowCount) {
          await db.query('rollback'); return reply.code(409).send({ error: 'customer_proof_reused' });
        }
        // 정확한 현재 제안에만 결정한다. 제안 생성 뒤 다른 변경이 있으면 revision이 달라진다.
        if ((reservation.state !== 'proposed' && reservation.state !== 'change_proposed')
          || reservation.revision !== body.proposalRevision) {
          await db.query('rollback'); return reply.code(409).send({ error: 'proposal_mismatch' });
        }
        // 변경 제안의 철회는 확정 예약 전체 취소 요청이 되므로 이 계약에서 받지 않는다.
        if (body.decision === 'withdraw' && reservation.state !== 'proposed') {
          await db.query('rollback'); return reply.code(409).send({ error: 'decision_not_supported' });
        }
        const updated = body.decision === 'accept'
          ? await acceptReservationProposal(db, reservation, body.proposalRevision)
          : await requestReservationCancellation(db, reservation, body.proposalRevision, WITHDRAW_REASON);
        if (!updated) {
          await db.query('rollback'); return reply.code(409).send({ error: 'proposal_mismatch' });
        }
        const saved = await db.query<DecisionRow>(
          `insert into field.external_request_customer_decisions
            (id,organization_id,external_request_id,reservation_id,connection_id,client_id,
             field_grant_id,idempotency_key,body_hash,decision,proposal_revision,
             customer_record_id,customer_confirmed_at,result_state,result_revision)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           returning id,body_hash,decision,proposal_revision,result_state,result_revision,
             reservation_id,external_request_id`,
          [randomUUID(), grant.organization_id, external.id, external.reservation_id,
            external.connection_id, grant.client_id, grant.id, body.idempotencyKey, digest,
            body.decision, body.proposalRevision, proof.recordId, proof.confirmedAt,
            updated.state, updated.revision]);
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').code(201).send(decisionResult(saved.rows[0]!));
      } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    });

  app.get<{ Params: { id: string } }>('/integrations/v1/external-requests/:id/notification-route',
    async (request, reply) => {
      const grant = await fieldIntegratorGrant(request, reply, runtime, 'field.notification_route.read');
      if (!grant) return reply;
      if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'external_request_not_found' });
      const row = await boundRequest(runtime.pool, grant, request.params.id);
      if (!row) return reply.code(404).send({ error: 'external_request_not_found' });
      // 알림 경로 원장이 없으면 세대 1(AP 담당)이다. 세대 2 활성/중지는 Field 담당이고 AP 발송은 허용하지 않는다.
      const found = row.reservation_id ? await runtime.pool.query<{ state: string;
        route_generation: number; pending_transfer_id: string | null }>(
        `select state,route_generation,pending_transfer_id
         from field.external_reservation_notification_routes
         where reservation_id = $1 and organization_id = $2`, [row.reservation_id, grant.organization_id])
        : null;
      const route = found?.rows[0];
      const view = route?.state === 'active' || route?.state === 'suspended'
        ? { owner: 'field', generation: route.route_generation, allowed: false,
          reason: route.state === 'active' ? 'field_route_active' : 'field_route_suspended' }
        : route?.pending_transfer_id
          ? { owner: 'ap', generation: 1, allowed: false, reason: 'route_transfer_pending' }
          : { owner: 'ap', generation: 1, allowed: true, reason: 'ap_route_generation_1' };
      return reply.header('Cache-Control', 'private, no-store').send({
        externalRequestId: row.id, reservationId: row.reservation_id, ...view });
    });
}
