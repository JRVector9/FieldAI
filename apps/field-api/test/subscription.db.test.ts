import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
const user = (headers: IncomingHttpHeaders) =>
  typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null;

test('Field mock trial uses only Field identity, organization and ledger', async () => {
  const db = await pool.connect();
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const owner = randomUUID(), editor = randomUUID(), outsider = randomUUID(), org = randomUUID();
  const app = createFieldApp(async () => undefined, undefined, undefined,
    { pool: db as unknown as Pool, resolveUserId: async headers => user(headers) });
  const call = (method: 'GET' | 'POST', path: string, actor?: string, body?: object, organization = org) =>
    app.inject({ method, url: path, headers: { ...(actor ? { 'x-test-user': actor } : {}),
      'x-organization-id': organization }, payload: body });
  try {
    await db.query('begin');
    for (const id of [owner, editor, outsider])
      await db.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,false)',
        [id, id, `${id}@example.invalid`]);
    await db.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Trial Org']);
    await db.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner'),($1,$3,'editor')",
      [org, owner, editor]);
    assert.equal((await call('GET', '/v1/subscription', undefined)).statusCode, 401);
    assert.equal((await call('GET', '/v1/subscription', outsider)).statusCode, 404);
    assert.equal((await call('GET', '/v1/subscription', owner, undefined, randomUUID())).statusCode, 404);
    assert.equal((await call('POST', '/v1/subscription/trial', editor,
      { consentVersion: 'mock-trial-v1', termsAccepted: true })).statusCode, 404);
    assert.equal((await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: false })).statusCode, 400);
    process.env.FIELD_PROFILE = 'sandbox';
    assert.equal((await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: true })).statusCode, 503);
    assert.equal((await db.query('select count(*)::int as n from field.trial_subscriptions where organization_id=$1',
      [org])).rows[0].n, 0);
    process.env.FIELD_PROFILE = 'mock';
    const first = await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: true });
    assert.equal(first.statusCode, 201);
    const trial = first.json().trial;
    assert.equal(first.json().product, 'field');
    assert.equal(Date.parse(trial.endsAt) - Date.parse(trial.startedAt), 14 * 86_400_000);
    assert.equal((await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: true })).json().trial.id, trial.id);
    assert.equal((await call('GET', '/v1/subscription', editor)).json().state, 'trialing');
    assert.equal((await call('POST', '/v1/subscription/cancel', editor)).statusCode, 404);
    const cancelled = await call('POST', '/v1/subscription/cancel', owner);
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.json().state, 'trialing');
    assert.ok(cancelled.json().trial.cancelRequestedAt);
    assert.equal((await call('POST', '/v1/subscription/cancel', owner)).json().trial.cancelRequestedAt,
      cancelled.json().trial.cancelRequestedAt);
    assert.equal((await call('POST', '/v1/subscription/checkout', owner)).statusCode, 503);
    assert.equal((await db.query('select count(*)::int as n from field.trial_subscriptions where organization_id=$1',
      [org])).rows[0].n, 1);
    await db.query("update field.trial_subscriptions set started_at=now()-interval '16 days', ends_at=now()-interval '2 days' where organization_id=$1", [org]);
    assert.equal((await call('GET', '/v1/subscription', owner)).json().state, 'trial_ended');
    process.env.FIELD_PROFILE = 'sandbox';
    assert.equal((await call('POST', '/v1/subscription/trial', owner,
      { consentVersion: 'mock-trial-v1', termsAccepted: true })).statusCode, 503);
  } finally {
    await db.query('rollback');
    db.release();
    await app.close();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
    await pool.end();
  }
});

