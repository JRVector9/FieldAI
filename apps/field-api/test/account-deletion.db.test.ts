import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { runOrganizationDeletionOnce } from '../src/account-deletion.js';
import { MediaPermissionError, runSiteAssetDeletionOnce, type FieldSiteMediaStore } from '../src/site-media.js';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

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
  // 조직 삭제 예약도 owner 비밀번호 재입력을 요구한다(L8).
  const confirm = { confirmText: 'Field Deletion Org', acknowledgements: { retention: true, subscriptions: true, connections: true }, password };
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
    // 삭제 요청 중(state='deleting', 추가)인 사진도 조직 삭제가 2단계 삭제 경로로 다시 넘겨 지운다(M3).
    // 작업자가 멈춘 행('infinity')도 처음 넘길 때 다시 시작하므로 남지 않는다.
    const deletingAsset = randomUUID(), deletingKey = `${org}/${deletingAsset}.webp`;
    await siteMedia.put(deletingKey, Buffer.from('deleting-image'));
    await pool.query(`insert into field.site_assets(id,organization_id,object_key,content_type,byte_size,width,height,sha256,uploaded_by,
      state,deletion_requested_at,deletion_next_attempt_at,deletion_error)
      values ($1,$2,$3,'image/webp',14,10,10,$4,$5,'deleting',now(),'infinity','media_permission')`,
    [deletingAsset, org, deletingKey, hash('deleting-image'), owner]);
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
    assert.equal((await call('GET', `/v1/public/catalog/${org}`)).statusCode, 200);
    // owner 발송 기록(M3 후속): 미시작 건·종료 건은 암호문을 지우고, 결과 미상 건은 공급사 대조를 위해 남긴다.
    const [ownerEvent, ownerEvent2] = [randomUUID(), randomUUID()];
    for (const id of [ownerEvent, ownerEvent2]) {
      const outbox = randomUUID();
      await pool.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload) values ($1,$2,'field.synthetic.owner_test',$3,'{}'::jsonb)`,
        [outbox, org, inquiry]);
      await pool.query(`insert into field.notification_events(id,organization_id,outbox_id,target_id,audience,channel,state)
        values ($1,$2,$3,$4,'owner','in_app','available')`, [id, org, outbox, inquiry]);
    }
    const [deliveryPending, deliverySent, deliveryUnknown] = [randomUUID(), randomUUID(), randomUUID()];
    await pool.query(`insert into field.notification_deliveries(id,organization_id,notification_id,recipient_id,channel,state,recipient_ciphertext)
      values ($1,$2,$3,$4,'kakao','pending','synthetic-delivery-pending')`, [deliveryPending, org, ownerEvent, ownerRecipient]);
    await pool.query(`insert into field.notification_deliveries(id,organization_id,notification_id,recipient_id,channel,state,recipient_ciphertext,
      provider,account_id,key_fingerprint,started_at,reserved,reserved_day) values
      ($1,$2,$3,$4,'web_push','sent','synthetic-delivery-sent','synthetic','synthetic-account',$6,now(),true,current_date),
      ($5,$2,$7,$4,'kakao','unknown','synthetic-delivery-unknown','synthetic','synthetic-account',$6,now(),true,current_date)`,
    [deliverySent, org, ownerEvent, ownerRecipient, deliveryUnknown, 'a'.repeat(64), ownerEvent2]);

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
    // A-08 / QA47, QA79: 삭제 유예 조직의 승인 카탈로그도 공개 조회로 노출하지 않는다.
    const hiddenCatalog = await call('GET', `/v1/public/catalog/${org}`);
    assert.deepEqual([hiddenCatalog.statusCode, hiddenCatalog.json()], [404, { error: 'not_found' }]);
    assert.equal((await call('GET', `/v1/public/sites/${slug}`)).statusCode, 404);
    assert.equal((await call('GET', `/v1/public/site-assets/${asset}`)).statusCode, 404);
    const access = (await call('GET', '/v1/subscription', owner)).json().access;
    assert.deepEqual([access.canStartNew, access.reason], [false, 'deletion_scheduled']);
    assert.equal((await app.inject({ url: `/v1/inquiries/${inquiry}`, headers: { authorization: `Bearer ${inquiryKey}` } })).statusCode, 200);
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'empty');
    assert.equal((await call('DELETE', '/v1/organizations/current/deletion-requests/current', owner)).json().request.status, 'canceled');
    assert.equal((await call('GET', `/v1/public/catalog/${org}`)).statusCode, 200);
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

    // M3: 실행기는 잠금을 잡은 채 저장소 I/O를 하지 않는다. 첫 주기는 공개본·초안을 지우고 남은 사진을 2단계 삭제 경로로
    // 넘긴 뒤 'blocked'(assets_pending, 실패로 세지 않음)로 5분 뒤를 기다린다. 이때부터 owner 취소는 막힌다.
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'blocked');
    const pending = (await pool.query(`select last_error,steps,next_attempt_at>now() as later from field.organization_deletion_requests where id=$1`,
      [requestId])).rows[0];
    assert.deepEqual([pending.last_error, pending.later, pending.steps.executionStarted.siteAssetsQueued, pending.steps.executionFailures],
      ['assets_pending', true, 2, undefined]);
    assert.equal((await pool.query("select count(*)::int as n from field.site_assets where organization_id=$1 and state='deleting' and deletion_next_attempt_at<=now()", [org])).rows[0].n, 2);
    const inProgress = await call('DELETE', '/v1/organizations/current/deletion-requests/current', owner);
    assert.deepEqual([inProgress.statusCode, inProgress.json().error], [409, 'deletion_in_progress']);
    // 사진 작업자가 잠금 밖에서 저장소 삭제·부재 확인·행 삭제를 한다.
    assert.deepEqual(await runSiteAssetDeletionOnce({ pool, siteMedia }), { deleted: 2, retried: 0, stopped: 0, blocked: 0 });
    await pool.query("update field.organization_deletion_requests set next_attempt_at=now()-interval '1 minute' where id=$1", [requestId]);
    // 실행: 사이트 초안·공개본·사진 삭제, 사업 정보 비움, 구성원·세션 제거. 문의·예약 원본과 청구 원장은 보존.
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'executed');
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'empty');
    const steps = (await pool.query('select status,steps from field.organization_deletion_requests where id=$1', [requestId])).rows[0];
    assert.equal(steps.status, 'executed');
    assert.equal((await call('GET', `/v1/public/catalog/${org}`)).statusCode, 404);
    assert.equal(steps.steps.executed.siteAssetsDeleted, 2);
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
    assert.equal(steps.steps.executed.ownerDeliveriesPurged, 2);
    const deliveries = new Map((await pool.query<{ id: string; state: string; error_code: string | null; recipient_ciphertext: string | null;
      purged: boolean }>(`select id,state,error_code,recipient_ciphertext,retention_purged_at is not null as purged
      from field.notification_deliveries where id=any($1::uuid[])`, [[deliveryPending, deliverySent, deliveryUnknown]])).rows.map(row => [row.id, row]));
    assert.deepEqual(deliveries.get(deliveryPending), { id: deliveryPending, state: 'suppressed', error_code: 'organization_deleted', recipient_ciphertext: null, purged: true });
    assert.deepEqual(deliveries.get(deliverySent), { id: deliverySent, state: 'sent', error_code: null, recipient_ciphertext: null, purged: true });
    assert.deepEqual(deliveries.get(deliveryUnknown), { id: deliveryUnknown, state: 'unknown', error_code: null,
      recipient_ciphertext: 'synthetic-delivery-unknown', purged: false });
    assert.equal((await pool.query("select body from field.inquiry_messages where inquiry_id=$1", [inquiry])).rows[0].body, 'Original question');
    const customerReservation = await app.inject({ url: `/v1/reservations/${reservation}`, headers: { authorization: `Bearer ${reservationKey}` } });
    assert.equal(customerReservation.statusCode, 200);
    assert.equal(customerReservation.json().businessName, 'Field Deletion Org');
    assert.equal((await pool.query('select count(*)::int as n from field.paid_subscriptions where organization_id=$1', [org])).rows[0].n, 1);
    assert.equal((await call('GET', `/v1/public/sites/${slug}`)).statusCode, 404);

    // 조직 삭제 예약 재인증과 계정 삭제가 같은 15분 시도 창을 쓰므로, 창이 지난 상태를 만든다.
    await pool.query("update field.account_deletion_password_windows set window_started_at=now()-interval '16 minutes' where user_id=$1", [owner]);
    // 조직 삭제 뒤 계정 삭제: 비밀번호 재입력 후 사용자 행을 익명 tombstone으로 남긴다.
    assert.equal((await call('POST', '/v1/account/deletion-requests', owner,
      { password: 'wrong-password', confirmText: `${owner}@example.invalid`, acknowledgement: true })).json().error, 'invalid_password');
    const deleted = await call('POST', '/v1/account/deletion-requests', owner,
      { password, confirmText: `${owner}@example.invalid`, acknowledgement: true });
    assert.equal(deleted.statusCode, 200, deleted.body);
    const signedDeletions=await readdir(resolve(process.env.FIELD_RETENTION_JOURNAL_DIRECTORY!,'account-deletion')).catch(()=>[]);
    assert.ok(signedDeletions.some(name=>name.endsWith('.json')),'approved identity/site deletion needs independent signed restore proof');
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
    // L2: 재인증 부족은 조직 삭제와 같은 403 reauth_required다.
    assert.equal(refused.statusCode, 403);
    assert.deepEqual(refused.json(), { error: 'reauth_required', recentSignInMinutes: 5, blockers: ['reauth_required'] });
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

// M3: 실행기는 저장소 I/O를 하지 않는다. 사진 저장소 권한 부족(HeadObject 403)은 2단계 사진 삭제가 멈추고(운영자 재개 대상),
// 조직 삭제는 실패로 세지 않고 asset_deletion_stopped로 기다린다. DB 실행 실패만 상한(12회)까지 재시도한 뒤 멈춘다.
// (이전에는 실행기 안의 저장소 호출 실패로 상한을 시험했으나, 저장소 호출이 사진 작업자로 옮겨져 DB 실패로 시험한다.)
test('Field organization deletion waits on stopped photo deletions without counting failures and caps execution failures', async () => {
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const owner = randomUUID(), org = randomUUID(), asset = randomUUID(), requestId = randomUUID();
  const objectKey = `${org}/${asset}.webp`;
  const trigger = `field_test_fail_${org.replaceAll('-', '')}`;
  const siteMedia: FieldSiteMediaStore = {
    put: async () => undefined, get: async () => null, delete: async () => undefined,
    exists: async () => { throw new MediaPermissionError(); },
  };
  try {
    await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [owner, `${owner}@example.invalid`]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Field Media Org']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
    await pool.query(`insert into field.site_assets(id,organization_id,object_key,content_type,byte_size,width,height,sha256,uploaded_by)
      values ($1,$2,$3,'image/webp',15,10,10,$4,$5)`, [asset, org, objectKey, hash('x'), owner]);
    await pool.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values ($1,$2,$3,'{}'::jsonb,'scheduled',now()-interval '15 days',now()-interval '1 minute',now()-interval '1 minute')`, [requestId, org, owner]);
    const state = async () => (await pool.query<{ status: string; last_error: string; stopped: boolean; failures: number | null }>(
      `select status,last_error,next_attempt_at='infinity'::timestamptz as stopped,(steps->>'executionFailures')::int as failures
       from field.organization_deletion_requests where id=$1`, [requestId])).rows[0]!;
    const due = () => pool.query("update field.organization_deletion_requests set next_attempt_at=now()-interval '1 minute' where id=$1", [requestId]);
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'blocked');
    assert.deepEqual(await state(), { status: 'scheduled', last_error: 'assets_pending', stopped: false, failures: null });
    // 사진 작업자: 권한 부족은 즉시 멈추고 멈춘 시각을 남긴다.
    assert.deepEqual(await runSiteAssetDeletionOnce({ pool, siteMedia }), { deleted: 0, retried: 0, stopped: 1, blocked: 0 });
    const photo = (await pool.query(`select deletion_error,deletion_next_attempt_at='infinity'::timestamptz as stopped,deletion_stopped_at is not null as stamped
      from field.site_assets where id=$1`, [asset])).rows[0];
    assert.deepEqual(photo, { deletion_error: 'media_permission', stopped: true, stamped: true });
    await due();
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'blocked');
    assert.deepEqual(await state(), { status: 'scheduled', last_error: 'asset_deletion_stopped', stopped: false, failures: null });
    // 두 번째 주기부터는 멈춘 사진을 다시 시작하지 않는다(운영자 재개 대상).
    assert.equal((await pool.query("select count(*)::int as n from field.site_assets where id=$1 and deletion_next_attempt_at='infinity'", [asset])).rows[0].n, 1);

    // 사진이 없어진 뒤 DB 실행 실패: 5분 뒤 재시도하고, 실행 실패 12회째에 멈춘다.
    await pool.query('delete from field.site_assets where id=$1', [asset]);
    await pool.query(`create function field.${trigger}() returns trigger language plpgsql as $$
      begin raise exception 'synthetic execution failure'; end $$`);
    await pool.query(`create trigger ${trigger} before update of deleted_at on field.organizations for each row
      when (new.id = '${org}'::uuid) execute function field.${trigger}()`);
    await pool.query("update field.organization_deletion_requests set steps=steps-'executionFailures' where id=$1", [requestId]);
    for (let index = 1; index < 12; index += 1) {
      await due();
      assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'retry', String(index));
      assert.deepEqual(await state(), { status: 'scheduled', last_error: 'execution_failed', stopped: false, failures: index });
    }
    await due();
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'blocked');
    assert.deepEqual(await state(), { status: 'scheduled', last_error: 'execution_failed,execution_attempts_stopped', stopped: true, failures: 12 });
  } finally {
    await pool.query(`drop trigger if exists ${trigger} on field.organizations`);
    await pool.query(`drop function if exists field.${trigger}()`);
    // The signed organization decision is irreversible once execution starts.
    // Finish that synthetic decision after removing the injected failure so the
    // next scenario does not inherit a deliberately pending recovery proof.
    await pool.query('update field.organization_deletion_requests set next_attempt_at=now() where id=$1',[requestId]);
    await runOrganizationDeletionOnce({pool,siteMedia});
    await pool.query('delete from field.organization_deletion_requests where id=$1', [requestId]);
    await pool.end();
  }
});

