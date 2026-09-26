import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';

process.loadEnvFile(resolve('infra/field/.env'));
const database = new URL(process.env.FIELD_DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '55432');
assert.equal(database.username, 'field_local');
assert.equal(database.pathname, '/fieldai_field_mock');
const run = promisify(execFile), web = 'http://localhost:3002';
const sharp = createRequire(resolve('apps/field-api/package.json'))('sharp');

test('Field approved support reads native inquiry, reservation, and received work scopes without crossing original owners', async () => {
  const accounts = Array.from({ length: 3 }, () => ({ email: `field-support-${randomUUID()}@example.invalid`, password: `${randomBytes(18).toString('base64url')}A1!` }));
  const pool = new pg.Pool({ connectionString: database.toString() });
  const call = async (path, body, cookie, method = 'POST', extra = {}) => {
    const response = await fetch(web + path, { method, headers: { origin: web,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
    return { response, data: await response.json() };
  };
  let organizationId, media;
  try {
    for (const account of accounts) await call('/api/auth/sign-up/email', { ...account, name: 'Synthetic support browser' });
    const signed = await call('/api/auth/sign-in/email', accounts[0]);
    const cookie = signed.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    organizationId = (await call('/v1/organizations', { name: '지원 열람 검수 사업체' }, cookie)).data.id;
    const serviceId = randomUUID();
    await call('/v1/business/draft', { expectedRevision: 0, businessName: '지원 열람 검수 사업체', introduction: '승인 소개', region: '서울', openingHours: '평일', contactPhone: '',
      services: [{ id: serviceId, name: '상담', description: '상담 설명', bookingMode: 'request', durationMinutes: 30, priceAmount: null }] }, cookie, 'PUT');
    await call('/v1/catalog/releases', { expectedRevision: 1 }, cookie);
    await call('/v1/booking-policy', { expectedRevision: 0, timezone: 'Asia/Seoul', weekly: { mon: { open: '10:00', close: '18:00' } },
      beforeMinutes: 0, afterMinutes: 0, minLeadMinutes: 0, horizonDays: 30 }, cookie, 'PUT');
    const inquiry = (await call(`/v1/public/catalog/${organizationId}/inquiries`, { serviceId, name: 'PRIVATE_INQUIRY_CUSTOMER', phone: '010-3333-4444',
      message: 'PRIVATE_INQUIRY_BODY', visitRegion: 'PRIVATE_INQUIRY_REGION', consent: true })).data;
    const inquiryDetail = (await call(`/v1/inquiries/${inquiry.id}`, undefined, undefined, 'GET', { authorization: `Bearer ${inquiry.receiptKey}` })).data;
    await call(`/v1/owner/inquiries/${inquiry.id}/notes`, { body: 'PRIVATE_INTERNAL_NOTE', expectedRevision: inquiryDetail.revision }, cookie);
    const reservation = (await call(`/v1/public/catalog/${organizationId}/reservations`, { serviceId, name: 'PRIVATE_RESERVATION_CUSTOMER', phone: '010-3333-4445',
      preferredTimeText: '다음 주 오전', requestMessage: 'PRIVATE_RESERVATION_SUBMISSION', visitRegion: 'PRIVATE_RESERVATION_REGION', consent: true })).data;
    await call(`/v1/reservations/${reservation.id}/messages`, { messageId: randomUUID(), body: 'PRIVATE_RESERVATION_MESSAGE' }, undefined, 'POST', { authorization: `Bearer ${reservation.receiptKey}` });
    const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#225588' } }).png().toBuffer();
    for (const [path, receipt] of [[`/v1/inquiries/${inquiry.id}/messages/${inquiryDetail.messages[0].id}/attachments`, inquiry.receiptKey], [`/v1/reservations/${reservation.id}/attachments`, reservation.receiptKey]]) {
      const response = await fetch(web + path, { method: 'POST', headers: { origin: web, authorization: `Bearer ${receipt}`, 'content-type': 'application/octet-stream' }, body: png });
      assert.equal(response.status, 201, await response.clone().text());
    }
    await pool.query(`insert into field.platform_admin_memberships(user_id,role) select id,'operator' from "user" where email=any($1::text[])`, [accounts.slice(1).map(item => item.email)]);
    const owner = (await pool.query('select id from "user" where email=$1', [accounts[0].email])).rows[0].id;
    const connection = randomUUID(), external = randomUUID(), copied = randomUUID(), pending = randomUUID();
    await pool.query(`insert into field.ap_connections
      (id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,
       allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values ($1,$2,$3,'https://ap.example.invalid/api/auth','synthetic-support',$4,$5,$6,'Support AI',1,'{}','{}',$7,$8,now()+interval '1 hour','revoked')`,
    [connection, organizationId, owner, randomUUID(), randomUUID(), randomUUID(), Buffer.from('synthetic-unusable-token'), Buffer.from('synthetic-unusable-refresh')]);
    await pool.query(`insert into field.external_work_requests
      (id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,body_hash,origin_conversation_id,source_deployment_id,kind,
       service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,consent_record_id,consent_confirmed_at,conditions_hash,is_test,status)
      values ($1,$2,'agent-platform',$3,'synthetic-support',$4,$5,$6,$7,$8,'inquiry',$9,1,1,'{}',$10::jsonb,$11::jsonb,'PRIVATE_RECEIVED_SUMMARY',$12,now(),$13,true,'requested')`,
    [external, organizationId, connection, randomUUID(), randomUUID(), 'a'.repeat(64), randomUUID(), randomUUID(), serviceId,
      JSON.stringify({ name: 'PRIVATE_RECEIVED_CUSTOMER', phone: '010-3333-4446', verified: false }), JSON.stringify({ mode: 'inquiry', timezone: 'Asia/Seoul' }), randomUUID(), 'b'.repeat(64)]);
    process.env.FIELD_PROFILE = 'mock';
    media = (await import('../../apps/field-api/dist/inquiry-media.js')).createFieldInquiryMediaStore();
    assert.ok(media);
    const saved = await sharp(png).webp().toBuffer(), objectKey = `${organizationId}/${copied}.webp`;
    await pool.query(`insert into field.external_request_attachments
      (id,organization_id,external_request_id,source_attachment_id,state,object_key,sha256,byte_size,width,height,copied_at)
      values ($1,$2,$3,$4,'copied',$5,$6,$7,4,3,now())`,
    [copied, organizationId, external, randomUUID(), objectKey, createHash('sha256').update(saved).digest('hex'), saved.length]);
    await media.put(objectKey, saved);
    await pool.query(`insert into field.external_request_attachments(id,organization_id,external_request_id,source_attachment_id,state,next_attempt_at)
      values ($1,$2,$3,$4,'pending',now()+interval '1 year')`, [pending, organizationId, external, randomUUID()]);
    const fixtureEnv = { ...process.env, FIELD_SUPPORT_ACCOUNTS: JSON.stringify(accounts.slice(1)), FIELD_SUPPORT_INQUIRY: inquiry.id,
      FIELD_SUPPORT_RESERVATION: reservation.id, FIELD_SUPPORT_EXTERNAL: external };
    const { stdout, stderr } = await run(process.env.FIELD_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python', ['tools/spikes/field-customer-support-browser.py'],
      { cwd: process.cwd(), timeout: 120000, env: fixtureEnv });
    assert.match(stdout, /Field customer support scopes and recovery: passed/, stderr);
    const access = (await pool.query(`select id,target_kind,scopes,revoked_at from field.customer_support_access_requests where organization_id=$1 order by created_at`, [organizationId])).rows;
    assert.equal(access.length, 6);
    assert.ok(access[3].revoked_at);
    assert.equal((await pool.query('select count(*)::int as n from field.occupancies where organization_id=$1', [organizationId])).rows[0].n, 0);
    for (const [kind, receipt] of [['inquiries', inquiry], ['reservations', reservation]])
      assert.equal((await call(`/v1/${kind}/${receipt.id}`, undefined, undefined, 'GET', { authorization: `Bearer ${receipt.receiptKey}` })).response.status, 200);
    const operator = await call('/api/auth/sign-in/email', accounts[1]);
    const operatorCookie = operator.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    await pool.query("update field.customer_support_access_requests set expires_at=clock_timestamp()+interval '8 seconds' where id=$1", [access[5].id]);
    const expired = await run(process.env.FIELD_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python', ['tools/spikes/field-customer-support-browser.py', '--expiry'],
      { cwd: process.cwd(), timeout: 30000, env: { ...fixtureEnv, FIELD_SUPPORT_COOKIE: operatorCookie, FIELD_SUPPORT_ACCESS: access[5].id } });
    assert.match(expired.stdout, /Field support deadline cleared: passed/, expired.stderr);
    const events = (await pool.query('select action from field.customer_support_audit where target_id=any($1::uuid[])', [[inquiry.id, reservation.id, external]])).rows;
    for (const action of ['requested', 'approved', 'detail_read', 'photo_read', 'revoked']) assert.ok(events.some(row => row.action === action), action);
  } finally {
    try {
      if (organizationId) {
        if (!media) { process.env.FIELD_PROFILE = 'mock'; media = (await import('../../apps/field-api/dist/inquiry-media.js')).createFieldInquiryMediaStore(); }
        const keys = (await pool.query(`select object_key from field.inquiry_attachments where organization_id=$1 union
          select object_key from field.reservation_attachments where organization_id=$1 union
          select object_key from field.external_request_attachments where organization_id=$1 and object_key is not null`, [organizationId])).rows;
        if (media) for (const item of keys) await media.delete(item.object_key);
      }
    } finally {
      if (organizationId) await pool.query('delete from field.organizations where id=$1', [organizationId]);
      await pool.query('delete from "user" where email=any($1::text[])', [accounts.map(item => item.email)]);
      await pool.end();
    }
  }
});
