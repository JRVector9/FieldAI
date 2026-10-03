import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { get } from 'node:http';
import { test } from 'node:test';
import { promisify } from 'node:util';
import pg from 'pg';

const web = 'http://127.0.0.1:3002';
const run = promisify(execFile);

async function request(path, method = 'GET', body, cookie, host) {
  const response = await fetch(`${host ? `http://${host}` : web}${path}`, { method, redirect: 'manual', headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(cookie ? { cookie } : {}),
    ...(method === 'GET' ? {} : { origin: web }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, data: await response.clone().json().catch(() => ({})) };
}

test('Field tenant origin serves only its approved site and public intake while platform routes stay on the platform origin', async () => {
  const pool = new pg.Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const accounts = [];
  try {
    for (const label of ['A', 'B']) {
      const email = `field-tenant-host-${randomUUID()}@example.invalid`;
      const password = `${randomBytes(24).toString('base64url')}A1!`;
      accounts.push(email);
      const signup = await request('/api/auth/sign-up/email', 'POST', { email, password, name: `Tenant ${label}` });
      assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
      const login = await request('/api/auth/sign-in/email', 'POST', { email, password });
      assert.equal(login.response.status, 200, JSON.stringify(login.data));
      const cookie = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const org = await request('/v1/organizations', 'POST', { name: `Tenant ${label} 검수` }, cookie);
      assert.equal(org.response.status, 201, JSON.stringify(org.data));
      const serviceId = randomUUID();
      const catalog = { expectedRevision: 0, businessName: `Tenant ${label} 검수`, introduction: '직접 작성한 소개',
        region: '서울', openingHours: '예약 문의', contactPhone: '', defaultBookingMode: 'request',
        services: [{ id: serviceId, name: '방문 상담', description: '확인된 서비스',
          bookingMode: 'request', durationMinutes: 30, priceAmount: null }] };
      assert.equal((await request('/v1/business/draft', 'PUT', catalog, cookie)).response.status, 200);
      assert.equal((await request('/v1/catalog/releases', 'POST', { expectedRevision: 1 }, cookie)).response.status, 201);
      const site = await request('/v1/sites', 'POST', undefined, cookie);
      assert.equal(site.response.status, 201, JSON.stringify(site.data));
      const draft = { expectedRevision: 0, template: 'essential', palette: '#264653', pages: [
        { id: randomUUID(), slug: 'home', title: '홈', sections: [
          { id: randomUUID(), kind: 'hero', heading: `Tenant ${label} 소개`, body: '직접 작성한 문구' },
        ] },
        { id: randomUUID(), slug: 'services', title: '서비스 안내', sections: [
          { id: randomUUID(), kind: 'text', heading: `Tenant ${label} 전용 서비스`, body: '승인된 페이지' },
        ] },
      ] };
      assert.equal((await request('/v1/sites/draft', 'PUT', draft, cookie)).response.status, 200);
      assert.equal((await request('/v1/sites/releases', 'POST', { expectedRevision: 1 }, cookie)).response.status, 201);
      if (label === 'A') {
        const nextDraft = { ...draft, expectedRevision: 1, pages: [...draft.pages,
          { id: randomUUID(), slug: 'unpublished', title: '미승인 페이지', sections: [
            { id: randomUUID(), kind: 'text', heading: '초안 전용', body: '공개 전 문구' },
          ] }] };
        assert.equal((await request('/v1/sites/draft', 'PUT', nextDraft, cookie)).response.status, 200);
      }
      accounts[accounts.length - 1] = { email, password, organizationId: org.data.id, slug: site.data.slug };
    }
    const [a, b] = accounts;
    const tenantHost = `${a.slug}.localhost:3002`;
    assert.equal((await request(`/site/${a.slug}`, 'GET', undefined, undefined, tenantHost)).response.status, 200);
    assert.equal((await request(`/site/${a.slug}/services`, 'GET', undefined, undefined, tenantHost)).response.status, 200);
    const homeHtml = await (await request(`/site/${a.slug}`, 'GET', undefined, undefined, tenantHost)).response.text();
    assert.match(homeHtml, /<title>홈 \| Tenant A 검수<\/title>/);
    assert.match(homeHtml, /<meta name="description" content="직접 작성한 문구"/);
    assert.match(homeHtml, new RegExp(`<link rel="canonical" href="http://${tenantHost}/site/${a.slug}"`));
    const servicesHtml = await (await request(`/site/${a.slug}/services`, 'GET', undefined, undefined, tenantHost)).response.text();
    assert.match(servicesHtml, /<title>서비스 안내 \| Tenant A 검수<\/title>/);
    assert.match(servicesHtml, /<meta name="description" content="승인된 페이지"/);
    assert.match(servicesHtml, new RegExp(`<link rel="canonical" href="http://${tenantHost}/site/${a.slug}/services"`));
    assert.equal((await request(`/site/${a.slug}/missing`, 'GET', undefined, undefined, tenantHost)).response.status, 404);
    assert.equal((await request(`/site/${a.slug}/unpublished`, 'GET', undefined, undefined, tenantHost)).response.status, 404);
    assert.equal((await request(`/public/${a.organizationId}`, 'GET', undefined, undefined, tenantHost)).response.status, 200);
    assert.equal((await request(`/site/${b.slug}`, 'GET', undefined, undefined, tenantHost)).response.status, 404);
    assert.equal((await request(`/site/${b.slug}/services`, 'GET', undefined, undefined, tenantHost)).response.status, 404);
    assert.equal((await request(`/public/${b.organizationId}`, 'GET', undefined, undefined, tenantHost)).response.status, 404);
    assert.equal((await request('/workspace', 'GET', undefined, undefined, tenantHost)).response.status, 404);
    // 2026-10-02: 기본 사이트 주소 루트는 사업자에게 안내되는 주소이므로 /site/<slug>로 연결되어 홈을 보여준다(이전 404는 결함).
    const rootResponse = (await request('/', 'GET', undefined, undefined, tenantHost)).response;
    assert.equal(rootResponse.status, 200);
    assert.match(await rootResponse.text(), /<title>홈 \| Tenant A 검수<\/title>/);
    assert.equal((await request('/services', 'GET', undefined, undefined, tenantHost)).response.status, 200);
    assert.equal((await request('/', 'GET', undefined, undefined, 'field-000000000000.localhost:3002')).response.status, 404);
    assert.equal((await request(`/inquiry/${randomUUID()}`, 'GET', undefined, undefined, tenantHost)).response.status, 200);
    assert.equal((await request(`/public/${b.organizationId}`)).response.status, 200);
    assert.equal((await request(`/site/${a.slug}/services`)).response.status, 200);
    const platformHtml = await (await request(`/site/${a.slug}/services`)).response.text();
    assert.match(platformHtml, new RegExp(`<link rel="canonical" href="http://${tenantHost}/site/${a.slug}/services"`));
    assert.equal((await request(`/site/${a.slug}/unpublished`)).response.status, 404);
    assert.equal((await request('/workspace')).response.status, 200);
    const workspaceHtml = await (await request('/workspace')).response.text();
    assert.match(workspaceHtml, /<meta name="robots" content="[^"]*noindex/);
    const previewHtml = await (await request('/preview/owner/editor')).response.text();
    assert.match(previewHtml, /<meta name="robots" content="[^"]*noindex/);
    const proof = randomBytes(24).toString('base64url');
    const ownerCookie = await request('/api/auth/sign-in/email', 'POST', {
      email: a.email, password: a.password,
    });
    assert.equal(ownerCookie.response.status, 200);
    const cookie = ownerCookie.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.equal((await request('/v1/sites/verification', 'POST', { proof }, cookie)).response.status, 201);
    const wellKnown = await request('/.well-known/ap-site-verification', 'GET', undefined, undefined, tenantHost);
    assert.equal(wellKnown.response.status, 200);
    assert.equal(await wellKnown.response.text(), `ap-site-verification=${proof}`);
    const { stdout, stderr } = await run(process.env.FIELD_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      ['tools/spikes/field-tenant-host-browser.py'], { cwd: process.cwd(), timeout: 60000,
        env: { ...process.env, FIELD_TEST_TENANT_HOST: tenantHost,
          FIELD_TEST_TENANT_SLUG: a.slug, FIELD_TEST_TENANT_ORGANIZATION_ID: a.organizationId,
          FIELD_TEST_OTHER_ORGANIZATION_ID: b.organizationId } });
    assert.match(stdout, /Field tenant host browser: passed/, stderr);
  } finally {
    try {
      for (const item of accounts) {
        const email = typeof item === 'string' ? item : item.email;
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query(`delete from field.site_releases sr using field.sites s,
            field.organizations o, "user" u where sr.site_id = s.id
            and s.organization_id = o.id and o.owner_user_id = u.id and u.email = $1`, [email]);
          await client.query(`delete from field.organizations where owner_user_id =
            (select id from "user" where email = $1)`, [email]);
          await client.query('delete from "user" where email = $1', [email]);
          await client.query('commit');
        } catch (error) {
          await client.query('rollback');
          throw error;
        } finally { client.release(); }
      }
    } finally { await pool.end(); }
  }
});