// L8·여러 조직 owner(추가): 조직 삭제 예약은 계정 삭제와 같은 재인증을 요구하고, x-organization-id로 고른 조직만 예약·취소한다.
test('Field organization deletion scheduling re-authenticates and targets the x-organization-id owner organization', async () => {
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool, resolveUserId: async headers => user(headers),
    resolveSession: async headers => {
      const id = headers['x-test-session'], actor = user(headers);
      return typeof id === 'string' && actor ? { id, userId: actor } : null;
    } });
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
    await pool.query(`insert into field.organizations(id,owner_user_id,name,created_at) values
      ($1,$2,'First Org',now()-interval '2 minutes'),($3,$4,'Second Org',now()-interval '1 minute'),($5,$6,'Third Org',now()),($7,$8,'Kakao Org',now())`,
    [orgA, owner, orgB, holderB, orgC, holderC, orgK, kakao]);
    await pool.query(`insert into field.memberships(organization_id,user_id,role,created_at) values
      ($1,$2,'owner',now()-interval '2 minutes'),($3,$2,'owner',now()-interval '1 minute'),($3,$4,'owner',now()),
      ($5,$2,'editor',now()),($5,$6,'owner',now()),($7,$8,'owner',now())`,
    [orgA, owner, orgB, holderB, orgC, holderC, orgK, kakao]);

    const listed = (await call('GET', '/v1/account/deletion-eligibility', owner)).json().organizations;
    assert.deepEqual(listed.map((item: { id: string; deletionStatus: string; deleted: boolean }) => [item.id, item.deletionStatus, item.deleted]),
      [[orgA, 'none', false], [orgB, 'none', false]]);

    // 재인증: 비밀번호 누락·오류는 예약하지 않는다.
    assert.equal((await scheduleB({})).json().error, 'password_required');
    // 자유 입력의 NUL은 PG 오류(500) 대신 400 invalid_text다(Security #1).
    assert.deepEqual((await scheduleB({ password, reason: 'bad\u0000reason' })).json(), { error: 'invalid_text' });
    const wrong = await scheduleB({ password: 'wrong-password' });
    assert.equal(wrong.statusCode, 403);
    assert.equal(wrong.json().error, 'invalid_password');
    assert.equal((await pool.query('select count(*)::int as n from field.organization_deletion_requests where organization_id=$1', [orgB])).rows[0].n, 0);
    const scheduled = await scheduleB({ password });
    assert.equal(scheduled.statusCode, 201, scheduled.body);
    assert.equal((await pool.query('select organization_id from field.organization_deletion_requests where id=$1',
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
    assert.deepEqual(stale.json(), { error: 'reauth_required', recentSignInMinutes: 5 });
    const fresh = await call('POST', '/v1/organizations/current/deletion-requests', kakao, { 'x-test-session': freshSession }, kakaoBody);
    assert.equal(fresh.statusCode, 201, fresh.body);
  } finally {
    await pool.query(`update field.organization_deletion_requests set status='canceled',canceled_at=now(),canceled_by=requested_by
      where organization_id=any($1::uuid[]) and status='scheduled'`, [[orgA, orgB, orgC, orgK]]);
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
  }
});

