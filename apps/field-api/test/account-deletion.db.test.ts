import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { runOrganizationDeletionOnce } from '../src/account-deletion.js';
import { MediaPermissionError, type FieldSiteMediaStore } from '../src/site-media.js';

const user = (headers: IncomingHttpHeaders) =>
  typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

test('Field organization deletion unpublishes, cools, cancels, removes site data and keeps work originals; account deletion follows', async () => {
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const files = new Map<string, Buffer>();
  const siteMedia: FieldSiteMediaStore = {
    put: async (key, data) => { files.set(key, data); },
    get: async key => files.get(key) ?? null,
    delete: async key => { files.delete(key); },
  };
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool, resolveUserId: async headers => user(headers), siteMedia });
  const owner = randomUUID(), editor = randomUUID(), operator = randomUUID(), org = randomUUID(), site = randomUUID();
  // 다른 조직에도 속한 구성원: 이 조직 삭제로 다른 조직 작업 세션까지 끊기지 않아야 한다.
  const shared = randomUUID(), otherOrg = randomUUID();
  const catalog = randomUUID(), service = randomUUID(), asset = randomUUID(), inquiry = randomUUID(), reservation = randomUUID();
  const slug = `field-${randomBytes(6).toString('hex')}`, objectKey = `${org}/${asset}.webp`;
  const password = `${randomBytes(12).toString('base64url')}A1!`;
  const inquiryKey = randomBytes(32).toString('base64url'), reservationKey = randomBytes(32).toString('base64url');
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, actor?: string, payload?: object) =>
    app.inject({ method, url, headers: actor ? { 'x-test-user': actor } : {}, payload });
  const confirm = { confirmText: 'Field Deletion Org', acknowledgements: { retention: true, subscriptions: true, connections: true } };
  const snapshot = JSON.stringify({ id: service, name: 'Cleaning' });
  try {
    for (const id of [owner, editor, operator, shared])
      await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,true)', [id, id, `${id}@example.invalid`]);
    await pool.query(`insert into "account"("id","accountId","providerId","userId","password","createdAt","updatedAt")
      values ($1,$2,'credential',$2,$3,now(),now())`, [randomUUID(), owner, await hashPassword(password)]);
    for (const id of [owner, editor, shared])
      await pool.query(`insert into "session"("id","expiresAt","token","createdAt","updatedAt","userId")
        values ($1,now()+interval '1 day',$2,now(),now(),$3)`, [randomUUID(), randomBytes(16).toString('hex'), id]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Field Deletion Org']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner'),($1,$3,'editor'),($1,$4,'editor')", [org, owner, editor, shared]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [otherOrg, shared, 'Field Other Org']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [otherOrg, shared]);
    // owner 알림 연락처(암호문)는 조직 삭제 실행 때 회수와 함께 지운다.
    const ownerRecipient = randomUUID();
    await pool.query(`insert into field.notification_recipients(id,organization_id,target_kind,target_id,audience,actor_user_id,
      recipient_ciphertext,kakao,consent_version) values ($1,$2,'owner',$3,'owner',$3,'synthetic-ciphertext',true,'notification-v1')`,
    [ownerRecipient, org, owner]);
    const catalogContent = JSON.stringify({ businessName: 'Field Deletion Org', industry: 'cleaning', introduction: 'Private intro',
      region: 'Seoul', openingHours: '9-6', contactPhone: '010-1111-2222', defaultBookingMode: 'request',
      services: [{ id: service, name: 'Cleaning' }], faqs: [] });
    await pool.query('insert into field.catalog_drafts(organization_id,content,updated_by) values ($1,$2::jsonb,$3)', [org, catalogContent, owner]);
    await pool.query(`insert into field.catalog_releases(id,organization_id,revision,content,content_hash,approved_by)
      values ($1,$2,1,$3::jsonb,'synthetic',$4)`, [catalog, org, catalogContent, owner]);
    await pool.query('insert into field.sites(id,organization_id,slug) values ($1,$2,$3)', [site, org, slug]);
    const siteContent = JSON.stringify({ template: 'essential', palette: '#ffffff', pages: [] });
    await pool.query('insert into field.site_drafts(site_id,content,updated_by) values ($1,$2::jsonb,$3)', [site, siteContent, owner]);
    const release = randomUUID();
    await pool.query(`insert into field.site_releases(id,site_id,revision,content,content_hash,catalog_release_id,catalog_revision,published_by)
      values ($1,$2,1,$3::jsonb,'synthetic',$4,1,$5)`, [release, site, siteContent, catalog, owner]);
    await siteMedia.put(objectKey, Buffer.from('synthetic-image'));
    await pool.query(`insert into field.site_assets(id,organization_id,object_key,content_type,byte_size,width,height,sha256,uploaded_by)
      values ($1,$2,$3,'image/webp',15,10,10,$4,$5)`, [asset, org, objectKey, hash('synthetic-image'), owner]);
    await pool.query('insert into field.site_release_assets(release_id,asset_id) values ($1,$2)', [release, asset]);
    await pool.query(`insert into field.inquiries(id,organization_id,catalog_revision,service_id,service_snapshot,customer_name,customer_phone,
      visitor_key_hash,state,consent_at) values ($1,$2,1,$3,$4::jsonb,'Customer','010-4567-7893',$5,'needs_owner',now())`,
    [inquiry, org, service, snapshot, hash(inquiryKey)]);
    await pool.query(`insert into field.inquiry_messages(id,inquiry_id,sender,body,delivery_state)
      values ($1,$2,'customer','Original question','pending')`, [randomUUID(), inquiry]);
    await pool.query(`insert into field.reservations(id,organization_id,catalog_revision,service_id,service_snapshot,booking_mode,customer_name,
      customer_phone,visitor_key_hash,timezone,state,consent_at,preferred_time_text,request_message,visit_region)
      values ($1,$2,1,$3,$4::jsonb,'request','Customer','010-4567-7891',$5,'Asia/Seoul','requested',now(),'Morning','Please','Seoul')`,
    [reservation, org, service, snapshot, hash(reservationKey)]);
    assert.equal((await call('GET', `/v1/public/sites/${slug}`)).statusCode, 200);

    // 계정 삭제는 조직 owner에게 거절된다.
    const refused = await call('POST', '/v1/account/deletion-requests', owner,
      { password, confirmText: `${owner}@example.invalid`, acknowledgement: true });
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.json().error, 'organization_deletion_required');

    // 전제 조건: 진행 중 예약과 해지되지 않은 유료 구독은 예약을 막는다.
    const plan = randomUUID(), subscription = randomUUID();
    await pool.query(`insert into field.billing_plans(id,mode,name,total_amount,supply_amount,vat_amount,included_ai_units,grace_days,
      terms_version,terms_text,refund_version,refund_text,reference,requested_by,approved_by,approved_at)
      values ($1,'test','Synthetic',11000,10000,1000,10,3,'terms','Synthetic','refund','Synthetic','SYNTHETIC',$2,$3,now())`, [plan, operator, editor]);
    await pool.query(`insert into field.paid_subscriptions(id,organization_id,plan_id,customer_key,state,created_by)
      values ($1,$2,$3,$4,'awaiting_authorization',$5)`, [subscription, org, plan, randomUUID(), owner]);
    assert.equal((await call('POST', '/v1/organizations/current/deletion-requests', editor, confirm)).statusCode, 403);
    const blocked = await call('POST', '/v1/organizations/current/deletion-requests', owner, confirm);
    assert.equal(blocked.statusCode, 409);
    assert.deepEqual(blocked.json().preconditions.filter((item: { ok: boolean }) => !item.ok).map((item: { code: string }) => item.code),
      ['paid_subscription_active', 'open_reservations']);
    await pool.query("update field.paid_subscriptions set state='canceled',terminated_at=now() where id=$1", [subscription]);
    await pool.query("update field.reservations set state='canceled',revision=1 where id=$1", [reservation]);
    assert.equal((await call('POST', '/v1/organizations/current/deletion-requests', owner, { ...confirm, confirmText: 'wrong' })).json().error, 'confirmation_mismatch');

    // 예약: 공개 사이트·사진 즉시 비공개, 새 업무 차단, 고객 확인키 열람 유지. 취소하면 다시 공개된다.
    const scheduled = await call('POST', '/v1/organizations/current/deletion-requests', owner, confirm);
    assert.equal(scheduled.statusCode, 201, scheduled.body);
    assert.equal((await call('GET', `/v1/public/sites/${slug}`)).statusCode, 404);
    assert.equal((await call('GET', `/v1/public/site-assets/${asset}`)).statusCode, 404);
    const access = (await call('GET', '/v1/subscription', owner)).json().access;
    assert.deepEqual([access.canStartNew, access.reason], [false, 'deletion_scheduled']);
    assert.equal((await app.inject({ url: `/v1/inquiries/${inquiry}`, headers: { authorization: `Bearer ${inquiryKey}` } })).statusCode, 200);
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'empty');
    assert.equal((await call('DELETE', '/v1/organizations/current/deletion-requests/current', owner)).json().request.status, 'canceled');
    assert.equal((await call('GET', `/v1/public/sites/${slug}`)).statusCode, 200);
    const again = await call('POST', '/v1/organizations/current/deletion-requests', owner, confirm);
    assert.equal(again.statusCode, 201);
    const requestId = again.json().request.id as string;
    await pool.query(`update field.organization_deletion_requests set requested_at=now()-interval '15 days',
      scheduled_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute' where id=$1`, [requestId]);

    // 사진 저장소가 없으면 아무것도 지우지 않고 blocked_integration으로 남는다.
    assert.equal(await runOrganizationDeletionOnce({ pool }), 'blocked');
    assert.equal((await pool.query('select last_error from field.organization_deletion_requests where id=$1', [requestId])).rows[0].last_error, 'blocked_integration');
    assert.equal((await pool.query('select count(*)::int as n from field.site_releases where site_id=$1', [site])).rows[0].n, 1);
    await pool.query("update field.organization_deletion_requests set next_attempt_at=now()-interval '1 minute' where id=$1", [requestId]);

    // 실행: 사이트 초안·공개본·사진 삭제, 사업 정보 비움, 구성원·세션 제거. 문의·예약 원본과 청구 원장은 보존.
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'executed');
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'empty');
    const steps = (await pool.query('select status,steps from field.organization_deletion_requests where id=$1', [requestId])).rows[0];
    assert.equal(steps.status, 'executed');
    assert.equal(steps.steps.executed.siteAssetsDeleted, 1);
    assert.equal(files.size, 0);
    for (const table of ['site_releases', 'site_drafts'])
      assert.equal((await pool.query(`select count(*)::int as n from field.${table} where site_id=$1`, [site])).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int as n from field.site_assets where organization_id=$1', [org])).rows[0].n, 0);
    const cleared = (await pool.query('select content from field.catalog_releases where id=$1', [catalog])).rows[0].content;
    assert.deepEqual([cleared.businessName, cleared.contactPhone, cleared.introduction, cleared.services], ['Field Deletion Org', '', '', []]);
    assert.equal((await pool.query('select count(*)::int as n from field.memberships where organization_id=$1', [org])).rows[0].n, 0);
    assert.equal((await pool.query(`select count(*)::int as n from "session" where "userId"=any($1::text[]) and "expiresAt">now()`, [[owner, editor]])).rows[0].n, 0);
    assert.equal((await pool.query(`select count(*)::int as n from "session" where "userId"=$1 and "expiresAt">now()`, [shared])).rows[0].n, 1);
    assert.equal((await pool.query('select count(*)::int as n from field.memberships where user_id=$1', [shared])).rows[0].n, 1);
    const recipient = (await pool.query('select recipient_ciphertext,revoked_at,retention_purged_at from field.notification_recipients where id=$1', [ownerRecipient])).rows[0];
    assert.equal(recipient.recipient_ciphertext, null);
    assert.ok(recipient.revoked_at && recipient.retention_purged_at);
    assert.equal((await pool.query("select body from field.inquiry_messages where inquiry_id=$1", [inquiry])).rows[0].body, 'Original question');
    const customerReservation = await app.inject({ url: `/v1/reservations/${reservation}`, headers: { authorization: `Bearer ${reservationKey}` } });
    assert.equal(customerReservation.statusCode, 200);
    assert.equal(customerReservation.json().businessName, 'Field Deletion Org');
    assert.equal((await pool.query('select count(*)::int as n from field.paid_subscriptions where organization_id=$1', [org])).rows[0].n, 1);
    assert.equal((await call('GET', `/v1/public/sites/${slug}`)).statusCode, 404);

    // 조직 삭제 뒤 계정 삭제: 비밀번호 재입력 후 사용자 행을 익명 tombstone으로 남긴다.
    assert.equal((await call('POST', '/v1/account/deletion-requests', owner,
      { password: 'wrong-password', confirmText: `${owner}@example.invalid`, acknowledgement: true })).json().error, 'invalid_password');
    const deleted = await call('POST', '/v1/account/deletion-requests', owner,
      { password, confirmText: `${owner}@example.invalid`, acknowledgement: true });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.match((await pool.query('select email from "user" where id=$1', [owner])).rows[0].email, /@deleted\.invalid$/);
    assert.equal((await pool.query('select count(*)::int as n from "account" where "userId"=$1', [owner])).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int as n from field.account_deletion_audit where user_id=$1', [owner])).rows[0].n, 1);
    // 비밀번호가 없어진 계정은 최근 로그인 세션이 없으면 재인증 필요로 표시된다.
    assert.equal((await call('GET', '/v1/account/deletion-eligibility', owner)).json().blockers.includes('reauth_required'), true);
  } finally {
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
  }
});

