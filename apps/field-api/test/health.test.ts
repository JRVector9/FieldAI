import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFieldApp } from '../src/app.js';

test('Field readiness succeeds when its own database responds', async () => {
  const app = createFieldApp(async () => undefined);
  const response = await app.inject('/health/ready');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { product: 'field', status: 'ready' });
  await app.close();
});

test('Field readiness fails when its own database is unavailable', async () => {
  const app = createFieldApp(async () => { throw new Error('db unavailable'); });
  const response = await app.inject('/health/ready');
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { product: 'field', status: 'unavailable' });
  await app.close();
});

test('Field auth HTTP route forwards form body and response cookie', async () => {
  const app = createFieldApp(async () => undefined, async (request) => {
    assert.equal(request.method, 'POST');
    assert.equal(await request.text(), 'grant_type=authorization_code');
    return new Response('created', {
      status: 201,
      headers: { 'content-type': 'text/plain', 'set-cookie': 'field_session=test; HttpOnly' },
    });
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/oauth2/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'grant_type=authorization_code',
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body, 'created');
  assert.match(response.headers['set-cookie']?.toString() ?? '', /field_session=test/);
  await app.close();
});
