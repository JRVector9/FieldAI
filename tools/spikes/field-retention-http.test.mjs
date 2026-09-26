import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';
import { FieldFileMediaStore } from '../../apps/field-api/dist/site-media.js';

const sharp = createRequire(resolve('apps/field-api/package.json'))('sharp');

process.loadEnvFile(resolve('infra/field/.env'));
const database = new URL(process.env.FIELD_DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '55432');
assert.equal(database.username, 'field_local'); assert.equal(database.pathname, '/fieldai_field_mock');
const run = promisify(execFile), web = 'http://localhost:3002';

test('Field native retention policy approval, holds, preview recovery, and received inquiry closure work at 320px', async () => {
  const accounts = Array.from({ length: 3 }, () => ({ email: `field-retention-${randomUUID()}@example.invalid`, password: `${randomBytes(18).toString('base64url')}A1!` }));
  const pool = new pg.Pool({ connectionString: database.toString() });
  const call = async (path, body, cookie, method = 'POST') => {
    const response = await fetch(web + path, { method, headers: { origin: web,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
    return { response, data: await response.json() };
  };
  let org, photoKey;
  try {
    for (const account of accounts) await call('/api/auth/sign-up/email', { ...account, name: 'Synthetic retention browser' });
    const signed = await call('/api/auth/sign-in/email', accounts[0]);
    const cookie = signed.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    org = (await call('/v1/organizations', { name: '보존 검수 사업체' }, cookie)).data.id;
    const service = randomUUID();
    await call('/v1/business/draft', { expectedRevision: 0, businessName: '보존 검수 사업체', introduction: '', region: '', openingHours: '', contactPhone: '',
      services: [{ id: service, name: '상담', description: '상담', bookingMode: 'request', durationMinutes: 30, priceAmount: null }] }, cookie, 'PUT');
    await call('/v1/catalog/releases', { expectedRevision: 1 }, cookie);
    const inquiry = (await call(`/v1/public/catalog/${org}/inquiries`, { serviceId: service, name: 'PRIVATE_RETENTION_CUSTOMER', phone: '010-3456-7890', message: 'PRIVATE_RETENTION_BODY', consent: true })).data;
    await call(`/v1/owner/inquiries/${inquiry.id}/close`, { expectedRevision: 0 }, cookie);
    const purgeInquiry = (await call(`/v1/public/catalog/${org}/inquiries`, { serviceId: service, name: 'PRIVATE_PURGE_BROWSER', phone: '010-3456-7892', message: 'PRIVATE_PURGE_BROWSER_BODY', consent: true })).data;
    const opened = await fetch(`${web}/v1/inquiries/${purgeInquiry.id}`, { headers: { authorization: `Bearer ${purgeInquiry.receiptKey}` } });
    assert.equal(opened.status, 200); const message = (await opened.json()).messages[0].id;
    const image = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#285588' } }).png().toBuffer();
    const photo = await fetch(`${web}/v1/inquiries/${purgeInquiry.id}/messages/${message}/attachments`, { method: 'POST',
      headers: { authorization: `Bearer ${purgeInquiry.receiptKey}`, 'content-type': 'application/octet-stream' }, body: image });
    assert.equal(photo.status, 201);
    photoKey = `${org}/${(await photo.json()).id}.webp`;
    await call(`/v1/owner/inquiries/${purgeInquiry.id}/close`, { expectedRevision: 0 }, cookie);
    // 기간을 바꾸는 대상은 이 실행에서 새로 만든 합성 업무뿐이다.
    await pool.query("update field.inquiries set retention_closed_at=now()-interval '200 days' where id=$1", [purgeInquiry.id]);
    await pool.query("update field.inquiry_messages set created_at=now()-interval '201 days' where inquiry_id=$1", [purgeInquiry.id]);
    await pool.query("update field.inquiry_attachments set created_at=now()-interval '201 days' where inquiry_id=$1", [purgeInquiry.id]);
    await pool.query(`insert into field.platform_admin_memberships(user_id,role) select id,'operator' from "user" where email=any($1::text[])`, [accounts.slice(1).map(a => a.email)]);
    const owner = (await pool.query('select id from "user" where email=$1', [accounts[0].email])).rows[0].id;
    const external = randomUUID(), connection = randomUUID();
    await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,
      ap_agent_revision,allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values($1,$2,$3,'https://ap.example.invalid/api/auth','synthetic-retention',$4,$5,$6,'Synthetic AI',1,'{}','{}',$7,$7,now(),'revoked')`,
    [connection, org, owner, randomUUID(), randomUUID(), randomUUID(), Buffer.from('synthetic-unusable')]);
    await pool.query(`insert into field.external_work_requests(id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,body_hash,origin_conversation_id,
      source_deployment_id,kind,service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,consent_record_id,consent_confirmed_at,conditions_hash,is_test,status)
      values($1,$2,'agent-platform',$3,'synthetic',$4,$5,$6,$7,$8,'inquiry',$9,1,1,$10::jsonb,$11::jsonb,'{}','PRIVATE_RECEIVED_RETENTION',$12,now(),$6,true,'requested')`,
    [external, org, connection, randomUUID(), randomUUID(), 'c'.repeat(64), randomUUID(), randomUUID(), service,
      JSON.stringify({ id: service, name: '상담' }), JSON.stringify({ name: '합성 수신 고객', phone: '010-3456-7891', verified: false }), randomUUID()]);
    const { stdout, stderr } = await run(process.env.FIELD_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python', [resolve('tools/spikes/field-retention-browser.py')], {
      timeout: 120000, env: { ...process.env, FIELD_RETENTION_ACCOUNTS: JSON.stringify(accounts), FIELD_RETENTION_ORG: org,
        FIELD_RETENTION_INQUIRY: inquiry.id, FIELD_RETENTION_EXTERNAL: external,
        FIELD_RETENTION_PURGE_INQUIRY: purgeInquiry.id, FIELD_RETENTION_PURGE_KEY: purgeInquiry.receiptKey },
    });
    assert.match(stdout, /Field retention native mobile flows: passed/, stderr);
    assert.equal((await pool.query('select body from field.inquiry_messages where inquiry_id=$1', [inquiry.id])).rows[0].body, 'PRIVATE_RETENTION_BODY');
    assert.ok((await pool.query('select retention_work_purged_at from field.inquiries where id=$1', [purgeInquiry.id])).rows[0].retention_work_purged_at);
    assert.equal((await pool.query('select body from field.inquiry_messages where inquiry_id=$1', [purgeInquiry.id])).rows[0].body, '[보존 기간 종료]');
    assert.equal(await new FieldFileMediaStore(resolve(process.env.FIELD_INQUIRY_MEDIA_DIRECTORY)).get(photoKey), null);
    const received = (await pool.query('select field_work_state,status,summary from field.external_work_requests where id=$1', [external])).rows[0];
    assert.equal(received.field_work_state, 'closed'); assert.equal(received.status, 'requested'); assert.equal(received.summary, 'PRIVATE_RECEIVED_RETENTION');
  } finally {
    try {
      if (photoKey) await new FieldFileMediaStore(resolve(process.env.FIELD_INQUIRY_MEDIA_DIRECTORY)).delete(photoKey);
      if (org) await pool.query('delete from field.organizations where id=$1', [org]);
      // 이 실행에서 만든 정책/감사와 합성 계정만 정리한다.
      const exists = await pool.query("select to_regclass('field.work_retention_policies') as table_name");
      if (exists.rows[0].table_name) await pool.query('delete from field.work_retention_policies where requested_by in (select id from "user" where email=any($1::text[]))', [accounts.map(a => a.email)]);
      await pool.query('delete from "user" where email=any($1::text[])', [accounts.map(a => a.email)]);
    } finally { await pool.end(); }
  }
});
