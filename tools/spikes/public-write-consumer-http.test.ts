import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { Client, Pool } from 'pg';
import { ApPublicWriteClient, ApPublicWriteError } from '../../apps/field-api/src/ap-public-write-client.js';

const root = resolve(import.meta.dirname, '../..');
let app: Awaited<ReturnType<typeof setup>>['app'];
let pool: Pool;
let admin: Client;
let database = '';
let origin = '';
let organizationId = '', agentId = '', actor = '', session = '';
const scopes = ['ap.agent.read', 'ap.connections.create', 'ap.deployments.manage'];
async function setup() {
  process.loadEnvFile(resolve(root, 'infra/agent/.env'));
  const source = new URL(process.env.AP_DATABASE_URL!);
  assert.equal(source.hostname, '127.0.0.1'); assert.equal(source.port, '55431');
  assert.equal(source.username, 'agent_local'); assert.equal(source.pathname, '/fieldai_agent_mock');
  database = 'fieldai_agent_test_'+randomUUID().replaceAll('-', '');
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
  admin = new Client({ connectionString: adminUrl.toString() }); await admin.connect();
  await admin.query(`create database "${database}"`);
  source.pathname = '/'+database;
  process.env.AP_DATABASE_URL = source.toString(); process.env.AP_PROFILE = 'mock';
  for (const key of Object.keys(process.env)) if (key.startsWith('FIELD_')) delete process.env[key];
  const migrated = spawnSync(process.execPath, ['tools/run-migrations.mjs', 'agent'], { cwd: root, stdio: 'pipe', env: process.env });
  assert.equal(migrated.status, 0, migrated.stderr.toString());
  pool = new Pool({ connectionString: source.toString() });
  const { createAgentApp } = await import('../../apps/agent-api/src/app.js');
  const runtime = { pool, resolveUserId: async (h: Record<string, unknown>) => typeof h['x-test-actor'] === 'string'
    ? h['x-test-actor'] : null, verifyDomain: async () => true };
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, runtime);
  origin = await app.listen({ host: '127.0.0.1', port: 0 });
  actor = randomUUID(); session = randomUUID();
  await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'consumer owner\',$2,true)',
    [actor, actor+'@example.invalid']);
  await pool.query(`insert into "session"(id,"userId",token,"expiresAt","updatedAt")
    values($1,$2,$3,now()+interval '1 day',now())`, [session, actor, randomUUID()]);
  const headers = { 'x-test-actor': actor };
  const org = await app.inject({ method: 'POST', url: '/v1/organizations', headers, payload: { name: 'consumer own AP organization' } });
  assert.equal(org.statusCode, 201, org.body); organizationId = org.json().id as string;
  assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers,
    payload: { expectedRevision: 0, businessName: '승인 사업장', introduction: '승인 정보', services: [], faqs: [] } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers, payload: { expectedRevision: 1 } })).statusCode, 201);
  const draft = await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers,
    payload: { expectedRevision: 0, name: '소비자 검사 AI', tone: 'clear', guideScope: '승인 안내', handoffText: '사업자에게 문의하세요.' } });
  assert.equal(draft.statusCode, 200, draft.body); agentId = draft.json().agentId as string;
  assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers,
    payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
  return { app };
}
before(async () => { app = (await setup()).app; });
after(async () => {
  if (app) await app.close(); if (pool) await pool.end();
  if (admin) {
    if (/^fieldai_agent_test_[a-f0-9]{32}$/.test(database)) {
      // Pool.end() may finish before PostgreSQL processes its socket Terminate.
      // Observe all own backends gone; do not FORCE-kill closing clients.
      let remaining = 0;
      for (let i = 0; i < 50; i++) {
        remaining = (await admin.query('select count(*)::int n from pg_stat_activity where datname=$1', [database])).rows[0].n as number;
        if (!remaining) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(remaining, 0, 'own test database still has active clients after app/pool close');
      await admin.query(`drop database "${database}"`);
    }
    await admin.end();
  }
});
async function grant(label: string, allowed = scopes) {
  const clientId = randomUUID(), selectionId = randomUUID(), token = randomBytes(32).toString('base64url');
  await pool.query(`insert into "oauthClient"(id,"clientId",name,"clientSecret",scopes,"redirectUris","applicationType")
    values($1,$1,$2,'synthetic-only',$3,'["https://external.example.test/callback"]','web')`, [clientId, label, JSON.stringify(allowed)]);
  await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,
    requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')`,
    [selectionId, session, actor, clientId, organizationId, agentId, allowed]);
  const resources = JSON.stringify([new URL('/integrations/v1', process.env.AP_AUTH_BASE_URL).toString()]);
  await pool.query(`insert into "oauthConsent"(id,"clientId","userId","referenceId",resources,scopes,"createdAt","updatedAt")
    values($1,$2,$3,$4,$5,$6,now(),now())`, [randomUUID(), clientId, actor, selectionId, resources, JSON.stringify(allowed)]);
  await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId",resources,scopes,"expiresAt","createdAt")
    values($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes',now())`,
    [randomUUID(), createHash('sha256').update(token).digest('base64url'), clientId, actor, selectionId, resources, JSON.stringify(allowed)]);
  return { token, selectionId };
}

