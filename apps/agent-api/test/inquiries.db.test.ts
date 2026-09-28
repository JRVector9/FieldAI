import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
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
  const email = `ap-inquiry-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic AP owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('AP owner reaches older work and notifications beyond the first 100 rows with scoped cursors', async () => {
  const first = await owner();
  const second = await owner();
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: first.cookie }, payload: { name: 'AP 목록 페이지 검수' } });
    assert.equal(created.statusCode, 201);
    const organizationId = (created.json() as { id: string }).id;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: first.cookie }, payload: { expectedRevision: 0, businessName: 'AP 목록 페이지 검수',
        introduction: '', services: [{ name: '상담', description: '' }], faqs: [] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: first.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const release = await pool.query<{ id: string; revision: number }>(
      'select id, revision from ap.knowledge_releases where organization_id = $1', [organizationId]);
    await pool.query(`insert into ap.inquiries (id, organization_id, knowledge_release_id, knowledge_revision,
      customer_name, customer_phone, visitor_key_hash, state, consent_at, created_at)
      select gen_random_uuid(), $1, $2, $3, '검수 ' || gs, '010-1234-5678', md5(random()::text || gs),
        'needs_owner', now(), '2026-09-26 12:34:56.123456+00'::timestamptz
      from generate_series(1,103) gs`, [organizationId, release.rows[0]!.id, release.rows[0]!.revision]);
    const oldest = await pool.query<{ id: string }>(
      'select id from ap.inquiries where organization_id = $1 order by created_at desc, id desc offset 102 limit 1',
      [organizationId]);
    await pool.query("update ap.inquiries set updated_at = now() + interval '1 day' where id = $1", [oldest.rows[0]!.id]);
    const page1 = await app.inject({ url: '/v1/owner/inquiries', headers: { cookie: first.cookie } });
    assert.equal(page1.statusCode, 200);
    const firstBody = page1.json() as { inquiries: { id: string; created_at: string; updated_at: string }[]; nextCursor: string | null };
    assert.equal(firstBody.inquiries.length, 100);
    assert.equal(firstBody.inquiries[0]?.id, oldest.rows[0]!.id);
    assert.ok(Date.parse(firstBody.inquiries[0]!.updated_at) > Date.parse(firstBody.inquiries[0]!.created_at));
    assert.ok(firstBody.nextCursor);
    const page2 = await app.inject({ url: `/v1/owner/inquiries?cursor=${encodeURIComponent(firstBody.nextCursor)}`,
      headers: { cookie: first.cookie } });
    assert.equal(page2.statusCode, 200);
    const secondBody = page2.json() as typeof firstBody;
    assert.equal(secondBody.inquiries.length, 3);
    assert.equal(secondBody.nextCursor, null);
    assert.equal(new Set([...firstBody.inquiries, ...secondBody.inquiries].map(item => item.id)).size, 103);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries?cursor=${encodeURIComponent(firstBody.nextCursor)}`,
      headers: { cookie: second.cookie } })).statusCode, 400);
    assert.equal((await app.inject({ url: '/v1/owner/inquiries?cursor=broken',
      headers: { cookie: first.cookie } })).statusCode, 400);
    const hidden = secondBody.inquiries[0]!.id;
    await pool.query("update ap.inquiries set state = 'waiting_customer' where organization_id = $1", [organizationId]);
    await pool.query("update ap.inquiries set state = 'needs_owner' where id = $1", [hidden]);
    const pendingPage = (await app.inject({ url: '/v1/owner/inquiries',
      headers: { cookie: first.cookie } })).json() as {
      inquiries: { id: string }[]; pendingCount: number; pendingPreview: { id: string }[];
    };
    assert.equal(pendingPage.inquiries.some(item => item.id === hidden), false);
    assert.equal(pendingPage.pendingCount, 1);
    assert.deepEqual(pendingPage.pendingPreview.map(item => item.id), [hidden]);
    const olderDetail = await app.inject({ url: `/v1/owner/inquiries/${hidden}`,
      headers: { cookie: first.cookie } });
    assert.equal(olderDetail.statusCode, 200);
    assert.equal((olderDetail.json() as { id: string; state: string }).id, hidden);
    assert.equal((olderDetail.json() as { id: string; state: string }).state, 'needs_owner');
    await pool.query(`insert into ap.outbox (id, organization_id, event_type, aggregate_id, payload)
      select gen_random_uuid(), $1, 'ap.inquiry.created', i.id, '{}'::jsonb
      from ap.inquiries i where i.organization_id = $1`, [organizationId]);
    await pool.query(`insert into ap.notification_events
      (id, organization_id, outbox_id, inquiry_id, source_message_id, audience, channel, state, created_at)
      select gen_random_uuid(), $1, o.id, o.aggregate_id::uuid, null, 'owner', 'in_app', 'available',
        '2026-09-26 12:34:56.123456+00'::timestamptz
      from ap.outbox o where o.organization_id = $1 and o.event_type = 'ap.inquiry.created'`, [organizationId]);
    const notificationPage1 = (await app.inject({ url: '/v1/owner/notifications',
      headers: { cookie: first.cookie } })).json() as {
      notifications: { id: string }[]; nextCursor: string | null; unreadCount: number;
    };
    assert.equal(notificationPage1.notifications.length, 100);
    assert.equal(notificationPage1.unreadCount, 103);
    assert.ok(notificationPage1.nextCursor);
    const notificationPage2 = (await app.inject({ url: `/v1/owner/notifications?cursor=${encodeURIComponent(notificationPage1.nextCursor!)}`,
      headers: { cookie: first.cookie } })).json() as typeof notificationPage1;
    assert.equal(notificationPage2.notifications.length, 3);
    assert.equal(notificationPage2.nextCursor, null);
    assert.equal(new Set([...notificationPage1.notifications, ...notificationPage2.notifications].map(item => item.id)).size, 103);
    const olderNotificationId = notificationPage2.notifications[0]!.id;
    const opened = await app.inject({ method: 'POST', url: `/v1/owner/notifications/${olderNotificationId}/read`,
      headers: { cookie: first.cookie } });
    assert.equal(opened.statusCode, 200);
    const afterRead = (await app.inject({ url: '/v1/owner/notifications',
      headers: { cookie: first.cookie } })).json() as typeof notificationPage1;
    assert.equal(afterRead.unreadCount, 102);
    assert.equal(afterRead.notifications.length, 100);
    const olderAfterRead = (await app.inject({ url: `/v1/owner/notifications?cursor=${encodeURIComponent(afterRead.nextCursor!)}`,
      headers: { cookie: first.cookie } })).json() as { notifications: { id: string; readAt: string | null }[] };
    assert.ok(olderAfterRead.notifications.find(item => item.id === olderNotificationId)?.readAt);
    assert.equal((await app.inject({ url: `/v1/owner/notifications?cursor=${encodeURIComponent(notificationPage1.nextCursor!)}`,
      headers: { cookie: second.cookie } })).statusCode, 400);
  } finally { await app.close(); }
});

