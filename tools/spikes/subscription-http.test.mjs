import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';

const products = [
  { name: 'agent', web: 'http://localhost:3001', database: process.env.AP_DATABASE_URL, schema: 'ap' },
  { name: 'field', web: 'http://127.0.0.1:3002', database: process.env.FIELD_DATABASE_URL, schema: 'field' },
];

async function request(web, path, method = 'GET', body, cookie) {
  const response = await fetch(`${web}${path}`, { method, headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(cookie ? { cookie } : {}),
    ...(method === 'GET' ? {} : { origin: web }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, data: await response.clone().json().catch(() => ({})) };
}

async function account(web, name) {
  const email = `subscription-http-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  assert.equal((await request(web, '/api/auth/sign-up/email', 'POST', { email, password, name })).response.status, 200);
  const signIn = await request(web, '/api/auth/sign-in/email', 'POST', { email, password });
  assert.equal(signIn.response.status, 200);
  const cookie = signIn.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.match(cookie, /session_token/);
  return { email, cookie };
}

test('AP and Field start and cancel independent cardless mock trials through each real web proxy', async () => {
  const clients = products.map(product => ({ ...product,
    pool: new pg.Pool({ connectionString: product.database }), account: null, organizationId: null }));
  try {
    for (const item of clients) {
      item.account = await account(item.web, `${item.name} trial owner`);
      const created = await request(item.web, '/v1/organizations', 'POST',
        { name: `${item.name} 체험 검수` }, item.account.cookie);
      assert.equal(created.response.status, 201);
      item.organizationId = created.data.id;
      const initial = await request(item.web, '/v1/subscription', 'GET', undefined, item.account.cookie);
      assert.equal(initial.response.status, 200);
      assert.equal(initial.data.product, item.name);
      assert.equal(initial.data.state, 'not_started');
      assert.equal(initial.data.canManage, true);
      assert.equal(initial.response.headers.get('cache-control'), 'private, no-store');
      assert.equal((await request(item.web, '/v1/subscription/checkout', 'POST', {}, item.account.cookie)).response.status, 503);
    }
    for (const item of clients) {
      const other = clients.find(client => client.name !== item.name);
      assert.equal((await request(item.web, '/v1/subscription', 'GET', undefined,
        other.account.cookie)).response.status, 401);
    }
    const browserPython = process.env.FIELD_SUBSCRIPTION_BROWSER_PYTHON;
    if (browserPython) {
      const output = execFileSync(browserPython, [resolve('tools/spikes/subscription-browser.py')], {
        cwd: resolve('.'), encoding: 'utf8', timeout: 45_000,
        env: { ...process.env, AP_SUBSCRIPTION_COOKIE: clients[0].account.cookie,
          FIELD_SUBSCRIPTION_COOKIE: clients[1].account.cookie },
      });
      assert.match(output, /both trial screens passed/);
    } else {
      for (const item of clients) {
        const start = await request(item.web, '/v1/subscription/trial', 'POST',
          { consentVersion: 'mock-trial-v1', termsAccepted: true }, item.account.cookie);
        assert.equal(start.response.status, 201);
      }
    }
    for (const item of clients) {
      const current = await request(item.web, '/v1/subscription', 'GET', undefined, item.account.cookie);
      assert.equal(current.data.state, 'trialing');
      assert.equal(current.data.trial.cancelRequestedAt, null);
      const retry = await request(item.web, '/v1/subscription/trial', 'POST',
        { consentVersion: 'mock-trial-v1', termsAccepted: true }, item.account.cookie);
      assert.equal(retry.response.status, 200);
      assert.equal(retry.data.trial.id, current.data.trial.id);
    }
    if (browserPython) {
      const output = execFileSync(browserPython, [resolve('tools/spikes/subscription-browser.py')], {
        cwd: resolve('.'), encoding: 'utf8', timeout: 45_000,
        env: { ...process.env, FIELD_SUBSCRIPTION_BROWSER_MODE: 'cancel_fault',
          AP_SUBSCRIPTION_COOKIE: clients[0].account.cookie,
          FIELD_SUBSCRIPTION_COOKIE: clients[1].account.cookie },
      });
      assert.match(output, /both cancel fault screens passed/);
    }
    for (const item of clients) {
      const cancelled = await request(item.web, '/v1/subscription/cancel', 'POST', {}, item.account.cookie);
      assert.equal(cancelled.response.status, 200);
      assert.equal(cancelled.data.state, 'trialing');
      assert.ok(cancelled.data.trial.cancelRequestedAt);
      if (item.name === 'agent') {
        assert.equal((await request(item.web, '/v1/knowledge/draft', 'PUT', {
          expectedRevision: 0, businessName: 'AP 체험 만료 검수', introduction: '',
          services: [{ name: '상담', description: '직접 문의' }], faqs: [],
        }, item.account.cookie)).response.status, 200);
        assert.equal((await request(item.web, '/v1/knowledge/releases', 'POST',
          { expectedRevision: 1 }, item.account.cookie)).response.status, 201);
      } else {
        item.serviceId = randomUUID();
        assert.equal((await request(item.web, '/v1/business/draft', 'PUT', {
          expectedRevision: 0, businessName: 'Field 체험 만료 검수', introduction: '',
          region: '서울', openingHours: '평일', contactPhone: '', defaultBookingMode: 'request',
          services: [{ id: item.serviceId, name: '상담', description: '직접 문의',
            bookingMode: 'request', durationMinutes: 30, priceAmount: null }],
        }, item.account.cookie)).response.status, 200);
        assert.equal((await request(item.web, '/v1/catalog/releases', 'POST',
          { expectedRevision: 1 }, item.account.cookie)).response.status, 201);
      }
    }
    const field = clients.find(item => item.name === 'field');
    const policy = await request(field.web, '/v1/booking-policy', 'PUT', {
      expectedRevision: 0, timezone: 'Asia/Seoul', weekly: { mon: { open: '10:00', close: '18:00' } },
      beforeMinutes: 0, afterMinutes: 0, minLeadMinutes: 0, horizonDays: 30,
    }, field.account.cookie);
    assert.equal(policy.response.status, 200, JSON.stringify(policy.data));
    const reservation = await request(field.web, `/v1/public/catalog/${field.organizationId}/reservations`,
      'POST', { serviceId: field.serviceId, preferredTimeText: '다음 주 평일',
        name: '합성 예약 고객', phone: '010-5555-4444', consent: true });
    assert.equal(reservation.response.status, 201, JSON.stringify(reservation.data));
    field.reservationId = reservation.data.id;
    for (const item of clients) {
      await item.pool.query(`update ${item.schema}.trial_subscriptions
        set started_at = started_at - interval '15 days',
            ends_at = ends_at - interval '15 days',
            cancel_requested_at = cancel_requested_at - interval '15 days'
        where organization_id = $1`, [item.organizationId]);
      const ended = await request(item.web, '/v1/subscription', 'GET', undefined, item.account.cookie);
      assert.equal(ended.response.status, 200);
      assert.equal(ended.data.state, 'trial_ended');
      const path = item.name === 'agent'
        ? `/v1/public/organizations/${item.organizationId}/inquiries`
        : `/v1/public/catalog/${item.organizationId}/inquiries`;
      const blocked = await request(item.web, path, 'POST', {
        ...(item.name === 'field' ? { serviceId: item.serviceId } : {}),
        name: '만료 후 합성 고객', phone: '010-4444-4444', message: '새 문의 차단 확인', consent: true,
      });
      assert.equal(blocked.response.status, 403);
      assert.equal(blocked.data.error, 'trial_ended');
      assert.equal(blocked.data.accessMode, 'cleanup_only');
    }
    const downloaded = await request(field.web,
      `/v1/owner/reservations/${field.reservationId}/export`, 'GET', undefined, field.account.cookie);
    assert.equal(downloaded.response.status, 200, JSON.stringify(downloaded.data));
    assert.equal(downloaded.data.formatVersion, 'field-reservation-export.v1');
    assert.equal(downloaded.data.reservation.id, field.reservationId);
    assert.equal(downloaded.data.reservation.state, 'requested');
    assert.deepEqual(downloaded.data.events.map(event => event.revision), [0]);
    assert.equal(downloaded.response.headers.get('cache-control'), 'private, no-store');
    assert.match(downloaded.response.headers.get('content-disposition'), /field-reservation-.*\.json/);
    assert.equal((await request(field.web,
      `/v1/owner/reservations/${field.reservationId}/export`, 'GET', undefined,
      clients[0].account.cookie)).response.status, 401);
    if (browserPython) {
      const output = execFileSync(browserPython, [resolve('tools/spikes/subscription-browser.py')], {
        cwd: resolve('.'), encoding: 'utf8', timeout: 45_000,
        env: { ...process.env, FIELD_SUBSCRIPTION_BROWSER_MODE: 'expired',
          AP_SUBSCRIPTION_COOKIE: clients[0].account.cookie,
          FIELD_SUBSCRIPTION_COOKIE: clients[1].account.cookie,
          FIELD_SUBSCRIPTION_RESERVATION_ID: field.reservationId },
      });
      assert.match(output, /both expired trial screens passed/);
    }
  } finally {
    for (const item of clients) {
      try {
        if (item.account) {
          await item.pool.query(`delete from ${item.schema}.trial_subscriptions
            where organization_id = (select id from ${item.schema}.organizations
              where owner_user_id = (select id from "user" where email=$1))`, [item.account.email]);
          await item.pool.query(`delete from ${item.schema}.organizations
            where owner_user_id = (select id from "user" where email=$1)`, [item.account.email]);
          await item.pool.query('delete from "user" where email=$1', [item.account.email]);
        }
      } finally { await item.pool.end(); }
    }
  }
});
