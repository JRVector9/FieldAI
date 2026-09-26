import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
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
const run = promisify(execFile), web = 'http://localhost:3001';

test('AP report, approved operator review and owner appeal run through separate native browser sessions', async () => {
  const accounts = Array.from({ length: 3 }, () => ({ email: `agent-moderation-${randomUUID()}@example.invalid`,
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
    for (const account of accounts) await call('/api/auth/sign-up/email', { ...account, name: 'Synthetic AP moderation browser' });
    const signed = await call('/api/auth/sign-in/email', accounts[0]);
    const cookie = signed.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    organizationId = (await call('/v1/organizations', { name: 'AP 신고·이의 검수 사업체' }, cookie)).data.id;
    await call('/v1/knowledge/draft', { expectedRevision: 0, businessName: 'AP 신고·이의 검수 사업체', introduction: 'AP 승인 소개',
      region: '서울', openingHours: '평일', services: [{ name: '신고 당시 AP 승인 서비스', description: 'AP 승인 서비스 문구' }],
      faqs: [{ question: '신고 당시 AP 질문', answer: '신고 당시 AP 승인 답변' }] }, cookie, 'PUT');
    await call('/v1/knowledge/releases', { expectedRevision: 1 }, cookie);
    await call('/v1/agents/draft', { expectedRevision: 0, expectedKnowledgeRevision: 1, name: '사업 AI', tone: 'clear',
      guideScope: 'PRIVATE_AP_BROWSER_INSTRUCTION', handoffText: '담당자에게 문의하세요.' }, cookie, 'PUT');
    await call('/v1/agents/releases', { expectedRevision: 1, expectedKnowledgeRevision: 1 }, cookie);
    const deployments = [];
    for (let index = 0; index < 2; index++) {
      const deployment = (await call('/v1/deployments', { kind: 'link' }, cookie)).data;
      await call(`/v1/deployments/${deployment.id}/activate`, undefined, cookie);
      deployments.push(deployment);
    }
    await pool.query(`insert into ap.platform_admin_memberships(user_id,role)
      select id,'operator' from "user" where email=any($1::text[])`, [accounts.slice(1).map(item => item.email)]);
    const { stdout, stderr } = await run(process.env.AP_BROWSER_PYTHON ?? '/tmp/fieldai-ui-venv/bin/python',
      ['tools/spikes/agent-moderation-browser.py'], { cwd: process.cwd(), timeout: 120000,
        env: { ...process.env, AP_MODERATION_ACCOUNTS: JSON.stringify(accounts), AP_MODERATION_DEPLOYMENTS: JSON.stringify(deployments) } });
    assert.match(stdout, /AP report and scoped review appeal: passed/, stderr);
    assert.deepEqual((await pool.query('select state,revision from ap.moderation_reports where organization_id=$1', [organizationId])).rows,
      [{ state: 'closed', revision: 4 }]);
    const notices = (await pool.query(`select n.inquiry_id,n.moderation_report_id,n.channel,n.state,r.read_at
      from ap.notification_events n join ap.outbox o on o.id=n.outbox_id
      left join ap.notification_reads r on r.notification_id=n.id
      where n.organization_id=$1 and o.event_type like 'ap.moderation.%'`, [organizationId])).rows;
    assert.equal(notices.length, 2);
    assert.ok(notices.every(row => row.inquiry_id === null && row.moderation_report_id && row.channel === 'in_app' && row.state === 'available'));
    assert.equal(notices.filter(row => row.read_at !== null).length, 1);
  } finally {
    if (organizationId) await pool.query('delete from ap.organizations where id=$1', [organizationId]);
    await pool.query('delete from "user" where email=any($1::text[])', [accounts.map(item => item.email)]);
    await pool.end();
  }
});
