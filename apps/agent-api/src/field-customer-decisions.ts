import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { fieldResourceForCustomer, type CustomerFieldResource } from './field-connector.js';
import type { Action } from './field-actions.js';
import { enqueueFieldAgentEvent } from './field-webhook-sender.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const instant = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const CACHE_MS = 30_000;
const MAX_CACHE_ENTRIES = 5_000;

type Proposal = { revision: number; startAt: string; endAt: string;
  state: 'awaiting_customer' | 'customer_accepted' };
type Snapshot = { state: string; revision: number; proposal: Proposal | null; checkedAt: number };
type ReadState = 'current' | 'not_found' | 'scope_missing' | 'connection_invalid' | 'remote_unavailable';
// Field 현재 상태 읽기 캐시(프로세스별). 404·장애 때 마지막으로 확인한 값을 보여 주는 용도이며 AP 원장이 아니다.
const snapshots = new Map<string, Snapshot>();
function remember(actionId: string, snapshot: Snapshot) {
  snapshots.delete(actionId);
  if (snapshots.size >= MAX_CACHE_ENTRIES) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(actionId, snapshot);
}
function accessError(statusCode: number): ReadState {
  return statusCode === 403 ? 'scope_missing' : statusCode === 404 ? 'connection_invalid'
    : 'remote_unavailable';
}
function validProposal(value: unknown): Proposal | null | undefined {
  if (value === null) return null;
  const proposal = object(value);
  if (!proposal || !Number.isSafeInteger(proposal.revision) || Number(proposal.revision) < 1
    || !instant(proposal.startAt) || !instant(proposal.endAt)
    || (proposal.state !== 'awaiting_customer' && proposal.state !== 'customer_accepted')) return undefined;
  return { revision: proposal.revision as number, startAt: proposal.startAt as string,
    endAt: proposal.endAt as string, state: proposal.state };
}
type DecisionRow = { id: string; decision: 'accept' | 'withdraw'; proposal_revision: number;
  idempotency_key: string; customer_record_id: string; customer_confirmed_at: Date;
  state: 'pending' | 'recorded' | 'rejected'; error_code: string | null;
  result_state: string | null; result_revision: number | null };
function decisionView(action: Action, row: DecisionRow, decisionState?: 'decision_unknown') {
  return { actionRequestId: action.id, decision: row.decision, proposalRevision: row.proposal_revision,
    decisionState: decisionState ?? (row.state === 'pending' ? 'decision_unknown' : row.state),
    error: row.error_code, reservationState: row.result_state, revision: row.result_revision,
    // AP는 예약을 확정하지 않는다. 고객 결정 뒤에도 확정은 Field 사업자가 한다
    bookingConfirmedBy: 'field_owner' };
}

// field-actions.ts와 같은 고객 확인키 규칙(Bearer 43자 키의 SHA-256, 동의한 원본 문의만).
// 이 모듈은 field-actions.ts가 등록하므로 순환 import를 피하려고 여기서 다시 읽는다.
function receiptHash(request: FastifyRequest) {
  const key = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '')?.[1];
  return key ? createHash('sha256').update(key).digest('hex') : null;
}
async function customerAction(runtime: BusinessRuntime, inquiryId: string, secretHash: string,
  actionId: string): Promise<{ ok: true; inquiry: { id: string }; action: Action }
    | { ok: false; statusCode: number; error: string }> {
  const inquiry = (await runtime.pool.query<{ id: string }>(
    `select id from ap.inquiries where id = $1 and visitor_key_hash = $2 and consent_at is not null`,
    [inquiryId, secretHash])).rows[0];
  if (!inquiry) return { ok: false, statusCode: 401, error: 'invalid_receipt_key' };
  const found = await runtime.pool.query<Action>(
    'select * from ap.field_action_requests where id = $1 and inquiry_id = $2', [actionId, inquiry.id]);
  const action = found.rows[0];
  if (!action) return { ok: false, statusCode: 404, error: 'field_action_not_found' };
  return { ok: true, inquiry, action };
}

type Grant = Extract<CustomerFieldResource, { ok: true }>;
// Field가 저장 전에 확실히 거절한 사유(같은 키 기록 없음). 다음 시도는 새 키·고객 기록으로 보낼 수 있다
const rekeyable = ['customer_proof_expired', 'connection_invalid', 'scope_missing', 'field_reservation_mismatch'];
type SendResult = { outcome: 'recorded'; status: 200 | 201; row: DecisionRow }
  | { outcome: 'rejected'; status: 403 | 409; row: DecisionRow } | { outcome: 'unknown' };
