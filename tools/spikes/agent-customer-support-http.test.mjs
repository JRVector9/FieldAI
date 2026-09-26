import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';

process.loadEnvFile(resolve('infra/agent/.env'));
const database = new URL(process.env.AP_DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '55431');
assert.equal(database.username, 'agent_local');
assert.equal(database.pathname, '/fieldai_agent_mock');
const sharp = createRequire(resolve('apps/agent-api/package.json'))('sharp');
const run = promisify(execFile), web = 'http://localhost:3001';

test('AP approved customer support reads only selected original scopes and clears expired or revoked photos in native browsers', async () => {
  const accounts = Array.from({ length: 3 }, () => ({ email: `agent-support-${randomUUID()}@example.invalid`,
    password: `${randomBytes(18).toString('base64url')}A1!` }));
  const pool = new pg.Pool({ connectionString: database.toString() });
  const call = async (path, body, cookie, method = 'POST') => {
    const response = await fetch(web + path, { method, headers: { origin: web,
      ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
    return { response, data: await response.json() };
  };
  let org;
  const mediaKeys = [];
  try {
    for (const account of accounts) await call('/api/auth/sign-up/email', { ...account, name: 'Synthetic AP support browser' });
    const signed = await call('/api/auth/sign-in/email', accounts[0]);
    const cookie = signed.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    org = (await call('/v1/organizations', { name: '고객정보 지원 검수' }, cookie)).data.id;
    await call('/v1/knowledge/draft', { expectedRevision: 0, businessName: '고객정보 지원 검수', introduction: '승인 안내',
      services: [], faqs: [] }, cookie, 'PUT');
    await call('/v1/knowledge/releases', { expectedRevision: 1 }, cookie);
    const inquiry = (await call(`/v1/public/organizations/${org}/inquiries`, { name: 'PRIVATE_SUPPORT_CUSTOMER', phone: '010-3333-4444',
      message: 'PRIVATE_SUPPORT_BODY: 고객이 직접 접수한 원본', consent: true })).data;
    const opened = await fetch(web + `/v1/inquiries/${inquiry.id}`, { headers: { authorization: `Bearer ${inquiry.receiptKey}` } });
    assert.equal(opened.status, 200);
    const message = (await opened.json()).messages[0].id;
    await call(`/v1/owner/inquiries/${inquiry.id}/notes`, { body: 'PRIVATE_SUPPORT_INTERNAL_NOTE' }, cookie);
    const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#4477bb' } }).png().toBuffer();
    const uploaded = await fetch(web + `/v1/inquiries/${inquiry.id}/messages/${message}/attachments`, { method: 'POST',
      headers: { authorization: `Bearer ${inquiry.receiptKey}`, 'content-type': 'application/octet-stream' }, body: png });
    assert.equal(uploaded.status, 201);
    const photo = (await uploaded.json()).id;
    mediaKeys.push((await pool.query('select object_key from ap.inquiry_attachments where id=$1', [photo])).rows[0].object_key);
    await pool.query(`insert into ap.platform_admin_memberships(user_id,role)
      select id,'operator' from "user" where email=any($1::text[])`, [accounts.slice(1).map(item => item.email)]);
    const requesterCookie = (await call('/api/auth/sign-in/email', accounts[1])).response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const { stdout, stderr } = await run(process.env.AP_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      ['tools/spikes/agent-customer-support-browser.py'], { cwd: process.cwd(), timeout: 120000,
        env: { ...process.env, AP_SUPPORT_ACCOUNTS: JSON.stringify(accounts.slice(1)), AP_SUPPORT_INQUIRY: inquiry.id,
          AP_SUPPORT_PHOTO: photo },
      });
    assert.match(stdout, /AP customer support scopes and recovery: passed/, stderr);
    const requests = (await pool.query('select id,revoked_at from ap.customer_support_access_requests where inquiry_id=$1 order by created_at,id', [inquiry.id])).rows;
    assert.equal(requests.length, 3);
    assert.ok(requests[1].revoked_at);
    const available = (await fetch(web + `/v1/inquiries/${inquiry.id}`, { headers: { authorization: `Bearer ${inquiry.receiptKey}` } })).status;
    assert.equal(available, 200);
    // 브라우저의 마지막 grant를 실제 DB에서 곧 만료시키고, 같은 승인은 갱신하지 않는다.
    await pool.query("update ap.customer_support_access_requests set expires_at=clock_timestamp()+interval '8 seconds' where id=$1", [requests[2].id]);
    const { stdout: expiryOutput } = await run(process.env.AP_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      ['tools/spikes/agent-customer-support-browser.py', '--expiry'], { cwd: process.cwd(), timeout: 30000,
        env: { ...process.env, AP_SUPPORT_COOKIE: requesterCookie, AP_SUPPORT_ACCESS: requests[2].id } });
    assert.match(expiryOutput, /AP support deadline cleared: passed/);
    const audit = (await pool.query('select action from ap.customer_support_audit where inquiry_id=$1', [inquiry.id])).rows.map(row => row.action);
    for (const action of ['requested', 'approved', 'detail_read', 'photo_read', 'revoked']) assert.ok(audit.includes(action), action);
  } finally {
    for (const key of mediaKeys) {
      const { createAgentInquiryMediaStore } = await import('../../apps/agent-api/dist/inquiry-media.js');
      const previousProfile = process.env.AP_PROFILE;
      process.env.AP_PROFILE = 'mock';
      try { await createAgentInquiryMediaStore()?.delete(key); } finally { process.env.AP_PROFILE = previousProfile; }
    }
    if (org) await pool.query('delete from ap.organizations where id=$1', [org]);
    await pool.query('delete from "user" where email=any($1::text[])', [accounts.map(item => item.email)]);
    await pool.end();
  }
});
