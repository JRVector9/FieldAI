import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
const user = (headers: IncomingHttpHeaders) =>
  typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null;

test('AP mock trial is explicit, once per organization, owner controlled and never a paid checkout', async () => {
  const db = await pool.connect();
  const previousProfile = process.env.AP_PROFILE;
  process.env.AP_PROFILE = 'mock';
  const owner = randomUUID(), viewer = randomUUID(), outsider = randomUUID(), org = randomUUID();
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined,
    { pool: db as unknown as Pool, resolveUserId: async headers => user(headers) });
  const call = (method: 'GET' | 'POST', path: string, actor?: string, body?: object, organization = org) =>
    app.inject({ method, url: path, headers: { ...(actor ? { 'x-test-user': actor } : {}),
      'x-organization-id': organization }, payload: body });
  try {
    await db.query('begin');
    for (const id of [owner, viewer, outsider])
      await db.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,false)',
        [id, id, `${id}@example.invalid`]);
    await db.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Trial Org']);
    await db.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'owner'),($1,$3,'viewer')",
      [org, owner, viewer]);
    assert.equal((await call('GET', '/v1/subscription', undefined)).statusCode, 401);
    assert.equal((await call('GET', '/v1/subscription', outsider)).statusCode, 404);
    assert.equal((await call('GET', '/v1/subscription', owner, undefined, randomUUID())).statusCode, 404);
    assert.equal((await call('POST', '/v1/subscription/trial', viewer,
      { consentVersion: 'mock-trial-v1', termsAccepted: true })).statusCode, 404);
    assert.equal((await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: false })).statusCode, 400);
    process.env.AP_PROFILE = 'sandbox';
    assert.equal((await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: true })).statusCode, 503);
    assert.equal((await db.query('select count(*)::int as n from ap.trial_subscriptions where organization_id=$1',
      [org])).rows[0].n, 0);
    process.env.AP_PROFILE = 'mock';
    const first = await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: true });
    assert.equal(first.statusCode, 201);
    const trial = first.json().trial;
    assert.equal(first.json().state, 'trialing');
    assert.equal(Date.parse(trial.endsAt) - Date.parse(trial.startedAt), 14 * 86_400_000);
    const retry = await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: true });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().trial.id, trial.id);
    assert.equal((await call('GET', '/v1/subscription', viewer)).json().state, 'trialing');
    assert.equal((await call('POST', '/v1/subscription/cancel', viewer)).statusCode, 404);
    const cancelled = await call('POST', '/v1/subscription/cancel', owner);
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.json().state, 'trialing');
    assert.ok(cancelled.json().trial.cancelRequestedAt);
    assert.equal((await call('POST', '/v1/subscription/cancel', owner)).json().trial.cancelRequestedAt,
      cancelled.json().trial.cancelRequestedAt);
    assert.equal((await call('POST', '/v1/subscription/checkout', owner)).statusCode, 503);
    assert.equal((await db.query('select count(*)::int as n from ap.trial_subscriptions where organization_id=$1',
      [org])).rows[0].n, 1);
    await db.query("update ap.trial_subscriptions set started_at=now()-interval '16 days', ends_at=now()-interval '2 days' where organization_id=$1", [org]);
    assert.equal((await call('GET', '/v1/subscription', owner)).json().state, 'trial_ended');
    assert.equal((await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: true })).json().state, 'trial_ended');
    process.env.AP_PROFILE = 'sandbox';
    assert.equal((await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: true })).statusCode, 503);
  } finally {
    await db.query('rollback');
    db.release();
    await app.close();
    if (previousProfile === undefined) delete process.env.AP_PROFILE;
    else process.env.AP_PROFILE = previousProfile;
    await pool.end();
  }
});

