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
  // 조직 삭제 예약도 owner 비밀번호 재입력을 요구한다(L8).
  const confirm = { confirmText: 'Deletion Org', acknowledgements: { retention: true, subscriptions: true, connections: true }, password };
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
    // owner 발송 기록: 미시작 건·종료 건은 암호문을 지우고, 결과 미상 건은 공급사 대조를 위해 남긴다.
    const [ownerEvent, ownerEvent2] = [randomUUID(), randomUUID()];
    for (const id of [ownerEvent, ownerEvent2]) {
      const outbox = randomUUID();
      await pool.query(`insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload) values ($1,$2,'ap.inquiry.created',$3,'{}'::jsonb)`,
        [outbox, org, inquiryId]);
      await pool.query(`insert into ap.notification_events(id,organization_id,outbox_id,inquiry_id,audience,channel,state)
        values ($1,$2,$3,$4,'owner','in_app','available')`, [id, org, outbox, inquiryId]);
    }
    const [deliveryPending, deliverySent, deliveryUnknown] = [randomUUID(), randomUUID(), randomUUID()];
    await pool.query(`insert into ap.notification_deliveries(id,organization_id,notification_id,recipient_id,channel,state,recipient_ciphertext)
      values ($1,$2,$3,$4,'kakao','pending','synthetic-delivery-pending')`, [deliveryPending, org, ownerEvent, ownerRecipient]);
    await pool.query(`insert into ap.notification_deliveries(id,organization_id,notification_id,recipient_id,channel,state,recipient_ciphertext,
      provider,account_id,key_fingerprint,started_at,reserved,reserved_day) values
      ($1,$2,$3,$4,'web_push','sent','synthetic-delivery-sent','synthetic','synthetic-account',$6,now(),true,current_date),
      ($5,$2,$7,$4,'kakao','unknown','synthetic-delivery-unknown','synthetic','synthetic-account',$6,now(),true,current_date)`,
    [deliverySent, org, ownerEvent, ownerRecipient, deliveryUnknown, 'a'.repeat(64), ownerEvent2]);

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
      [['paid_subscription_active', false], ['connections_active', true], ['pending_action_requests', true],
        ['integrator_grants_active', true]]);
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
    assert.equal(executed.steps.executed.ownerDeliveriesPurged, 2);
    const deliveries = new Map((await pool.query<{ id: string; state: string; error_code: string | null; recipient_ciphertext: string | null;
      purged: boolean }>(`select id,state,error_code,recipient_ciphertext,retention_purged_at is not null as purged
      from ap.notification_deliveries where id=any($1::uuid[])`, [[deliveryPending, deliverySent, deliveryUnknown]])).rows.map(row => [row.id, row]));
    assert.deepEqual(deliveries.get(deliveryPending), { id: deliveryPending, state: 'suppressed', error_code: 'organization_deleted', recipient_ciphertext: null, purged: true });
    assert.deepEqual(deliveries.get(deliverySent), { id: deliverySent, state: 'sent', error_code: null, recipient_ciphertext: null, purged: true });
    assert.deepEqual(deliveries.get(deliveryUnknown), { id: deliveryUnknown, state: 'unknown', error_code: null,
      recipient_ciphertext: 'synthetic-delivery-unknown', purged: false });
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

    // 조직 삭제 예약 재인증(4회)과 계정 삭제가 같은 15분 시도 창을 쓰므로, 창이 지난 상태를 만든다.
    await pool.query(`update ap.account_deletion_password_windows set window_started_at=now()-interval '16 minutes' where subject_hash=$1`,
      [createHmac('sha256', process.env.AP_AUTH_SECRET!).update('ap-account-deletion-password-v1\0').update(owner).digest('hex')]);
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