test('Field expired mock trial rejects new intake while preserving accepted inquiry and retry', async () => {
  const live = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const owner = randomUUID(), org = randomUUID(), serviceId = randomUUID();
  const app = createFieldApp(async () => undefined, undefined, undefined,
    { pool: live, resolveUserId: async headers => user(headers) });
  try {
    await live.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,false)',
      [owner, 'Trial owner', `${owner}@example.invalid`]);
    await live.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Trial Org']);
    await live.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
    await live.query(`insert into field.catalog_releases
      (id,organization_id,revision,content,content_hash,approved_by)
      values ($1,$2,1,$3::jsonb,$4,$5)`,
    [randomUUID(), org, JSON.stringify({ businessName: 'Trial Org', introduction: '',
      region: 'Seoul', openingHours: '', contactPhone: '', defaultBookingMode: 'request',
      services: [{ id: serviceId, name: 'Consultation', description: '',
        bookingMode: 'request', durationMinutes: 30, priceAmount: null }] }), '0'.repeat(64), owner]);
    const ownerHeaders = { 'x-test-user': owner, 'x-organization-id': org };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/subscription/trial',
      headers: ownerHeaders, payload: { consentVersion: 'mock-trial-v1', termsAccepted: true } })).statusCode, 201);
    const inquiryUrl = `/v1/public/catalog/${org}/inquiries`;
    const receipt = randomBytes(32).toString('base64url');
    const headers = { 'idempotency-key': randomBytes(32).toString('base64url'), 'x-receipt-key': receipt };
    const payload = { serviceId, name: 'Customer', phone: '01012345678',
      message: 'Before expiry', consent: true };
    const submitted = await app.inject({ method: 'POST', url: inquiryUrl, headers, payload });
    assert.equal(submitted.statusCode, 201, submitted.body);
    const inquiryId = submitted.json().id as string;
    const policy = { expectedRevision: 0, timezone: 'Asia/Seoul',
      weekly: { mon: { open: '10:00', close: '18:00' } },
      beforeMinutes: 0, afterMinutes: 0, minLeadMinutes: 0, horizonDays: 30 };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/booking-policy',
      headers: ownerHeaders, payload: policy })).statusCode, 200);
    const reservationUrl = `/v1/public/catalog/${org}/reservations`;
    const reservationReceipt = randomBytes(32).toString('base64url');
    const reservationHeaders = { 'idempotency-key': randomBytes(32).toString('base64url'),
      'x-receipt-key': reservationReceipt };
    const reservationPayload = { serviceId, preferredTimeText: 'Next week',
      name: 'Customer', phone: '01012345679', consent: true };
    const reservation = await app.inject({ method: 'POST', url: reservationUrl,
      headers: reservationHeaders, payload: reservationPayload });
    assert.equal(reservation.statusCode, 201, reservation.body);
    const reservationId = reservation.json().id as string;
    const localBeforeExpiry = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const daysToManualMonday = (8 - localBeforeExpiry.getUTCDay()) % 7 || 7;
    const manualMondayLocal = new Date(Date.UTC(localBeforeExpiry.getUTCFullYear(),
      localBeforeExpiry.getUTCMonth(), localBeforeExpiry.getUTCDate() + daysToManualMonday, 14));
    const manualPayload = { serviceId, name: 'Phone customer', phone: '01012345670',
      startAt: new Date(manualMondayLocal.getTime() - 9 * 60 * 60 * 1000).toISOString() };
    const manualHeaders = { ...ownerHeaders, 'idempotency-key': randomBytes(32).toString('base64url') };
    const manualBeforeExpiry = await app.inject({ method: 'POST', url: '/v1/owner/reservations/manual',
      headers: manualHeaders, payload: manualPayload });
    assert.equal(manualBeforeExpiry.statusCode, 201, manualBeforeExpiry.body);
    const manualId = manualBeforeExpiry.json().id as string;
    const site = await app.inject({ method: 'POST', url: '/v1/sites', headers: ownerHeaders });
    assert.equal(site.statusCode, 201, site.body);
    const siteDraft = await app.inject({ method: 'GET', url: '/v1/sites/draft', headers: ownerHeaders });
    assert.equal(siteDraft.statusCode, 200);
    const { template, palette, pages } = siteDraft.json();
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/sites/draft',
      headers: ownerHeaders, payload: { expectedRevision: 0, template, palette, pages } })).statusCode, 200);
    await live.query("update field.trial_subscriptions set started_at=now()-interval '16 days', ends_at=now()-interval '2 days' where organization_id=$1", [org]);
    assert.equal((await app.inject({ method: 'POST', url: inquiryUrl, headers, payload })).statusCode, 200);
    const denied = await app.inject({ method: 'POST', url: inquiryUrl,
      payload: { ...payload, message: 'After expiry' } });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().error, 'trial_ended');
    assert.equal((await app.inject({ method: 'POST', url: reservationUrl,
      headers: reservationHeaders, payload: reservationPayload })).statusCode, 200);
    const manualAfterExpiry = await app.inject({ method: 'POST', url: '/v1/owner/reservations/manual',
      headers: manualHeaders, payload: manualPayload });
    assert.equal(manualAfterExpiry.statusCode, 200, manualAfterExpiry.body);
    assert.equal(manualAfterExpiry.json().id, manualId);
    const deniedReservation = await app.inject({ method: 'POST', url: reservationUrl,
      payload: { ...reservationPayload, preferredTimeText: 'Later' } });
    assert.equal(deniedReservation.statusCode, 403);
    assert.equal(deniedReservation.json().error, 'trial_ended');
    assert.equal((await app.inject({ method: 'GET', url: `/v1/reservations/${reservationId}`,
      headers: { authorization: `Bearer ${reservationReceipt}` } })).statusCode, 200);
    const localNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const daysToMonday = (8 - localNow.getUTCDay()) % 7 || 7;
    const nextMondayLocal = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(),
      localNow.getUTCDate() + daysToMonday, 10));
    const startAt = new Date(nextMondayLocal.getTime() - 9 * 60 * 60 * 1000).toISOString();
    const confirmed = await app.inject({ method: 'POST',
      url: `/v1/owner/reservations/${reservationId}/confirm`, headers: ownerHeaders,
      payload: { expectedRevision: 0, expectedCatalogRevision: 1, startAt } });
    assert.equal(confirmed.statusCode, 201, confirmed.body);
    assert.equal(confirmed.json().state, 'confirmed');
    const exportPath = `/v1/owner/reservations/${reservationId}/export`;
    assert.equal((await app.inject({ url: exportPath })).statusCode, 401);
    assert.equal((await app.inject({ url: exportPath,
      headers: { ...ownerHeaders, 'x-test-user': randomUUID() } })).statusCode, 404);
    assert.equal((await app.inject({ url: exportPath,
      headers: { ...ownerHeaders, 'x-organization-id': randomUUID() } })).statusCode, 404);
    assert.equal((await app.inject({ url: exportPath,
      headers: { ...ownerHeaders, 'x-organization-id': 'invalid' } })).statusCode, 400);
    const downloaded = await app.inject({ url: exportPath, headers: ownerHeaders });
    assert.equal(downloaded.statusCode, 200, downloaded.body);
    assert.equal(downloaded.json().formatVersion, 'field-reservation-export.v1');
    assert.equal(downloaded.json().reservation.state, 'confirmed');
    assert.deepEqual(downloaded.json().events.map((event: { revision: number }) => event.revision), [0, 1]);
    assert.equal(downloaded.json().externalSource, null);
    assert.ok(Array.isArray(downloaded.json().notifications));
    assert.equal(downloaded.headers['cache-control'], 'private, no-store');
    assert.equal(downloaded.headers['x-content-type-options'], 'nosniff');
    assert.match(String(downloaded.headers['content-disposition']), /attachment; filename="field-reservation-/);
    assert.doesNotMatch(downloaded.body, /visitor_key_hash|submission_key_hash|receiptKey/);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/owner/reservations/manual',
      headers: { ...ownerHeaders, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { ...manualPayload, startAt } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites', headers: ownerHeaders })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites/releases',
      headers: ownerHeaders, payload: { expectedRevision: 1 } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites/generation-jobs',
      headers: ownerHeaders, payload: { expectedRevision: 1, prompt: 'Create site' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/sites/draft', headers: ownerHeaders })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: `/v1/inquiries/${inquiryId}`,
      headers: { authorization: `Bearer ${receipt}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${inquiryId}/replies`,
      headers: ownerHeaders, payload: { body: 'Existing work remains available' } })).statusCode, 201);
  } finally {
    await live.query('delete from field.trial_subscriptions where organization_id=$1', [org]);
    await live.query('delete from field.organizations where id=$1', [org]);
    await live.query('delete from "user" where id=$1', [owner]);
    await app.close();
    await live.end();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
  }
});