// M4 후속(추가): 저장소 권한 부족으로 멈춘 삭제 요청은 운영자(operator)만 사유와 함께 다시 실행하고, 그 기록을 요청 행에 남긴다.
test('Field stopped organization deletions are listed for admins and resumed only by operators with an audit entry', async () => {
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  let permissionDenied = true;
  const files = new Map<string, Buffer>();
  const siteMedia: FieldSiteMediaStore = {
    put: async (key, data) => { files.set(key, data); }, get: async key => files.get(key) ?? null,
    delete: async key => { files.delete(key); },
    exists: async key => { if (permissionDenied) throw new MediaPermissionError(); return files.has(key); },
  };
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool, resolveUserId: async headers => user(headers), siteMedia });
  const owner = randomUUID(), operator = randomUUID(), auditor = randomUUID(), org = randomUUID(), asset = randomUUID(), requestId = randomUUID();
  const objectKey = `${org}/${asset}.webp`;
  const call = (method: 'GET' | 'POST', url: string, actor: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { 'x-test-user': actor, ...headers }, payload });
  const resumeUrl = `/v1/admin/organization-deletions/${requestId}/resume`;
  const reason = '저장소 권한을 확인해 다시 실행합니다';
  try {
    for (const id of [owner, operator, auditor])
      await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [id, `${id}@example.invalid`]);
    await pool.query("insert into field.platform_admin_memberships(user_id,role) values ($1,'operator'),($2,'auditor')", [operator, auditor]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Field Stopped Org']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
    await siteMedia.put(objectKey, Buffer.from('x'));
    await pool.query(`insert into field.site_assets(id,organization_id,object_key,content_type,byte_size,width,height,sha256,uploaded_by)
      values ($1,$2,$3,'image/webp',1,10,10,$4,$5)`, [asset, org, objectKey, hash('x'), owner]);
    await pool.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values ($1,$2,$3,'{}'::jsonb,'scheduled',now()-interval '15 days',now()-interval '1 minute',now()-interval '1 minute')`, [requestId, org, owner]);
    // M3 이후 실행기는 저장소를 호출하지 않으므로, 실행 실패 상한(12회)에 걸려 멈춘 요청을 직접 만든다.
    await pool.query(`update field.organization_deletion_requests set next_attempt_at='infinity',
      last_error='execution_failed,execution_attempts_stopped',steps=jsonb_build_object('executionFailures',12) where id=$1`, [requestId]);

    // 목록: 관리자(감사자 포함)만, status=stopped만 받는다.
    assert.equal((await call('GET', '/v1/admin/organization-deletions?status=stopped', owner)).statusCode, 403);
    assert.equal((await call('GET', '/v1/admin/organization-deletions', auditor)).statusCode, 400);
    const listed = await call('GET', '/v1/admin/organization-deletions?status=stopped', auditor);
    assert.equal(listed.statusCode, 200, listed.body);
    const item = listed.json().deletions.find((row: { id: string }) => row.id === requestId);
    assert.deepEqual([item.organizationId, item.executionFailures, item.lastError], [org, 12, 'execution_failed,execution_attempts_stopped']);

    // 다시 실행: 감사자·사유 누락은 거절, operator는 사유와 함께 실행 시각·오류·실패 횟수를 되돌린다.
    assert.equal((await call('POST', resumeUrl, auditor, { reason })).statusCode, 403);
    assert.equal((await call('POST', resumeUrl, operator, {})).json().error, 'invalid_reason');
    // L3: 다른 origin에서 온 브라우저 요청은 관리자 세션이 있어도 거절한다. 사유의 NUL은 400 invalid_text(Security #1).
    for (const headers of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
      const crossOrigin = await call('POST', resumeUrl, operator, { reason }, headers);
      assert.deepEqual([crossOrigin.statusCode, crossOrigin.json().error], [403, 'origin_denied']);
    }
    assert.equal((await call('POST', resumeUrl, operator, { reason }, { origin: 'http://localhost:3002' })).statusCode !== 403, true);
    assert.deepEqual((await call('POST', resumeUrl, operator, { reason: `${reason}\u0000` })).json(), { error: 'invalid_text' });
    assert.equal((await pool.query("select next_attempt_at='infinity'::timestamptz as stopped from field.organization_deletion_requests where id=$1",
      [requestId])).rows[0].stopped, false, 'the same-origin call above resumed it');
    await pool.query("update field.organization_deletion_requests set next_attempt_at='infinity',last_error='execution_failed,execution_attempts_stopped',steps=jsonb_build_object('executionFailures',12) where id=$1", [requestId]);
    assert.equal((await call('POST', `/v1/admin/organization-deletions/${randomUUID()}/resume`, operator, { reason })).statusCode, 404);
    const resumed = await call('POST', resumeUrl, operator, { reason });
    assert.equal(resumed.statusCode, 200, resumed.body);
    const row = (await pool.query(`select status,last_error,next_attempt_at<=now() as due,steps from field.organization_deletion_requests where id=$1`, [requestId])).rows[0];
    assert.deepEqual([row.status, row.last_error, row.due, row.steps.executionFailures], ['scheduled', null, true, 0]);
    assert.deepEqual([row.steps.operatorResumes[0].actorUserId, row.steps.operatorResumes[0].reason, row.steps.operatorResumes[0].previousError,
      row.steps.operatorResumes[0].previousExecutionFailures], [operator, reason, 'execution_failed,execution_attempts_stopped', 12]);
    assert.equal((await call('POST', resumeUrl, operator, { reason })).json().error, 'deletion_not_stopped');
    assert.equal((await call('GET', '/v1/admin/organization-deletions?status=stopped', operator)).json().deletions
      .some((entry: { id: string }) => entry.id === requestId), false);
    // owner 삭제 상태 응답에는 운영자 사용자 ID·사유(운영자 감사 기록)가 나가지 않는다.
    const ownerView = await call('GET', '/v1/organizations/current/deletion-requests/current', owner);
    assert.equal(ownerView.statusCode, 200, ownerView.body);
    assert.equal(ownerView.json().request.id, requestId);
    assert.equal(ownerView.json().request.steps.operatorResumes, undefined);
    assert.equal(ownerView.json().request.steps.executionFailures, 0);
    assert.doesNotMatch(ownerView.body, new RegExp(`${operator}|${reason}`));
    // 다시 멈추면 관리자 목록에서는 이전 다시 실행 기록(운영자·사유)을 그대로 본다.
    await pool.query("update field.organization_deletion_requests set next_attempt_at='infinity' where id=$1", [requestId]);
    const again = (await call('GET', '/v1/admin/organization-deletions?status=stopped', auditor)).json().deletions
      .find((entry: { id: string }) => entry.id === requestId);
    assert.deepEqual([again.operatorResumes[0].actorUserId, again.operatorResumes[0].reason], [operator, reason]);
    await pool.query('update field.organization_deletion_requests set next_attempt_at=now() where id=$1', [requestId]);
    // 원인이 풀린 뒤 실행기가 사진을 2단계 삭제로 넘기고, 사진 작업자가 지운 다음 실행을 끝낸다.
    permissionDenied = false;
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'blocked');
    assert.equal((await runSiteAssetDeletionOnce({ pool, siteMedia })).deleted, 1);
    await pool.query('update field.organization_deletion_requests set next_attempt_at=now() where id=$1', [requestId]);
    assert.equal(await runOrganizationDeletionOnce({ pool, siteMedia }), 'executed');
    assert.equal(files.size, 0);
  } finally {
    await pool.query("update field.organization_deletion_requests set status='canceled',canceled_at=now(),canceled_by=$2 where id=$1 and status='scheduled'", [requestId, owner]);
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
  }
});

// H1: 삭제 예약(또는 실행) 조직은 새 유료 구독·체험·AP 연결·통합 선택(grant)을 만들지 않는다(409 deletion_scheduled).
// 취소하면 같은 요청이 삭제 검사를 통과한다(대조군).
test('Field deletion-scheduled organizations cannot start checkout, trial, AP connection or an integration selection', async () => {
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const owner = randomUUID(), org = randomUUID(), requestId = randomUUID(), session = randomUUID();
  const clientId = `field-h1-${randomUUID()}`;
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool, resolveUserId: async headers => user(headers),
    resolveSession: async headers => user(headers) ? { id: session, userId: user(headers)! } : null,
    billing: { credentialKey: randomBytes(32), webOrigin: 'http://localhost:3002', provider: {
      mode: 'test' as const, clientKey: 'test_ck_synthetic', mid: 'synthetic-mid',
      issue: async () => { throw new Error('provider must not run in request'); },
      charge: async () => { throw new Error('provider must not run in request'); }, lookup: async () => null } },
    apConnector: { issuer: 'https://ap.example.invalid/api/auth', clientId: 'synthetic-ap-client', clientSecret: 'synthetic-secret',
      tokenKey: randomBytes(32), redirectUri: 'http://127.0.0.1:4321/v1/connections/ap/callback', webOrigin: 'http://localhost:3002',
      reverseClientId: '', fetcher: async () => { throw new Error('AP must not be called'); } } });
  const post = (url: string, payload: object, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, headers: { 'x-test-user': owner, ...headers }, payload });
  const consent = { planId: randomUUID(), termsVersion: 'synthetic-terms', refundVersion: 'synthetic-refund', totalAmount: 11000,
    supplyAmount: 10000, vatAmount: 1000, currency: 'KRW', includedAiUnits: 10, graceDays: 3, termsAccepted: true, autoRenew: true,
    firstChargePolicy: 'after_authorization' };
  const attempts = () => Promise.all([
    post('/v1/subscription/checkout', consent, { 'idempotency-key': randomUUID() }),
    post('/v1/subscription/trial', { consentVersion: 'mock-trial-v1', termsAccepted: true }),
    post('/v1/connections/ap/start', { organizationId: org }),
    post('/integrations/v1/authorization/selections', { clientId, organizationId: org, scopes: ['field.facts.read'] }),
  ]);
  try {
    await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [owner, `${owner}@example.invalid`]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Field Scheduled Org']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
    await pool.query(`insert into "session"("id","expiresAt","token","createdAt","updatedAt","userId")
      values ($1,now()+interval '1 day',$2,now(),now(),$3)`, [session, randomBytes(16).toString('hex'), owner]);
    const resource = new URL('/integrations/v1', process.env.FIELD_AUTH_BASE_URL).toString();
    await pool.query(`insert into "oauthResource"(id,identifier,name,"createdAt","updatedAt") values ($1,$2,'Field',now(),now())
      on conflict (identifier) do nothing`, [randomUUID(), resource]);
    await pool.query(`insert into "oauthClient"(id,"clientId","clientSecret",name,scopes,"applicationType","redirectUris","createdAt","updatedAt")
      values ($1,$2,'synthetic-secret-hash','Synthetic integrator','["field.facts.read"]'::jsonb,'web','["https://integrator.example.invalid/cb"]'::jsonb,now(),now())`,
    [randomUUID(), clientId]);
    await pool.query(`insert into "oauthClientResource"(id,"clientId","resourceId","createdAt") values ($1,$2,$3,now())`, [randomUUID(), clientId, resource]);
    await pool.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values ($1,$2,$3,'{}'::jsonb,'scheduled',now(),now()+interval '14 days',now()+interval '14 days')`, [requestId, org, owner]);

    const blocked = await attempts();
    for (const response of blocked) assert.deepEqual([response.statusCode, response.json()], [409, { error: 'deletion_scheduled' }], response.body);
    for (const table of ['paid_subscriptions', 'trial_subscriptions', 'ap_oauth_attempts', 'oauth_selections'])
      assert.equal((await pool.query(`select count(*)::int as n from field.${table} where organization_id=$1`, [org])).rows[0].n, 0, table);

    // 대조군: 취소하면 삭제 검사를 통과한다(checkout은 합성 요금제가 없어 다음 단계인 요금제 확인에서 멈춘다).
    await pool.query("update field.organization_deletion_requests set status='canceled',canceled_at=now(),canceled_by=$2 where id=$1", [requestId, owner]);
    const allowed = await attempts();
    assert.deepEqual(allowed.map(response => response.statusCode), [409, 201, 201, 201], allowed.map(response => response.body).join('\n'));
    assert.equal(allowed[0]!.json().error, 'billing_plan_conditions_changed');
  } finally {
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
  }
});