// L8·여러 조직 owner(추가): 조직 삭제 예약은 계정 삭제와 같은 재인증을 요구하고, x-organization-id로 고른 조직만 예약·취소한다.
test('AP organization deletion scheduling re-authenticates and targets the x-organization-id owner organization', async () => {
  const previousProfile = process.env.AP_PROFILE;
  process.env.AP_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const sessionOf = (headers: IncomingHttpHeaders) => typeof headers['x-test-session'] === 'string' ? headers['x-test-session'] : null;
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined,
    { pool, resolveUserId: async headers => user(headers),
      resolveSession: async headers => { const id = sessionOf(headers), userId = user(headers);
        return id && userId ? { id, userId } : null; } });
  const owner = randomUUID(), holderB = randomUUID(), holderC = randomUUID(), kakao = randomUUID();
  const orgA = randomUUID(), orgB = randomUUID(), orgC = randomUUID(), orgK = randomUUID();
  const oldSession = randomUUID(), freshSession = randomUUID();
  const password = `${randomBytes(12).toString('base64url')}A1!`;
  const acknowledgements = { retention: true, subscriptions: true, connections: true };
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, actor: string, extra: Record<string, string> = {}, payload?: object) =>
    app.inject({ method, url, headers: { 'x-test-user': actor, ...extra }, payload });
  const scheduleB = (body: object) => call('POST', '/v1/organizations/current/deletion-requests', owner, { 'x-organization-id': orgB },
    { confirmText: 'Second Org', acknowledgements, ...body });
  try {
    for (const id of [owner, holderB, holderC, kakao])
      await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [id, `${id}@example.invalid`]);
    await pool.query(`insert into "account"("id","accountId","providerId","userId","password","createdAt","updatedAt")
      values ($1,$2,'credential',$2,$3,now(),now())`, [randomUUID(), owner, await hashPassword(password)]);
    await pool.query(`insert into "account"("id","accountId","providerId","userId","createdAt","updatedAt")
      values ($1,$2,'kakao',$3,now(),now())`, [randomUUID(), `kakao-${kakao}`, kakao]);
    await pool.query(`insert into "session"("id","expiresAt","token","createdAt","updatedAt","userId") values
      ($1,now()+interval '1 day',$2,now()-interval '10 minutes',now(),$5),($3,now()+interval '1 day',$4,now(),now(),$5)`,
    [oldSession, randomBytes(16).toString('hex'), freshSession, randomBytes(16).toString('hex'), kakao]);
    // owner는 A(owner_user_id)와 B(owner 멤버십) 두 조직의 owner이고, C에서는 editor다.
    await pool.query(`insert into ap.organizations(id,owner_user_id,name,created_at) values
      ($1,$2,'First Org',now()-interval '2 minutes'),($3,$4,'Second Org',now()-interval '1 minute'),($5,$6,'Third Org',now()),($7,$8,'Kakao Org',now())`,
    [orgA, owner, orgB, holderB, orgC, holderC, orgK, kakao]);
    await pool.query(`insert into ap.memberships(organization_id,user_id,role,created_at) values
      ($1,$2,'owner',now()-interval '2 minutes'),($3,$2,'owner',now()-interval '1 minute'),($3,$4,'owner',now()),
      ($5,$2,'editor',now()),($5,$6,'owner',now()),($7,$8,'owner',now())`,
    [orgA, owner, orgB, holderB, orgC, holderC, orgK, kakao]);

    const listed = (await call('GET', '/v1/account/deletion-eligibility', owner)).json().organizations;
    assert.deepEqual(listed.map((item: { id: string; deletionStatus: string; deleted: boolean }) => [item.id, item.deletionStatus, item.deleted]),
      [[orgA, 'none', false], [orgB, 'none', false]]);

    // 재인증: 비밀번호 누락·오류는 예약하지 않는다.
    assert.equal((await scheduleB({})).json().error, 'password_required');
    const wrong = await scheduleB({ password: 'wrong-password' });
    assert.equal(wrong.statusCode, 403);
    assert.equal(wrong.json().error, 'invalid_password');
    assert.equal((await pool.query('select count(*)::int as n from ap.organization_deletion_requests where organization_id=$1', [orgB])).rows[0].n, 0);
    const scheduled = await scheduleB({ password });
    assert.equal(scheduled.statusCode, 201, scheduled.body);
    assert.equal((await pool.query('select organization_id from ap.organization_deletion_requests where id=$1',
      [scheduled.json().request.id])).rows[0].organization_id, orgB);

    // 헤더로 고른 조직만 예약 상태이고, 헤더가 없으면 첫 owner 조직(A)을 보여 준다.
    assert.equal((await call('GET', '/v1/organizations/current/deletion-requests/current', owner, { 'x-organization-id': orgB })).json().request.status, 'scheduled');
    const current = (await call('GET', '/v1/organizations/current/deletion-requests/current', owner)).json();
    assert.deepEqual([current.organization.id, current.request], [orgA, null]);
    const after = (await call('GET', '/v1/account/deletion-eligibility', owner)).json().organizations;
    assert.deepEqual(after.map((item: { deletionStatus: string }) => item.deletionStatus), ['none', 'scheduled']);
    // editor인 조직·구성원이 아닌 조직·잘못된 헤더는 거절한다.
    assert.equal((await call('POST', '/v1/organizations/current/deletion-requests', owner, { 'x-organization-id': orgC },
      { confirmText: 'Third Org', acknowledgements, password })).statusCode, 403);
    assert.equal((await call('GET', '/v1/organizations/current/deletion-requests/current', owner, { 'x-organization-id': randomUUID() })).statusCode, 404);
    assert.equal((await call('GET', '/v1/organizations/current/deletion-requests/current', owner, { 'x-organization-id': 'not-a-uuid' })).statusCode, 400);
    const canceled = await call('DELETE', '/v1/organizations/current/deletion-requests/current', owner, { 'x-organization-id': orgB });
    assert.equal(canceled.json().request.status, 'canceled');
    assert.equal((await call('DELETE', '/v1/organizations/current/deletion-requests/current', owner)).statusCode, 404);

    // 비밀번호 시도 창(15분 5회)은 계정 삭제와 공유한다: 2회 사용 뒤 3회 더 틀리면 6번째는 맞아도 429.
    for (let index = 0; index < 3; index += 1) assert.equal((await scheduleB({ password: `wrong-${index}` })).json().error, 'invalid_password');
    const limited = await scheduleB({ password });
    assert.equal(limited.statusCode, 429, limited.body);
    assert.equal(limited.json().error, 'password_attempts_exceeded');
    assert.ok(Number(limited.headers['retry-after']) >= 1);

    // 카카오 전용 owner: 5분이 지난 세션은 reauth_required, 새로 로그인한 세션은 예약된다.
    const kakaoBody = { confirmText: 'Kakao Org', acknowledgements };
    const stale = await call('POST', '/v1/organizations/current/deletion-requests', kakao, { 'x-test-session': oldSession }, kakaoBody);
    assert.equal(stale.statusCode, 403, stale.body);
    assert.deepEqual(stale.json(), { error: 'reauth_required', reauthWindowMinutes: 5 });
    const fresh = await call('POST', '/v1/organizations/current/deletion-requests', kakao, { 'x-test-session': freshSession }, kakaoBody);
    assert.equal(fresh.statusCode, 201, fresh.body);
  } finally {
    await pool.query(`update ap.organization_deletion_requests set status='canceled',canceled_at=now(),canceled_by=requested_by
      where organization_id=any($1::uuid[]) and status='scheduled'`, [[orgA, orgB, orgC, orgK]]);
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.AP_PROFILE;
    else process.env.AP_PROFILE = previousProfile;
  }
});

