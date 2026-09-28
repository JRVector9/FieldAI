import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { availableSlots } from '../src/bookings.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4321';
async function owner() {
  const email = `field-booking-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic booking owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
function futureWeekday() {
  for (let offset = 3; offset < 15; offset += 1) {
    const day = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const weekday = new Date(`${day}T12:00:00+09:00`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return day;
  }
  throw new Error('no weekday');
}

test('Field slots distinguish repeated DST instants and use elapsed duration at transitions', async () => {
  const organizationId = randomUUID();
  const policy = { revision: 1, timezone: 'America/New_York',
    weekly: { sun: { open: '00:00', close: '03:00' } }, closed_dates: [], special_dates: {},
    before_minutes: 0, after_minutes: 0, min_lead_minutes: 0, horizon_days: 30 };
  const service = { id: randomUUID(), name: 'DST 상담', description: '', bookingMode: 'slot' as const,
    durationMinutes: 30, priceAmount: null };
  const fallNow = new Date('2026-10-20T12:00:00Z');
  const fall = await availableSlots(pool, organizationId, policy, service, '2026-11-01', true, fallNow);
  assert.ok(fall.some(slot => slot.startAt === '2026-11-01T05:00:00.000Z'));
  assert.ok(fall.some(slot => slot.startAt === '2026-11-01T06:00:00.000Z'));
  assert.equal(fall.length, 8);
  const longFall = await availableSlots(pool, organizationId,
    { ...policy, weekly: { sun: { open: '00:00', close: '02:00' } } },
    { ...service, durationMinutes: 180 }, '2026-11-01', true, fallNow);
  assert.deepEqual(longFall, [{ startAt: '2026-11-01T04:00:00.000Z', endAt: '2026-11-01T07:00:00.000Z' }]);
  const repeatedOpening = await availableSlots(pool, organizationId,
    { ...policy, weekly: { sun: { open: '01:30', close: '02:00' } } },
    { ...service, durationMinutes: 60 }, '2026-11-01', true, fallNow);
  assert.deepEqual(repeatedOpening, [
    { startAt: '2026-11-01T05:30:00.000Z', endAt: '2026-11-01T06:30:00.000Z' },
  ]);
  const springNow = new Date('2026-03-01T12:00:00Z');
  const spring = await availableSlots(pool, organizationId,
    { ...policy, weekly: { sun: { open: '00:00', close: '03:30' } } },
    { ...service, durationMinutes: 120 }, '2026-03-08', true, springNow);
  assert.deepEqual(spring, [
    { startAt: '2026-03-08T05:00:00.000Z', endAt: '2026-03-08T07:00:00.000Z' },
    { startAt: '2026-03-08T05:30:00.000Z', endAt: '2026-03-08T07:30:00.000Z' },
  ]);
  const missingClosing = await availableSlots(pool, organizationId,
    { ...policy, weekly: { sun: { open: '01:00', close: '02:30' } } },
    { ...service, durationMinutes: 60 }, '2026-03-08', true, springNow);
  assert.deepEqual(missingClosing, [
    { startAt: '2026-03-08T06:00:00.000Z', endAt: '2026-03-08T07:00:00.000Z' },
  ]);
  const oneDay = { ...policy, weekly: { mon: { open: '10:00', close: '11:00' } }, horizon_days: 1 };
  const beyondSpringHorizon = await availableSlots(pool, organizationId, oneDay, service,
    '2026-03-09', true, new Date('2026-03-08T04:30:00Z'));
  assert.deepEqual(beyondSpringHorizon, []);
  const withinFallHorizon = await availableSlots(pool, organizationId, oneDay, service,
    '2026-11-02', true, new Date('2026-11-01T04:30:00Z'));
  assert.ok(withinFallHorizon.length > 0);
});

test('Field owner reservation list pages past 100 in stable order and stays inside its organization', async () => {
  const first = await owner();
  const second = await owner();
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  const organizations: string[] = [];
  try {
    for (const account of [first, second]) {
      const created = await app.inject({ method: 'POST', url: '/v1/organizations',
        headers: { cookie: account.cookie }, payload: { name: '예약 목록 페이지 검수' } });
      assert.equal(created.statusCode, 201);
      organizations.push((created.json() as { id: string }).id);
    }
    const ids = Array.from({ length: 103 }, () => randomUUID());
    const service = { id: randomUUID(), name: '예약 상담', description: '',
      bookingMode: 'request', durationMinutes: 30, priceAmount: null };
    await pool.query(
      `insert into field.reservations
        (id, organization_id, catalog_revision, service_id, service_snapshot, booking_mode,
         customer_name, customer_phone, visitor_key_hash, preferred_time_text, timezone,
         state, consent_at, created_at)
       select id, $1, 1, $3, $4::jsonb, 'request', '예약 고객', '01012345678',
         md5(id::text), '다음 주 오전', 'Asia/Seoul', 'requested', now(),
         '2026-09-26T00:00:00.123456Z'::timestamptz
       from unnest($2::uuid[]) as id`,
      [organizations[0], ids, service.id, JSON.stringify(service)],
    );
    const headers = { cookie: first.cookie };
    const firstPage = await app.inject({ url: '/v1/owner/reservations', headers });
    assert.equal(firstPage.statusCode, 200);
    const firstData = firstPage.json() as { reservations: { id: string }[]; nextCursor: string | null };
    assert.equal(firstData.reservations.length, 100);
    assert.ok(firstData.nextCursor);
    const secondPage = await app.inject({ url: `/v1/owner/reservations?cursor=${encodeURIComponent(firstData.nextCursor!)}`, headers });
    assert.equal(secondPage.statusCode, 200);
    const secondData = secondPage.json() as typeof firstData;
    assert.equal(secondData.reservations.length, 3);
    assert.equal(secondData.nextCursor, null);
    const actualIds = [...firstData.reservations, ...secondData.reservations].map(item => item.id);
    const ordered = await pool.query<{ id: string }>(
      'select id from field.reservations where organization_id = $1 order by created_at desc, id desc', [organizations[0]],
    );
    assert.deepEqual(actualIds, ordered.rows.map(item => item.id));
    assert.equal(new Set(actualIds).size, 103);
    assert.equal((await app.inject({ url: '/v1/owner/reservations?cursor=bad', headers })).statusCode, 400);
    const otherOwner = await app.inject({ url: `/v1/owner/reservations?cursor=${encodeURIComponent(firstData.nextCursor!)}`,
      headers: { cookie: second.cookie } });
    assert.equal(otherOwner.statusCode, 400);
    assert.deepEqual(otherOwner.json(), { error: 'invalid_reservation_cursor' });
  } finally {
    await app.close();
    if (organizations.length) await pool.query('delete from field.organizations where id = any($1::uuid[])', [organizations]);
    await authPool.query('delete from "user" where email = any($1::text[])', [[first.email, second.email]]);
  }
});

test('Field public reservation retries create one record and preserve the receipt capability', async () => {
  const account = await owner();
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: account.cookie }, payload: { name: 'Field 예약 재시도 검수' } });
    assert.equal(organization.statusCode, 201);
    const organizationId = (organization.json() as { id: string }).id;
    const serviceId = randomUUID();
    const catalog = { expectedRevision: 0, businessName: 'Field 예약 재시도 검수', introduction: '', region: '서울',
      defaultBookingMode: 'request',
      openingHours: '평일', contactPhone: '', services: [
        { id: serviceId, name: '상담', description: '', bookingMode: 'inherit', durationMinutes: 30, priceAmount: 12000 },
      ] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: account.cookie }, payload: catalog })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: account.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const policy = { expectedRevision: 0, timezone: 'Asia/Seoul', weekly: { mon: { open: '10:00', close: '18:00' } },
      beforeMinutes: 0, afterMinutes: 0, minLeadMinutes: 0, horizonDays: 30 };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/booking-policy',
      headers: { cookie: account.cookie }, payload: policy })).statusCode, 200);
    const path = `/v1/public/catalog/${organizationId}/reservations`;
    const idempotencyKey = randomBytes(32).toString('base64url');
    const receiptKey = randomBytes(32).toString('base64url');
    const headers = { 'idempotency-key': idempotencyKey, 'x-receipt-key': receiptKey };
    const payload = { serviceId, preferredTimeText: '다음 주 오전', name: '비회원', phone: '010-1111-2222', consent: true };
    const responses = await Promise.all([0, 1].map(() => app.inject({ method: 'POST', url: path, headers, payload })));
    const first = responses[0]!;
    const duplicate = responses[1]!;
    assert.deepEqual([first.statusCode, duplicate.statusCode].sort(), [200, 201]);
    const one = first.json() as { id: string; receiptKey: string };
    const two = duplicate.json() as { id: string; receiptKey: string };
    assert.equal(one.id, two.id);
    assert.equal(one.receiptKey, receiptKey);
    assert.equal(two.receiptKey, receiptKey);
    const recoverUrl = `${path}/recover`;
    const recovered = await app.inject({ url: recoverUrl, headers });
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.json().id, one.id);
    assert.equal(recovered.json().receiptKey, receiptKey);
    assert.equal(recovered.headers['cache-control'], 'no-store');
    assert.equal((await app.inject({ url: recoverUrl, headers: {
      ...headers, 'idempotency-key': 'weak' } })).statusCode, 400);
    assert.equal((await app.inject({ url: `/v1/public/catalog/${randomUUID()}/reservations/recover`,
      headers })).statusCode, 404);
    assert.equal((await app.inject({ url: recoverUrl, headers: {
      ...headers, 'x-receipt-key': randomBytes(32).toString('base64url') } })).statusCode, 404);
    assert.equal((first.json() as { bookingMode: string }).bookingMode, 'request');
    const restored = await app.inject({ method: 'POST', url: path, headers, payload });
    assert.equal(restored.statusCode, 200);
    assert.equal((restored.json() as { id: string }).id, one.id);
    const ratePayload = { ...payload, phone: '010-8765-4321' };
    let lastKey = '';
    let lastReceipt = '';
    for (let index = 0; index < 5; index += 1) {
      lastKey = randomBytes(32).toString('base64url');
      lastReceipt = randomBytes(32).toString('base64url');
      assert.equal((await app.inject({ method: 'POST', url: path,
        headers: { 'idempotency-key': lastKey, 'x-receipt-key': lastReceipt },
        payload: { ...ratePayload, preferredTimeText: `다음 주 오전 ${index}` } })).statusCode, 201);
    }
    const blocked = await app.inject({ method: 'POST', url: path,
      payload: { ...ratePayload, phone: '01087654321', preferredTimeText: '여섯 번째 예약' } });
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().error, 'submission_rate_limited');
    assert.equal(blocked.json().scope, 'phone');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.equal((await app.inject({ method: 'POST', url: path,
      headers: { 'idempotency-key': lastKey, 'x-receipt-key': lastReceipt },
      payload: { ...ratePayload, preferredTimeText: '다음 주 오전 4' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: path,
      payload: { ...ratePayload, phone: '010-8765-4322', preferredTimeText: '다른 번호' } })).statusCode, 201);
    const blockedInquiry = await app.inject({ method: 'POST',
      url: `/v1/public/catalog/${organizationId}/inquiries`,
      payload: { serviceId, name: '비회원', phone: ratePayload.phone, message: '예약 뒤 문의', consent: true } });
    assert.equal(blockedInquiry.statusCode, 429);
    const windows = await pool.query<{ attempts: number }>(
      'select attempts from field.public_submission_windows where organization_id = $1 and attempts = 5',
      [organizationId]);
    assert.equal(windows.rows.length, 1);
    await pool.query("update field.public_submission_windows set window_started_at = now() - interval '16 minutes' where organization_id = $1 and attempts = 5", [organizationId]);
    assert.equal((await app.inject({ method: 'POST', url: path,
      payload: { ...ratePayload, preferredTimeText: '제한 만료 뒤 예약' } })).statusCode, 201);
    const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      app.inject({ method: 'POST', url: path,
        payload: { ...ratePayload, phone: '010-8765-4333', preferredTimeText: `동시 예약 ${index}` } })));
    assert.equal(concurrent.filter(result => result.statusCode === 201).length, 5);
    assert.equal(concurrent.filter(result => result.statusCode === 429).length, 3);
    await pool.query(`insert into field.public_submission_organization_windows
      (organization_id, attempts, window_started_at, updated_at) values ($1, 59, now(), now())
      on conflict (organization_id) do update set attempts = 59, window_started_at = now()`, [organizationId]);
    const orgKey = randomBytes(32).toString('base64url');
    const orgReceipt = randomBytes(32).toString('base64url');
    const orgPayload = { ...payload, phone: '010-8765-4351', preferredTimeText: '조직 상한 마지막 허용' };
    const orgHeaders = { 'idempotency-key': orgKey, 'x-receipt-key': orgReceipt };
    assert.equal((await app.inject({ method: 'POST', url: path,
      headers: orgHeaders, payload: orgPayload })).statusCode, 201);
    const orgBlocked = await app.inject({ method: 'POST', url: path,
      payload: { ...payload, phone: '010-8765-4352', preferredTimeText: '다른 번호도 제한' } });
    assert.equal(orgBlocked.statusCode, 429);
    assert.deepEqual(orgBlocked.json(), { error: 'submission_rate_limited', scope: 'organization' });
    assert.ok(Number(orgBlocked.headers['retry-after']) > 0);
    assert.equal((await app.inject({ method: 'POST', url: path,
      headers: orgHeaders, payload: orgPayload })).statusCode, 200);
    const orgBlockedInquiry = await app.inject({ method: 'POST',
      url: `/v1/public/catalog/${organizationId}/inquiries`,
      payload: { serviceId, name: '비회원', phone: '010-8765-4353', message: '예약과 공유 상한', consent: true } });
    assert.equal(orgBlockedInquiry.statusCode, 429);
    assert.equal(orgBlockedInquiry.json().scope, 'organization');
    await pool.query(`update field.public_submission_organization_windows
      set window_started_at = now() - interval '16 minutes' where organization_id = $1`, [organizationId]);
    assert.equal((await app.inject({ method: 'POST', url: path,
      payload: { ...payload, phone: '010-8765-4352', preferredTimeText: '만료 후 예약' } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: account.cookie }, payload: { ...catalog, expectedRevision: 1,
        businessName: 'Field 예약 새 상호',
        defaultBookingMode: 'slot',
        services: [{ ...catalog.services[0]!, priceAmount: 13000 }] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: account.cookie }, payload: { expectedRevision: 2 } })).statusCode, 201);
    const replayAfterChange = await app.inject({ method: 'POST', url: path, headers, payload });
    assert.equal(replayAfterChange.statusCode, 200);
    assert.equal((replayAfterChange.json() as { id: string }).id, one.id);
    assert.equal(replayAfterChange.json().bookingMode, 'request');
    const originalReservation = await app.inject({ url: `/v1/reservations/${one.id}`,
      headers: { authorization: `Bearer ${receiptKey}` } });
    assert.equal(originalReservation.statusCode, 200);
    assert.equal(originalReservation.json().businessName, 'Field 예약 재시도 검수');
    const currentCatalog = await app.inject({ url: `/v1/public/catalog/${organizationId}` });
    assert.equal(currentCatalog.json().services[0].bookingMode, 'slot');
    assert.equal(currentCatalog.json().businessName, 'Field 예약 새 상호');
    const changed = await app.inject({ method: 'POST', url: path, headers,
      payload: { ...payload, preferredTimeText: '다음 주 오후' } });
    assert.equal(changed.statusCode, 409);
    assert.equal((changed.json() as { error: string }).error, 'idempotency_conflict');
    const wrongReceipt = await app.inject({ method: 'POST', url: path,
      headers: { ...headers, 'x-receipt-key': randomBytes(32).toString('base64url') }, payload });
    assert.equal(wrongReceipt.statusCode, 409);
    const invalid = await app.inject({ method: 'POST', url: path,
      headers: { ...headers, 'idempotency-key': 'weak' }, payload });
    assert.equal(invalid.statusCode, 400);
    const count = await pool.query<{ count: string }>(
      'select count(*) from field.reservations where id = $1', [one.id]);
    assert.equal(Number(count.rows[0]!.count), 1);
    const snapshot = await pool.query<{ booking_mode: string; service_snapshot: { bookingMode: string } }>(
      'select booking_mode, service_snapshot from field.reservations where id = $1', [one.id]);
    assert.deepEqual(snapshot.rows[0], { booking_mode: 'request', service_snapshot: {
      ...catalog.services[0]!, bookingMode: 'request',
    } });
    const events = await pool.query<{ count: string }>(
      'select count(*) from field.reservation_events where reservation_id = $1', [one.id]);
    assert.equal(Number(events.rows[0]!.count), 1);
    const outbox = await pool.query<{ count: string }>(
      "select count(*) from field.outbox where aggregate_id = $1 and event_type = 'field.reservation.requested'", [one.id]);
    assert.equal(Number(outbox.rows[0]!.count), 1);
    const notifications = await app.inject({ url: '/v1/owner/notifications', headers: { cookie: account.cookie } });
    assert.equal(notifications.statusCode, 200);
    assert.deepEqual(notifications.json().notifications.filter((item: { targetId: string }) => item.targetId === one.id)
      .map((item: { eventType: string }) => item.eventType), ['field.reservation.requested']);
    const notification = await pool.query<{ audience: string; state: string }>(
      `select n.audience, n.state from field.notification_events n join field.outbox o on o.id = n.outbox_id
       where o.aggregate_id = $1 and o.event_type = 'field.reservation.requested'`, [one.id]);
    assert.deepEqual(notification.rows[0], { audience: 'owner', state: 'available' });
    const customerMessageId = randomUUID();
    const customerMessagePath = `/v1/reservations/${one.id}/messages`;
    const customerMessage = { messageId: customerMessageId, body: '예약 시간을 조금 늦출 수 있나요?' };
    const sent = await app.inject({ method: 'POST', url: customerMessagePath,
      headers: { authorization: `Bearer ${receiptKey}` }, payload: customerMessage });
    assert.equal(sent.statusCode, 201);
    assert.equal(sent.json().messageId, customerMessageId);
    assert.equal((await app.inject({ method: 'POST', url: customerMessagePath,
      headers: { authorization: `Bearer ${receiptKey}` }, payload: customerMessage })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: customerMessagePath,
      headers: { authorization: `Bearer ${receiptKey}` },
      payload: { ...customerMessage, body: '다른 내용' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: customerMessagePath,
      headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` },
      payload: { messageId: randomUUID(), body: '권한 없는 내용' } })).statusCode, 404);
    const ownerMessageId = randomUUID();
    const ownerMessagePath = `/v1/owner/reservations/${one.id}/messages`;
    const ownerReply = await app.inject({ method: 'POST', url: ownerMessagePath,
      headers: { cookie: account.cookie },
      payload: { messageId: ownerMessageId, body: '가능한 시간을 확인해 답변드리겠습니다.' } });
    assert.equal(ownerReply.statusCode, 201);
    assert.equal(ownerReply.json().delivery, 'blocked_integration');
    assert.equal((await app.inject({ method: 'POST', url: ownerMessagePath,
      headers: { cookie: account.cookie },
      payload: { messageId: ownerMessageId, body: '가능한 시간을 확인해 답변드리겠습니다.' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: ownerMessagePath,
      headers: { cookie: account.cookie },
      payload: { messageId: ownerMessageId, body: '다른 사업자 답변' } })).statusCode, 409);
    const thread = await app.inject({ url: `/v1/reservations/${one.id}`,
      headers: { authorization: `Bearer ${receiptKey}` } });
    assert.deepEqual(thread.json().messages.map((message: { id: string; sender: string }) =>
      [message.id, message.sender]), [[customerMessageId, 'customer'], [ownerMessageId, 'owner']]);
    const ownerThread = await app.inject({ url: `/v1/owner/reservations/${one.id}`,
      headers: { cookie: account.cookie } });
    assert.equal(ownerThread.json().messages.length, 2);
    const messageCounts = await pool.query<{ event_type: string; count: string }>(
      `select event_type,count(*)::text as count from field.outbox where aggregate_id = $1
       and event_type like 'field.booking_message.%' group by event_type order by event_type`, [one.id]);
    assert.deepEqual(messageCounts.rows, [
      { event_type: 'field.booking_message.customer', count: '1' },
      { event_type: 'field.booking_message.owner', count: '1' },
    ]);
    const messageNotifications = await pool.query<{ event_type: string; audience: string; state: string }>(
      `select o.event_type,n.audience,n.state from field.notification_events n
       join field.outbox o on o.id=n.outbox_id where o.aggregate_id=$1
         and o.event_type like 'field.booking_message.%' order by o.event_type`, [one.id]);
    assert.deepEqual(messageNotifications.rows, [
      { event_type: 'field.booking_message.customer', audience: 'owner', state: 'available' },
      { event_type: 'field.booking_message.owner', audience: 'customer', state: 'blocked_integration' },
    ]);
    const exported = await app.inject({ url: `/v1/owner/reservations/${one.id}/export`,
      headers: { cookie: account.cookie } });
    assert.equal(exported.statusCode, 200);
    assert.equal(exported.json().messages.length, 2);
    const archive = await app.inject({ url: `/v1/owner/organizations/${organizationId}/operations/export`,
      headers: { cookie: account.cookie } });
    assert.equal(archive.statusCode, 200);
    assert.equal(archive.json().reservations.find((item: { id: string }) => item.id === one.id).messages.length, 2);
    const badReceipt = randomBytes(32).toString('base64url');
    for (let attemptNumber = 0; attemptNumber < 5; attemptNumber += 1) {
      assert.equal((await app.inject({ url: `/v1/reservations/${one.id}`,
        headers: { authorization: `Bearer ${badReceipt}`, 'x-forwarded-for': `198.51.100.${attemptNumber + 1}` } })).statusCode, 404);
    }
    const limited = await app.inject({ url: `/v1/reservations/${one.id}`,
      headers: { authorization: `Bearer ${receiptKey}`, 'x-forwarded-for': '203.0.113.20' } });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error, 'receipt_rate_limited');
    assert.ok(Number(limited.headers['retry-after']) > 0);
    await pool.query("update field.receipt_attempts set blocked_until = now() - interval '1 second', window_started_at = now() - interval '16 minutes' where target_kind = 'reservation' and target_id = $1", [one.id]);
    assert.equal((await app.inject({ url: `/v1/reservations/${one.id}`,
      headers: { authorization: `Bearer ${receiptKey}` } })).statusCode, 200);
    assert.equal(Number((await pool.query<{ count: string }>(
      "select count(*) from field.receipt_attempts where target_kind = 'reservation' and target_id = $1", [one.id])).rows[0]!.count), 0);
    const nextReceipt = randomBytes(32).toString('base64url');
    const rotateUrl = `/v1/reservations/${one.id}/receipt-key/rotate`;
    const rotateHeaders = { authorization: `Bearer ${receiptKey}`,
      'idempotency-key': randomBytes(32).toString('base64url') };
    const rotatePayload = { nextReceiptKey: nextReceipt };
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl,
      headers: { ...rotateHeaders, authorization: `Bearer ${badReceipt}` },
      payload: rotatePayload })).statusCode, 404);
    const [rotateA, rotateB] = await Promise.all([
      app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders, payload: rotatePayload }),
      app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders, payload: rotatePayload }),
    ]);
    assert.deepEqual([rotateA.statusCode, rotateB.statusCode], [200, 200]);
    assert.equal((await app.inject({ url: `/v1/reservations/${one.id}`,
      headers: { authorization: `Bearer ${receiptKey}` } })).statusCode, 404);
    assert.equal((await app.inject({ url: recoverUrl, headers })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/reservations/${one.id}`,
      headers: { authorization: `Bearer ${nextReceipt}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders,
      payload: rotatePayload })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: path, headers,
      payload })).statusCode, 409);
    assert.equal(Number((await pool.query<{ count: string }>(
      'select count(*) from field.reservation_receipt_rotations where reservation_id = $1', [one.id])).rows[0]!.count), 1);
    const finalReceipt = randomBytes(32).toString('base64url');
    const nextHeaders = { authorization: `Bearer ${nextReceipt}`,
      'idempotency-key': randomBytes(32).toString('base64url') };
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: nextHeaders,
      payload: { nextReceiptKey: receiptKey } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: nextHeaders,
      payload: { nextReceiptKey: finalReceipt } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: rotateUrl, headers: rotateHeaders,
      payload: rotatePayload })).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/reservations/${one.id}`,
      headers: { authorization: `Bearer ${nextReceipt}` } })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/reservations/${one.id}`,
      headers: { authorization: `Bearer ${finalReceipt}` } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/owner/reservations/${one.id}`,
      headers: { cookie: account.cookie } })).statusCode, 200);
    assert.equal(Number((await pool.query<{ count: string }>(
      'select count(*) from field.reservation_events where reservation_id = $1', [one.id])).rows[0]!.count), 1);
    await pool.query("update field.reservations set source='external_ap' where id=$1", [one.id]);
    assert.equal((await app.inject({ method: 'POST', url: customerMessagePath,
      headers: { authorization: `Bearer ${finalReceipt}` },
      payload: { messageId: randomUUID(), body: 'AP 원본 중복 금지' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: ownerMessagePath,
      headers: { cookie: account.cookie },
      payload: { messageId: randomUUID(), body: 'AP 답변 중복 금지' } })).statusCode, 409);
  } finally {
    await app.close();
    await pool.query("delete from field.receipt_attempts where target_kind = 'reservation' and target_id in (select id from field.reservations where organization_id = (select id from field.organizations where owner_user_id = (select id from \"user\" where email = $1)))", [account.email]).catch(() => undefined);
    await pool.query('delete from field.organizations where owner_user_id = (select id from "user" where email = $1)', [account.email]).catch(() => undefined);
    await authPool.query('delete from "user" where email = $1', [account.email]);
  }
});

test('Field request and slot modes share one resource; only owner confirmation occupies time', async () => {
  const first = await owner();
  const second = await owner();
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: first.cookie }, payload: { name: 'Field 예약 검수 상호' } });
    const organizationId = (organization.json() as { id: string }).id;
    const slotServiceId = randomUUID();
    const requestServiceId = randomUUID();
    const services = [
      { id: slotServiceId, name: '시간표 서비스', description: '', bookingMode: 'slot', durationMinutes: 60, priceAmount: 10000 },
      { id: requestServiceId, name: '희망시간 서비스', description: '', bookingMode: 'request', durationMinutes: 30, priceAmount: 20000 },
    ];
    const catalog = { expectedRevision: 0, businessName: 'Field 예약 검수 상호', introduction: '', region: '서울', openingHours: '평일 10-18시', contactPhone: '', services };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: first.cookie }, payload: catalog })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const date = futureWeekday();
    const availabilityUrl = `/v1/public/catalog/${organizationId}/availability?serviceId=${slotServiceId}&date=${date}`;
    assert.equal((await app.inject({ url: availabilityUrl })).statusCode, 409);
    const weekly = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map(day => [day, { open: '10:00', close: '18:00' }]));
    const policy = { expectedRevision: 0, timezone: 'Asia/Seoul', weekly, beforeMinutes: 15, afterMinutes: 15, minLeadMinutes: 0, horizonDays: 30 };
    const savedPolicy = await app.inject({ method: 'PUT', url: '/v1/booking-policy', headers: { cookie: first.cookie }, payload: policy });
    assert.equal(savedPolicy.statusCode, 200);
    assert.equal((savedPolicy.json() as { revision: number }).revision, 1);
    const available = await app.inject({ url: availabilityUrl });
    assert.equal(available.statusCode, 200);
    const slots = (available.json() as { slots: { startAt: string }[] }).slots;
    assert.ok(slots.length > 2);
    const startAt = slots[0]!.startAt;
    const submitUrl = `/v1/public/catalog/${organizationId}/reservations`;
    const requestBody = { serviceId: slotServiceId, startAt, name: '비회원 예약 고객', phone: '010-2222-3333', consent: true };
    const one = await app.inject({ method: 'POST', url: submitUrl, payload: requestBody });
    const two = await app.inject({ method: 'POST', url: submitUrl, payload: requestBody });
    assert.equal(one.statusCode, 201);
    assert.equal(two.statusCode, 201);
    const firstReservation = one.json() as { id: string; receiptKey: string; state: string };
    const secondReservation = two.json() as { id: string; receiptKey: string };
    assert.equal(firstReservation.state, 'requested');
    const countBefore = await pool.query<{ count: string }>('select count(*) from field.occupancies where organization_id = $1', [organizationId]);
    assert.equal(Number(countBefore.rows[0]!.count), 0);
    assert.equal((await app.inject({ url: `/v1/reservations/${firstReservation.id}?phone=010-2222-3333` })).statusCode, 401);
    assert.equal((await app.inject({ url: `/v1/reservations/${firstReservation.id}`, headers: { authorization: `Bearer ${firstReservation.receiptKey}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/reservations/${firstReservation.id}/confirm`, headers: { cookie: second.cookie }, payload: { expectedRevision: 0, expectedCatalogRevision: 1 } })).statusCode, 404);
    const confirmed = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${firstReservation.id}/confirm`, headers: { cookie: first.cookie }, payload: { expectedRevision: 0, expectedCatalogRevision: 1 } });
    assert.equal(confirmed.statusCode, 201, confirmed.body);
    assert.equal((confirmed.json() as { state: string }).state, 'confirmed');
    const confirmationNotification = await pool.query<{ audience: string; state: string; delivery_owner_product: string }>(
      `select n.audience,n.state,n.delivery_owner_product from field.notification_events n
       join field.outbox o on o.id=n.outbox_id
       where o.aggregate_id=$1 and o.event_type='field.reservation.confirmed'`, [firstReservation.id]);
    assert.deepEqual(confirmationNotification.rows, [{ audience: 'customer', state: 'blocked_integration', delivery_owner_product: 'field' }]);
    const conflict = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${secondReservation.id}/confirm`, headers: { cookie: first.cookie }, payload: { expectedRevision: 0, expectedCatalogRevision: 1 } });
    assert.equal(conflict.statusCode, 409);
    assert.equal((conflict.json() as { error: string }).error, 'time_conflict');
    const countAfter = await pool.query<{ count: string }>('select count(*) from field.occupancies where organization_id = $1', [organizationId]);
    assert.equal(Number(countAfter.rows[0]!.count), 1);
    const unavailable = await app.inject({ url: availabilityUrl });
    assert.ok(!(unavailable.json() as { slots: { startAt: string }[] }).slots.some(slot => slot.startAt === startAt));
    assert.equal((await app.inject({ method: 'POST', url: '/v1/owner/blocks', headers: { cookie: first.cookie }, payload: { startAt, endAt: slots[1]!.startAt, label: '수동 일정' } })).statusCode, 409);
    const preferred = await app.inject({ method: 'POST', url: submitUrl, payload: { serviceId: requestServiceId, preferredTimeText: '다음 주 오전', name: '희망시간 고객', phone: '010-3333-4444', consent: true } });
    assert.equal(preferred.statusCode, 201);
    const preferredId = (preferred.json() as { id: string }).id;
    const requestConfirm = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${preferredId}/confirm`, headers: { cookie: first.cookie }, payload: { expectedRevision: 0, expectedCatalogRevision: 1, startAt: slots[3]!.startAt } });
    assert.equal(requestConfirm.statusCode, 201);
    const inbox = await app.inject({ url: '/v1/owner/reservations', headers: { cookie: first.cookie } });
    assert.equal(inbox.statusCode, 200);
    assert.equal((inbox.json() as { reservations: unknown[] }).reservations.length, 3);
    const proposed = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${secondReservation.id}/proposals`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 0, expectedCatalogRevision: 1, startAt: slots[5]!.startAt } });
    assert.equal(proposed.statusCode, 201);
    assert.equal((proposed.json() as { state: string }).state, 'proposed');
    assert.equal(Number((await pool.query<{ count: string }>('select count(*) from field.occupancies where organization_id = $1', [organizationId])).rows[0]!.count), 2);
    const accepted = await app.inject({ method: 'POST', url: `/v1/reservations/${secondReservation.id}/accept-proposal`,
      headers: { authorization: `Bearer ${secondReservation.receiptKey}` }, payload: { expectedRevision: 1 } });
    assert.equal(accepted.statusCode, 200);
    assert.equal((accepted.json() as { state: string }).state, 'customer_accepted');
    const proposedConfirm = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${secondReservation.id}/confirm`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 2, expectedCatalogRevision: 1 } });
    assert.equal(proposedConfirm.statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/reservations/${secondReservation.id}/confirm`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 2, expectedCatalogRevision: 1 } })).statusCode, 409);
    assert.equal(Number((await pool.query<{ count: string }>(
      "select count(*) from field.outbox where aggregate_id = $1 and event_type = 'field.reservation.confirmed'", [secondReservation.id])).rows[0]!.count), 1);
    const changed = await app.inject({ method: 'POST', url: `/v1/reservations/${secondReservation.id}/change-request`,
      headers: { authorization: `Bearer ${secondReservation.receiptKey}` },
      payload: { expectedRevision: 3, preferredTimeText: '조금 더 늦게 부탁드립니다' } });
    assert.equal(changed.statusCode, 200);
    assert.equal((changed.json() as { state: string }).state, 'change_requested');
    assert.equal(Number((await pool.query<{ count: string }>('select count(*) from field.occupancies where organization_id = $1', [organizationId])).rows[0]!.count), 3);
    const changeProposal = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${secondReservation.id}/proposals`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 4, expectedCatalogRevision: 1, startAt: slots[8]!.startAt } });
    assert.equal(changeProposal.statusCode, 201);
    assert.equal((changeProposal.json() as { state: string }).state, 'change_proposed');
    const changeAccepted = await app.inject({ method: 'POST', url: `/v1/reservations/${secondReservation.id}/accept-proposal`,
      headers: { authorization: `Bearer ${secondReservation.receiptKey}` }, payload: { expectedRevision: 5 } });
    assert.equal(changeAccepted.statusCode, 200);
    assert.equal((changeAccepted.json() as { state: string }).state, 'change_accepted');
    const competingBlock = await app.inject({ method: 'POST', url: '/v1/owner/blocks', headers: { cookie: first.cookie },
      payload: { startAt: slots[8]!.startAt, endAt: slots[9]!.startAt, label: '교체 충돌 검수' } });
    assert.equal(competingBlock.statusCode, 201);
    const blockId = (competingBlock.json() as { id: string }).id;
    const failedSwap = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${secondReservation.id}/confirm`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 6, expectedCatalogRevision: 1 } });
    assert.equal(failedSwap.statusCode, 409);
    assert.equal((failedSwap.json() as { error: string }).error, 'time_conflict');
    const oldOccupancy = await pool.query<{ start_at: Date }>(
      'select lower(occupied) as start_at from field.occupancies where reservation_id = $1', [secondReservation.id]);
    assert.equal(oldOccupancy.rows[0]!.start_at.toISOString(), new Date(Date.parse(slots[5]!.startAt) - 15 * 60_000).toISOString());
    assert.equal((await app.inject({ method: 'DELETE', url: `/v1/owner/blocks/${blockId}`, headers: { cookie: first.cookie } })).statusCode, 204);
    const changedConfirm = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${secondReservation.id}/confirm`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 6, expectedCatalogRevision: 1 } });
    assert.equal(changedConfirm.statusCode, 201);
    assert.equal((changedConfirm.json() as { confirmedStartAt: string }).confirmedStartAt, slots[8]!.startAt);
    assert.equal(Number((await pool.query<{ count: string }>('select count(*) from field.occupancies where organization_id = $1', [organizationId])).rows[0]!.count), 3);
    const cancelRequested = await app.inject({ method: 'POST', url: `/v1/reservations/${secondReservation.id}/cancel-request`,
      headers: { authorization: `Bearer ${secondReservation.receiptKey}` }, payload: { expectedRevision: 7, reason: '일정 변경' } });
    assert.equal(cancelRequested.statusCode, 200);
    assert.equal((cancelRequested.json() as { state: string }).state, 'cancel_requested');
    assert.equal(Number((await pool.query<{ count: string }>('select count(*) from field.occupancies where organization_id = $1', [organizationId])).rows[0]!.count), 3);
    const canceled = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${secondReservation.id}/cancel`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 8, reason: '고객 요청 승인' } });
    assert.equal(canceled.statusCode, 200);
    assert.equal((canceled.json() as { state: string }).state, 'canceled');
    assert.equal(Number((await pool.query<{ count: string }>('select count(*) from field.occupancies where organization_id = $1', [organizationId])).rows[0]!.count), 2);
    const history = await app.inject({ url: `/v1/reservations/${secondReservation.id}`,
      headers: { authorization: `Bearer ${secondReservation.receiptKey}` } });
    assert.equal(history.statusCode, 200);
    const events = (history.json() as { events: { revision: number; previousState: string | null; nextState: string }[] }).events;
    assert.deepEqual(events.map(event => event.revision), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(events[0]!.previousState, null);
    assert.equal(events.at(-1)!.nextState, 'canceled');
    const manualKey = randomBytes(32).toString('base64url');
    const manualPayload = { serviceId: slotServiceId, startAt: slots[12]!.startAt,
      name: '전화 예약 고객', phone: '010-6666-7777' };
    const manualHeaders = { cookie: first.cookie, 'idempotency-key': manualKey };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/owner/reservations/manual',
      headers: { 'idempotency-key': manualKey }, payload: manualPayload })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/owner/reservations/manual',
      headers: { cookie: second.cookie, 'x-organization-id': organizationId,
        'idempotency-key': manualKey }, payload: manualPayload })).statusCode, 404);
    const concurrentManual = await Promise.all([1, 2].map(() => app.inject({
      method: 'POST', url: '/v1/owner/reservations/manual', headers: manualHeaders,
      payload: manualPayload,
    })));
    assert.deepEqual(concurrentManual.map(result => result.statusCode).sort(), [200, 201]);
    const manual = concurrentManual.find(result => result.statusCode === 201)!;
    assert.equal(manual.statusCode, 201);
    assert.equal((manual.json() as { state: string; source: string }).state, 'confirmed');
    assert.equal((manual.json() as { source: string }).source, 'owner_manual');
    const manualId = (manual.json() as { id: string }).id;
    assert.equal((concurrentManual.find(result => result.statusCode === 200)!.json() as { id: string }).id, manualId);
    const manualReplay = await app.inject({ method: 'POST', url: '/v1/owner/reservations/manual',
      headers: manualHeaders, payload: manualPayload });
    assert.equal(manualReplay.statusCode, 200);
    assert.equal((manualReplay.json() as { id: string }).id, manualId);
    const manualConflict = await app.inject({ method: 'POST', url: '/v1/owner/reservations/manual',
      headers: manualHeaders, payload: { ...manualPayload, name: '다른 고객' } });
    assert.equal(manualConflict.statusCode, 409);
    assert.equal((manualConflict.json() as { error: string }).error, 'idempotency_conflict');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/owner/reservations/manual',
      headers: { cookie: first.cookie }, payload: manualPayload })).statusCode, 400);
    assert.equal(Number((await pool.query<{ count: string }>(
      'select count(*) from field.occupancies where reservation_id = $1', [manualId])).rows[0]!.count), 1);
    assert.equal(Number((await pool.query<{ count: string }>(
      "select count(*) from field.reservation_events where reservation_id = $1 and event_type = 'field.reservation.manual_recorded'",
      [manualId])).rows[0]!.count), 1);
    assert.equal(Number((await pool.query<{ count: string }>(
      "select count(*) from field.outbox where aggregate_id = $1 and event_type = 'field.reservation.manual_recorded'",
      [manualId])).rows[0]!.count), 1);
    assert.equal(Number((await pool.query<{ count: string }>('select count(*) from field.occupancies where organization_id = $1', [organizationId])).rows[0]!.count), 3);
    const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    const nextAvailability = await app.inject({ url: `/v1/public/catalog/${organizationId}/availability?serviceId=${slotServiceId}&date=${nextDate}` });
    assert.equal(nextAvailability.statusCode, 200);
    const concurrentStart = (nextAvailability.json() as { slots: { startAt: string }[] }).slots[0]!.startAt;
    const concurrentRequests = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: submitUrl,
      payload: { ...requestBody, startAt: concurrentStart } })));
    assert.deepEqual(concurrentRequests.map(result => result.statusCode), [201, 201]);
    const concurrentIds = concurrentRequests.map(result => (result.json() as { id: string }).id);
    const concurrentConfirmations = await Promise.all(concurrentIds.map(id => app.inject({ method: 'POST',
      url: `/v1/owner/reservations/${id}/confirm`, headers: { cookie: first.cookie },
      payload: { expectedRevision: 0, expectedCatalogRevision: 1 } })));
    assert.deepEqual(concurrentConfirmations.map(result => result.statusCode).sort(), [201, 409]);
    assert.equal(Number((await pool.query<{ count: string }>(
      "select count(*) from field.outbox where aggregate_id = any($1::text[]) and event_type = 'field.reservation.confirmed'", [concurrentIds])).rows[0]!.count), 1);
    const futureCompletion = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${firstReservation.id}/decision`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 1, action: 'complete', reason: '업무 완료' } });
    assert.equal(futureCompletion.statusCode, 409);
    const firstCancel = await app.inject({ method: 'POST', url: `/v1/reservations/${firstReservation.id}/cancel-request`,
      headers: { authorization: `Bearer ${firstReservation.receiptKey}` }, payload: { expectedRevision: 1, reason: '취소 검토' } });
    assert.equal(firstCancel.statusCode, 200);
    const declinedCancel = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${firstReservation.id}/decision`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 2, action: 'decline_cancel', reason: '고객과 통화 후 유지' } });
    assert.equal(declinedCancel.statusCode, 200);
    assert.equal((declinedCancel.json() as { state: string }).state, 'confirmed');
    const toReject = await app.inject({ method: 'POST', url: submitUrl,
      payload: { serviceId: requestServiceId, preferredTimeText: '협의 희망', name: '거절 검수', phone: '010-7777-8888', consent: true } });
    assert.equal(toReject.statusCode, 201);
    const rejected = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${(toReject.json() as { id: string }).id}/decision`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 0, action: 'reject', reason: '일정 불가' } });
    assert.equal(rejected.statusCode, 200);
    assert.equal((rejected.json() as { state: string }).state, 'rejected');
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/booking-policy', headers: { cookie: first.cookie }, payload: policy })).statusCode, 409);
    const closedPolicy = await app.inject({ method: 'PUT', url: '/v1/booking-policy', headers: { cookie: first.cookie },
      payload: { ...policy, expectedRevision: 1, closedDates: [date] } });
    assert.equal(closedPolicy.statusCode, 200);
    assert.equal((closedPolicy.json() as { revision: number }).revision, 2);
    assert.deepEqual((await app.inject({ url: availabilityUrl })).json().slots, []);
    const reopened = await app.inject({ method: 'PUT', url: '/v1/booking-policy', headers: { cookie: first.cookie },
      payload: { ...policy, expectedRevision: 2 } });
    assert.equal(reopened.statusCode, 200);
    const staleCandidate = await app.inject({ method: 'POST', url: submitUrl, payload: {
      serviceId: requestServiceId, preferredTimeText: '다음 주 오후', name: '변경 검수 고객', phone: '010-4444-5555', consent: true,
    } });
    assert.equal(staleCandidate.statusCode, 201);
    const { id: staleId, receiptKey: staleReceiptKey } = staleCandidate.json() as { id: string; receiptKey: string };
    const changedCatalog = { ...catalog, expectedRevision: 1,
      services: services.map(service => service.id === requestServiceId ? { ...service, priceAmount: 25000 } : service) };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: first.cookie }, payload: changedCatalog })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 2 } })).statusCode, 201);
    const staleConfirm = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${staleId}/confirm`, headers: { cookie: first.cookie },
      payload: { expectedRevision: 0, expectedCatalogRevision: 1, startAt: slots[5]!.startAt } });
    assert.equal(staleConfirm.statusCode, 409);
    assert.equal((staleConfirm.json() as { error: string }).error, 'catalog_stale');
    assert.equal((await app.inject({ url: `/v1/reservations/${staleId}/catalog-review` })).statusCode, 401);
    const review = await app.inject({ url: `/v1/reservations/${staleId}/catalog-review`,
      headers: { authorization: `Bearer ${staleReceiptKey}` } });
    assert.equal(review.statusCode, 200);
    assert.equal((review.json() as { previousService: { priceAmount: number } }).previousService.priceAmount, 20000);
    assert.equal((review.json() as { services: { priceAmount: number }[] }).services.find(service => service.priceAmount === 25000)?.priceAmount, 25000);
    const reviewBody = { expectedRevision: 0, expectedCatalogRevision: 2, serviceId: requestServiceId, consent: true };
    assert.equal((await app.inject({ method: 'POST', url: `/v1/reservations/${staleId}/review-catalog`,
      headers: { authorization: `Bearer ${staleReceiptKey}` }, payload: { ...reviewBody, consent: false } })).statusCode, 400);
    const reconsented = await app.inject({ method: 'POST', url: `/v1/reservations/${staleId}/review-catalog`,
      headers: { authorization: `Bearer ${staleReceiptKey}` }, payload: reviewBody });
    assert.equal(reconsented.statusCode, 200);
    assert.equal((reconsented.json() as { service: { priceAmount: number }; catalogRevision: number }).service.priceAmount, 25000);
    assert.equal((reconsented.json() as { catalogRevision: number }).catalogRevision, 2);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/reservations/${staleId}/review-catalog`,
      headers: { authorization: `Bearer ${staleReceiptKey}` }, payload: reviewBody })).statusCode, 409);
    const confirmedAfterReview = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${staleId}/confirm`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 1, expectedCatalogRevision: 2, startAt: slots[5]!.startAt } });
    assert.equal(confirmedAfterReview.statusCode, 201);
    const replacementCandidate = await app.inject({ method: 'POST', url: submitUrl, payload: {
      serviceId: requestServiceId, preferredTimeText: '서비스 교체 희망', name: '대체 서비스 고객', phone: '010-5555-0000', consent: true,
    } });
    assert.equal(replacementCandidate.statusCode, 201);
    const { id: replacementId, receiptKey: replacementKey } = replacementCandidate.json() as { id: string; receiptKey: string };
    const replacementProposal = await app.inject({ method: 'POST', url: `/v1/owner/reservations/${replacementId}/proposals`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 0, expectedCatalogRevision: 2, startAt: slots[10]!.startAt } });
    assert.equal(replacementProposal.statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: first.cookie },
      payload: { ...changedCatalog, expectedRevision: 2, services: [services[0]] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: first.cookie },
      payload: { expectedRevision: 3 } })).statusCode, 201);
    const replacementReview = await app.inject({ url: `/v1/reservations/${replacementId}/catalog-review`,
      headers: { authorization: `Bearer ${replacementKey}` } });
    assert.equal(replacementReview.statusCode, 200);
    assert.deepEqual((replacementReview.json() as { services: { id: string }[] }).services.map(service => service.id), [slotServiceId]);
    const replacementSlots = (await app.inject({ url: `/v1/public/catalog/${organizationId}/availability?serviceId=${slotServiceId}&date=${nextDate}` })).json().slots as { startAt: string }[];
    const replacementStart = replacementSlots.at(-2)!.startAt;
    const replaced = await app.inject({ method: 'POST', url: `/v1/reservations/${replacementId}/review-catalog`,
      headers: { authorization: `Bearer ${replacementKey}` }, payload: {
        expectedRevision: 1, expectedCatalogRevision: 3, serviceId: slotServiceId, startAt: replacementStart, consent: true,
      } });
    assert.equal(replaced.statusCode, 200);
    assert.equal((replaced.json() as { bookingMode: string; state: string; proposalStartAt: string | null }).bookingMode, 'slot');
    assert.equal((replaced.json() as { state: string }).state, 'requested');
    assert.equal((replaced.json() as { proposalStartAt: string | null }).proposalStartAt, null);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/reservations/${replacementId}/confirm`,
      headers: { cookie: first.cookie }, payload: { expectedRevision: 2, expectedCatalogRevision: 3 } })).statusCode, 201);
    const nightDate = new Date(Date.parse(`${date}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
    const morningAfter = new Date(Date.parse(`${nightDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const overnightPolicy = await app.inject({ method: 'PUT', url: '/v1/booking-policy', headers: { cookie: first.cookie },
      payload: { ...policy, expectedRevision: 3, specialDates: { [nightDate]: { open: '22:00', close: '02:00' } } } });
    assert.equal(overnightPolicy.statusCode, 200);
    const nightSlots = (await app.inject({ url: `/v1/public/catalog/${organizationId}/availability?serviceId=${slotServiceId}&date=${nightDate}` })).json().slots as { startAt: string }[];
    assert.ok(nightSlots.some(slot => slot.startAt === new Date(`${nightDate}T22:00:00+09:00`).toISOString()));
    const morningSlots = (await app.inject({ url: `/v1/public/catalog/${organizationId}/availability?serviceId=${slotServiceId}&date=${morningAfter}` })).json().slots as { startAt: string }[];
    assert.ok(morningSlots.some(slot => slot.startAt === new Date(`${morningAfter}T00:00:00+09:00`).toISOString()));
    const closedMorning = await app.inject({ method: 'PUT', url: '/v1/booking-policy', headers: { cookie: first.cookie },
      payload: { ...policy, expectedRevision: 4, specialDates: { [nightDate]: { open: '22:00', close: '02:00' } }, closedDates: [morningAfter] } });
    assert.equal(closedMorning.statusCode, 200);
    assert.deepEqual((await app.inject({ url: `/v1/public/catalog/${organizationId}/availability?serviceId=${slotServiceId}&date=${morningAfter}` })).json().slots, []);
  } finally {
    await app.close();
    await pool.query('DELETE FROM field.reservations WHERE organization_id = (SELECT o.id FROM field.organizations o JOIN "user" u ON u.id = o.owner_user_id WHERE u.email = $1)', [first.email]).catch(() => undefined);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [first.email]).catch(() => undefined);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[first.email, second.email]]);
  }
});
