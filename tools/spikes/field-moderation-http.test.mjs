import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
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
test('Field public report, approved operator review and owner appeal run through separate browser sessions', async () => {
  const accounts = Array.from({ length: 3 }, () => ({ email: `field-moderation-${randomUUID()}@example.invalid`,
    password: `${randomBytes(18).toString('base64url')}A1!` }));
  const pool = new pg.Pool({ connectionString: database.toString() });
  const call = async (path, body, cookie, method = 'POST') => {
    const response = await fetch(web + path, { method, headers: { origin: web,
      ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
    return { response, data: await response.json() };
  };
  let organizationId;
  try {
    for (const account of accounts) await call('/api/auth/sign-up/email', { ...account, name: 'Synthetic moderation browser' });
    const signed = await call('/api/auth/sign-in/email', accounts[0]);
    const cookie = signed.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    organizationId = (await call('/v1/organizations', { name: '신고·이의 검수 사업체' }, cookie)).data.id;
    await call('/v1/business/draft', { expectedRevision: 0, businessName: '신고·이의 검수 사업체', introduction: '공개 소개',
      region: '서울', openingHours: '평일', contactPhone: '', services: [{ id: randomUUID(), name: '신고 당시 승인 서비스',
        description: '승인 서비스 설명', bookingMode: 'request', durationMinutes: 30, priceAmount: 50000 }],
      faqs: [{ question: '신고 당시 승인 질문', answer: '신고 당시 승인 답변' }] }, cookie, 'PUT');
    await call('/v1/catalog/releases', { expectedRevision: 1 }, cookie);
    await call('/v1/sites', {}, cookie);
    const site = (await call('/v1/sites/draft', undefined, cookie, 'GET')).data;
    site.pages[0].sections[0].body = '신고 당시 사이트 본문 검토 문구';
    await call('/v1/sites/draft', { ...site, expectedRevision: 0 }, cookie, 'PUT');
    const release = (await call('/v1/sites/releases', { expectedRevision: 1 }, cookie)).data;
    await pool.query(`insert into field.platform_admin_memberships(user_id,role)
      select id,'operator' from "user" where email=any($1::text[])`, [accounts.slice(1).map(item => item.email)]);
    const { stdout, stderr } = await run(process.env.FIELD_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      ['tools/spikes/field-moderation-browser.py'], { cwd: process.cwd(), timeout: 120000,
        env: { ...process.env, FIELD_MODERATION_ACCOUNTS: JSON.stringify(accounts), FIELD_MODERATION_SLUG: release.slug } });
    assert.match(stdout, /Field report and scoped review appeal: passed/, stderr);
    const reports = (await pool.query('select state,revision from field.moderation_reports where organization_id=$1', [organizationId])).rows;
    assert.deepEqual(reports, [{ state: 'closed', revision: 4 }]);
    const notices = (await pool.query(`select n.channel,n.state,r.read_at from field.notification_events n
      join field.outbox o on o.id=n.outbox_id left join field.notification_reads r on r.notification_id=n.id
      where n.organization_id=$1 and o.event_type like 'field.moderation.%'`, [organizationId])).rows;
    assert.equal(notices.length, 2);
    assert.ok(notices.every(row => row.channel === 'in_app' && row.state === 'available'));
    assert.equal(notices.filter(row => row.read_at !== null).length, 1);
  } finally {
    if (organizationId) {
      await pool.query(`delete from field.site_releases r using field.sites s where r.site_id=s.id and s.organization_id=$1`, [organizationId]);
      await pool.query('delete from field.organizations where id=$1', [organizationId]);
    }
    await pool.query('delete from "user" where email=any($1::text[])', [accounts.map(item => item.email)]);
    await pool.end();
  }
});
