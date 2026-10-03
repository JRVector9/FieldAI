import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';
import { purgeAccountDeletionPasswordWindows, runOrganizationDeletionOnce } from '../src/account-deletion.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const user = (headers: IncomingHttpHeaders) =>
  typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null;

test('AP organization deletion is owner-confirmed, cooled, cancelable and retains originals; account deletion follows', async () => {
  const previousProfile = process.env.AP_PROFILE;
  process.env.AP_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined,
    { pool, resolveUserId: async headers => user(headers), modelProvider: {
      model: 'test', generate: async () => { throw new Error('model must not be called'); } } });
  const owner = randomUUID(), editor = randomUUID(), admin = randomUUID(), org = randomUUID();
  // 다른 조직에도 속한 구성원(multi)은 조직 삭제 실행 뒤에도 세션을 유지해야 한다.
  const multi = randomUUID(), otherOrg = randomUUID();
  const password = `${randomBytes(12).toString('base64url')}A1!`;
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, actor?: string, payload?: object) =>
    app.inject({ method, url, headers: actor ? { 'x-test-user': actor } : {}, payload });
  const confirm = { confirmText: 'Deletion Org', acknowledgements: { retention: true, subscriptions: true, connections: true } };
  try {
    for (const id of [owner, editor, admin, multi])
      await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,true)', [id, id, `${id}@example.invalid`]);
    for (const id of [owner, admin])
      await pool.query(`insert into "account"("id","accountId","providerId","userId","password","createdAt","updatedAt")
        values ($1,$2,'credential',$2,$3,now(),now())`, [randomUUID(), id, await hashPassword(password)]);
    await pool.query("insert into ap.platform_admin_memberships(user_id,role) values ($1,'operator')", [admin]);
    for (const id of [owner, editor, multi])
      await pool.query(`insert into "session"("id","expiresAt","token","createdAt","updatedAt","userId")
        values ($1,now()+interval '1 day',$2,now(),now(),$3)`, [randomUUID(), randomBytes(16).toString('hex'), id]);
    await pool.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Deletion Org']);
    await pool.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'owner'),($1,$3,'editor')", [org, owner, editor]);
    await pool.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)', [otherOrg, multi, 'Other Org']);
    await pool.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'editor'),($3,$2,'owner')", [org, multi, otherOrg]);
    // owner 알림 수신처(연락처 암호문)와 인증 메일 감사 행: 삭제 뒤 남지 않아야 한다.
    const ownerRecipient = randomUUID();
    await pool.query(`insert into ap.notification_recipients(id,organization_id,target_kind,target_id,audience,actor_user_id,
      recipient_ciphertext,kakao,consent_version) values ($1,$2,'owner',$3,'owner',$3,'synthetic-owner-ciphertext',true,'notification-v1')`,
    [ownerRecipient, org, owner]);
    const outboxId = (await pool.query<{ id: string }>(`insert into ap.email_outbox("to",subject,text,purpose)
      values ($1,'synthetic','synthetic','verify_email') returning id`, [`${owner}@EXAMPLE.invalid`])).rows[0]!.id;
    await pool.query(`insert into ap.knowledge_drafts(organization_id,content,updated_by) values ($1,$2::jsonb,$3)`,
      [org, JSON.stringify({ businessName: 'Deletion Org', introduction: 'Private intro', services: [], faqs: [] }), owner]);
    await pool.query(`insert into ap.agent_drafts(organization_id,agent_id,content,updated_by) values ($1,$2,$3::jsonb,$4)`,
      [org, randomUUID(), JSON.stringify({ name: 'Owner AI', tone: 'clear', guideScope: 'secret scope', handoffText: 'Owner replies' }), owner]);
    const knowledgeId = randomUUID();
    await pool.query(`insert into ap.knowledge_releases(id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by)
      values ($1,$2,1,1,'native',$3::jsonb,$4,$5)`, [knowledgeId, org, JSON.stringify({ businessName: 'Deletion Org',
      introduction: 'Private intro', services: [{ name: 'Consultation', description: 'Real service' }], faqs: [] }), '0'.repeat(64), owner]);
    await pool.query(`insert into ap.agent_releases(id,organization_id,agent_id,revision,draft_revision,content,content_hash,
      knowledge_release_id,knowledge_revision,approved_by) values ($1,$2,$3,1,1,$4::jsonb,$5,$6,1,$7)`,
    [randomUUID(), org, randomUUID(), JSON.stringify({ name: 'Owner AI', tone: 'clear', guideScope: 'secret scope',
      handoffText: 'Owner replies' }), '0'.repeat(64), knowledgeId, owner]);
    const ownerHeaders = { 'x-test-user': owner };
    const deployment = await app.inject({ method: 'POST', url: '/v1/deployments', headers: ownerHeaders, payload: { kind: 'link' } });
    assert.equal(deployment.statusCode, 201, deployment.body);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deployment.json().id}/activate`,
      headers: ownerHeaders })).statusCode, 200);
    const receipt = randomBytes(32).toString('base64url');
    const inquiry = await app.inject({ method: 'POST', url: `/v1/public/organizations/${org}/inquiries`,
      headers: { 'idempotency-key': randomBytes(32).toString('base64url'), 'x-receipt-key': receipt },
      payload: { name: 'Customer', phone: '01012345678', message: 'Original question', consent: true } });
    assert.equal(inquiry.statusCode, 201, inquiry.body);
    const inquiryId = inquiry.json().id as string;

    // 계정 삭제는 삭제되지 않은 조직 owner·플랫폼 관리자에게 거절된다.
    const ownerEligibility = await call('GET', '/v1/account/deletion-eligibility', owner);
    assert.deepEqual(ownerEligibility.json().blockers, ['organization_deletion_required']);
    const ownerRefused = await call('POST', '/v1/account/deletion-requests', owner,
      { password, confirmText: `${owner}@example.invalid`, acknowledgement: true });
    assert.equal(ownerRefused.statusCode, 409);
    assert.equal(ownerRefused.json().error, 'organization_deletion_required');
    const adminRefused = await call('POST', '/v1/account/deletion-requests', admin,
      { password, confirmText: `${admin}@example.invalid`, acknowledgement: true });
    assert.equal(adminRefused.json().error, 'admin_membership_required_removal');

    // 전제 조건: 해지되지 않은 유료 구독은 예약을 막는다.
    const plan = randomUUID(), subscription = randomUUID();
    await pool.query(`insert into ap.billing_plans(id,mode,name,total_amount,supply_amount,vat_amount,tax_free_amount,included_ai_units,grace_days,
      terms_version,terms_text,refund_version,refund_text,reference,requested_by,approved_by,approved_at)
      values ($1,'test','Synthetic',11000,10000,1000,0,10,3,'terms','Synthetic','refund','Synthetic','SYNTHETIC',$2,$3,now())`, [plan, admin, editor]);
    await pool.query(`insert into ap.paid_subscriptions(id,organization_id,plan_id,customer_key,state,created_by)
      values ($1,$2,$3,$4,'awaiting_authorization',$5)`, [subscription, org, plan, randomUUID(), owner]);
    assert.equal((await call('POST', '/v1/organizations/current/deletion-requests', undefined, confirm)).statusCode, 401);
    assert.equal((await call('POST', '/v1/organizations/current/deletion-requests', editor, confirm)).statusCode, 403);
    assert.equal((await call('POST', '/v1/organizations/current/deletion-requests', owner, { ...confirm, confirmText: 'deletion org' })).json().error, 'confirmation_mismatch');
    assert.equal((await call('POST', '/v1/organizations/current/deletion-requests', owner,
      { ...confirm, acknowledgements: { retention: true, subscriptions: true } })).json().error, 'acknowledgements_required');
    const blocked = await call('POST', '/v1/organizations/current/deletion-requests', owner, confirm);
    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.json().error, 'paid_subscription_active');
    const before = (await call('GET', '/v1/organizations/current/deletion-requests/current', owner)).json();
    assert.equal(before.request, null);
    assert.deepEqual(before.preconditions.map((item: { code: string; ok: boolean }) => [item.code, item.ok]),
      [['paid_subscription_active', false], ['connections_active', true], ['pending_action_requests', true]]);
    await pool.query("update ap.paid_subscriptions set state='canceled',terminated_at=now() where id=$1", [subscription]);

    // 예약: 14일 유예, 배포 즉시 중지, 새 업무 차단, 기존 고객 확인키 열람 유지.
    const scheduled = await call('POST', '/v1/organizations/current/deletion-requests', owner, { ...confirm, reason: '폐업' });
    assert.equal(scheduled.statusCode, 201, scheduled.body);
    const first = scheduled.json().request;
    assert.equal(first.status, 'scheduled');
    assert.equal(Math.round((Date.parse(first.scheduledAt) - Date.parse(first.requestedAt)) / 86_400_000), 14);
    assert.equal((await call('POST', '/v1/organizations/current/deletion-requests', owner, confirm)).json().request.id, first.id);
    assert.equal((await pool.query('select status from ap.deployments where id=$1', [deployment.json().id])).rows[0].status, 'paused');
    const denied = await app.inject({ method: 'POST', url: `/v1/public/organizations/${org}/inquiries`,
      headers: { 'idempotency-key': randomBytes(32).toString('base64url'), 'x-receipt-key': randomBytes(32).toString('base64url') },
      payload: { name: 'Customer', phone: '01012345678', message: 'New after schedule', consent: true } });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().error, 'deletion_scheduled');
    const beforeExecution = await app.inject({ method: 'GET', url: `/v1/inquiries/${inquiryId}`, headers: { authorization: `Bearer ${receipt}` } });
    assert.equal(beforeExecution.statusCode, 200);
    assert.equal(beforeExecution.json().organizationDeleted, false);
    assert.equal((await runOrganizationDeletionOnce({ pool })), 'empty');

    // 유예 중 취소하면 새 업무가 다시 열리고, 다시 예약하면 새 요청 행이 생긴다.
    assert.equal((await call('DELETE', '/v1/organizations/current/deletion-requests/current', editor)).statusCode, 403);
    const canceled = await call('DELETE', '/v1/organizations/current/deletion-requests/current', owner);
    assert.equal(canceled.statusCode, 200);
    assert.equal(canceled.json().request.status, 'canceled');
    assert.equal((await call('DELETE', '/v1/organizations/current/deletion-requests/current', owner)).statusCode, 404);
    assert.equal((await call('GET', '/v1/subscription', owner)).json().access.canStartNew, true);
    const again = await call('POST', '/v1/organizations/current/deletion-requests', owner, confirm);
    assert.equal(again.statusCode, 201);
    assert.notEqual(again.json().request.id, first.id);

    // 유예 종료 뒤 실행: owner 입력 정보·구성원·세션 제거, 문의 원본·청구 원장·조직 행 보존.
    await pool.query(`update ap.organization_deletion_requests set requested_at=now()-interval '15 days',
      scheduled_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute' where id=$1`, [again.json().request.id]);
    assert.equal(await runOrganizationDeletionOnce({ pool }), 'executed');
    assert.equal(await runOrganizationDeletionOnce({ pool }), 'empty');
    const executed = (await pool.query('select status,executed_at,steps from ap.organization_deletion_requests where id=$1', [again.json().request.id])).rows[0];
    assert.equal(executed.status, 'executed');
    assert.ok(executed.steps.executed.membershipsRemoved === 3 && executed.steps.executed.sessionsRevoked === 2);
    assert.equal(executed.steps.executed.ownerRecipientsCleared, 1);
    assert.equal((await pool.query(`select count(*)::int as n from "session" where "userId"=$1 and "expiresAt">now()`, [multi])).rows[0].n, 1);
    assert.equal((await pool.query('select count(*)::int as n from ap.memberships where user_id=$1', [multi])).rows[0].n, 1);
    const recipient = (await pool.query('select recipient_ciphertext,revoked_at,retention_purged_at from ap.notification_recipients where id=$1',
      [ownerRecipient])).rows[0];
    assert.equal(recipient.recipient_ciphertext, null);
    assert.ok(recipient.revoked_at && recipient.retention_purged_at);
    assert.ok((await pool.query('select deleted_at from ap.organizations where id=$1', [org])).rows[0].deleted_at);
    assert.equal((await pool.query('select count(*)::int as n from ap.memberships where organization_id=$1', [org])).rows[0].n, 0);
    assert.equal((await pool.query(`select count(*)::int as n from "session" where "userId"=any($1::text[]) and "expiresAt">now()`, [[owner, editor]])).rows[0].n, 0);
    const knowledge = (await pool.query('select content from ap.knowledge_releases where id=$1', [knowledgeId])).rows[0].content;
    assert.deepEqual(knowledge, { businessName: 'Deletion Org', introduction: '', region: '', openingHours: '', services: [], faqs: [] });
    assert.equal((await pool.query('select content from ap.knowledge_drafts where organization_id=$1', [org])).rows[0].content.introduction, '');
    assert.equal((await pool.query('select content from ap.agent_drafts where organization_id=$1', [org])).rows[0].content.guideScope, '');
    assert.equal((await pool.query('select content from ap.agent_releases where organization_id=$1', [org])).rows[0].content.guideScope, '');
    const message = (await pool.query("select body from ap.inquiry_messages where inquiry_id=$1 and actor='customer' order by created_at limit 1", [inquiryId])).rows[0];
    assert.equal(message.body, 'Original question');
    // 삭제 실행 뒤에도 고객은 원본을 열람하고, 답변할 사업자가 없다는 표시를 함께 받는다.
    const afterExecution = await app.inject({ method: 'GET', url: `/v1/inquiries/${inquiryId}`, headers: { authorization: `Bearer ${receipt}` } });
    assert.equal(afterExecution.statusCode, 200);
    assert.equal(afterExecution.json().organizationDeleted, true);
    assert.equal((await pool.query('select count(*)::int as n from ap.paid_subscriptions where organization_id=$1', [org])).rows[0].n, 1);
    assert.equal((await call('GET', '/v1/subscription', owner)).statusCode, 404);
    const done = (await call('GET', '/v1/organizations/current/deletion-requests/current', owner)).json();
    assert.equal(done.organization.deleted, true);
    assert.equal(done.request.status, 'executed');

    // 조직 삭제 뒤 계정 삭제: 비밀번호·확인 문구를 요구하고, 사용자 행은 익명 tombstone으로 남긴다.
    assert.deepEqual((await call('GET', '/v1/account/deletion-eligibility', owner)).json().blockers, []);
    assert.equal((await call('POST', '/v1/account/deletion-requests', owner,
      { password: 'wrong-password', confirmText: `${owner}@example.invalid`, acknowledgement: true })).statusCode, 403);
    assert.equal((await call('POST', '/v1/account/deletion-requests', owner,
      { password, confirmText: 'someone@example.invalid', acknowledgement: true })).json().error, 'confirmation_mismatch');
    assert.equal((await call('POST', '/v1/account/deletion-requests', owner,
      { password, confirmText: `${owner}@example.invalid` })).json().error, 'acknowledgements_required');
    const deleted = await call('POST', '/v1/account/deletion-requests', owner,
      { password, confirmText: `${owner}@example.invalid`, acknowledgement: true });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(deleted.json().mode, 'anonymized');
    const tombstone = (await pool.query('select name,email,"emailVerified" from "user" where id=$1', [owner])).rows[0];
    assert.equal(tombstone.name, '삭제된 사용자');
    assert.match(tombstone.email, /^deleted-.*@deleted\.invalid$/);
    assert.equal(tombstone.emailVerified, false);
    assert.equal((await pool.query('select "to" from ap.email_outbox where id=$1', [outboxId])).rows[0].to, tombstone.email);
    assert.equal((await pool.query('select count(*)::int as n from "account" where "userId"=$1', [owner])).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int as n from ap.account_deletion_audit where user_id=$1', [owner])).rows[0].n, 1);
    assert.equal((await pool.query('select count(*)::int as n from ap.inquiries where id=$1', [inquiryId])).rows[0].n, 1);
  } finally {
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.AP_PROFILE;
    else process.env.AP_PROFILE = previousProfile;
  }
});

