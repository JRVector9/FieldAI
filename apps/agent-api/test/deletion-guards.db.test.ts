import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';
import { runOrganizationDeletionOnce } from '../src/account-deletion.js';
import { purgeUnverifiedCredentialUsers } from '../src/retention-purge.js';
import { agentRevocationJournalFromEnvironment } from '../src/revocation-journal.js';
import { RETENTION_WORK_QUERY } from '../src/work-retention.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';
const webOrigin = 'http://localhost:3001';
const testUser = (headers: IncomingHttpHeaders) => typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null;
const hex = () => randomBytes(32).toString('hex');

// x-test-user 방식 조직 준비: owner(비밀번호 계정)·조직·승인된 지식/AI·활성 링크 배포·고객 접수 1건.
async function businessFixture(app: ReturnType<typeof createAgentApp>, name: string) {
  const owner = randomUUID(), org = randomUUID();
  const password = `${randomBytes(12).toString('base64url')}A1!`;
  await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [owner, `${owner}@example.invalid`]);
  await pool.query(`insert into "account"("id","accountId","providerId","userId","password","createdAt","updatedAt")
    values ($1,$2,'credential',$2,$3,now(),now())`, [randomUUID(), owner, await hashPassword(password)]);
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, name]);
  await pool.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
  const knowledgeId = randomUUID(), agentId = randomUUID();
  await pool.query(`insert into ap.knowledge_releases(id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by)
    values ($1,$2,1,1,'native',$3::jsonb,$4,$5)`, [knowledgeId, org, JSON.stringify({ businessName: name,
    introduction: '소개', services: [{ name: '상담', description: '방문 상담' }], faqs: [] }), '0'.repeat(64), owner]);
  await pool.query(`insert into ap.agent_releases(id,organization_id,agent_id,revision,draft_revision,content,content_hash,
    knowledge_release_id,knowledge_revision,approved_by) values ($1,$2,$3,1,1,$4::jsonb,$5,$6,1,$7)`,
  [randomUUID(), org, agentId, JSON.stringify({ name: '상담 AI', tone: 'clear', guideScope: '', handoffText: '담당자 답변' }),
    '0'.repeat(64), knowledgeId, owner]);
  const headers = { 'x-test-user': owner };
  const deployment = await app.inject({ method: 'POST', url: '/v1/deployments', headers, payload: { kind: 'link' } });
  assert.equal(deployment.statusCode, 201, deployment.body);
  assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deployment.json().id}/activate`, headers })).statusCode, 200);
  const receipt = randomBytes(32).toString('base64url');
  const inquiry = await app.inject({ method: 'POST', url: `/v1/public/organizations/${org}/inquiries`,
    headers: { 'idempotency-key': randomBytes(32).toString('base64url'), 'x-receipt-key': receipt },
    payload: { name: '고객', phone: '01012345678', message: '원본 문의', consent: true } });
  assert.equal(inquiry.statusCode, 201, inquiry.body);
  return { owner, org, agentId, password, receipt, inquiryId: inquiry.json().id as string,
    confirm: { confirmText: name, acknowledgements: { retention: true, subscriptions: true, connections: true }, password } };
}
// 조직 삭제 예약을 유예 종료 상태로 당긴다.
const makeDue = (requestId: string) => pool.query(`update ap.organization_deletion_requests set requested_at=now()-interval '15 days',
  scheduled_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute' where id=$1`, [requestId]);