// M1: 조직 삭제 실행은 조직이 통합자에게 준 선택(grant)·토큰·동의를 회수 원장에 남기고 회수한다. 원장이 없으면 실행하지 않는다.
// 이어서 계정 삭제 차단 사유(oauth_grants_active·oauth_clients_active·admin_membership_required_removal)와 전제 조건 connections_active를 확인한다.
test('Field organization deletion revokes integration grants and account deletion reports OAuth client, grant and admin blockers', async () => {
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool, resolveUserId: async headers => user(headers) });
  const owner = randomUUID(), org = randomUUID(), requestId = randomUUID(), selection = randomUUID(), revokedSelection = randomUUID();
  const clientId = `field-m1-${randomUUID()}`, ownClientId = `field-m1-own-${randomUUID()}`, connection = randomUUID();
  const journal: unknown[] = [];
  const revocationJournal = { append: async (intent: object) => {
    journal.push(intent);
    return { version: 1, product: 'field', id: randomUUID(), createdAt: new Date().toISOString(), ...intent } as never;
  } };
  const eligibility = async () => (await app.inject({ url: '/v1/account/deletion-eligibility', headers: { 'x-test-user': owner } })).json();
  try {
    await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [owner, `${owner}@example.invalid`]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Field Grant Org']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
    for (const [id, userId] of [[clientId, null], [ownClientId, owner]])
      await pool.query(`insert into "oauthClient"(id,"clientId","clientSecret",name,scopes,"applicationType","redirectUris","userId","createdAt","updatedAt")
        values ($1,$2,'synthetic-secret-hash','Synthetic','["field.facts.read"]'::jsonb,'web','[]'::jsonb,$3,now(),now())`, [randomUUID(), id, userId]);
    for (const [id, revoked] of [[selection, false], [revokedSelection, true]])
      await pool.query(`insert into field.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,requested_scopes,selection_expires_at,revoked_at)
        values ($1,null,$2,$3,$4,'{field.facts.read}',now()+interval '5 minutes',case when $5 then now() else null end)`,
      [id, owner, clientId, org, revoked]);
    const refresh = randomUUID(), access = randomUUID(), stray = randomUUID();
    await pool.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","expiresAt","createdAt",scopes)
      values ($1,$2,$3,$4,$5,now()+interval '30 days',now(),'["field.facts.read"]'::jsonb)`, [refresh, randomUUID(), clientId, owner, selection]);
    await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId","expiresAt","createdAt",scopes) values
      ($1,$2,$3,$4,$5,now()+interval '10 minutes',now(),'["field.facts.read"]'::jsonb),($6,$7,$3,$4,$8,now()+interval '10 minutes',now(),'["field.facts.read"]'::jsonb)`,
    [access, randomUUID(), clientId, owner, selection, stray, randomUUID(), revokedSelection]);
    await pool.query(`insert into "oauthConsent"(id,"clientId","userId","referenceId",scopes,"createdAt","updatedAt")
      values ($1,$2,$3,$4,'["field.facts.read"]'::jsonb,now(),now())`, [randomUUID(), clientId, owner, selection]);

    // 계정 삭제 차단: owner 조직·살아 있는 refresh token·본인이 등록한 활성 client·플랫폼 관리자 자격.
    await pool.query("insert into field.platform_admin_memberships(user_id,role) values ($1,'auditor')", [owner]);
    assert.deepEqual((await eligibility()).blockers, ['organization_deletion_required', 'admin_membership_required_removal',
      'oauth_grants_active', 'oauth_clients_active', 'reauth_required']);
    await pool.query('delete from field.platform_admin_memberships where user_id=$1', [owner]);

    // 전제 조건: 살아 있는 AP 연결은 예약을 막고, 통합 grant는 막지 않고 실행 때 회수한다고 알린다.
    await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,
      ap_agent_revision,allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values ($1,$2,$3,'https://ap.example.invalid/api/auth','synthetic-client',$4,$5,$6,'Synthetic',1,'{}','{ap.agent.read}','\\x00'::bytea,'\\x00'::bytea,now()+interval '1 hour','active')`,
    [connection, org, owner, randomUUID(), randomUUID(), randomUUID()]);
    const current = (await app.inject({ url: '/v1/organizations/current/deletion-requests/current', headers: { 'x-test-user': owner } })).json();
    assert.deepEqual(current.preconditions.map((item: { code: string; count: number; ok: boolean }) => [item.code, item.count, item.ok]),
      [['paid_subscription_active', 0, true], ['connections_active', 1, false], ['open_reservations', 0, true], ['integration_grants_active', 1, true]]);
    await pool.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values ($1,$2,$3,'{}'::jsonb,'scheduled',now()-interval '15 days',now()-interval '1 minute',now()-interval '1 minute')`, [requestId, org, owner]);
    assert.equal(await runOrganizationDeletionOnce({ pool, revocationJournal }), 'blocked');
    assert.equal((await pool.query('select last_error from field.organization_deletion_requests where id=$1', [requestId])).rows[0].last_error, 'connections_active');
    await pool.query("update field.ap_connections set status='revoked' where id=$1", [connection]);

    // 회수 원장이 없으면 grant를 남긴 채 blocked_integration으로 기다린다.
    await pool.query("update field.organization_deletion_requests set next_attempt_at=now()-interval '1 minute' where id=$1", [requestId]);
    assert.equal(await runOrganizationDeletionOnce({ pool }), 'blocked');
    assert.equal((await pool.query('select last_error from field.organization_deletion_requests where id=$1', [requestId])).rows[0].last_error, 'blocked_integration');
    assert.equal((await pool.query('select revoked_at from field.oauth_selections where id=$1', [selection])).rows[0].revoked_at, null);

    await pool.query("update field.organization_deletion_requests set next_attempt_at=now()-interval '1 minute' where id=$1", [requestId]);
    assert.equal(await runOrganizationDeletionOnce({ pool, revocationJournal }), 'executed');
    assert.deepEqual(journal, [{ targetKind: 'selection', targetId: selection, organizationId: org, selectionId: selection, source: 'owner', revocationId: null }]);
    const executed = (await pool.query('select steps from field.organization_deletion_requests where id=$1', [requestId])).rows[0].steps.executed;
    // 이미 회수된 선택에 붙은 토큰은 000061 guard가 저장 때 바로 회수하므로 여기서 회수되는 access token은 1개다.
    assert.deepEqual(executed.integrationGrantsRevoked, { selections: 1, accessTokens: 1, refreshTokens: 1, consents: 1 });
    assert.equal((await pool.query('select count(*)::int as n from field.oauth_selections where organization_id=$1 and revoked_at is null', [org])).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int as n from "oauthAccessToken" where id=any($1::text[]) and revoked is null', [[access, stray]])).rows[0].n, 0);
    assert.ok((await pool.query('select revoked from "oauthRefreshToken" where id=$1', [refresh])).rows[0].revoked);
    assert.equal((await pool.query('select count(*)::int as n from "oauthConsent" where "referenceId"=$1', [selection])).rows[0].n, 0);

    // 조직 삭제 뒤 계정 삭제: grant 차단은 풀리고, 본인이 등록한 client는 비활성화해야 풀린다(Security #6 안전 기본값).
    assert.deepEqual((await eligibility()).blockers, ['oauth_clients_active', 'reauth_required']);
    await pool.query(`update "oauthClient" set disabled=true where "clientId"=$1`, [ownClientId]);
    assert.deepEqual((await eligibility()).blockers, ['reauth_required']);
  } finally {
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
  }
});