// 카카오 전용 계정(비밀번호 없음)은 5분 이내 새 로그인 세션으로 재인증하고, 비밀번호 계정은 15분 5회로 제한한다.
test('Field account deletion: Kakao-only reauth window, password attempt limit and outbox anonymization', async () => {
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool, resolveUserId: async headers => user(headers),
    resolveSession: async headers => {
      const id = headers['x-test-session'], actor = user(headers);
      return typeof id === 'string' && actor ? { id, userId: actor } : null;
    } });
  const kakao = randomUUID(), withPassword = randomUUID(), oldSession = randomUUID(), freshSession = randomUUID();
  const password = `${randomBytes(12).toString('base64url')}A1!`;
  const call = (method: 'GET' | 'POST', url: string, actor: string, session?: string, payload?: object) =>
    app.inject({ method, url, headers: { 'x-test-user': actor, ...(session ? { 'x-test-session': session } : {}) }, payload });
  try {
    for (const id of [kakao, withPassword])
      await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,true)', [id, id, `${id}@example.invalid`]);
    await pool.query(`insert into "account"("id","accountId","providerId","userId","createdAt","updatedAt")
      values ($1,'kakao-synthetic','kakao',$2,now(),now())`, [randomUUID(), kakao]);
    await pool.query(`insert into "account"("id","accountId","providerId","userId","password","createdAt","updatedAt")
      values ($1,$2,'credential',$2,$3,now(),now())`, [randomUUID(), withPassword, await hashPassword(password)]);
    await pool.query(`insert into "session"("id","expiresAt","token","createdAt","updatedAt","userId") values
      ($1,now()+interval '1 day',$2,now()-interval '10 minutes',now(),$4),($3,now()+interval '1 day',$5,now(),now(),$4)`,
    [oldSession, randomBytes(16).toString('hex'), freshSession, kakao, randomBytes(16).toString('hex')]);
    const kakaoEmail = `${kakao}@example.invalid`;
    await pool.query(`insert into field.email_outbox("to",subject,text,html,purpose,state,sent_at) values
      ($1,'인증','주소 확인: ' || $1,'<p>' || $1 || '</p>','verify_email','sent',now()),($2,'인증','다른 사람','<p>x</p>','verify_email','sent',now())`,
    [kakaoEmail.toUpperCase(), `${withPassword}@example.invalid`]);

    const stale = (await call('GET', '/v1/account/deletion-eligibility', kakao, oldSession)).json();
    assert.deepEqual([stale.eligible, stale.blockers, stale.reauthentication], [false, ['reauth_required'], 'recent_sign_in']);
    const refused = await call('POST', '/v1/account/deletion-requests', kakao, oldSession, { confirmText: kakaoEmail, acknowledgement: true });
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.json().error, 'reauth_required');
    const fresh = (await call('GET', '/v1/account/deletion-eligibility', kakao, freshSession)).json();
    assert.deepEqual([fresh.eligible, fresh.reauthentication, fresh.recentSignInMinutes], [true, 'recent_sign_in', 5]);
    const deleted = await call('POST', '/v1/account/deletion-requests', kakao, freshSession, { confirmText: kakaoEmail, acknowledgement: true });
    assert.equal(deleted.statusCode, 200, deleted.body);
    const anonymized = (await pool.query<{ email: string }>('select email from "user" where id=$1', [kakao])).rows[0]!.email;
    assert.match(anonymized, /@deleted\.invalid$/);
    const outbox = await pool.query<{ to: string; text: string; html: string }>(
      'select "to",text,html from field.email_outbox where "to"=$1 or lower("to")=lower($2)', [anonymized, kakaoEmail]);
    assert.deepEqual(outbox.rows, [{ to: anonymized, text: '[삭제됨]', html: '[삭제됨]' }]);
    assert.equal((await pool.query('select count(*)::int as n from field.email_outbox where "to"=$1', [`${withPassword}@example.invalid`])).rows[0].n, 1);

    // 비밀번호 계정: 15분 창에 5회까지 판정하고, 그 뒤에는 맞는 비밀번호도 429로 거절한다(실패 시도는 별도 commit).
    const attempt = (value: string) => call('POST', '/v1/account/deletion-requests', withPassword, undefined,
      { password: value, confirmText: `${withPassword}@example.invalid`, acknowledgement: true });
    assert.equal((await call('GET', '/v1/account/deletion-eligibility', withPassword)).json().reauthentication, 'password');
    for (let index = 0; index < 5; index += 1) assert.equal((await attempt('wrong-password')).json().error, 'invalid_password');
    const limited = await attempt(password);
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error, 'password_attempts_exceeded');
    assert.ok(Number(limited.headers['retry-after']) >= 1);
    assert.equal((await pool.query('select count(*)::int as n from "account" where "userId"=$1', [withPassword])).rows[0].n, 1);
    await pool.query("update field.account_deletion_password_windows set window_started_at=now()-interval '16 minutes' where user_id=$1", [withPassword]);
    assert.equal((await attempt(password)).statusCode, 200);
    assert.equal((await pool.query('select count(*)::int as n from field.account_deletion_password_windows where user_id=$1', [withPassword])).rows[0].n, 0);
  } finally {
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
  }
});