test('Field configured trial policy opens non-mock trials only with the approved consent version and days', async () => {
  const live = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const db = await live.connect();
  const keys = ['FIELD_PROFILE', 'FIELD_TRIAL_CONSENT_VERSION', 'FIELD_TRIAL_DAYS'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.FIELD_PROFILE = 'mock';
  const owner = randomUUID(), org = randomUUID();
  const app = createFieldApp(async () => undefined, undefined, undefined,
    { pool: db as unknown as Pool, resolveUserId: async headers => user(headers) });
  const call = (method: 'GET' | 'POST', path: string, body?: object) =>
    app.inject({ method, url: path, headers: { 'x-test-user': owner, 'x-organization-id': org }, payload: body });
  try {
    await db.query('begin');
    await db.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,false)',
      [owner, owner, `${owner}@example.invalid`]);
    await db.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)', [org, owner, 'Policy Org']);
    await db.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, owner]);
    // 정책 env가 없으면 sandbox에서도 체험을 열지 않는다(blocked_integration).
    process.env.FIELD_PROFILE = 'sandbox';
    delete process.env.FIELD_TRIAL_CONSENT_VERSION;
    delete process.env.FIELD_TRIAL_DAYS;
    const blocked = (await call('GET', '/v1/subscription')).json();
    assert.deepEqual(blocked.policy, { consentVersion: null, days: null, source: 'unavailable' });
    assert.equal(blocked.state, 'unavailable');
    assert.equal(blocked.access.canStartNew, false);
    assert.equal(blocked.access.reason, 'paid_subscription_required');
    const unset = await call('POST', '/v1/subscription/trial', { consentVersion: 'field-trial-2026-10', termsAccepted: true });
    assert.equal(unset.statusCode, 503);
    assert.equal(unset.json().error, 'trial_policy_not_approved');
    process.env.FIELD_TRIAL_CONSENT_VERSION = 'field-trial-2026-10';
    for (const days of ['0', '91', '7.5', 'abc']) {
      process.env.FIELD_TRIAL_DAYS = days;
      assert.equal((await call('GET', '/v1/subscription')).json().policy.source, 'unavailable', days);
      assert.equal((await call('POST', '/v1/subscription/trial', { consentVersion: 'field-trial-2026-10', termsAccepted: true })).statusCode, 503, days);
    }
    process.env.FIELD_TRIAL_DAYS = '30';
    const before = (await call('GET', '/v1/subscription')).json();
    assert.deepEqual(before.policy, { consentVersion: 'field-trial-2026-10', days: 30, source: 'configured' });
    assert.equal(before.mode, 'trial');
    assert.equal(before.state, 'not_started');
    assert.equal((await call('POST', '/v1/subscription/trial', { consentVersion: 'mock-trial-v1', termsAccepted: true })).statusCode, 400);
    assert.equal((await call('POST', '/v1/subscription/trial', { consentVersion: 'field-trial-2026-10', termsAccepted: false })).statusCode, 400);
    assert.equal((await call('POST', '/v1/subscription/trial', { consentVersion: 'field-trial-2026-10' })).statusCode, 400);
    assert.equal((await db.query('select count(*)::int as n from field.trial_subscriptions where organization_id=$1', [org])).rows[0].n, 0);
    const started = await call('POST', '/v1/subscription/trial', { consentVersion: 'field-trial-2026-10', termsAccepted: true });
    assert.equal(started.statusCode, 201, started.body);
    assert.equal(started.json().state, 'trialing');
    assert.equal(started.json().trial.consentVersion, 'field-trial-2026-10');
    const stored = (await db.query(`select consent_version, ends_at = now() + interval '30 days' as exact
      from field.trial_subscriptions where organization_id=$1`, [org])).rows[0];
    assert.deepEqual(stored, { consent_version: 'field-trial-2026-10', exact: true });
    assert.equal(Date.parse(started.json().trial.endsAt) - Date.parse(started.json().trial.startedAt), 30 * 86_400_000);
    const current = (await call('GET', '/v1/subscription')).json();
    assert.equal(current.access.mode, 'trial');
    assert.equal(current.access.canStartNew, true);
    const cancelled = await call('POST', '/v1/subscription/cancel');
    assert.equal(cancelled.statusCode, 200);
    assert.ok(cancelled.json().trial.cancelRequestedAt);
    await db.query("update field.trial_subscriptions set started_at=now()-interval '31 days', ends_at=now()-interval '1 day' where organization_id=$1", [org]);
    const ended = (await call('GET', '/v1/subscription')).json();
    assert.equal(ended.state, 'trial_ended');
    assert.equal(ended.access.canStartNew, false);
    assert.equal(ended.access.reason, 'trial_ended');
    // 정책 env를 내리면 체험 행 표시는 유지하되 새 시작·종료 예약은 다시 닫힌다.
    delete process.env.FIELD_TRIAL_DAYS;
    assert.equal((await call('GET', '/v1/subscription')).json().trial.consentVersion, 'field-trial-2026-10');
    assert.equal((await call('POST', '/v1/subscription/cancel')).statusCode, 503);
  } finally {
    await db.query('rollback');
    db.release();
    await app.close();
    await live.end();
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