// M4 후속(추가): 실행 실패 12회로 멈춘 삭제 요청은 운영자(operator)만 사유와 함께 다시 실행하고, 그 기록을 요청 행에 남긴다.
test('AP stopped organization deletions are listed for admins and resumed only by operators with an audit entry', async () => {
  const previousProfile = process.env.AP_PROFILE;
  process.env.AP_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, { pool, resolveUserId: async headers => user(headers) });
  const owner = randomUUID(), operator = randomUUID(), auditor = randomUUID(), org = randomUUID(), requestId = randomUUID();
  const failing = { connect: async () => {
    const client = await pool.connect();
    return new Proxy(client, { get(target, key) {
      if (key !== 'query') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
      return (sql: unknown, params?: unknown[]) => typeof sql === 'string' && sql.includes('update ap.knowledge_drafts')
        ? Promise.reject(Object.assign(new Error('synthetic'), { code: 'PAN01' })) : target.query(sql as string, params);
    } });
  }, query: pool.query.bind(pool) } as unknown as Pool;
  const call = (method: 'GET' | 'POST', url: string, actor: string, payload?: object) =>
    app.inject({ method, url, headers: { 'x-test-user': actor }, payload });
  const resumeUrl = `/v1/admin/organization-deletions/${requestId}/resume`;
  const reason = '저장소 권한을 확인해 다시 실행합니다';
  try {
    for (const id of [owner, operator, auditor])
      await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [id, `${id}@example.invalid`]);
    await pool.query("insert into ap.platform_admin_memberships(user_id,role) values ($1,'operator'),($2,'auditor')", [operator, auditor]);
    await pool.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Stopped Org']);
    await pool.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
    await pool.query(`insert into ap.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values ($1,$2,$3,'{}'::jsonb,'scheduled',now()-interval '15 days',now()-interval '1 minute',now()-interval '1 minute')`, [requestId, org, owner]);
    // 실행 실패 11회는 재시도, 12회째는 infinity로 멈춘다.
    for (let index = 1; index < 12; index += 1) {
      assert.equal(await runOrganizationDeletionOnce({ pool: failing }), 'retry', String(index));
      await pool.query("update ap.organization_deletion_requests set next_attempt_at=now()-interval '1 minute' where id=$1", [requestId]);
    }
    assert.equal(await runOrganizationDeletionOnce({ pool: failing }), 'blocked');
    const stopped = (await pool.query(`select last_error,next_attempt_at='infinity'::timestamptz as stopped,steps->>'executionFailures' as failures
      from ap.organization_deletion_requests where id=$1`, [requestId])).rows[0];
    assert.deepEqual(stopped, { last_error: 'execution_failed:PAN01,execution_attempts_stopped', stopped: true, failures: '12' });
    assert.equal(await runOrganizationDeletionOnce({ pool }), 'empty');

    // 목록: 관리자(감사자 포함)만, status=stopped만 받는다.
    assert.equal((await call('GET', '/v1/admin/organization-deletions?status=stopped', owner)).statusCode, 403);
    assert.equal((await call('GET', '/v1/admin/organization-deletions?status=all', auditor)).statusCode, 400);
    const listed = await call('GET', '/v1/admin/organization-deletions?status=stopped', auditor);
    assert.equal(listed.statusCode, 200, listed.body);
    const item = listed.json().deletions.find((row: { id: string }) => row.id === requestId);
    assert.deepEqual([item.organizationId, item.executionFailures, item.lastError], [org, 12, 'execution_failed:PAN01,execution_attempts_stopped']);

    // 다시 실행: 감사자·사유 누락은 거절, operator는 사유와 함께 실행 시각·오류·실패 횟수를 되돌린다.
    assert.equal((await call('POST', resumeUrl, auditor, { reason })).statusCode, 403);
    assert.equal((await call('POST', resumeUrl, operator, { reason: '짧음' })).json().error, 'invalid_reason');
    // 다른 관리자 변경 경로와 같은 Origin 검사, NUL 문자 사유 거절(추가)
    const crossOrigin = await app.inject({ method: 'POST', url: resumeUrl,
      headers: { 'x-test-user': operator, origin: 'https://evil.example' }, payload: { reason } });
    assert.equal(crossOrigin.statusCode, 403);
    assert.equal(crossOrigin.json().error, 'origin_denied');
    assert.equal((await call('POST', resumeUrl, operator, { reason: '저장소 권한\u0000확인 후 다시 실행' })).json().error, 'invalid_text');
    assert.equal((await call('POST', `/v1/admin/organization-deletions/${randomUUID()}/resume`, operator, { reason })).statusCode, 404);
    const resumed = await call('POST', resumeUrl, operator, { reason });
    assert.equal(resumed.statusCode, 200, resumed.body);
    const row = (await pool.query(`select status,last_error,next_attempt_at<=now() as due,steps from ap.organization_deletion_requests where id=$1`, [requestId])).rows[0];
    assert.deepEqual([row.status, row.last_error, row.due, row.steps.executionFailures], ['scheduled', null, true, 0]);
    assert.equal(row.steps.operatorResumes.length, 1);
    assert.deepEqual([row.steps.operatorResumes[0].actorUserId, row.steps.operatorResumes[0].reason, row.steps.operatorResumes[0].previousError,
      row.steps.operatorResumes[0].previousExecutionFailures], [operator, reason, 'execution_failed:PAN01,execution_attempts_stopped', 12]);
    // 조직 구성원 화면에는 운영자 ID·사유를 빼고 시각·직전 오류·실패 횟수만 보인다
    const ownerView = await call('GET', '/v1/organizations/current/deletion-requests/current', owner);
    assert.equal(ownerView.statusCode, 200, ownerView.body);
    const ownerResumes = ownerView.json().request.steps.operatorResumes;
    assert.equal(ownerResumes.length, 1);
    assert.deepEqual(Object.keys(ownerResumes[0]).sort(), ['at', 'previousError', 'previousExecutionFailures']);
    assert.deepEqual([ownerResumes[0].previousError, ownerResumes[0].previousExecutionFailures],
      ['execution_failed:PAN01,execution_attempts_stopped', 12]);
    assert.ok(Number.isFinite(Date.parse(ownerResumes[0].at)));
    assert.ok(!ownerView.body.includes(operator) && !ownerView.body.includes(reason));
    // 관리자 목록은 전체 기록(운영자·사유)을 유지한다(다시 멈춘 요청으로 확인)
    await pool.query("update ap.organization_deletion_requests set next_attempt_at='infinity' where id=$1", [requestId]);
    const adminItem = (await call('GET', '/v1/admin/organization-deletions?status=stopped', auditor)).json().deletions
      .find((entry: { id: string }) => entry.id === requestId);
    assert.deepEqual([adminItem.operatorResumes[0].actorUserId, adminItem.operatorResumes[0].reason], [operator, reason]);
    await pool.query('update ap.organization_deletion_requests set next_attempt_at=clock_timestamp() where id=$1', [requestId]);
    assert.equal((await call('POST', resumeUrl, operator, { reason })).json().error, 'deletion_not_stopped');
    assert.equal((await call('GET', '/v1/admin/organization-deletions?status=stopped', operator)).json().deletions
      .some((entry: { id: string }) => entry.id === requestId), false);
    // 원인이 풀린 뒤 작업자가 실제로 실행한다.
    assert.equal(await runOrganizationDeletionOnce({ pool }), 'executed');
    assert.equal((await pool.query('select status from ap.organization_deletion_requests where id=$1', [requestId])).rows[0].status, 'executed');
  } finally {
    await pool.query("update ap.organization_deletion_requests set status='canceled',canceled_at=now(),canceled_by=$2 where id=$1 and status='scheduled'", [requestId, owner]);
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.AP_PROFILE;
    else process.env.AP_PROFILE = previousProfile;
  }
});
