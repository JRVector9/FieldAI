import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

async function owner() {
  const response = await auth.handler(new Request(`${base}/api/auth/sign-up/email`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email: `spam-${randomUUID()}@example.invalid`,
      password: `${randomBytes(16).toString('base64url')}A1!`, name: '합성 스팸 처리 사업자' }),
  }));
  assert.equal(response.status, 200);
  return { cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('AP spam preserves evidence, silences current and future notifications, and requires explicit restoration', async () => {
  const first = await owner();
  const other = await owner();
  const photos = new Map<string, Buffer>();
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool, resolveUserId: async headers =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    inquiryMedia: { put: async (key, data) => { photos.set(key, data); },
      get: async key => photos.get(key) ?? null, delete: async key => { photos.delete(key); } },
  });
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: first, payload: { name: '합성 AP 스팸 검수' } });
    assert.equal(organization.statusCode, 201);
    const organizationId = organization.json().id as string;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: first,
      payload: { expectedRevision: 0, businessName: '합성 AP 스팸 검수', introduction: '',
        services: [{ name: '상담', description: '' }], faqs: [] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: first,
      payload: { expectedRevision: 1 } })).statusCode, 201);
    const intake = await app.inject({ method: 'POST', url: `/v1/public/organizations/${organizationId}/inquiries`,
      payload: { serviceName: '상담', name: '합성 고객', phone: '01012345678', message: '보존할 원문', consent: true } });
    assert.equal(intake.statusCode, 201);
    const { id, receiptKey } = intake.json() as { id: string; receiptKey: string };
    const ownerPath = `/v1/owner/inquiries/${id}`;
    const customer = { authorization: `Bearer ${receiptKey}` };
    assert.equal((await app.inject({ method: 'POST', url: `${ownerPath}/replies`, headers: first,
      payload: { body: '분류 전 답변' } })).statusCode, 201);
    const revision = (await app.inject({ url: ownerPath, headers: first })).json().revision as number;
    const spamPayload = { expectedRevision: revision, spam: true };
    assert.equal((await app.inject({ method: 'POST', url: `${ownerPath}/spam`, payload: spamPayload })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: `${ownerPath}/spam`, headers: other,
      payload: spamPayload })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `${ownerPath}/spam`, headers: first,
      payload: { ...spamPayload, spam: 'true' } })).statusCode, 400);
    const [a, b] = await Promise.all([1, 2].map(() => app.inject({ method: 'POST',
      url: `${ownerPath}/spam`, headers: first, payload: spamPayload })));
    assert.ok(a && b);
    assert.deepEqual([a.statusCode, b.statusCode], [200, 200]);
    assert.equal(a.json().state, 'spam');
    assert.equal(b.json().revision, revision + 1);
    assert.equal((await app.inject({ url: '/v1/owner/notifications', headers: first })).json().unreadCount, 0);
    const stopped = await pool.query<{ state: string; suppression_reason: string }>(
      'select state, suppression_reason from ap.notification_events where inquiry_id=$1', [id]);
    assert.equal(stopped.rows.length, 2);
    assert.ok(stopped.rows.every(row => row.state === 'not_applicable' && row.suppression_reason === 'spam'));
    const followupHeaders = { ...customer, 'idempotency-key': randomBytes(32).toString('base64url') };
    const followup = { method: 'POST' as const, url: `/v1/inquiries/${id}/messages`,
      headers: followupHeaders, payload: { body: '분류 후에도 보존할 후속 메시지' } };
    const stored = await app.inject(followup);
    assert.equal(stored.statusCode, 201);
    assert.equal(stored.json().state, 'spam');
    assert.equal(stored.json().delivery, 'not_applicable');
    const replay = await app.inject(followup);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().state, 'spam');
    assert.equal(replay.json().messageId, stored.json().messageId);
    const photo = await app.inject({ method: 'POST',
      url: `/v1/inquiries/${id}/messages/${stored.json().messageId}/attachments`,
      headers: { ...customer, 'content-type': 'application/octet-stream' },
      payload: readFileSync(resolve('../../quality_checks/report_320.png')) });
    assert.equal(photo.statusCode, 201, photo.body);
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}/attachments/${photo.json().id}`,
      headers: customer })).statusCode, 200);
    assert.equal((await app.inject({ url: '/v1/owner/notifications', headers: first })).json().unreadCount, 0);
    assert.equal((await app.inject({ method: 'POST', url: `${ownerPath}/replies`, headers: first,
      payload: { body: '중단된 고객 답변' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `${ownerPath}/close`, headers: first,
      payload: { expectedRevision: revision + 2 } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `${ownerPath}/notes`, headers: first,
      payload: { body: '분류 중 내부 증빙 메모' } })).statusCode, 201);
    const guest = await app.inject({ url: `/v1/inquiries/${id}`, headers: customer });
    assert.equal(guest.json().state, 'spam');
    for (const message of ['보존할 원문', '분류 전 답변', '분류 후에도 보존할 후속 메시지'])
      assert.ok(guest.json().messages.some((item: { body: string }) => item.body === message));
    assert.doesNotMatch(guest.body, /분류 중 내부 증빙 메모/);
    const currentRevision = (await app.inject({ url: ownerPath, headers: first })).json().revision as number;
    assert.equal((await app.inject({ method: 'POST', url: `${ownerPath}/spam`, headers: first,
      payload: { expectedRevision: revision + 1, spam: false } })).statusCode, 409);
    const restored = await app.inject({ method: 'POST', url: `${ownerPath}/spam`, headers: first,
      payload: { expectedRevision: currentRevision, spam: false } });
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.json().state, 'needs_owner');
    assert.equal((await app.inject({ url: '/v1/owner/notifications', headers: first })).json().unreadCount, 0);
    assert.equal((await app.inject({ method: 'POST', url: `${ownerPath}/replies`, headers: first,
      payload: { body: '해제 후 신규 답변' } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/inquiries/${id}/messages`, headers: customer,
      payload: { body: '해제 후 신규 질문' } })).json().state, 'needs_owner');
    const visible = (await app.inject({ url: '/v1/owner/notifications', headers: first })).json();
    assert.equal(visible.unreadCount, 1);
    assert.equal(visible.notifications.length, 1);
    const stoppedAfterRestore = await pool.query<{ count: string }>(
      "select count(*)::text as count from ap.notification_events where inquiry_id=$1 and suppression_reason='spam'", [id]);
    assert.equal(stoppedAfterRestore.rows[0]?.count, '3');
    const exported = (await app.inject({ url: `${ownerPath}/export`, headers: first })).json();
    assert.ok(exported.messages.some((message: { body: string }) => message.body === '분류 중 내부 증빙 메모'));
    assert.deepEqual(exported.resolutionEvents.map((event: { eventType: string }) => event.eventType), ['spam', 'unspammed']);
    const archive = (await app.inject({ url: `/v1/owner/organizations/${organizationId}/inquiries/export`, headers: first })).json();
    assert.deepEqual(archive.inquiries.find((item: { id: string }) => item.id === id)
      .resolutionEvents.map((event: { eventType: string }) => event.eventType), ['spam', 'unspammed']);
  } finally { await app.close(); }
});