test('Field HTTP consumer and ordinary external client receive equal installation rights and scope denials from actual isolated AP', async () => {
  const field = await grant('Field BFF'), external = await grant('Ordinary external BFF');
  const common = { externalOrganizationId: randomUUID(), origin: 'https://owned.example.test' };
  let corruptFirstCommittedReply = true;
  const consumer = new ApPublicWriteClient({ apiOrigin: origin, accessToken: field.token, organizationId, agentId, mock: true,
    fetcher: (async (url, init) => {
      const response = await fetch(url, init);
      if (corruptFirstCommittedReply && String(url).endsWith('/connections')) {
        corruptFirstCommittedReply = false;
        const result = await response.json() as Record<string, unknown>;
        delete result.operation_id;
        return new Response(JSON.stringify(result), { status: response.status });
      }
      return response;
    }) as typeof fetch });
  const connectionKey = randomUUID();
  await assert.rejects(consumer.createConnection(common, connectionKey),
    (e: unknown) => e instanceof ApPublicWriteError && e.code === 'ap_public_write_result_unknown' && e.retryable);
  const fconn = await consumer.createConnection(common, connectionKey);
  assert.equal((await pool.query('select count(*)::int n from ap.public_installation_connections where selection_id=$1',
    [field.selectionId])).rows[0].n, 1);
  const raw = await fetch(origin+'/integrations/v1/connections', { method: 'POST',
    headers: { authorization: 'Bearer '+external.token, 'content-type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ organizationId, agentId, ...common }) });
  assert.equal(raw.status, 201); const econn = await raw.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(fconn).sort(), Object.keys(econn).sort());
  assert.equal(fconn.state, econn.state); assert.equal(fconn.state, 'installation_only');
  let dep = await consumer.prepareDeployment(fconn, randomUUID());
  assert.equal(dep.state, 'pending');
  dep = await consumer.updateDeployment('verify', dep, randomUUID());
  dep = await consumer.updateDeployment('activate', dep, randomUUID());
  assert.equal(dep.state, 'active');
  const ef = new ApPublicWriteClient({ apiOrigin: origin, accessToken: external.token, organizationId, agentId, mock: true });
  await assert.rejects(ef.getDeployment(dep), (e: unknown) => e instanceof ApPublicWriteError && e.status === 404);
  const noScope = await grant('Field no management scope', ['ap.agent.read']);
  const limited = new ApPublicWriteClient({ apiOrigin: origin, accessToken: noScope.token, organizationId, agentId, mock: true });
  await assert.rejects(limited.createConnection(common, randomUUID()), (e: unknown) => e instanceof ApPublicWriteError && e.status === 403);
  const denied = await fetch(origin+'/integrations/v1/connections', { method: 'POST',
    headers: { authorization: 'Bearer '+noScope.token, 'content-type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ organizationId, agentId, ...common }) });
  assert.equal(denied.status, 403);
  await pool.query('update ap.oauth_selections set revoked_at=now() where id=$1', [field.selectionId]);
  await assert.rejects(consumer.getDeployment(dep), (e: unknown) => e instanceof ApPublicWriteError && e.status === 401);
  assert.equal((await pool.query('select status from ap.deployments where id=$1', [dep.id])).rows[0].status, 'paused');
});