// P1-3: 삭제 유예 중에는 유료 결제·체험·외부 통합 권한 선택·Field 연결 시작을 새로 만들지 않는다.
test('AP deletion grace blocks new checkout, trial, integrator selection and Field connection start', async () => {
  const email = `deletion-guard-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const authPost = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Deletion guard owner' }) }));
  assert.equal((await authPost('/sign-up/email')).status, 200);
  const cookie = (await authPost('/sign-in/email')).headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const ownerSession = (await auth.api.getSession({ headers: new Headers({ cookie }) }))!;
  const runtime = { pool,
    resolveUserId: async (headers: IncomingHttpHeaders) => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    resolveSession: async (headers: IncomingHttpHeaders) => {
      const current = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      return current ? { id: current.session.id, userId: current.user.id } : null;
    },
    billing: { credentialKey: randomBytes(32), webOrigin, provider: { mode: 'test' as const, clientKey: 'test_ck_synthetic',
      mid: 'synthetic-mid', issue: async () => { throw new Error('provider must not run'); },
      charge: async () => { throw new Error('provider must not run'); }, lookup: async () => null } },
    fieldConnector: { issuer: 'http://127.0.0.1:4321/api/auth', clientId: 'synthetic-field-client', clientSecret: 'synthetic-secret',
      tokenKey: randomBytes(32), redirectUri: `${base}/v1/connections/field/callback`, webOrigin,
      fetcher: (async () => { throw new Error('Field must not be called'); }) as typeof fetch } };
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, runtime);
  const headers = { cookie };
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations', headers, payload: { name: '삭제 가드 검수' } });
    assert.equal(organization.statusCode, 201, organization.body);
    const organizationId = organization.json().id as string;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers, payload: { expectedRevision: 0,
      businessName: '삭제 가드 검수', introduction: '', services: [], faqs: [] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers, payload: { expectedRevision: 1 } })).statusCode, 201);
    const draft = await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers, payload: { expectedRevision: 0,
      name: '상담 AI', tone: 'clear', guideScope: '', handoffText: '담당자 답변' } });
    assert.equal(draft.statusCode, 200, draft.body);
    const agentId = draft.json().agentId as string;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers,
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
    const registered = await auth.handler(new Request(`${base}/api/auth/oauth2/create-client`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie },
      body: JSON.stringify({ client_name: 'Deletion guard client', redirect_uris: ['http://127.0.0.1:4399/callback'],
        application_type: 'native', token_endpoint_auth_method: 'client_secret_basic',
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        scope: 'openid offline_access ap.agent.read ap.conversations.read' }) }));
    assert.equal(registered.status, 201, await registered.clone().text());
    const clientId = (await registered.json() as { client_id: string }).client_id;
    const selection = { clientId, organizationId, agentId, deploymentIds: [], scopes: ['ap.agent.read', 'ap.conversations.read'] };
    const selectionCount = async () => (await pool.query<{ n: number }>(
      'select count(*)::int as n from ap.oauth_selections where organization_id=$1', [organizationId])).rows[0]!.n;
    // 기준: 유예 전에는 선택·연결 시작이 된다
    const allowedSelection = await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections', headers, payload: selection });
    assert.equal(allowedSelection.statusCode, 201, allowedSelection.body);
    const apGrantId = randomUUID();
    await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at)
      values ($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')`,
    [apGrantId, ownerSession.session.id, ownerSession.user.id, clientId, organizationId, agentId, ['ap.agent.read', 'ap.conversations.read']]);
    const resources = JSON.stringify([`${base}/integrations/v1`]), scopes = JSON.stringify(['offline_access', 'ap.agent.read', 'ap.conversations.read']);
    await pool.query(`insert into "oauthConsent"("id","clientId","userId","referenceId","resources","scopes","createdAt","updatedAt")
      values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),now())`, [randomUUID(), clientId, ownerSession.user.id, apGrantId, resources, scopes]);
    await pool.query(`insert into "oauthRefreshToken"("id","token","clientId","userId","referenceId","resources","scopes","expiresAt","createdAt")
      values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now()+interval '1 hour',now())`,
    [randomUUID(), randomBytes(32).toString('base64url'), clientId, ownerSession.user.id, apGrantId, resources, scopes]);
    const start = () => app.inject({ method: 'POST', url: '/v1/connections/field/start', headers,
      payload: { fieldConnectionId: randomUUID(), apGrantId } });
    assert.equal((await start()).statusCode, 201);
    const attempts = async () => (await pool.query<{ n: number }>(
      'select count(*)::int as n from ap.field_oauth_attempts where ap_organization_id=$1', [organizationId])).rows[0]!.n;
    assert.equal(await attempts(), 1);
    const plan = randomUUID();
    await pool.query(`insert into ap.billing_plans(id,mode,name,total_amount,supply_amount,vat_amount,tax_free_amount,included_ai_units,grace_days,
      terms_version,terms_text,refund_version,refund_text,reference,requested_by,approved_by,approved_at)
      values ($1,'test','Synthetic',11000,10000,1000,0,10,3,'terms','Synthetic','refund','Synthetic','SYNTHETIC','op-a','op-b',now())`, [plan]);

    // 삭제 예약(유예 14일)
    const requestId = randomUUID();
    await pool.query(`insert into ap.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,scheduled_at,next_attempt_at)
      values ($1,$2,$3,'{}'::jsonb,'scheduled',now()+interval '14 days',now()+interval '14 days')`, [requestId, organizationId, ownerSession.user.id]);
    const expectGuard = (response: { statusCode: number; json: () => { error: string; accessMode: string } }, label: string) => {
      assert.equal(response.statusCode, 409, label);
      assert.deepEqual(response.json(), { error: 'deletion_scheduled', accessMode: 'cleanup_only' }, label);
    };
    expectGuard(await app.inject({ method: 'POST', url: '/v1/subscription/checkout',
      headers: { ...headers, origin: webOrigin, 'idempotency-key': randomUUID() },
      payload: { planId: plan, termsVersion: 'terms', refundVersion: 'refund', totalAmount: 11000, supplyAmount: 10000,
        vatAmount: 1000, taxFreeAmount: 0, currency: 'KRW', includedAiUnits: 10, graceDays: 3, termsAccepted: true,
        autoRenew: true, firstChargePolicy: 'after_authorization' } }), 'checkout');
    assert.equal((await pool.query('select count(*)::int as n from ap.paid_subscriptions where organization_id=$1', [organizationId])).rows[0].n, 0);
    const trial = () => app.inject({ method: 'POST', url: '/v1/subscription/trial', headers,
      payload: { consentVersion: 'mock-trial-v1', termsAccepted: true } });
    expectGuard(await trial(), 'trial');
    assert.equal((await pool.query('select count(*)::int as n from ap.trial_subscriptions where organization_id=$1', [organizationId])).rows[0].n, 0);
    const selectionsBefore = await selectionCount();
    expectGuard(await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections', headers, payload: selection }), 'selection');
    assert.equal(await selectionCount(), selectionsBefore);
    expectGuard(await start(), 'field start');
    assert.equal(await attempts(), 1);

    // 유예 중 취소하면 다시 시작할 수 있다
    assert.equal((await app.inject({ method: 'DELETE', url: '/v1/organizations/current/deletion-requests/current', headers })).statusCode, 200);
    assert.equal((await trial()).statusCode, 201);
  } finally { await app.close(); }
});