// L10: 멈춘 사진 2단계 삭제는 관리자 목록에서 보고 operator만 사유와 함께 다시 시작한다(감사 행 기록).
test('Field stopped site photo deletions are listed for admins and resumed only by operators with an audit row', async () => {
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool, resolveUserId: async headers => user(headers) });
  const owner = randomUUID(), operator = randomUUID(), auditor = randomUUID(), org = randomUUID(), site = randomUUID(), asset = randomUUID();
  const call = (method: 'GET' | 'POST', url: string, actor: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { 'x-test-user': actor, ...headers }, payload });
  const resumeUrl = `/v1/admin/site-asset-deletions/${asset}/resume`;
  const reason = '저장소 권한을 복구해 사진 삭제를 다시 시작합니다';
  try {
    for (const id of [owner, operator, auditor])
      await pool.query('insert into "user"("id","name","email","emailVerified") values ($1,$1,$2,true)', [id, `${id}@example.invalid`]);
    await pool.query("insert into field.platform_admin_memberships(user_id,role) values ($1,'operator'),($2,'auditor')", [operator, auditor]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Field Photo Org']);
    await pool.query('insert into field.sites(id,organization_id,slug) values ($1,$2,$3)', [site, org, `field-${randomBytes(6).toString('hex')}`]);
    await pool.query(`insert into field.site_assets(id,organization_id,object_key,content_type,byte_size,width,height,sha256,uploaded_by,
      state,deletion_requested_at,deletion_next_attempt_at,deletion_attempts,deletion_error,deletion_stopped_at)
      values ($1,$2,$3,'image/webp',1,10,10,$4,$5,'deleting',now()-interval '1 hour','infinity',12,'media_unavailable,attempts_stopped',now())`,
    [asset, org, `${org}/${asset}.webp`, hash('x'), owner]);

    assert.equal((await call('GET', '/v1/admin/site-asset-deletions?status=stopped', owner)).statusCode, 403);
    assert.equal((await call('GET', '/v1/admin/site-asset-deletions', auditor)).statusCode, 400);
    const listed = await call('GET', '/v1/admin/site-asset-deletions?status=stopped', auditor);
    assert.equal(listed.statusCode, 200, listed.body);
    const item = listed.json().deletions.find((row: { id: string }) => row.id === asset);
    assert.deepEqual(Object.keys(item).sort(), ['attempts', 'error', 'id', 'organizationId', 'requestedAt', 'siteId', 'stoppedAt']);
    assert.deepEqual([item.siteId, item.organizationId, item.attempts, item.error, typeof item.requestedAt, typeof item.stoppedAt],
      [site, org, 12, 'media_unavailable,attempts_stopped', 'string', 'string']);

    assert.equal((await call('POST', resumeUrl, auditor, { reason })).statusCode, 403);
    assert.deepEqual((await call('POST', resumeUrl, operator, { reason: '짧음' })).json(), { error: 'invalid_reason' });
    assert.deepEqual((await call('POST', resumeUrl, operator, { reason: `${reason}\u0000` })).json(), { error: 'invalid_text' });
    assert.deepEqual((await call('POST', resumeUrl, operator, { reason }, { origin: 'https://evil.example' })).json(), { error: 'origin_denied' });
    assert.equal((await call('POST', `/v1/admin/site-asset-deletions/${randomUUID()}/resume`, operator, { reason })).statusCode, 404);
    const resumed = await call('POST', resumeUrl, operator, { reason });
    assert.equal(resumed.statusCode, 200, resumed.body);
    assert.deepEqual([resumed.json().id, resumed.json().state], [asset, 'deleting']);
    const row = (await pool.query(`select deletion_attempts,deletion_error,deletion_stopped_at,deletion_next_attempt_at<=now() as due
      from field.site_assets where id=$1`, [asset])).rows[0];
    assert.deepEqual(row, { deletion_attempts: 0, deletion_error: null, deletion_stopped_at: null, due: true });
    const audit = (await pool.query('select actor_user_id,reason,previous_error,previous_attempts from field.site_asset_deletion_resumes where asset_id=$1', [asset])).rows;
    assert.deepEqual(audit, [{ actor_user_id: operator, reason, previous_error: 'media_unavailable,attempts_stopped', previous_attempts: 12 }]);
    assert.equal((await call('POST', resumeUrl, operator, { reason })).json().error, 'deletion_not_stopped');
    assert.equal((await call('GET', '/v1/admin/site-asset-deletions?status=stopped', operator)).json().deletions
      .some((entry: { id: string }) => entry.id === asset), false);
  } finally {
    await pool.query('delete from field.site_assets where id=$1', [asset]);
    await app.close();
    await pool.end();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
  }
});