// M2: 계정 삭제 비밀번호 재입력은 사용자별 15분 5회까지만 받는다. 실패 시도는 본 트랜잭션 롤백과 무관하게 남는다.
test('AP account deletion password re-entry is limited to 5 attempts per 15 minutes per user', async () => {
  const previousProfile = process.env.AP_PROFILE;
  process.env.AP_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined,
    { pool, resolveUserId: async headers => user(headers) });
  const member = randomUUID();
  const password = `${randomBytes(12).toString('base64url')}A1!`;
  const attempt = (value: string) => app.inject({ method: 'POST', url: '/v1/account/deletion-requests',
    headers: { 'x-test-user': member }, payload: { password: value, confirmText: `${member}@example.invalid`, acknowledgement: true } });
  try {
    await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [member, `${member}@example.invalid`]);
    await pool.query(`insert into "account"("id","accountId","providerId","userId","password","createdAt","updatedAt")
      values ($1,$2,'credential',$2,$3,now(),now())`, [randomUUID(), member, await hashPassword(password)]);
    const subject = createHmac('sha256', process.env.AP_AUTH_SECRET!).update('ap-account-deletion-password-v1\0').update(member).digest('hex');
    for (let index = 0; index < 5; index += 1) {
      const wrong = await attempt(`wrong-${index}`);
      assert.equal(wrong.statusCode, 403, wrong.body);
      assert.equal(wrong.json().error, 'invalid_password');
    }
    // 6번째는 올바른 비밀번호라도 창이 끝날 때까지 429로 거절하고 계정은 그대로 둔다.
    const limited = await attempt(password);
    assert.equal(limited.statusCode, 429, limited.body);
    assert.equal(limited.json().error, 'password_attempts_exceeded');
    assert.ok(Number(limited.headers['retry-after']) >= 1);
    assert.equal((await pool.query('select email from "user" where id=$1', [member])).rows[0].email, `${member}@example.invalid`);
    // 사용자 id 원문 대신 HMAC 행만 저장된다.
    assert.equal((await pool.query('select attempts from ap.account_deletion_password_windows where subject_hash=$1', [subject])).rows[0].attempts, 6);
    assert.equal((await pool.query('select count(*)::int as n from ap.account_deletion_password_windows where subject_hash=$1', [member])).rows[0].n, 0);
    // 창이 끝나면 다시 시도할 수 있다.
    await pool.query(`update ap.account_deletion_password_windows set window_started_at=now()-interval '16 minutes',
      updated_at=now()-interval '16 minutes' where subject_hash=$1`, [subject]);
    // 보존 작업자 단계가 끝난 창을 지운다.
    assert.ok(await purgeAccountDeletionPasswordWindows(pool) >= 1);
    assert.equal((await pool.query('select count(*)::int as n from ap.account_deletion_password_windows where subject_hash=$1', [subject])).rows[0].n, 0);
    const allowed = await attempt(password);
    assert.equal(allowed.statusCode, 200, allowed.body);
  } finally {
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.AP_PROFILE;
    else process.env.AP_PROFILE = previousProfile;
  }
});