// P1-1·P2-7: 연결 해제·동의 24시간 경과 결과 미상은 삭제·보존을 막지 않고, 운영자가 사유와 함께 종결한다.
test('AP unreconcilable delivery_unknown no longer blocks deletion and an operator closes it as unresolved', async () => {
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, { pool, resolveUserId: async headers => testUser(headers) });
  try {
    const f = await businessFixture(app, 'Unknown Org');
    const operator = randomUUID();
    await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [operator, `${operator}@example.invalid`]);
    await pool.query("insert into ap.platform_admin_memberships(user_id,role) values ($1,'operator')", [operator]);
    const clientId = `client-${randomUUID()}`, grantId = randomUUID(), connectionId = randomUUID();
    await pool.query(`insert into "oauthClient"(id,"clientId","redirectUris") values ($1,$1,'[]')`, [clientId]);
    await pool.query(`insert into ap.oauth_selections(id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at)
      values ($1,$2,$3,$4,$5,$6,now()-interval '1 minute')`, [grantId, f.owner, clientId, f.org, f.agentId, ['ap.agent.read']]);
    await pool.query(`insert into ap.field_connections(id,ap_grant_id,ap_organization_id,ap_agent_id,initiator_user_id,field_issuer,
      field_client_id,field_grant_id,field_organization_id,scopes,access_expires_at,status)
      values ($1,$2,$3,$4,$5,'http://127.0.0.1:4321/api/auth','field-client','field-grant',$6,$7,now(),'revoked')`,
    [connectionId, grantId, f.org, f.agentId, f.owner, randomUUID(), ['field.requests.read']]);
    const serviceA = randomUUID(), serviceB = randomUUID();
    const insertAction = async (serviceId: string, consentAgo: string, state = 'delivery_unknown') => {
      const id = randomUUID();
      await pool.query(`insert into ap.field_action_requests(id,organization_id,inquiry_id,connection_id,submission_key_hash,input_hash,
        field_body_hash,field_request_body,kind,service_id,service_snapshot,consent_record_id,consent_confirmed_at,state)
        values ($1,$2,$3,$4,$5,$6,$7,jsonb_build_object('consent',jsonb_build_object('confirmedAt',to_char((now()-$12::interval) at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),'inquiry',$8,$9::jsonb,$10,now()-$12::interval,$11)`,
      [id, f.org, f.inquiryId, connectionId, hex(), hex(), hex(), serviceId, JSON.stringify({ name: '상담', priceAmount: null }),
        randomUUID(), state, consentAgo]);
      return id;
    };
    const stale = await insertAction(serviceA, '25 hours');
    const recent = await insertAction(serviceB, '1 hour');
    const owner = { 'x-test-user': f.owner };
    const current = async () => (await app.inject({ url: '/v1/organizations/current/deletion-requests/current', headers: owner })).json();
    const pending = (await current()).preconditions.find((item: { code: string }) => item.code === 'pending_action_requests');
    // 최근 동의 건만 남고(1), 다시 확인할 수 없는 건은 빠진다
    assert.deepEqual(pending, { code: 'pending_action_requests', count: 1, ok: false });
    const externalPending = async () => (await pool.query<{ external_pending: boolean }>(
      `with work as (${RETENTION_WORK_QUERY}) select external_pending from work where target_id=$2`, [f.org, f.inquiryId])).rows[0]!.external_pending;
    assert.equal(await externalPending(), true);

    // 운영자 종결: 권한·Origin·사유·NUL·종결 가능 여부를 검사한다
    const close = (id: string, actor: string, reason: unknown, origin?: string) => app.inject({ method: 'POST',
      url: `/v1/admin/field-actions/${id}/close-unknown`, headers: { 'x-test-user': actor, ...(origin ? { origin } : {}) }, payload: { reason } });
    assert.equal((await close(stale, f.owner, '운영자 확인 결과 종결합니다')).statusCode, 403);
    const crossOrigin = await close(stale, operator, '운영자 확인 결과 종결합니다', 'https://evil.example');
    assert.equal(crossOrigin.statusCode, 403);
    assert.equal(crossOrigin.json().error, 'origin_denied');
    // 로컬 웹 주소(127.0.0.1:3001)는 mock에서만 추가로 허용한다
    assert.equal((await close(stale, operator, '짧음', 'http://127.0.0.1:3001')).json().error, 'invalid_reason');
    process.env.AP_PROFILE = 'sandbox';
    try {
      const localOrigin = await close(stale, operator, '운영자 확인 결과 종결합니다', 'http://127.0.0.1:3001');
      assert.equal(localOrigin.statusCode, 403);
      assert.equal(localOrigin.json().error, 'origin_denied');
    } finally { process.env.AP_PROFILE = 'mock'; }
    assert.equal((await close(stale, operator, '짧음')).json().error, 'invalid_reason');
    assert.equal((await close(stale, operator, '운영자 확인\u0000결과 종결합니다')).json().error, 'invalid_text');
    assert.equal((await close(randomUUID(), operator, '운영자 확인 결과 종결합니다')).statusCode, 404);
    const tooEarly = await close(recent, operator, '운영자 확인 결과 종결합니다');
    assert.equal(tooEarly.statusCode, 409);
    assert.equal(tooEarly.json().error, 'field_action_not_closable');

    // 최근 건이 Field 거절로 끝나면 전제 조건이 풀리고, 예약 기록에 건너뛴 건수가 남는다
    await pool.query("update ap.field_action_requests set state='rejected',error_code='field_request_rejected' where id=$1", [recent]);
    assert.equal(await externalPending(), false);
    // 사유에 NUL 문자가 있으면 DB 오류(500) 대신 400으로 거절한다
    const nul = await app.inject({ method: 'POST', url: '/v1/organizations/current/deletion-requests', headers: owner,
      payload: { ...f.confirm, reason: '폐업\u0000예정' } });
    assert.equal(nul.statusCode, 400);
    assert.equal(nul.json().error, 'invalid_text');
    const scheduled = await app.inject({ method: 'POST', url: '/v1/organizations/current/deletion-requests', headers: owner, payload: f.confirm });
    assert.equal(scheduled.statusCode, 201, scheduled.body);
    assert.equal(scheduled.json().request.steps.scheduled.unresolvableActionRequestsSkipped, 1);
    await makeDue(scheduled.json().request.id);
    assert.equal(await runOrganizationDeletionOnce({ pool }), 'executed');
    const executed = (await pool.query('select steps from ap.organization_deletion_requests where id=$1', [scheduled.json().request.id])).rows[0].steps;
    assert.equal(executed.executed.unresolvableActionRequestsSkipped, 1);
    assert.equal(executed.executed.integratorSelectionsRevoked, 0);

    // P2-7: 삭제 실행된 조직에는 새 고객 메시지를 받지 않는다(열람은 유지)
    const bearer = { authorization: `Bearer ${f.receipt}` };
    const message = await app.inject({ method: 'POST', url: `/v1/inquiries/${f.inquiryId}/messages`, headers: bearer, payload: { body: '추가 문의' } });
    assert.equal(message.statusCode, 410, message.body);
    assert.equal(message.json().error, 'organization_deleted');
    assert.equal((await app.inject({ url: `/v1/inquiries/${f.inquiryId}`, headers: bearer })).statusCode, 200);

    const closed = await close(stale, operator, '연결 해제 후 확인 불가로 종결합니다');
    assert.equal(closed.statusCode, 200, closed.body);
    assert.equal(closed.json().state, 'unresolved');
    assert.equal(closed.json().error, 'operator_closed_unknown');
    assert.equal((await close(stale, operator, '연결 해제 후 확인 불가로 종결합니다')).statusCode, 409);
    const row = (await pool.query('select state,error_code,closed_by,close_reason,closed_at from ap.field_action_requests where id=$1', [stale])).rows[0];
    assert.deepEqual({ ...row, closed_at: Boolean(row.closed_at) }, { state: 'unresolved', error_code: 'operator_closed_unknown',
      closed_by: operator, close_reason: '연결 해제 후 확인 불가로 종결합니다', closed_at: true });
    assert.equal((await pool.query("select count(*)::int as n from ap.outbox where aggregate_id=$1 and event_type='ap.field_action.unresolved'",
      [stale])).rows[0].n, 1);
    // 종결된 건은 다시 확인·재전송하지 않는다(Field 커넥터 없이 현재 상태를 돌려줌)
    const reconciled = await app.inject({ method: 'POST', url: `/v1/inquiries/${f.inquiryId}/field-actions/${stale}/reconcile`, headers: bearer });
    assert.equal(reconciled.statusCode, 200, reconciled.body);
    assert.equal(reconciled.json().state, 'unresolved');
    // 같은 문의·연결·서비스의 새 전달 금지는 unresolved에도 유지된다
    await assert.rejects(insertAction(serviceA, '0 hours', 'sending'), (error: { code?: string }) => error.code === '23505');
  } finally { await app.close(); }
});