test('AP accepts a guest request, separates private notes, and preserves ordered human conversation', async () => {
  const first = await owner();
  const second = await owner();
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: first.cookie }, payload: { name: 'AP 문의 검수 상호' } });
    assert.equal(created.statusCode, 201);
    const organizationId = (created.json() as { id: string }).id;
    const draft = { expectedRevision: 0, businessName: 'AP 문의 검수 상호', introduction: '사람에게 문의 가능', services: [{ name: '상담', description: '일반 상담' }], faqs: [] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: first.cookie }, payload: draft })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const submitUrl = `/v1/public/organizations/${organizationId}/inquiries`;
    const request = { serviceName: '상담', name: '비회원', phone: '010-1111-2222', message: '직접 문의합니다', consent: true };
    assert.equal((await app.inject({ method: 'POST', url: submitUrl, payload: { ...request, consent: false } })).statusCode, 400);
    const submitted = await app.inject({ method: 'POST', url: submitUrl, payload: request });
    assert.equal(submitted.statusCode, 201);
    const { id, receiptKey } = submitted.json() as { id: string; receiptKey: string };
    const directList = await app.inject({ url: '/v1/owner/inquiries', headers: { cookie: first.cookie } });
    const directItem = directList.json().inquiries.find((item: { id: string }) => item.id === id) as {
      source_kind: string; has_ai_history: boolean } | undefined;
    assert.deepEqual(directItem && [directItem.source_kind, directItem.has_ai_history], ['direct', false]);
    assert.match(receiptKey, /^[A-Za-z0-9_-]{43}$/);
    const firstNotification = await app.inject({ url: '/v1/owner/notifications', headers: { cookie: first.cookie } });
    assert.equal(firstNotification.statusCode, 200);
    assert.deepEqual(firstNotification.json().notifications.map((item: { inquiryId: string; eventType: string }) =>
      [item.inquiryId, item.eventType]), [[id, 'ap.inquiry.created']]);
    assert.equal(firstNotification.json().unreadCount, 1);
    assert.deepEqual((await app.inject({ url: '/v1/owner/notifications', headers: { cookie: second.cookie } })).json().notifications, []);
    const notificationId = firstNotification.json().notifications[0].id as string;
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/notifications/${notificationId}/read`,
      headers: { cookie: second.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/notifications/${notificationId}/read`,
      headers: { cookie: first.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/v1/owner/notifications', headers: { cookie: first.cookie } })).json().unreadCount, 0);
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}?phone=010-1111-2222` })).statusCode, 401);
    const customer = await app.inject({ url: `/v1/inquiries/${id}`, headers: { authorization: `Bearer ${receiptKey}` } });
    assert.equal(customer.statusCode, 200);
    assert.equal((customer.json() as { messages: { body: string }[] }).messages[0]?.body, '직접 문의합니다');
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${id}`, headers: { cookie: second.cookie } })).statusCode, 404);
    const note = await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${id}/notes`, headers: { cookie: first.cookie }, payload: { body: '내부 확인 메모' } });
    assert.equal(note.statusCode, 201);
    assert.equal((await app.inject({ url: '/v1/owner/notifications', headers: { cookie: first.cookie } })).json().notifications.length, 1);
    const guestAfterNote = await app.inject({ url: `/v1/inquiries/${id}`, headers: { authorization: `Bearer ${receiptKey}` } });
    assert.doesNotMatch(guestAfterNote.body, /내부 확인 메모/);
    const ownerDetail = await app.inject({ url: `/v1/owner/inquiries/${id}`, headers: { cookie: first.cookie } });
    assert.match(ownerDetail.body, /내부 확인 메모/);
    const reply = await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${id}/replies`, headers: { cookie: first.cookie }, payload: { body: '사업자 답변' } });
    assert.equal(reply.statusCode, 201);
    assert.equal((reply.json() as { delivery: string }).delivery, 'blocked_integration');
    const afterReply = await app.inject({ url: `/v1/inquiries/${id}`, headers: { authorization: `Bearer ${receiptKey}` } });
    assert.match(afterReply.body, /사업자 답변/);
    assert.doesNotMatch(afterReply.body, /내부 확인 메모/);
    assert.equal((afterReply.json() as { messages: { delivery_state: string }[] }).messages.at(-1)?.delivery_state, 'blocked_integration');
    assert.equal((await app.inject({ url: '/v1/owner/notifications', headers: { cookie: first.cookie } })).json().notifications.length, 1);
    const readyToClose = await app.inject({ url: `/v1/owner/inquiries/${id}`, headers: { cookie: first.cookie } });
    const expectedRevision = (readyToClose.json() as { revision: number }).revision;
    assert.ok(Number.isInteger(expectedRevision));
    const closeUrl = `/v1/owner/inquiries/${id}/close`;
    assert.equal((await app.inject({ method: 'POST', url: closeUrl,
      headers: { cookie: second.cookie }, payload: { expectedRevision } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: closeUrl,
      headers: { cookie: first.cookie }, payload: { expectedRevision: -1 } })).statusCode, 400);
    const [closedA, closedB] = await Promise.all([
      app.inject({ method: 'POST', url: closeUrl, headers: { cookie: first.cookie }, payload: { expectedRevision } }),
      app.inject({ method: 'POST', url: closeUrl, headers: { cookie: first.cookie }, payload: { expectedRevision } }),
    ]);
    assert.deepEqual([closedA.statusCode, closedB.statusCode].sort(), [200, 200]);
    assert.equal(closedA.json().state, 'closed');
    assert.equal(closedB.json().revision, expectedRevision + 1);
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}`,
      headers: { authorization: `Bearer ${receiptKey}` } })).json().state, 'closed');
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${id}/replies`,
      headers: { cookie: first.cookie }, payload: { body: '완료 후 답변' } })).statusCode, 409);
    const followup = await app.inject({ method: 'POST', url: `/v1/inquiries/${id}/messages`, headers: { authorization: `Bearer ${receiptKey}` }, payload: { body: '고객 추가 질문' } });
    assert.equal(followup.statusCode, 201);
    assert.equal((followup.json() as { state: string }).state, 'needs_owner');
    assert.equal((await app.inject({ method: 'POST', url: closeUrl,
      headers: { cookie: first.cookie }, payload: { expectedRevision } })).statusCode, 409);
    const resolution = await pool.query<{ event_type: string; revision: number; actor_user_id: string | null;
      source_message_id: string | null }>(
      `select event_type, revision, actor_user_id, source_message_id
       from ap.inquiry_resolution_events where inquiry_id = $1 order by revision`, [id]);
    assert.deepEqual(resolution.rows.map(row => [row.event_type, row.revision]),
      [['closed', expectedRevision + 1], ['reopened', expectedRevision + 2]]);
    assert.ok(resolution.rows[0]?.actor_user_id);
    assert.equal(resolution.rows[0]?.source_message_id, null);
    assert.equal(resolution.rows[1]?.actor_user_id, null);
    assert.equal(resolution.rows[1]?.source_message_id, followup.json().messageId);
    const closedExport = await app.inject({ url: `/v1/owner/inquiries/${id}/export`,
      headers: { cookie: first.cookie } });
    assert.deepEqual(closedExport.json().resolutionEvents.map((event: { eventType: string }) => event.eventType),
      ['closed', 'reopened']);
    const organizationArchive = await app.inject({
      url: `/v1/owner/organizations/${organizationId}/inquiries/export`, headers: { cookie: first.cookie },
    });
    assert.equal(organizationArchive.statusCode, 200);
    assert.deepEqual(organizationArchive.json().inquiries.find((item: { id: string }) => item.id === id)
      .resolutionEvents.map((event: { eventType: string }) => event.eventType), ['closed', 'reopened']);
    const followupNotifications = await app.inject({ url: '/v1/owner/notifications', headers: { cookie: first.cookie } });
    assert.deepEqual(followupNotifications.json().notifications.map((item: { eventType: string }) => item.eventType),
      ['ap.inquiry.customer_message', 'ap.inquiry.created']);
    const ledger = await pool.query<{ event_type: string; intent_count: string }>(
      `select o.event_type, count(n.id)::text as intent_count from ap.outbox o
       left join ap.notification_events n on n.outbox_id = o.id
       where o.organization_id = $1 and o.event_type like 'ap.inquiry.%'
       group by o.event_type order by o.event_type`, [organizationId]);
    assert.deepEqual(ledger.rows.map(row => [row.event_type, Number(row.intent_count)]),
      [['ap.inquiry.created', 1], ['ap.inquiry.customer_message', 1], ['ap.inquiry.owner_reply', 1]]);
    const final = await app.inject({ url: `/v1/owner/inquiries/${id}`, headers: { cookie: first.cookie } });
    assert.deepEqual((final.json() as { messages: { sequence: string }[] }).messages.map(message => Number(message.sequence)), [1, 2, 3, 4]);
    const retryKey = randomBytes(32).toString('base64url');
    const retryReceipt = randomBytes(32).toString('base64url');
    const retryHeaders = { 'idempotency-key': retryKey, 'x-receipt-key': retryReceipt };
    const [concurrentA, concurrentB] = await Promise.all([
      app.inject({ method: 'POST', url: submitUrl, headers: retryHeaders, payload: request }),
      app.inject({ method: 'POST', url: submitUrl, headers: retryHeaders, payload: request }),
    ]);
    assert.deepEqual([concurrentA.statusCode, concurrentB.statusCode].sort(), [200, 201]);
    const retriedId = concurrentA.json().id as string;
    assert.equal(concurrentB.json().id, retriedId);
    assert.equal(concurrentA.json().receiptKey, retryReceipt);
    assert.equal(concurrentB.json().receiptKey, retryReceipt);
    const replay = await app.inject({ method: 'POST', url: submitUrl, headers: retryHeaders, payload: request });
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().id, retriedId);
    const recoverUrl = `${submitUrl}/recover`;
    const recovered = await app.inject({ url: recoverUrl, headers: retryHeaders });
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.json().id, retriedId);
    assert.equal(recovered.json().receiptKey, retryReceipt);
    assert.equal(recovered.headers['cache-control'], 'no-store');
    assert.equal((await app.inject({ url: `/v1/public/organizations/${randomUUID()}/inquiries/recover`,
      headers: retryHeaders })).statusCode, 404);
    assert.equal((await app.inject({ url: recoverUrl,
      headers: { ...retryHeaders, 'x-receipt-key': randomBytes(32).toString('base64url') } })).statusCode, 404);
    assert.equal((await app.inject({ url: recoverUrl, headers: {
      ...retryHeaders, 'idempotency-key': randomBytes(32).toString('base64url') } })).statusCode, 404);
    assert.equal((await app.inject({ url: recoverUrl, headers: {
      ...retryHeaders, 'idempotency-key': 'weak' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: submitUrl, headers: retryHeaders,
      payload: { ...request, message: '다른 내용' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: submitUrl,
      headers: { ...retryHeaders, 'x-receipt-key': randomBytes(32).toString('base64url') }, payload: request })).statusCode, 409);
    const retryLedger = await pool.query<{ inquiries: string; events: string; notifications: string }>(
      `select (select count(*) from ap.inquiries where id = $1)::text as inquiries,
        (select count(*) from ap.outbox where aggregate_id = $1::text)::text as events,
        (select count(*) from ap.notification_events where inquiry_id = $1)::text as notifications`, [retriedId]);
    assert.deepEqual(retryLedger.rows[0], { inquiries: '1', events: '1', notifications: '1' });

    const followupUrl = `/v1/inquiries/${retriedId}/messages`;
    const followupHeaders = { authorization: `Bearer ${retryReceipt}`,
      'idempotency-key': randomBytes(32).toString('base64url') };
    const [messageA, messageB] = await Promise.all([
      app.inject({ method: 'POST', url: followupUrl, headers: followupHeaders, payload: { body: '다시 묻습니다' } }),
      app.inject({ method: 'POST', url: followupUrl, headers: followupHeaders, payload: { body: '다시 묻습니다' } }),
    ]);
    assert.deepEqual([messageA.statusCode, messageB.statusCode].sort(), [200, 201]);
    assert.equal(messageA.json().messageId, messageB.json().messageId);
    const messageRecoverUrl = `${followupUrl}/recover`;
    const messageRecovered = await app.inject({ url: messageRecoverUrl, headers: followupHeaders });
    assert.equal(messageRecovered.statusCode, 200);
    assert.equal(messageRecovered.headers['cache-control'], 'no-store');
    assert.equal(messageRecovered.json().messageId, messageA.json().messageId);
    assert.equal((await app.inject({ url: messageRecoverUrl, headers: {
      ...followupHeaders, 'idempotency-key': randomBytes(32).toString('base64url') } })).statusCode, 404);
    assert.equal((await app.inject({ url: messageRecoverUrl, headers: {
      ...followupHeaders, 'idempotency-key': 'weak' } })).statusCode, 400);
    assert.equal((await app.inject({ url: messageRecoverUrl, headers: {
      ...followupHeaders, authorization: `Bearer ${receiptKey}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: `/v1/inquiries/${randomUUID()}/messages/recover`,
      headers: followupHeaders })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: followupUrl, headers: followupHeaders,
      payload: { body: '변경된 질문' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: followupUrl,
      headers: { ...followupHeaders, authorization: `Bearer ${receiptKey}` },
      payload: { body: '다시 묻습니다' } })).statusCode, 401);

    const answerUrl = `/v1/owner/inquiries/${retriedId}/replies`;
    const answerHeaders = { cookie: first.cookie, 'idempotency-key': randomBytes(32).toString('base64url') };
    const [answerA, answerB] = await Promise.all([
      app.inject({ method: 'POST', url: answerUrl, headers: answerHeaders, payload: { body: '확인 답변' } }),
      app.inject({ method: 'POST', url: answerUrl, headers: answerHeaders, payload: { body: '확인 답변' } }),
    ]);
    assert.deepEqual([answerA.statusCode, answerB.statusCode].sort(), [200, 201]);
    assert.equal(answerA.json().messageId, answerB.json().messageId);
    assert.equal((await app.inject({ method: 'POST', url: answerUrl, headers: answerHeaders,
      payload: { body: '다른 답변' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${retriedId}/notes`,
      headers: answerHeaders, payload: { body: '확인 답변' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: answerUrl,
      headers: { ...answerHeaders, cookie: second.cookie }, payload: { body: '확인 답변' } })).statusCode, 404);

    const noteHeaders = { cookie: first.cookie, 'idempotency-key': randomBytes(32).toString('base64url') };
    const noteUrl = `/v1/owner/inquiries/${retriedId}/notes`;
    assert.equal((await app.inject({ method: 'POST', url: noteUrl, headers: noteHeaders,
      payload: { body: '검수 메모' } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: noteUrl, headers: noteHeaders,
      payload: { body: '검수 메모' } })).statusCode, 200);
    const messageLedger = await pool.query<{ messages: string; events: string; notifications: string }>(
      `select (select count(*) from ap.inquiry_messages where inquiry_id = $1)::text as messages,
        (select count(*) from ap.outbox where aggregate_id = $1::text)::text as events,
        (select count(*) from ap.notification_events where inquiry_id = $1)::text as notifications`, [retriedId]);
    assert.deepEqual(messageLedger.rows[0], { messages: '4', events: '3', notifications: '3' });

    const badReceipt = randomBytes(32).toString('base64url');
    const firstMessageId = (customer.json() as { messages: { id: string }[] }).messages[0]!.id;
    const wrongPaths = [
      `/v1/inquiries/${id}`,
      `/v1/inquiries/${id}/messages`,
      `/v1/inquiries/${id}/attachments/${randomUUID()}`,
      `/v1/inquiries/${id}`,
      `/v1/inquiries/${id}/messages/${firstMessageId}/attachments`,
    ];
    for (const [index, path] of wrongPaths.entries()) {
      const attempt = await app.inject({ method: path.endsWith('/messages') || path.endsWith('/attachments') ? 'POST' : 'GET',
        url: path, headers: { authorization: `Bearer ${badReceipt}`,
          'x-forwarded-for': `198.51.100.${index + 1}` },
        ...(path.endsWith('/messages') ? { payload: { body: '잘못된 확인키' } } : {}) });
      assert.equal(attempt.statusCode, 401);
    }
    const limited = await app.inject({ url: `/v1/inquiries/${id}`,
      headers: { authorization: `Bearer ${receiptKey}`, 'x-forwarded-for': '203.0.113.20' } });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error, 'receipt_rate_limited');
    assert.ok(Number(limited.headers['retry-after']) > 0);
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${retryReceipt}` } })).statusCode, 200);
    assert.equal((await pool.query<{ failures: number }>(
      "select failures from ap.receipt_attempts where target_id = $1", [id])).rows[0]?.failures, 5);
    await pool.query("update ap.receipt_attempts set blocked_until = now() - interval '1 second', window_started_at = now() - interval '16 minutes' where target_id = $1", [id]);
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}`,
      headers: { authorization: `Bearer ${badReceipt}` } })).statusCode, 401);
    assert.equal((await pool.query<{ failures: number }>(
      "select failures from ap.receipt_attempts where target_id = $1", [id])).rows[0]?.failures, 1);
    assert.equal((await app.inject({ url: `/v1/inquiries/${id}`,
      headers: { authorization: `Bearer ${receiptKey}` } })).statusCode, 200);
    assert.equal(Number((await pool.query<{ count: string }>(
      'select count(*) from ap.receipt_attempts where target_id = $1', [id])).rows[0]!.count), 0);

    const nextReceipt = randomBytes(32).toString('base64url');
    const rotateUrl = `/v1/inquiries/${retriedId}/receipt-key/rotate`;
    const rotateHeaders = { authorization: `Bearer ${retryReceipt}`,
      'idempotency-key': randomBytes(32).toString('base64url') };
    const rotatePayload = { nextReceiptKey: nextReceipt };
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl,
      headers: { ...rotateHeaders, authorization: `Bearer ${receiptKey}` },
      payload: rotatePayload })).statusCode, 401);
    const [rotateA, rotateB] = await Promise.all([
      app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders, payload: rotatePayload }),
      app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders, payload: rotatePayload }),
    ]);
    assert.deepEqual([rotateA.statusCode, rotateB.statusCode], [200, 200]);
    assert.doesNotMatch(rotateA.body, new RegExp(nextReceipt));
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${retryReceipt}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: messageRecoverUrl, headers: followupHeaders })).statusCode, 401);
    assert.equal((await app.inject({ url: recoverUrl, headers: retryHeaders })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${nextReceipt}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders,
      payload: rotatePayload })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: submitUrl, headers: retryHeaders,
      payload: request })).statusCode, 409);
    assert.equal(Number((await pool.query<{ count: string }>(
      'select count(*) from ap.inquiry_receipt_rotations where inquiry_id = $1', [retriedId])).rows[0]!.count), 1);
    const finalReceipt = randomBytes(32).toString('base64url');
    const nextHeaders = { authorization: `Bearer ${nextReceipt}`,
      'idempotency-key': randomBytes(32).toString('base64url') };
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: nextHeaders,
      payload: { nextReceiptKey: retryReceipt } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: nextHeaders,
      payload: { nextReceiptKey: finalReceipt } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders,
      payload: rotatePayload })).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${nextReceipt}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: `/v1/inquiries/${retriedId}`,
      headers: { authorization: `Bearer ${finalReceipt}` } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${retriedId}`,
      headers: { cookie: first.cookie } })).statusCode, 200);
    assert.equal(Number((await pool.query<{ count: string }>(
      'select count(*) from ap.outbox where aggregate_id = $1', [retriedId])).rows[0]!.count), 3);
    const exportUrl = `/v1/owner/inquiries/${retriedId}/export`;
    assert.equal((await app.inject({ url: exportUrl })).statusCode, 401);
    assert.equal((await app.inject({ url: exportUrl, headers: { cookie: second.cookie } })).statusCode, 404);
    await pool.query(
      `insert into ap.memberships(organization_id, user_id, role)
       select $1, id, 'editor' from "user" where email = $2`, [organizationId, second.email]);
    assert.equal((await app.inject({ url: exportUrl, headers: { cookie: second.cookie } })).statusCode, 200);
    await pool.query(`update ap.memberships set role = 'viewer' where organization_id = $1
      and user_id = (select id from "user" where email = $2)`, [organizationId, second.email]);
    assert.equal((await app.inject({ url: exportUrl, headers: { cookie: second.cookie } })).statusCode, 404);
    const exported = await app.inject({ url: exportUrl, headers: { cookie: first.cookie } });
    assert.equal(exported.statusCode, 200);
    assert.equal(exported.headers['cache-control'], 'private, no-store');
    assert.match(String(exported.headers['content-disposition']), /attachment; filename="ap-inquiry-/);
    assert.equal(exported.json().product, 'agent');
    assert.equal(exported.json().inquiry.id, retriedId);
    assert.ok(exported.json().messages.some((item: { body: string; visibility: string }) =>
      item.body === '검수 메모' && item.visibility === 'internal'));
    assert.doesNotMatch(exported.body, new RegExp(retryReceipt));
    assert.doesNotMatch(exported.body, /visitor_key_hash|submission_key_hash|object_key/);
    const ratePayload = { ...request, phone: '010-8765-4321' };
    let lastKey = '';
    let lastReceipt = '';
    for (let index = 0; index < 5; index += 1) {
      lastKey = randomBytes(32).toString('base64url');
      lastReceipt = randomBytes(32).toString('base64url');
      assert.equal((await app.inject({ method: 'POST', url: submitUrl,
        headers: { 'idempotency-key': lastKey, 'x-receipt-key': lastReceipt },
        payload: { ...ratePayload, message: `제한 검수 ${index}` } })).statusCode, 201);
    }
    const blocked = await app.inject({ method: 'POST', url: submitUrl,
      payload: { ...ratePayload, phone: '01087654321', message: '여섯 번째 접수' } });
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().error, 'submission_rate_limited');
    assert.equal(blocked.json().scope, 'phone');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.equal((await app.inject({ method: 'POST', url: submitUrl,
      headers: { 'idempotency-key': lastKey, 'x-receipt-key': lastReceipt },
      payload: { ...ratePayload, message: '제한 검수 4' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: submitUrl,
      payload: { ...ratePayload, phone: '010-8765-4322', message: '다른 번호' } })).statusCode, 201);
    const windows = await pool.query<{ subject_hash: string; attempts: number }>(
      'select subject_hash, attempts from ap.public_submission_windows where organization_id = $1 and attempts = 5',
      [organizationId]);
    assert.equal(windows.rows.length, 1);
    assert.match(windows.rows[0]!.subject_hash, /^[0-9a-f]{64}$/);
    await pool.query("update ap.public_submission_windows set window_started_at = now() - interval '16 minutes' where organization_id = $1 and attempts = 5", [organizationId]);
    assert.equal((await app.inject({ method: 'POST', url: submitUrl,
      payload: { ...ratePayload, message: '제한 만료 뒤 접수' } })).statusCode, 201);
    const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      app.inject({ method: 'POST', url: submitUrl,
        payload: { ...ratePayload, phone: '010-8765-4333', message: `동시 접수 ${index}` } })));
    assert.equal(concurrent.filter(result => result.statusCode === 201).length, 5);
    assert.equal(concurrent.filter(result => result.statusCode === 429).length, 3);
    await pool.query(`insert into ap.public_submission_organization_windows
      (organization_id, attempts, window_started_at, updated_at) values ($1, 59, now(), now())
      on conflict (organization_id) do update set attempts = 59, window_started_at = now()`, [organizationId]);
    const orgKey = randomBytes(32).toString('base64url');
    const orgReceipt = randomBytes(32).toString('base64url');
    const orgPayload = { ...request, phone: '010-8765-4351', message: '조직 상한 마지막 허용' };
    const orgHeaders = { 'idempotency-key': orgKey, 'x-receipt-key': orgReceipt };
    const orgAccepted = await app.inject({ method: 'POST', url: submitUrl, headers: orgHeaders, payload: orgPayload });
    assert.equal(orgAccepted.statusCode, 201);
    const orgBlocked = await app.inject({ method: 'POST', url: submitUrl,
      payload: { ...request, phone: '010-8765-4352', message: '다른 번호도 제한' } });
    assert.equal(orgBlocked.statusCode, 429);
    assert.deepEqual(orgBlocked.json(), { error: 'submission_rate_limited', scope: 'organization' });
    assert.ok(Number(orgBlocked.headers['retry-after']) > 0);
    assert.equal((await app.inject({ method: 'POST', url: submitUrl,
      headers: orgHeaders, payload: orgPayload })).statusCode, 200);
    await pool.query(`update ap.public_submission_organization_windows
      set window_started_at = now() - interval '16 minutes' where organization_id = $1`, [organizationId]);
    assert.equal((await app.inject({ method: 'POST', url: submitUrl,
      payload: { ...request, phone: '010-8765-4352', message: '만료 후 접수' } })).statusCode, 201);
  } finally {
    await app.close();
    await pool.query('delete from ap.receipt_attempts where target_id in (select id from ap.inquiries where organization_id = (select id from ap.organizations where owner_user_id = (select id from "user" where email = $1)))', [first.email]).catch(() => undefined);
    await pool.query('DELETE FROM ap.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [first.email]).catch(() => undefined);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[first.email, second.email]]);
  }
});