// M3: 비밀번호가 없는 카카오 전용 계정은 최근 5분 이내 새로 로그인한 세션으로 본인 확인 후 삭제한다.
test('AP Kakao-only account deletion requires a session created within the last 5 minutes', async () => {
  const previousProfile = process.env.AP_PROFILE;
  process.env.AP_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const sessionOf = (headers: IncomingHttpHeaders) => typeof headers['x-test-session'] === 'string' ? headers['x-test-session'] : null;
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined,
    { pool, resolveUserId: async headers => user(headers),
      resolveSession: async headers => { const id = sessionOf(headers), userId = user(headers);
        return id && userId ? { id, userId } : null; } });
  const member = randomUUID(), oldSession = randomUUID(), freshSession = randomUUID();
  const headers = (session: string) => ({ 'x-test-user': member, 'x-test-session': session });
  const body = { confirmText: `${member}@example.invalid`, acknowledgement: true };
  try {
    await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [member, `${member}@example.invalid`]);
    await pool.query(`insert into "account"("id","accountId","providerId","userId","createdAt","updatedAt")
      values ($1,$2,'kakao',$3,now(),now())`, [randomUUID(), `kakao-${member}`, member]);
    await pool.query(`insert into "session"("id","expiresAt","token","createdAt","updatedAt","userId")
      values ($1,now()+interval '1 day',$2,now()-interval '10 minutes',now(),$3)`, [oldSession, randomBytes(16).toString('hex'), member]);
    const stale = await app.inject({ url: '/v1/account/deletion-eligibility', headers: headers(oldSession) });
    assert.equal(stale.statusCode, 200, stale.body);
    assert.equal(stale.json().verification, 'recent_sign_in');
    assert.equal(stale.json().reauthWindowMinutes, 5);
    assert.deepEqual(stale.json().blockers, ['reauth_required']);
    assert.equal(stale.json().eligible, false);
    const refused = await app.inject({ method: 'POST', url: '/v1/account/deletion-requests', headers: headers(oldSession), payload: body });
    assert.equal(refused.statusCode, 403, refused.body);
    assert.deepEqual(refused.json(), { error: 'reauth_required', reauthWindowMinutes: 5 });
    // 세션 없이(또는 다른 사용자 세션으로) 보내도 거절한다.
    assert.equal((await app.inject({ method: 'POST', url: '/v1/account/deletion-requests',
      headers: { 'x-test-user': member }, payload: body })).statusCode, 403);
    // 카카오로 다시 로그인한 새 세션: 비밀번호 없이 삭제된다.
    await pool.query(`insert into "session"("id","expiresAt","token","createdAt","updatedAt","userId")
      values ($1,now()+interval '1 day',$2,now(),now(),$3)`, [freshSession, randomBytes(16).toString('hex'), member]);
    const fresh = await app.inject({ url: '/v1/account/deletion-eligibility', headers: headers(freshSession) });
    assert.deepEqual(fresh.json().blockers, []);
    assert.equal(fresh.json().eligible, true);
    const deleted = await app.inject({ method: 'POST', url: '/v1/account/deletion-requests', headers: headers(freshSession), payload: body });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(deleted.json().deleted, true);
    assert.equal((await pool.query('select count(*)::int as n from "account" where "userId"=$1', [member])).rows[0].n, 0);
    assert.equal((await pool.query(`select count(*)::int as n from "session" where "userId"=$1 and "expiresAt">now()`, [member])).rows[0].n, 0);
  } finally {
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.AP_PROFILE;
    else process.env.AP_PROFILE = previousProfile;
  }
});