// P2-1·P2-2·보안 #6: 조직 삭제가 외부 통합 권한을 회수하고, 계정 삭제는 매체 소속·활성 OAuth client를 먼저 정리하게 한다.
test('AP organization deletion revokes integrator grants; account deletion is blocked by publishers and active OAuth clients', async () => {
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, { pool,
    resolveUserId: async headers => testUser(headers), verifyDomain: async () => true });
  try {
    const f = await businessFixture(app, 'Grant Org');
    const owner = { 'x-test-user': f.owner };
    const clientId = `client-${randomUUID()}`, selectionId = randomUUID();
    await pool.query(`insert into "oauthClient"(id,"clientId","redirectUris","userId") values ($1,$1,'[]',$2)`, [clientId, f.owner]);
    await pool.query(`insert into ap.oauth_selections(id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at)
      values ($1,$2,$3,$4,$5,$6,now()-interval '1 minute')`, [selectionId, f.owner, clientId, f.org, f.agentId, ['ap.agent.read']]);
    await pool.query(`insert into "oauthConsent"("id","clientId","userId","referenceId","scopes","createdAt","updatedAt")
      values ($1,$2,$3,$4,'["ap.agent.read"]'::jsonb,now(),now())`, [randomUUID(), clientId, f.owner, selectionId]);
    await pool.query(`insert into "oauthRefreshToken"("id","token","clientId","userId","referenceId","scopes","expiresAt","createdAt")
      values ($1,$2,$3,$4,$5,'["ap.agent.read"]'::jsonb,now()+interval '30 days',now())`,
    [randomUUID(), randomBytes(32).toString('base64url'), clientId, f.owner, selectionId]);
    const preconditions = (await app.inject({ url: '/v1/organizations/current/deletion-requests/current', headers: owner })).json().preconditions;
    assert.deepEqual(preconditions.find((item: { code: string }) => item.code === 'integrator_grants_active'),
      { code: 'integrator_grants_active', count: 1, ok: true });
    const scheduled = await app.inject({ method: 'POST', url: '/v1/organizations/current/deletion-requests', headers: owner, payload: f.confirm });
    assert.equal(scheduled.statusCode, 201, scheduled.body);
    const requestId = scheduled.json().request.id as string;
    await makeDue(requestId);
    // 회수 저널이 없으면 권한을 남긴 채 삭제하지 않고 보류한다
    assert.equal(await runOrganizationDeletionOnce({ pool }), 'blocked');
    assert.match((await pool.query('select last_error from ap.organization_deletion_requests where id=$1', [requestId])).rows[0].last_error,
      /revocation_journal_unavailable/);
    await makeDue(requestId);
    const journal = agentRevocationJournalFromEnvironment();
    assert.ok(journal, 'DB suite provides the revocation journal');
    assert.equal(await runOrganizationDeletionOnce({ pool, revocationJournal: journal }), 'executed');
    assert.ok((await pool.query('select revoked_at from ap.oauth_selections where id=$1', [selectionId])).rows[0].revoked_at);
    assert.equal((await pool.query('select count(*)::int as n from "oauthRefreshToken" where "referenceId"=$1 and revoked is null', [selectionId])).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int as n from "oauthConsent" where "referenceId"=$1', [selectionId])).rows[0].n, 0);
    assert.equal((await pool.query('select steps from ap.organization_deletion_requests where id=$1', [requestId])).rows[0].steps.executed.integratorSelectionsRevoked, 1);
    assert.ok((await journal.read(true)).some(entry => entry.targetKind === 'selection' && entry.targetId === selectionId));

    // 계정 삭제 차단: 조직 grant는 회수됐고, 본인이 등록한 활성 OAuth client는 남아 있다
    const blockers = async (actor: string) => (await app.inject({ url: '/v1/account/deletion-eligibility', headers: { 'x-test-user': actor } })).json().blockers;
    assert.deepEqual(await blockers(f.owner), ['oauth_clients_active']);
    await pool.query('update "oauthClient" set disabled=true where "clientId"=$1', [clientId]);
    assert.deepEqual(await blockers(f.owner), []);
    // 매체 owner·구성원도 먼저 정리해야 한다
    const publisher = await app.inject({ method: 'POST', url: '/v1/publishers', headers: owner, payload: { name: '정리할 매체' } });
    assert.equal(publisher.statusCode, 201, publisher.body);
    assert.deepEqual(await blockers(f.owner), ['publisher_membership_required_removal']);
    const editor = randomUUID();
    await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [editor, `${editor}@example.invalid`]);
    await pool.query(`insert into "account"("id","accountId","providerId","userId","password","createdAt","updatedAt")
      values ($1,$2,'credential',$2,$3,now(),now())`, [randomUUID(), editor, await hashPassword(f.password)]);
    assert.deepEqual(await blockers(editor), []);
    await pool.query("insert into ap.publisher_memberships(publisher_id,user_id,role) values ($1,$2,'editor')", [publisher.json().id, editor]);
    assert.deepEqual(await blockers(editor), ['publisher_membership_required_removal']);

    // P2-2: 검증 기간이 지난 다른 매체의 origin은 더 이상 막지 않고, 새 소유자가 검증하면 점유가 넘어간다
    const origin = `https://media-${randomUUID().slice(0, 8)}.example.test`;
    const first = await app.inject({ method: 'POST', url: `/v1/publishers/${publisher.json().id}/domains`, headers: owner, payload: { origin } });
    assert.equal(first.statusCode, 201, first.body);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/publishers/${publisher.json().id}/domains/${first.json().id}/verify`,
      headers: owner })).statusCode, 200);
    const rival = { 'x-test-user': editor };
    const rivalPublisher = (await app.inject({ method: 'POST', url: '/v1/publishers', headers: rival, payload: { name: '실제 소유 매체' } })).json().id;
    const register = () => app.inject({ method: 'POST', url: `/v1/publishers/${rivalPublisher}/domains`, headers: rival, payload: { origin } });
    assert.equal((await register()).statusCode, 409);
    await pool.query("update ap.publisher_domains set verified_until=now()-interval '1 minute' where id=$1", [first.json().id]);
    const taken = await register();
    assert.equal(taken.statusCode, 201, taken.body);
    const verifiedRival = await app.inject({ method: 'POST', url: `/v1/publishers/${rivalPublisher}/domains/${taken.json().id}/verify`, headers: rival });
    assert.equal(verifiedRival.statusCode, 200, verifiedRival.body);
    assert.equal((await pool.query('select verified_at from ap.publisher_domains where id=$1', [first.json().id])).rows[0].verified_at, null);
    // 예전 소유자가 다시 검증해도 현재 점유를 빼앗지 못한다
    const reclaim = await app.inject({ method: 'POST', url: `/v1/publishers/${publisher.json().id}/domains/${first.json().id}/verify`, headers: owner });
    assert.equal(reclaim.statusCode, 409);
    assert.equal(reclaim.json().error, 'origin_already_registered');
  } finally { await app.close(); }
});

// 보안 #2: 48시간 넘게 인증하지 않은 비밀번호 전용·무소속 계정만 지운다.
test('AP retention removes unverified credential-only users without memberships after 48 hours', async () => {
  const make = async (options: { verified?: boolean; hours: number; provider?: string }) => {
    const id = randomUUID();
    await pool.query(`insert into "user"("id","name","email","emailVerified","createdAt","updatedAt")
      values ($1,$1,$2,$3,now()-make_interval(hours => $4::int),now())`, [id, `${id}@example.invalid`, options.verified ?? false, options.hours]);
    await pool.query(`insert into "account"("id","accountId","providerId","userId","createdAt","updatedAt")
      values ($1,$2,$3,$2,now(),now())`, [randomUUID(), id, options.provider ?? 'credential']);
    return id;
  };
  const stale = await make({ hours: 49 });
  const young = await make({ hours: 47 });
  const verified = await make({ verified: true, hours: 49 });
  const kakao = await make({ hours: 49, provider: 'kakao' });
  const member = await make({ hours: 49 });
  const referenced = await make({ hours: 49 });
  const ownerOrg = randomUUID();
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)', [ownerOrg, verified, 'Purge Org']);
  await pool.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'editor')", [ownerOrg, member]);
  // 다른 기록이 FK로 참조하는 계정은 지우지 않고 건너뛴다
  await pool.query(`insert into ap.trial_subscriptions(id,organization_id,consent_version,started_by,ends_at)
    values ($1,$2,'trial-v1',$3,now()+interval '1 day')`, [randomUUID(), ownerOrg, referenced]);
  assert.equal(await purgeUnverifiedCredentialUsers(pool), 1);
  const remaining = new Set((await pool.query<{ id: string }>('select id from "user" where id=any($1::text[])',
    [[stale, young, verified, kakao, member, referenced]])).rows.map(row => row.id));
  assert.equal(remaining.has(stale), false);
  for (const kept of [young, verified, kakao, member, referenced]) assert.ok(remaining.has(kept), kept);
  assert.equal((await pool.query('select count(*)::int as n from "account" where "userId"=$1', [stale])).rows[0].n, 0);
});

// P1-2: 사진 저장소·보존 저널 없이도 보존 작업자가 부팅해 조직 삭제·정리 단계를 돌리고, media 단계만 blocked_integration으로 알린다.
test('AP retention worker boots without media store or retention journal and runs housekeeping', async () => {
  const env: Record<string, string | undefined> = { ...process.env, AP_PROFILE: 'mock' };
  for (const key of Object.keys(env))
    if (key.startsWith('AP_INQUIRY_') || key.startsWith('AP_RETENTION_JOURNAL_') || key === 'NODE_TEST_CONTEXT') delete env[key];
  // 지난 15분 창 행은 이번 주기에 지워져야 한다
  const subject = hex();
  await pool.query(`insert into ap.billing_webhook_ip_windows(subject_hash,attempts,window_started_at,updated_at)
    values ($1,1,now()-interval '1 hour',now()-interval '1 hour')`, [subject]);
  const run = (extra: Record<string, string> = {}) => spawnSync('tsx', ['src/retention-purge-worker.ts', '--once'],
    { cwd: resolve('.'), env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000 });
  const result = run();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /agent retention worker ready \(media retention: blocked_integration\)/);
  assert.match(result.stdout, /media retention blocked_integration/);
  assert.equal((await pool.query('select count(*)::int as n from ap.billing_webhook_ip_windows where subject_hash=$1', [subject])).rows[0].n, 0);
  // 저널 설정이 반쪽이면 설정 오류로 부팅을 거부한다
  const partial = run({ AP_RETENTION_JOURNAL_DIRECTORY: resolve('.') });
  assert.notEqual(partial.status, 0);
  assert.match(partial.stderr, /directory and secret must be configured together/);
});
