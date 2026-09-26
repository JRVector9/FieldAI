import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { FieldSiteQueue } from '../src/site-queue.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4321';

async function worker(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--import', resolve('test/worker-fetch.fixture.mjs'), resolve('dist/worker.js')], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test', FIELD_PROFILE: 'mock',
      FIELD_DATABASE_URL: process.env.FIELD_DATABASE_URL,
      FIELD_VALKEY_URL: process.env.FIELD_VALKEY_URL,
      FIELD_OPENAI_API_KEY: 'synthetic-field-key',
      FIELD_OPENAI_MODEL: 'synthetic-field-layout',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr += String(chunk); });
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`worker_start_timeout ${stderr}`)), 5000);
    child.stdout?.on('data', chunk => {
      stdout += String(chunk);
      if (stdout.includes('field site generation worker ready')) { clearTimeout(timer); resolveReady(); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`worker_exited_${code} ${stderr}`)); });
  });
  return child;
}
async function stop(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

test('separate Field worker resumes queued work and leaves a lost running result unknown', async () => {
  const email = `field-worker-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  const cookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const queue = new FieldSiteQueue(process.env.FIELD_VALKEY_URL!);
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool, siteQueue: queue,
    siteGenerator: { model: 'synthetic-field-layout', generate: async () => { throw new Error('API must not call model'); } },
    resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  let child: ChildProcess | null = null;
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie }, payload: { name: 'Worker 검수 상호' } })).statusCode, 201);
    const catalog = { expectedRevision: 0, businessName: 'Worker 검수 상호', introduction: '사업자 입력 소개', region: '서울', openingHours: '평일', contactPhone: '010-1234-5678', services: [{ id: randomUUID(), name: '방문 상담', description: '직접 상담', bookingMode: 'request', durationMinutes: 30, priceAmount: 10000 }] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie }, payload: catalog })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites', headers: { cookie } })).statusCode, 201);
    const created = await app.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '따뜻한 사이트', expectedRevision: 0 } });
    assert.equal(created.statusCode, 202);
    assert.equal((await app.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job.status, 'queued');
    child = await worker();
    let proposed = false;
    for (let i = 0; i < 50; i += 1) {
      const job = (await app.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job;
      if (job.status === 'proposed') { proposed = true; assert.equal(job.inputTokens, 20); break; }
      await delay(100);
    }
    assert.equal(proposed, true);
    assert.equal((await app.inject({ url: '/v1/sites/draft', headers: { cookie } })).json().revision, 0);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/sites/generation-jobs/${created.json().id}/apply`, headers: { cookie } })).json().revision, 1);
    await stop(child); child = null;
    const lost = await app.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '중단된 실행', expectedRevision: 1 } });
    assert.equal(lost.statusCode, 202);
    await pool.query(`update field.site_generation_jobs set status = 'running', started_at = now() - interval '2 minutes' where id = $1`, [lost.json().id]);
    child = await worker();
    const failed = (await app.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job;
    assert.equal(failed.status, 'failed');
    assert.equal(failed.errorCode, 'result_unknown_after_restart');
    assert.equal(failed.inputTokens, null);
    assert.equal((await app.inject({ url: '/v1/sites/draft', headers: { cookie } })).json().revision, 1);
  } finally {
    await stop(child);
    queue.close();
    await app.close();
    await pool.query('DELETE FROM field.sites WHERE organization_id = (SELECT o.id FROM field.organizations o JOIN "user" u ON u.id = o.owner_user_id WHERE u.email = $1)', [email]);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [email]);
    await authPool.query('DELETE FROM "user" WHERE email = $1', [email]);
  }
});