// L5: 실행 실패 시 원인 추적용 PII 없는 오류 코드(SQLSTATE 등)를 last_error에 남기고 재시도를 예약한다.
test('AP organization deletion failure records a PII-free error code and retries', async () => {
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const owner = randomUUID(), org = randomUUID(), requestId = randomUUID();
  // 실행 중 한 단계에서 SQLSTATE가 있는 오류를 내는 연결(메시지에는 PII를 넣어 저장되지 않는지 확인).
  const failing = { connect: async () => {
    const client = await pool.connect();
    return new Proxy(client, { get(target, key) {
      if (key !== 'query') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
      return (sql: unknown, params?: unknown[]) => typeof sql === 'string' && sql.includes('update ap.knowledge_drafts')
        ? Promise.reject(Object.assign(new Error('owner@example.invalid 010-1234-5678'), { code: 'PAN01' }))
        : target.query(sql as string, params);
    } });
  }, query: pool.query.bind(pool) } as unknown as Pool;
  try {
    await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [owner, `${owner}@example.invalid`]);
    await pool.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Failing Org']);
    await pool.query(`insert into ap.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values ($1,$2,$3,'{}'::jsonb,'scheduled',now()-interval '15 days',now()-interval '1 minute',now()-interval '1 minute')`, [requestId, org, owner]);
    // 파일별 격리 DB에서 앞 테스트의 요청은 이미 실행됐으므로 due 요청은 이것 하나다.
    assert.equal(await runOrganizationDeletionOnce({ pool: failing }), 'retry');
    const row = (await pool.query('select status,last_error,attempt_count,next_attempt_at>now() as later from ap.organization_deletion_requests where id=$1', [requestId])).rows[0];
    assert.equal(row.status, 'scheduled');
    assert.equal(row.last_error, 'execution_failed:PAN01');
    assert.equal(row.attempt_count, 1);
    assert.equal(row.later, true);
    assert.equal((await pool.query('select deleted_at from ap.organizations where id=$1', [org])).rows[0].deleted_at, null);
  } finally {
    await pool.query("update ap.organization_deletion_requests set status='canceled',canceled_at=now(),canceled_by=$2 where id=$1 and status='scheduled'", [requestId, owner]);
    await pool.end();
  }
});