// 사진 저장소 권한 부족(HeadObject 403)은 재시도로 풀리지 않으므로 무한 재시도 대신 즉시 멈추고 사유를 남긴다.
test('Field organization deletion stops on media permission errors and caps other execution failures', async () => {
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const owner = randomUUID(), org = randomUUID(), asset = randomUUID(), requestId = randomUUID();
  const objectKey = `${org}/${asset}.webp`;
  let failure: 'permission' | 'other' = 'permission';
  const siteMedia: FieldSiteMediaStore = {
    put: async () => undefined, get: async () => null, delete: async () => undefined,
    exists: async () => { if (failure === 'permission') throw new MediaPermissionError(); throw new Error('transient'); },
  };
  try {
    await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [owner, `${owner}@example.invalid`]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Field Media Org']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
    await pool.query(`insert into field.site_assets(id,organization_id,object_key,content_type,byte_size,width,height,sha256,uploaded_by)
      values ($1,$2,$3,'image/webp',15,10,10,$4,$5)`, [asset, org, objectKey, hash('x'), owner]);
    await pool.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values ($1,$2,$3,'{}'::jsonb,'scheduled',now()-interval '15 days',now()-interval '1 minute',now()-interval '1 minute')`, [requestId, org, owner]);
    const state = async () => (await pool.query<{ status: string; last_error: string; stopped: boolean }>(
      `select status,last_error,next_attempt_at='infinity'::timestamptz as stopped from field.organization_deletion_requests where id=$1`,
      [requestId])).rows[0]!;
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'blocked');
    assert.deepEqual(await state(), { status: 'scheduled', last_error: 'media_permission,execution_attempts_stopped', stopped: true });
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'empty');
    assert.equal((await pool.query('select count(*)::int as n from field.site_assets where id=$1', [asset])).rows[0].n, 1);
    // 그 밖의 실패는 5분 뒤 재시도하고, 실행 실패 12회째에 멈춘다.
    failure = 'other';
    await pool.query("update field.organization_deletion_requests set next_attempt_at=now()-interval '1 minute',steps='{}'::jsonb where id=$1", [requestId]);
    for (let index = 1; index < 12; index += 1) {
      assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'retry', String(index));
      assert.deepEqual(await state(), { status: 'scheduled', last_error: 'execution_failed', stopped: false });
      await pool.query("update field.organization_deletion_requests set next_attempt_at=now()-interval '1 minute' where id=$1", [requestId]);
    }
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'blocked');
    assert.deepEqual(await state(), { status: 'scheduled', last_error: 'execution_failed,execution_attempts_stopped', stopped: true });
  } finally {
    await pool.query('delete from field.organization_deletion_requests where id=$1', [requestId]);
    await pool.end();
  }
});