test('AP expired mock trial rejects new intake while preserving accepted inquiry and retry', async () => {
  const live = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const previousProfile = process.env.AP_PROFILE;
  process.env.AP_PROFILE = 'mock';
  const owner = randomUUID(), org = randomUUID();
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined,
    { pool: live, resolveUserId: async headers => user(headers), modelProvider: {
      model: 'test', generate: async () => { throw new Error('model must not be called'); },
    } });
  try {
    await live.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,false)',
      [owner, 'Trial owner', `${owner}@example.invalid`]);
    await live.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Trial Org']);
    await live.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
    const knowledgeId = randomUUID();
    await live.query(`insert into ap.knowledge_releases
      (id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by)
      values ($1,$2,1,1,'native',$3::jsonb,$4,$5)`,
    [knowledgeId, org, JSON.stringify({ businessName: 'Trial Org', introduction: '',
      services: [{ name: 'Consultation', description: 'Real service' }], faqs: [] }),
      '0'.repeat(64), owner]);
    await live.query(`insert into ap.agent_releases
      (id,organization_id,agent_id,revision,draft_revision,content,content_hash,
       knowledge_release_id,knowledge_revision,approved_by)
      values ($1,$2,$3,1,1,$4::jsonb,$5,$6,1,$7)`,
    [randomUUID(), org, randomUUID(), JSON.stringify({ name: 'Trial AI', tone: 'clear',
      guideScope: '', handoffText: 'Owner replies' }), '0'.repeat(64), knowledgeId, owner]);
    const ownerHeaders = { 'x-test-user': owner, 'x-organization-id': org };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/subscription/trial',
      headers: ownerHeaders, payload: { consentVersion: 'mock-trial-v1', termsAccepted: true } })).statusCode, 201);
    const inquiryUrl = `/v1/public/organizations/${org}/inquiries`;
    const receipt = randomBytes(32).toString('base64url');
    const headers = { 'idempotency-key': randomBytes(32).toString('base64url'), 'x-receipt-key': receipt };
    const payload = { name: 'Customer', phone: '01012345678', message: 'Before expiry', consent: true };
    const submitted = await app.inject({ method: 'POST', url: inquiryUrl, headers, payload });
    assert.equal(submitted.statusCode, 201, submitted.body);
    const inquiryId = submitted.json().id as string;
    const deployment = await app.inject({ method: 'POST', url: '/v1/deployments',
      headers: ownerHeaders, payload: { kind: 'link' } });
    assert.equal(deployment.statusCode, 201, deployment.body);
    const deploymentId = deployment.json().id as string;
    const publicId = deployment.json().publicId as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deploymentId}/activate`,
      headers: ownerHeaders })).statusCode, 200);
    const engagement = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(engagement.statusCode, 201, engagement.body);
    const sessionCookie = engagement.headers['set-cookie'] as string;
    const engagementId = engagement.json().id as string;
    const campaign = await app.inject({ method: 'POST', url: '/v1/campaigns', headers: ownerHeaders,
      payload: { name: 'Trial campaign', knowledgeReleaseId: knowledgeId, serviceIndex: 0 } });
    assert.equal(campaign.statusCode, 201, campaign.body);
    const campaignId = campaign.json().id as string;
    const campaignRelease = await app.inject({ method: 'POST',
      url: `/v1/campaigns/${campaignId}/releases`, headers: ownerHeaders,
      payload: { expectedRevision: 1, idempotencyKey: randomUUID(), confirmApprovedFacts: true } });
    assert.equal(campaignRelease.statusCode, 201, campaignRelease.body);
    const campaignReleaseId = campaignRelease.json().releaseId as string;
    await live.query("update ap.trial_subscriptions set started_at=now()-interval '16 days', ends_at=now()-interval '2 days' where organization_id=$1", [org]);
    assert.equal((await app.inject({ method: 'POST', url: inquiryUrl, headers, payload })).statusCode, 200);
    const denied = await app.inject({ method: 'POST', url: inquiryUrl,
      payload: { ...payload, message: 'After expiry' } });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().error, 'trial_ended');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/deployments',
      headers: ownerHeaders, payload: { kind: 'link' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/test',
      headers: ownerHeaders, payload: { question: 'What service is offered?' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/campaigns', headers: ownerHeaders,
      payload: { name: 'New campaign', knowledgeReleaseId: knowledgeId, serviceIndex: 0 } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/campaigns/${campaignId}/pause`,
      headers: ownerHeaders, payload: { expectedReleaseId: campaignReleaseId } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/campaigns/${campaignId}/resume`,
      headers: ownerHeaders, payload: { expectedReleaseId: campaignReleaseId } })).statusCode, 403);
    const deniedEngagement = await app.inject({ method: 'POST',
      url: `/v1/public/deployments/${publicId}/engagements` });
    assert.equal(deniedEngagement.statusCode, 403);
    assert.equal(deniedEngagement.json().error, 'trial_ended');
    const deniedHandoff = await app.inject({ method: 'POST',
      url: `/v1/conversations/${engagementId}/submissions`, headers: { cookie: sessionCookie },
      payload: { name: 'Customer', phone: '01022223333', message: 'New handoff', consent: true } });
    assert.equal(deniedHandoff.statusCode, 403, deniedHandoff.body);
    assert.equal(deniedHandoff.json().error, 'trial_ended');
    assert.equal((await app.inject({ method: 'GET', url: `/v1/engagements/${engagementId}`,
      headers: { cookie: sessionCookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: `/v1/inquiries/${inquiryId}`,
      headers: { authorization: `Bearer ${receipt}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${inquiryId}/replies`,
      headers: ownerHeaders, payload: { body: 'Existing work remains available' } })).statusCode, 201);
  } finally {
    await live.query('delete from ap.trial_subscriptions where organization_id=$1', [org]);
    await live.query('delete from ap.organizations where id=$1', [org]);
    await live.query('delete from "user" where id=$1', [owner]);
    await app.close();
    await live.end();
    if (previousProfile === undefined) delete process.env.AP_PROFILE;
    else process.env.AP_PROFILE = previousProfile;
  }
});