// edge(Caddy) on-demand TLS ask와 사업자 도메인 TLS 확인 경로. 등록·검증되지 않은 도메인에는 발급 허용·증명값을 주지 않는다.
// Caddy는 두 경로를 Field API로 바로 보내므로 웹 프록시가 아니라 API(4321)에 Host를 지정해 요청한다.
function apiGet(path, host) {
  return new Promise((resolveGet, rejectGet) => {
    get({ host: '127.0.0.1', port: 4321, path, headers: host ? { host } : {} }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolveGet({ status: response.statusCode, headers: response.headers, body }));
    }).on('error', rejectGet);
  });
}

test('Field TLS ask and site-health refuse unknown custom domains without caching', async () => {
  const unknown = `unknown-${randomUUID()}.example.invalid`;
  const ask = await apiGet(`/v1/public/site-hosts/allow?domain=${encodeURIComponent(unknown)}`);
  assert.equal(ask.status, 404, ask.body);
  assert.equal(JSON.parse(ask.body).error, 'site_host_not_allowed');
  assert.equal(ask.headers['cache-control'], 'no-store');
  const empty = await apiGet('/v1/public/site-hosts/allow');
  assert.equal(empty.status, 404, empty.body);
  const health = await apiGet('/.well-known/field-site-health', unknown);
  assert.equal(health.status, 404, health.body);
  assert.equal(JSON.parse(health.body).error, 'site_host_not_allowed');
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.doesNotMatch(health.body, /proof/);
});
