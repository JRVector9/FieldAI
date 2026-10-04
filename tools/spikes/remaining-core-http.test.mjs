import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';

// A-20 / QA20/21/38/47/56/74: real HTTP against the isolated mock stack.
// DNS/ACME and provider credentials remain separate live gates.
const product = process.env.CORE_SPIKE_PRODUCT;
assert.ok(product === 'agent' || product === 'field', 'CORE_SPIKE_PRODUCT=agent|field is required');
const prefix = product === 'agent' ? 'AP' : 'FIELD';
process.loadEnvFile(resolve(`infra/${product}/.env`));
process.env[`${prefix}_PROFILE`] = 'mock';
const api = product === 'agent' ? 'http://127.0.0.1:4311' : 'http://127.0.0.1:4321';
const web = process.env[`${prefix}_PUBLIC_WEB_ORIGIN`];
assert.ok(web, 'own public web origin is required');
const schema = product === 'agent' ? 'ap' : 'field';

async function json(path, method = 'GET', body, cookie, headers = {}) {
  const response = await fetch(`${api}${path}`, { method, headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(cookie ? { cookie } : {}), ...(method === 'GET' ? {} : { origin: web }), ...headers,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
  return { response, data: await response.clone().json().catch(() => ({})) };
}
// Node fetch replaces Host with the URL host. Use HTTP directly to exercise
// the Host-preserving request that the edge sends to the health endpoint.
async function healthFor(hostname) {
  return new Promise((resolveRequest, reject) => {
    const request = httpRequest(`${api}/.well-known/field-site-health`, { headers: { host: hostname } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        try { resolveRequest({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (error) { reject(error); }
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error('health HTTP timeout')));
    request.on('error', reject);
    request.end();
  });
}
async function owner() {
  const email = `core-spike-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const signup = await json('/api/auth/sign-up/email', 'POST', { email, password, name: 'HTTP 검수 사업자' });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
  const login = await json('/api/auth/sign-in/email', 'POST', { email, password });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  const cookie = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const organization = await json('/v1/organizations', 'POST', { name: 'HTTP 코어 검수' }, cookie);
  assert.equal(organization.response.status, 201, JSON.stringify(organization.data));
  return { email, cookie, organizationId: organization.data.id };
}
async function cleanup(pool, identity) {
  if (!identity) return;
  const db = await pool.connect();
  try {
    await db.query('begin');
    if (product === 'field') {
      await db.query(`delete from field.site_releases using field.sites
        where site_releases.site_id=sites.id and sites.organization_id=$1`, [identity.organizationId]);
    }
    await db.query(`delete from ${schema}.organizations where id=$1`, [identity.organizationId]);
    await db.query('delete from "user" where email=$1', [identity.email]);
    await db.query('commit');
  } catch (error) { await db.query('rollback'); throw error; }
  finally { db.release(); }
}

test(`${product} legal pages and Toss hints cross HTTP without accepting payment outcomes`, async () => {
  const pool = new Pool({ connectionString: process.env[`${prefix}_DATABASE_URL`] });
  const orderId = `core_${randomUUID()}`.slice(0, 40), paymentKey = randomBytes(32).toString('base64url');
  try {
    for (const path of ['/terms', '/privacy']) {
      const response = await fetch(`${web}${path}`, { signal: AbortSignal.timeout(10_000) });
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /text\/html/);
    }
    const invalid = await json('/v1/billing/webhooks/toss', 'POST', { eventType: 'unknown', data: {} });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.data.error, 'invalid_webhook');
    const hint = { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId, paymentKey, status: 'DONE' } };
    for (let attempt = 0; attempt < 2; attempt++) {
      const received = await json('/v1/billing/webhooks/toss', 'POST', hint);
      assert.equal(received.response.status, 200, JSON.stringify(received.data));
      assert.deepEqual(received.data, { received: true });
      assert.match(received.response.headers.get('cache-control'), /no-store/);
    }
    const rows = (await pool.query(`select outcome,payment_key_hash from ${schema}.billing_webhook_events
      where order_id=$1 order by received_at`, [orderId])).rows;
    assert.equal(rows.length, 2, 'each received hint is recorded; payment operations are not created');
    assert.ok(rows.every(row => row.outcome === 'blocked_integration'));
    assert.ok(rows.every(row => row.payment_key_hash === createHash('sha256').update(paymentKey).digest('hex')));
    assert.equal((await pool.query(`select count(*)::integer as count from ${schema}.billing_transactions
      where order_id=$1`, [orderId])).rows[0].count, 0);
  } finally {
    await pool.query(`delete from ${schema}.billing_webhook_events where order_id=$1`, [orderId]);
    await pool.end();
  }
});

if (product === 'agent') test('AP human_active has durable idempotent takeover/release and never resumes AI', async () => {
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  let identity;
  try {
    identity = await owner();
    const content = { expectedRevision: 0, businessName: 'HTTP 코어 검수', introduction: '직접 작성한 소개', services: [], faqs: [] };
    assert.equal((await json('/v1/knowledge/draft', 'PUT', content, identity.cookie)).response.status, 200);
    assert.equal((await json('/v1/knowledge/releases', 'POST', { expectedRevision: 1 }, identity.cookie)).response.status, 201);
    const created = await json(`/v1/public/organizations/${identity.organizationId}/inquiries`, 'POST', {
      name: '합성 고객', phone: '01000000000', message: '직접 응대를 요청합니다', consent: true,
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    const path = `/v1/owner/inquiries/${created.data.id}`;
    const current = await json(path, 'GET', undefined, identity.cookie);
    const revision = current.data.revision;
    assert.ok(Number.isInteger(revision));
    const takeover = await json(`${path}/take-over`, 'POST', { expectedRevision: revision }, identity.cookie);
    assert.equal(takeover.response.status, 200, JSON.stringify(takeover.data));
    assert.equal(takeover.data.state, 'human_active');
    const replay = await json(`${path}/take-over`, 'POST', { expectedRevision: revision }, identity.cookie);
    assert.deepEqual(replay.data, takeover.data);
    const followup = await json(`/v1/inquiries/${created.data.id}/messages`, 'POST', { body: '추가 문의' },
      undefined, { authorization: `Bearer ${created.data.receiptKey}` });
    assert.equal(followup.response.status, 201, JSON.stringify(followup.data));
    assert.equal(followup.data.state, 'human_active');
    const pending = await json(path, 'GET', undefined, identity.cookie);
    const release = await json(`${path}/release`, 'POST', { expectedRevision: pending.data.revision }, identity.cookie);
    assert.equal(release.response.status, 200, JSON.stringify(release.data));
    assert.equal(release.data.state, 'needs_owner');
    const state = (await pool.query('select mode,automation_paused from ap.inquiries where id=$1', [created.data.id])).rows[0];
    assert.deepEqual(state, { mode: 'human', automation_paused: true });
    const events = (await pool.query(`select event_type from ap.inquiry_resolution_events where inquiry_id=$1
      and event_type in ('human_takeover','human_release') order by created_at`, [created.data.id])).rows;
    assert.deepEqual(events.map(row => row.event_type), ['human_takeover', 'human_release']);
  } finally { await cleanup(pool, identity); await pool.end(); }
});

if (product === 'field') test('Field asset deletion is acknowledged before storage deletion, then completes once', async () => {
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  let identity;
  try {
    identity = await owner();
    const site = await json('/v1/sites', 'POST', undefined, identity.cookie);
    assert.equal(site.response.status, 201, JSON.stringify(site.data));
    // Small synthetic PNG, no customer photograph.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVQokWNQcwsmCTGManAbDSW14Zo0AF8svwEYioYIAAAAAElFTkSuQmCC', 'base64');
    const uploaded = await fetch(`${api}/v1/sites/assets`, { method: 'POST', headers: {
      cookie: identity.cookie, origin: web, 'content-type': 'application/octet-stream',
    }, body: png, signal: AbortSignal.timeout(10_000) });
    const image = await uploaded.json();
    assert.equal(uploaded.status, 201, JSON.stringify(image));
    const stored = (await pool.query('select object_key from field.site_assets where id=$1', [image.id])).rows[0];
    const target = resolve(process.env.FIELD_MEDIA_DIRECTORY, stored.object_key);
    assert.ok((await readFile(target)).length > 0);
    const deleted = await json(`/v1/sites/assets/${image.id}`, 'DELETE', undefined, identity.cookie);
    assert.equal(deleted.response.status, 202, JSON.stringify(deleted.data));
    assert.deepEqual(deleted.data, { id: image.id, state: 'deleting' });
    assert.equal((await json(`/v1/sites/assets/${image.id}`, 'GET', undefined, identity.cookie)).response.status, 404);
    const { runSiteAssetDeletionOnce, createFieldSiteMediaStore } = await import('../../apps/field-api/dist/site-media.js');
    await runSiteAssetDeletionOnce({ pool, siteMedia: createFieldSiteMediaStore() });
    // The suite's retention worker may claim the same row first. Check the durable result.
    for (let attempt = 0; attempt < 50; attempt++) {
      if (!(await pool.query('select 1 from field.site_assets where id=$1', [image.id])).rowCount) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await assert.rejects(readFile(target), error => error.code === 'ENOENT');
    assert.equal((await pool.query('select 1 from field.site_assets where id=$1', [image.id])).rowCount, 0);
    await runSiteAssetDeletionOnce({ pool, siteMedia: createFieldSiteMediaStore() });
    assert.equal((await pool.query(`select count(*)::integer as count from field.outbox
      where aggregate_id=$1 and event_type='field.site.asset.deleted'`, [image.id])).rows[0].count, 1);
  } finally { await cleanup(pool, identity); await pool.end(); }
});

if (product === 'field') test('Field domain registration, TLS ask, health proof, host resolution and disconnect cross HTTP', async () => {
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  let identity;
  let domainId;
  const hostname = `spike-${randomBytes(8).toString('hex')}.example.com`;
  try {
    identity = await owner();
    const content = { expectedRevision: 0, businessName: 'HTTP 코어 검수', introduction: '직접 작성한 소개',
      region: '서울', openingHours: '예약 문의', contactPhone: '', defaultBookingMode: 'request',
      services: [{ id: randomUUID(), name: '상담', description: '승인된 서비스', bookingMode: 'request',
        durationMinutes: 30, priceAmount: null }] };
    assert.equal((await json('/v1/business/draft', 'PUT', content, identity.cookie)).response.status, 200);
    assert.equal((await json('/v1/catalog/releases', 'POST', { expectedRevision: 1 }, identity.cookie)).response.status, 201);
    const site = await json('/v1/sites', 'POST', undefined, identity.cookie);
    assert.equal(site.response.status, 201, JSON.stringify(site.data));
    const draft = { expectedRevision: 0, template: 'essential', palette: '#264653', pages: [
      { id: randomUUID(), slug: 'home', title: '홈', sections: [
        { id: randomUUID(), kind: 'hero', heading: 'HTTP 도메인 검수', body: '직접 작성한 문구' },
      ] },
    ] };
    assert.equal((await json('/v1/sites/draft', 'PUT', draft, identity.cookie)).response.status, 200);
    assert.equal((await json('/v1/sites/releases', 'POST', { expectedRevision: 1 }, identity.cookie)).response.status, 201);
    const key = randomUUID();
    const registered = await json('/v1/sites/domains', 'POST', { hostname, requestKey: key }, identity.cookie);
    assert.equal(registered.response.status, 201, JSON.stringify(registered.data));
    domainId = registered.data.id;
    assert.equal(registered.data.state, 'registered');
    assert.equal((await json(`/v1/public/site-hosts/allow?domain=${hostname}`)).response.status, 404);
    assert.equal((await healthFor(hostname)).status, 404);
    // Synthetic DNS/edge evidence only; this does not assert real DNS or ACME issuance.
    // Fence the unconfigured mock domain worker from replacing this fixture evidence.
    await pool.query(`update field.site_domains set hostname_claimed=true,state='tls_pending',
      ownership_state='verified',dns_state='verified',checked_at=now(),next_check_at='infinity',
      claim_token=null,lease_expires_at=null,generation=generation+1 where id=$1`, [registered.data.id]);
    const allowed = await json(`/v1/public/site-hosts/allow?domain=${hostname}`);
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.data));
    assert.deepEqual(allowed.data, { domain: hostname });
    assert.match(allowed.response.headers.get('cache-control'), /no-store/);
    const health = await healthFor(hostname);
    assert.equal(health.status, 200, JSON.stringify(health.data));
    const { siteHealthProof } = await import('../../apps/field-api/dist/custom-domain-edge-caddy.js');
    assert.deepEqual(health.data, { ok: true,
      proof: siteHealthProof(process.env.FIELD_AUTH_SECRET, hostname, identity.organizationId) });
    await pool.query(`update field.site_domains set state='connected',tls_state='ready',binding_state='ready',
      valid_until=now()+interval '1 hour',certificate_expires_at=now()+interval '1 day' where id=$1`, [registered.data.id]);
    const primary = await json(`/v1/sites/domains/${registered.data.id}/primary`, 'POST', {}, identity.cookie);
    assert.equal(primary.response.status, 200, JSON.stringify(primary.data));
    assert.equal(primary.data.origin, `https://${hostname}`);
    const resolved = await json(`/v1/public/site-hosts/${hostname}`);
    assert.equal(resolved.response.status, 200, JSON.stringify(resolved.data));
    assert.equal(resolved.data.slug, site.data.slug);
    const disconnect = await json(`/v1/sites/domains/${registered.data.id}/disconnect`, 'POST', {}, identity.cookie);
    assert.equal(disconnect.response.status, 200, JSON.stringify(disconnect.data));
    assert.equal((await json(`/v1/public/site-hosts/allow?domain=${hostname}`)).response.status, 404);
    assert.equal((await healthFor(hostname)).status, 404);
    assert.equal((await json(`/v1/public/site-hosts/${hostname}`)).response.status, 404);
  } finally {
    try {
      if (domainId && identity) {
        const stopped = await json(`/v1/sites/domains/${domainId}/disconnect`, 'POST', {}, identity.cookie);
        assert.equal(stopped.response.status, 200, JSON.stringify(stopped.data));
      }
    } finally {
      // Keep immutable domain identity/audit rows until the isolated DB is reclaimed.
      await pool.end();
    }
  }
});
