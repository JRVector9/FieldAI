import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';

test('AP admin overview requires its own role and blocks non-mock access without MFA', async () => {
  const email = `ap-admin-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(18).toString('base64url')}A1!`;
  const signUp = await auth.handler(new Request(`${base}/api/auth/sign-up/email`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic AP operator' }),
  }));
  assert.equal(signUp.status, 200);
  const signIn = await auth.handler(new Request(`${base}/api/auth/sign-in/email`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password }),
  }));
  assert.equal(signIn.status, 200);
  const cookie = signIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    assert.equal((await app.inject({ url: '/v1/admin/overview' })).statusCode, 401);
    assert.equal((await app.inject({ url: '/v1/admin/overview', headers: { cookie } })).statusCode, 403);
    const actor = (await pool.query<{ id: string }>('select id from "user" where email = $1', [email])).rows[0]?.id;
    assert.ok(actor);
    const organizationId = randomUUID(), eventId = randomUUID();
    await pool.query('insert into ap.organizations(id, owner_user_id, name) values ($1,$2,$3)',
      [organizationId, actor, 'Synthetic admin incident']);
    await pool.query(`insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload, occurred_at)
      values ($1,$2,'synthetic.admin.pending','private-aggregate',$3,now() + interval '1 year')`,
      [eventId, organizationId, { customerPhone: 'PRIVATE_ADMIN_TEST_PHONE' }]);
    await pool.query(`insert into ap.platform_admin_memberships(user_id, role)
      values ((select id from "user" where email = $1), 'operator')`, [email]);
    const overview = await app.inject({ url: '/v1/admin/overview', headers: { cookie } });
    assert.equal(overview.statusCode, 200);
    const body = overview.json() as { product: string; role: string; counts: Record<string, string>;
      recentIncidents: Array<{ eventId: string; eventType: string; occurredAt: string; state: string }>;
      recentAdminAccesses: Array<{ actorUserId: string; resource: string; accessedAt: string }> };
    assert.equal(body.product, 'agent');
    assert.equal(body.role, 'operator');
    assert.deepEqual(Object.keys(body.counts).sort(), [
      'activeDeployments', 'activeTrials', 'adminReads', 'approvedAgentOrganizations',
      'blockedCustomerNotifications', 'cancelRequestedTrials', 'memberships',
      'openInquiries', 'organizations', 'pendingOutbox', 'publisherOrganizations',
      'verifiedOwnedEmbeds',
    ]);
    assert.ok(Object.values(body.counts).every(value => /^\d+$/.test(value)));
    assert.equal(body.counts.adminReads, '1');
    assert.equal(body.recentAdminAccesses[0]?.actorUserId, actor);
    assert.equal(body.recentAdminAccesses[0]?.resource, 'overview');
    assert.ok(body.recentIncidents.length <= 20);
    assert.equal(body.recentIncidents[0]?.eventId, eventId);
    assert.equal(body.recentIncidents[0]?.eventType, 'synthetic.admin.pending');
    assert.equal(body.recentIncidents[0]?.state, 'pending');
    assert.ok(body.recentIncidents[0]?.occurredAt);
    assert.ok(!overview.body.includes(email));
    assert.ok(!overview.body.includes('customerName'));
    assert.ok(!overview.body.includes('PRIVATE_ADMIN_TEST_PHONE'));
    assert.ok(!overview.body.includes('private-aggregate'));
    const audit = await pool.query<{ count: string }>(
      `select count(*)::text as count from ap.admin_access_audit where actor_user_id = $1 and resource = 'overview'`,
      [actor]);
    assert.equal(audit.rows[0]?.count, '1');
    process.env.AP_PROFILE = 'sandbox';
    assert.deepEqual((await app.inject({ url: '/v1/admin/overview', headers: { cookie } })).json(),
      { error: 'mfa_required' });
    assert.equal((await pool.query<{ count: string }>(
      'select count(*)::text as count from ap.admin_access_audit where actor_user_id = $1',
      [actor])).rows[0]?.count, '1');
  } finally {
    process.env.AP_PROFILE = 'mock';
    await app.close();
    await pool.query('delete from ap.organizations where owner_user_id = (select id from "user" where email = $1)',
      [email]);
    await authPool.query('delete from "user" where email = $1', [email]);
  }
});