// 저장된 결정 한 건을 Field에 보낸다. 재시도는 저장된 키·고객 기록·확인 시각으로 같은 본문을 만든다
async function sendDecision(runtime: BusinessRuntime, action: Action, grant: Grant,
  row: DecisionRow): Promise<SendResult> {
  await runtime.pool.query(`update ap.field_customer_decisions set attempts = attempts + 1,updated_at = now()
    where id = $1`, [row.id]);
  const fieldBody = { decision: row.decision, proposalRevision: row.proposal_revision,
    customerProof: { recordId: row.customer_record_id,
      confirmedAt: row.customer_confirmed_at.toISOString(), originConversationId: action.inquiry_id },
    idempotencyKey: row.idempotency_key };
  const keep = async (error: string) => {
    await runtime.pool.query(`update ap.field_customer_decisions set error_code = $2,updated_at = now()
      where id = $1 and state = 'pending'`, [row.id, error]);
    return { outcome: 'unknown' } as const;
  };
  const reject = async (error: string, status: 403 | 409) => {
    const rejected = await runtime.pool.query<DecisionRow>(
      `update ap.field_customer_decisions set state = 'rejected',error_code = $2,updated_at = now()
       where id = $1 and state = 'pending' returning *`, [row.id, error]);
    return { outcome: 'rejected', status, row: rejected.rows[0] ?? row } as const;
  };
  let response: Response;
  try {
    response = await grant.transport(
      `${grant.apiUrl}/external-requests/${action.external_request_id}/customer-decisions`, {
        method: 'POST', headers: { authorization: `Bearer ${grant.access}`,
          'content-type': 'application/json' },
        body: JSON.stringify(fieldBody), signal: AbortSignal.timeout(8000) });
  } catch { return keep('decision_unknown'); }
  const data = object(await response.json().catch(() => null));
  if (response.status === 200 || response.status === 201) {
    if (!data || !uuid.test(String(data.decisionId))
      || data.externalRequestId !== action.external_request_id
      || data.reservationId !== action.reservation_id || data.decision !== row.decision
      || data.proposalRevision !== row.proposal_revision
      || !['customer_accepted', 'change_accepted', 'canceled'].includes(String(data.state))
      || !Number.isSafeInteger(data.revision) || Number(data.revision) <= row.proposal_revision)
      return keep('invalid_field_decision');
    const db = await runtime.pool.connect();
    let recorded: DecisionRow;
    try {
      await db.query('begin');
      // 같은 전달 기록의 사건 순서를 정하기 위해 AP 전달 행을 잠근다
      await db.query('select id from ap.field_action_requests where id = $1 for update', [action.id]);
      const updated = await db.query<DecisionRow>(
        `update ap.field_customer_decisions set state = 'recorded',error_code = null,
           field_decision_id = $2,result_state = $3,result_revision = $4,updated_at = now()
         where id = $1 and state = 'pending' returning *`,
        [row.id, data.decisionId, data.state, data.revision]);
      if (updated.rows[0]) await enqueueFieldAgentEvent(db, { organizationId: action.organization_id,
        connectionId: action.connection_id, actionRequestId: action.id, correlationId: row.id,
        status: `customer_decided_${row.decision}`, occurredAt: new Date() });
      recorded = updated.rows[0] ?? (await db.query<DecisionRow>(
        'select * from ap.field_customer_decisions where id = $1', [row.id])).rows[0]!;
      await db.query('commit');
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    snapshots.delete(action.id);
    return { outcome: 'recorded', status: response.status === 201 ? 201 : 200, row: recorded };
  }
  const error = typeof data?.error === 'string' && /^[a-z_]{1,80}$/.test(data.error)
    ? data.error : 'field_decision_rejected';
  if (response.status === 400 || response.status === 409) {
    if (error === 'proposal_mismatch') snapshots.delete(action.id);
    return reject(error, 409);
  }
  // 인증·권한·연결 불일치는 Field가 저장 전에 확실히 거절한 것이다. 거절로 닫고 다음 시도는 새 키로 보낸다
  if (response.status === 401 || response.status === 403 || response.status === 404)
    return reject(response.status === 403 ? 'scope_missing' : response.status === 401
      ? 'connection_invalid' : 'field_reservation_mismatch', response.status === 403 ? 403 : 409);
  return keep('decision_unknown');
}

export function registerFieldCustomerDecisionRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  // 고객 확인키로 AP 전달 기록 하나와 Field 최신 상태·제안을 읽는다. 이 읽기는 AP 전달 상태를 바꾸지 않는다.
  app.get<{ Params: { id: string; actionId: string } }>(
    '/v1/inquiries/:id/field-actions/:actionId', async (request, reply) => {
      const secretHash = receiptHash(request);
      if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
      if (!uuid.test(request.params.id) || !uuid.test(request.params.actionId))
        return reply.code(404).send({ error: 'field_action_not_found' });
      const found = await customerAction(runtime, request.params.id, secretHash, request.params.actionId);
      if (!found.ok) return reply.code(found.statusCode).send({ error: found.error });
      const { action, inquiry } = found;
      const base = { actionRequestId: action.id, kind: action.kind, state: action.state,
        externalRequestId: action.external_request_id, reservationId: action.reservation_id,
        error: action.error_code, serviceName: action.service_snapshot.name,
        priceAmount: action.service_snapshot.priceAmount, createdAt: action.created_at };
      const decisions = await runtime.pool.query<DecisionRow>(
        `select * from ap.field_customer_decisions where action_request_id = $1
         order by created_at desc limit 10`, [action.id]);
      // 연결이 제안 응답 권한(field.proposals.respond)에 동의했는지. 없으면 화면이 수락·철회를 비활성화하고 사유를 보인다(추가, P2-5)
      const canRespond = (await runtime.pool.query<{ scopes: string[] }>(
        'select scopes from ap.field_connections where id = $1', [action.connection_id])).rows[0]
        ?.scopes.includes('field.proposals.respond') ?? false;
      const send = (readState: ReadState | 'not_applicable', snapshot?: Snapshot) =>
        reply.header('Cache-Control', 'private, no-store').send({ ...base, canRespond,
          field: { readState, state: snapshot?.state ?? null, revision: snapshot?.revision ?? null,
            proposal: snapshot?.proposal ?? null,
            checkedAt: snapshot ? new Date(snapshot.checkedAt).toISOString() : null },
          decisions: decisions.rows.map(row => decisionView(action, row)) });
      if (action.state !== 'accepted_external' || !action.external_request_id)
        return send('not_applicable');
      const cached = snapshots.get(action.id);
      if (cached && Date.now() - cached.checkedAt < CACHE_MS) return send('current', cached);
      const grant = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
        action.connection_id, 'field.requests.read');
      if (!grant.ok) return send(accessError(grant.statusCode), cached);
      let response: Response;
      try {
        response = await grant.transport(`${grant.apiUrl}/external-requests/${action.external_request_id}`,
          { headers: { authorization: `Bearer ${grant.access}` }, signal: AbortSignal.timeout(8000) });
      } catch { return send('remote_unavailable', cached); }
      if (response.status === 401) return send('connection_invalid', cached);
      if (response.status === 403) return send('scope_missing', cached);
      if (response.status === 404) return send('not_found', cached);
      if (!response.ok) return send('remote_unavailable', cached);
      const data = object(await response.json().catch(() => null));
      const proposal = validProposal(data?.proposal);
      if (!data || data.externalRequestId !== action.external_request_id
        || data.actionRequestId !== action.id || data.connectionId !== action.connection_id
        || data.organizationId !== grant.fieldOrganizationId
        || data.reservationId !== action.reservation_id
        || typeof data.state !== 'string' || !data.state || data.state.length > 60
        || !Number.isSafeInteger(data.revision) || Number(data.revision) < 0 || proposal === undefined)
        return send('remote_unavailable', cached);
      const snapshot = { state: data.state, revision: data.revision as number, proposal,
        checkedAt: Date.now() };
      remember(action.id, snapshot);
      return send('current', snapshot);
    });

  // 고객이 현재 제안을 수락하거나 요청을 철회한다. Field 고객 전이만 실행하며 예약 확정은 Field 사업자가 한다.
  app.post<{ Params: { id: string; actionId: string } }>(
    '/v1/inquiries/:id/field-actions/:actionId/customer-decisions', async (request, reply) => {
      const secretHash = receiptHash(request);
      if (!secretHash) return reply.code(401).send({ error: 'receipt_key_required' });
      if (!uuid.test(request.params.id) || !uuid.test(request.params.actionId))
        return reply.code(404).send({ error: 'field_action_not_found' });
      const body = object(request.body);
      if (!body || Object.keys(body).some(key => key !== 'decision' && key !== 'proposalRevision')
        || (body.decision !== 'accept' && body.decision !== 'withdraw')
        || !Number.isSafeInteger(body.proposalRevision) || Number(body.proposalRevision) < 1
        || Number(body.proposalRevision) > 1_000_000_000)
        return reply.code(400).send({ error: 'invalid_customer_decision' });
      const decision = body.decision;
      const proposalRevision = body.proposalRevision as number;
      const found = await customerAction(runtime, request.params.id, secretHash, request.params.actionId);
      if (!found.ok) return reply.code(found.statusCode).send({ error: found.error });
      const { action, inquiry } = found;
      if (action.state !== 'accepted_external' || action.kind !== 'reservation_request'
        || !action.external_request_id || !action.reservation_id)
        return reply.code(409).send({ error: 'field_reservation_not_accepted' });
      const existing = (await runtime.pool.query<DecisionRow>(
        `select * from ap.field_customer_decisions
         where action_request_id = $1 and decision = $2 and proposal_revision = $3`,
        [action.id, decision, proposalRevision])).rows[0];
      if (existing?.state === 'recorded')
        return reply.header('Cache-Control', 'private, no-store').send(decisionView(action, existing));
      // Field가 저장 전에 거절한 결정(같은 키 기록 없음)만 새 키로 다시 보낼 수 있다
      if (existing?.state === 'rejected' && !rekeyable.includes(existing.error_code ?? ''))
        return reply.code(409).send(decisionView(action, existing));
      const grant = await fieldResourceForCustomer(runtime, inquiry.id, secretHash,
        action.connection_id, 'field.proposals.respond');
      if (!grant.ok) return reply.code(grant.statusCode === 403 ? 403 : grant.statusCode === 404 ? 409 : 503)
        .send({ error: accessError(grant.statusCode),
          ...(existing?.state === 'pending' ? { decisionState: 'decision_unknown' } : {}) });
      // 다른 결정이 결과 미상이면 서버가 그 결정을 저장된 키·본문으로 먼저 다시 보내 결과를 확정한다.
      // 그래도 결과 미상이면 새 결정으로 우회하지 않고 그 결정을 알려 준다(고객 화면: 이전 응답 결과 확인 중)
      const unresolved = (await runtime.pool.query<DecisionRow>(
        `select * from ap.field_customer_decisions
         where action_request_id = $1 and state = 'pending'
           and not (decision = $2 and proposal_revision = $3)
         order by created_at limit 1`, [action.id, decision, proposalRevision])).rows[0];
      if (unresolved) {
        const prior = await sendDecision(runtime, action, grant, unresolved);
        if (prior.outcome === 'unknown') return reply.code(409).send({ error: 'prior_decision_unknown',
          decision: unresolved.decision, proposalRevision: unresolved.proposal_revision,
          decisionState: 'decision_unknown' });
      }
      if (existing?.state === 'rejected') await runtime.pool.query(
        `update ap.field_customer_decisions set idempotency_key = $2,customer_record_id = $3,
           customer_confirmed_at = now(),state = 'pending',error_code = null,updated_at = now()
         where id = $1 and state = 'rejected' and error_code = any($4::text[])`,
        [existing.id, randomUUID(), randomUUID(), rekeyable]);
      else if (!existing) await runtime.pool.query(
        `insert into ap.field_customer_decisions
          (id,organization_id,action_request_id,external_request_id,decision,proposal_revision,
           idempotency_key,customer_record_id,customer_confirmed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now())
         on conflict (action_request_id,decision,proposal_revision) do nothing`,
        [randomUUID(), action.organization_id, action.id, action.external_request_id,
          decision, proposalRevision, randomUUID(), randomUUID()]);
      const row = (await runtime.pool.query<DecisionRow>(
        `select * from ap.field_customer_decisions
         where action_request_id = $1 and decision = $2 and proposal_revision = $3`,
        [action.id, decision, proposalRevision])).rows[0]!;
      if (row.state === 'recorded')
        return reply.header('Cache-Control', 'private, no-store').send(decisionView(action, row));
      if (row.state === 'rejected') return reply.code(409).send(decisionView(action, row));
      const result = await sendDecision(runtime, action, grant, row);
      if (result.outcome === 'recorded') return reply.header('Cache-Control', 'private, no-store')
        .code(result.status).send(decisionView(action, result.row));
      if (result.outcome === 'rejected')
        return reply.code(result.status).send(decisionView(action, result.row));
      return reply.code(202).send(decisionView(action, row, 'decision_unknown'));
    });
}
