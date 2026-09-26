import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });

test('Field admin overview requires its own role and blocks non-mock access without MFA', async () => {
  const db = await pool.connect();
  const previousProfile = process.env.FIELD_PROFILE;
  const userId = randomUUID();
  process.env.FIELD_PROFILE = 'mock';
  const app = createFieldApp(async () => undefined, undefined, undefined,
    { pool: db as unknown as Pool, resolveUserId: async headers =>
      typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null });
  try {
    await db.query('begin');
    await db.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,false)',
      [userId, 'Synthetic Field operator', `${userId}@example.invalid`]);
    const call = () => app.inject({ url: '/v1/admin/overview', headers: { 'x-test-user': userId } });
    assert.equal((await app.inject({ url: '/v1/admin/overview' })).statusCode, 401);
    assert.equal((await call()).statusCode, 403);
    const organizationId = randomUUID(), eventId = randomUUID();
    await db.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)',
      [organizationId, userId, 'Synthetic Field admin incident']);
    await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload,occurred_at)
      values ($1,$2,'synthetic.admin.pending','private-aggregate',$3,now() + interval '1 year')`,
      [eventId, organizationId, { customerPhone: 'PRIVATE_ADMIN_TEST_PHONE' }]);
    await db.query(`insert into field.platform_admin_memberships(user_id, role) values ($1, 'operator')`, [userId]);
    const overview = await call();
    assert.equal(overview.statusCode, 200);
    const body = overview.json() as { product: string; role: string; counts: Record<string, string>;
      recentIncidents: Array<{ eventId: string; eventType: string; occurredAt: string; state: string }>;
      recentAdminAccesses: Array<{ actorUserId: string; resource: string; accessedAt: string }> };
    assert.equal(body.product, 'field');
    assert.equal(body.role, 'operator');
    assert.deepEqual(Object.keys(body.counts).sort(), [
      'activeTrials', 'adminReads', 'blockedCustomerNotifications', 'cancelRequestedTrials',
      'failedSiteJobs', 'memberships', 'openInquiries', 'openReservations', 'organizations',
      'pendingOutbox', 'publishedSites', 'runningSiteJobs',
    ]);
    assert.ok(Object.values(body.counts).every(value => /^\d+$/.test(value)));
    assert.equal(body.counts.adminReads, '1');
    assert.equal(body.recentAdminAccesses[0]?.actorUserId, userId);
    assert.equal(body.recentAdminAccesses[0]?.resource, 'overview');
    assert.ok(body.recentIncidents.length <= 20);
    assert.equal(body.recentIncidents[0]?.eventId, eventId);
    assert.equal(body.recentIncidents[0]?.eventType, 'synthetic.admin.pending');
    assert.equal(body.recentIncidents[0]?.state, 'pending');
    assert.ok(body.recentIncidents[0]?.occurredAt);
    assert.ok(!overview.body.includes(`${userId}@example.invalid`));
    assert.ok(!overview.body.includes('customerPhone'));
    assert.ok(!overview.body.includes('PRIVATE_ADMIN_TEST_PHONE'));
    assert.ok(!overview.body.includes('private-aggregate'));
    assert.equal((await db.query<{ count: string }>(
      `select count(*)::text as count from field.admin_access_audit where actor_user_id=$1 and resource='overview'`,
      [userId])).rows[0]?.count, '1');
    process.env.FIELD_PROFILE = 'sandbox';
    assert.deepEqual((await call()).json(), { error: 'blocked_integration' });
    assert.equal((await db.query<{ count: string }>(
      'select count(*)::text as count from field.admin_access_audit where actor_user_id=$1',
      [userId])).rows[0]?.count, '1');
  } finally {
    process.env.FIELD_PROFILE = previousProfile;
    await db.query('rollback');
    await app.close();
    db.release();
    await pool.end();
  }
});
