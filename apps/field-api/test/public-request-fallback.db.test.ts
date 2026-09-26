import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4321';

async function account() {
  const email = `fallback-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: '합성 재접수 사업자' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signed = await post('/sign-in/email');
  assert.equal(signed.status, 200);
  return { email, cookie: signed.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

async function fixture() {
  const owner = await account();
  const other = await account();
  const app = createFieldApp(async () => undefined, auth.handler, base, { pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null });
  const headers = { cookie: owner.cookie };
  const organizations = [];
  for (const actor of [owner, other]) {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: actor.cookie }, payload: { name: '합성 재접수 사업장' } });
    assert.equal(created.statusCode, 201);
    organizations.push(created.json().id as string);
  }
  const organizationId = organizations[0]!;
  const services = ['request', 'slot'].map(bookingMode => ({ id: randomUUID(), name: `${bookingMode} 상담`,
    description: '', bookingMode, durationMinutes: 30, priceAmount: null }));
  const saved = await app.inject({ method: 'PUT', url: '/v1/business/draft', headers, payload: {
    expectedRevision: 0, businessName: '합성 재접수 사업장', introduction: '', region: '',
    openingHours: '', contactPhone: '01000000000', services } });
  assert.equal(saved.statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers,
    payload: { expectedRevision: 1 } })).statusCode, 201);
  assert.equal((await app.inject({ method: 'PUT', url: '/v1/booking-policy', headers, payload: {
    expectedRevision: 0, timezone: 'Asia/Seoul', weekly: Object.fromEntries(
      ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(day => [day, { open: '10:00', close: '18:00' }])),
    closedDates: [], specialDates: {}, beforeMinutes: 0, afterMinutes: 0,
    minLeadMinutes: 0, horizonDays: 30 } })).statusCode, 200);
  const request = { serviceId: services[0]!.id, name: '재접수 고객', phone: '01012345678', consent: true };
  return { app, owner, other, headers, organizationId, otherOrganizationId: organizations[1]!, services, request };
}

test('Field direct inquiry records an explicit AP fallback without copying or merging requests', async () => {
  const f = await fixture();
  try {
    const path = `/v1/public/catalog/${f.organizationId}/inquiries`;
    const actionRequestId = randomUUID();
    const fallback = { origin: 'ap_customer_reported', actionRequestId };
    const payload = { ...f.request, message: '고객이 새로 작성한 직접 문의', fallback };
    const headers = { 'idempotency-key': randomBytes(32).toString('base64url'),
      'x-receipt-key': randomBytes(32).toString('base64url') };
    const created = await f.app.inject({ method: 'POST', url: path, headers, payload });
    assert.equal(created.statusCode, 201);
    const { id, receiptKey } = created.json();
    const opened = await f.app.inject({ url: `/v1/inquiries/${id}`, headers: { authorization: `Bearer ${receiptKey}` } });
    assert.equal(opened.statusCode, 200);
    assert.equal(opened.json().fallback?.origin, fallback.origin);
    assert.equal(opened.json().fallback.actionRequestId, actionRequestId);
    assert.ok(Number.isFinite(Date.parse(opened.json().fallback.declaredAt)));
    assert.deepEqual(opened.json().messages.map((item: { body: string }) => item.body), [payload.message]);
    assert.equal(opened.json().fallbackReview, undefined);
    const replay = await f.app.inject({ method: 'POST', url: path, headers, payload });
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().id, id);
    for (const changed of [undefined, { ...fallback, actionRequestId: randomUUID() }]) {
      assert.equal((await f.app.inject({ method: 'POST', url: path, headers,
        payload: { ...payload, fallback: changed } })).statusCode, 409);
    }
    const separate = await f.app.inject({ method: 'POST', url: path,
      payload: { ...payload, fallback: undefined } });
    assert.equal(separate.statusCode, 201);
    assert.notEqual(separate.json().id, id);
    const regular = await f.app.inject({ url: `/v1/inquiries/${separate.json().id}`,
      headers: { authorization: `Bearer ${separate.json().receiptKey}` } });
    assert.equal(regular.json().fallback, null);
    const stored = await pool.query(`select fallback_origin, fallback_action_request_id from field.inquiries where id=$1`, [id]);
    assert.equal(stored.rows[0].fallback_action_request_id, actionRequestId);
    assert.equal((await pool.query(`select count(*)::int as n from field.outbox
      where organization_id=$1 and event_type='field.inquiry.created'`, [f.organizationId])).rows[0].n, 2);
    const exported = await f.app.inject({ url: `/v1/owner/inquiries/${id}/export`, headers: f.headers });
    assert.equal(exported.statusCode, 200);
    assert.deepEqual(exported.json().inquiry.fallback, opened.json().fallback);
  } finally { await f.app.close(); }
});

test('Field validates fallback declaration and preserves it for both direct reservation modes and exports', async () => {
  const f = await fixture();
  try {
    for (const suffix of ['inquiries', 'reservations']) {
      const payload = { ...f.request, message: '직접 문의', preferredTimeText: '다음 주 오전' };
      for (const fallback of [null, 'ap', {}, { actionRequestId: randomUUID() },
        { origin: 'ap_confirmed_outage' }, { origin: 'ap_customer_reported', actionRequestId: 'not-a-uuid' },
        { origin: 'ap_customer_reported', receiptKey: 'do-not-copy' }]) {
        const invalid = await f.app.inject({ method: 'POST', url: `/v1/public/catalog/${f.organizationId}/${suffix}`,
          payload: { ...payload, fallback } });
        assert.equal(invalid.statusCode, 400, JSON.stringify(fallback));
        assert.equal(invalid.json().error, 'invalid_fallback');
      }
    }
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const availability = await f.app.inject({ url: `/v1/public/catalog/${f.organizationId}/availability?serviceId=${f.services[1]!.id}&date=${date}` });
    assert.equal(availability.statusCode, 200);
    assert.ok(availability.json().slots.length);
    const ids = [];
    for (const [index, service] of f.services.entries()) {
      const fallback = index === 0 ? { origin: 'ap_customer_reported', actionRequestId: randomUUID() }
        : { origin: 'ap_customer_reported' };
      const payload = { ...f.request, serviceId: service.id, requestMessage: '별도로 작성한 새 예약', fallback,
        ...(index === 0 ? { preferredTimeText: '다음 주 오전' } : { startAt: availability.json().slots[0].startAt }) };
      const headers = { 'idempotency-key': randomBytes(32).toString('base64url'),
        'x-receipt-key': randomBytes(32).toString('base64url') };
      const url = `/v1/public/catalog/${f.organizationId}/reservations`;
      const created = await f.app.inject({ method: 'POST', url, headers, payload });
      assert.equal(created.statusCode, 201);
      const { id, receiptKey } = created.json();
      ids.push(id);
      assert.equal(created.json().fallback?.origin, fallback.origin);
      const customer = await f.app.inject({ url: `/v1/reservations/${id}`,
        headers: { authorization: `Bearer ${receiptKey}` } });
      assert.equal(customer.statusCode, 200);
      assert.equal(customer.json().fallbackReview, undefined);
      const replay = await f.app.inject({ method: 'POST', url, headers, payload });
      assert.equal(replay.statusCode, 200);
      assert.equal(replay.json().id, id);
      assert.equal((await f.app.inject({ method: 'POST', url, headers,
        payload: { ...payload, fallback: undefined } })).statusCode, 409);
      const exported = await f.app.inject({ url: `/v1/owner/reservations/${id}/export`, headers: f.headers });
      assert.equal(exported.statusCode, 200);
      assert.deepEqual(exported.json().reservation.fallback, created.json().fallback);
      assert.equal((await pool.query(`select count(*)::int as n from field.occupancies where reservation_id=$1`, [id])).rows[0].n, 0);
    }
    assert.notEqual(ids[0], ids[1]);
    const archive = await f.app.inject({ url: `/v1/owner/organizations/${f.organizationId}/operations/export`, headers: f.headers });
    assert.equal(archive.statusCode, 200);
    assert.equal(archive.json().reservations.filter((item: { fallback: unknown }) => item.fallback).length, 2);
  } finally { await f.app.close(); }
});

test('Field fallback candidates use only the owning organization received action ID and remain owner-only', async () => {
  const f = await fixture();
  try {
    const actionRequestId = randomUUID();
    const candidateId = randomUUID();
    for (const [organizationId, account] of [[f.organizationId, f.owner], [f.otherOrganizationId, f.other]] as const) {
      const userId = (await pool.query('select id from "user" where email=$1', [account.email])).rows[0].id;
      const connectionId = randomUUID();
      await pool.query(`insert into field.ap_connections
        (id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,
         ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,allowed_deployment_ids,
         scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
        values ($1,$2,$3,'http://127.0.0.1:4311/api/auth','fallback-test',$4,$5,$6,
          '합성 AP',1,'{}','{}',$7,$7,now(),'revoked')`,
      [connectionId, organizationId, userId, randomUUID(), randomUUID(), randomUUID(), Buffer.from('synthetic-unused')]);
      await pool.query(`insert into field.external_work_requests
        (id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,
         body_hash,origin_conversation_id,source_deployment_id,kind,service_id,catalog_revision,
         policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,
         consent_record_id,consent_confirmed_at,conditions_hash,is_test,status)
        values ($1,$2,'agent-platform',$3,'synthetic',$4,$5,$6,$7,$8,'inquiry',$9,1,1,$10::jsonb,
          $11::jsonb,'{}','이전 원문 복사 금지',$12,now(),$6,false,'requested')`,
      [organizationId === f.organizationId ? candidateId : randomUUID(), organizationId, connectionId,
        randomUUID(), actionRequestId, 'a'.repeat(64), randomUUID(), randomUUID(), f.services[0]!.id,
        JSON.stringify(f.services[0]), JSON.stringify({ name: '이전 AP 고객', phone: '01099999999', verified: false }), randomUUID()]);
    }
    const fallback = { origin: 'ap_customer_reported', actionRequestId };
    const submitted = await f.app.inject({ method: 'POST', url: `/v1/public/catalog/${f.organizationId}/inquiries`,
      payload: { ...f.request, message: '새로 작성한 본문', fallback } });
    assert.equal(submitted.statusCode, 201);
    const { id, receiptKey } = submitted.json();
    const detail = await f.app.inject({ url: `/v1/owner/inquiries/${id}`, headers: f.headers });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().fallbackReview?.candidates.length, 1);
    assert.equal(detail.json().fallbackReview.candidates[0].externalRequestId, candidateId);
    assert.equal(detail.json().fallbackReview.hasMore, false);
    const publicDetail = await f.app.inject({ url: `/v1/inquiries/${id}`, headers: { authorization: `Bearer ${receiptKey}` } });
    assert.equal(publicDetail.json().fallbackReview, undefined);
    assert.doesNotMatch(publicDetail.body, /이전 AP 고객|이전 원문|01099999999/);
    const candidate = await f.app.inject({ url: `/v1/owner/external-requests/${candidateId}`, headers: f.headers });
    assert.equal(candidate.statusCode, 200);
    assert.equal(candidate.json().id, candidateId);
    assert.equal((await f.app.inject({ url: `/v1/owner/external-requests/${candidateId}` })).statusCode, 401);
    const outsider = { cookie: f.other.cookie };
    assert.equal((await f.app.inject({ url: `/v1/owner/external-requests/${candidateId}`, headers: outsider })).statusCode, 404);
    assert.equal((await f.app.inject({ url: `/v1/owner/inquiries/${id}`, headers: outsider })).statusCode, 404);
    const archive = await f.app.inject({ url: `/v1/owner/organizations/${f.organizationId}/operations/export`, headers: f.headers });
    assert.equal(archive.statusCode, 200);
    assert.equal(archive.json().inquiries.find((item: { id: string }) => item.id === id).fallback.actionRequestId, actionRequestId);
  } finally { await f.app.close(); }
});
