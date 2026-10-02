import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import type { FieldBusinessRuntime } from '../src/business.js';
import { authEmailMessage, createSmtpEmailProvider, deliverAuthEmail, emailDeliveryState,
  emailProviderFromEnvironment, type EmailProvider } from '../src/email-provider.js';
process.env.FIELD_AUTH_SECRET ??= 'synthetic-email-provider-secret-32-bytes-ok';

test('Field SMTP adapter sends through the injected transport and never reports success without a message id', async () => {
  const sent: unknown[] = [];
  const provider = createSmtpEmailProvider({ from: 'Field <no-reply@example.invalid>',
    transport: { async sendMail(message) { sent.push(message); return { messageId: '<synthetic@example.invalid>' }; } } });
  const message = authEmailMessage('verify_email', 'owner@example.invalid', 'http://localhost:3002/verify-email?token=SECRET');
  assert.deepEqual(await provider.send(message), { outcome: 'sent', providerMessageId: '<synthetic@example.invalid>' });
  assert.equal((sent[0] as { from: string }).from, 'Field <no-reply@example.invalid>');
  assert.equal((sent[0] as { to: string }).to, 'owner@example.invalid');
  const silent = createSmtpEmailProvider({ from: 'no-reply@example.invalid', transport: { async sendMail() { return {}; } } });
  assert.equal((await silent.send(message)).outcome, 'failed');
  const broken = createSmtpEmailProvider({ from: 'no-reply@example.invalid',
    transport: { async sendMail() { throw Object.assign(new Error('refused'), { code: 'ECONNECTION' }); } } });
  assert.deepEqual(await broken.send(message), { outcome: 'failed', errorCode: 'smtp_econnection' });
});

test('Field email environment: mock forbids real SMTP, unconfigured non-mock is blocked_integration, AP keys are ignored', () => {
  assert.equal(emailProviderFromEnvironment({ FIELD_PROFILE: 'mock' }).kind, 'mock');
  assert.throws(() => emailProviderFromEnvironment({ FIELD_PROFILE: 'mock', FIELD_SMTP_URL: 'smtps://u:p@smtp.example.invalid' }), /forbidden_in_mock/);
  const blocked = emailProviderFromEnvironment({ FIELD_PROFILE: 'sandbox', AP_SMTP_URL: 'smtps://u:p@smtp.example.invalid', AP_MAIL_FROM: 'a@example.invalid' });
  assert.equal(blocked.kind, 'blocked_integration');
  assert.equal(emailDeliveryState(blocked), 'blocked_integration');
  assert.throws(() => emailProviderFromEnvironment({ FIELD_PROFILE: 'sandbox', FIELD_SMTP_URL: 'smtps://u:p@smtp.example.invalid' }), /incomplete_FIELD_email/);
  assert.throws(() => emailProviderFromEnvironment({ FIELD_PROFILE: 'live', FIELD_SMTP_URL: 'smtp://u:p@smtp.example.invalid', FIELD_MAIL_FROM: 'a@example.invalid' }), /invalid_FIELD_smtp_url/);
  assert.throws(() => emailProviderFromEnvironment({ FIELD_PROFILE: 'sandbox', FIELD_SMTP_URL: 'https://smtp.example.invalid', FIELD_MAIL_FROM: 'a@example.invalid' }), /invalid_FIELD_smtp_url/);
  const configured = emailProviderFromEnvironment({ FIELD_PROFILE: 'live', FIELD_SMTP_URL: 'smtps://u:p@smtp.example.invalid:465', FIELD_MAIL_FROM: 'Field <no-reply@example.invalid>' });
  assert.equal(emailDeliveryState(configured), 'configured');
});

test('Field auth email outbox always records the attempt and redacts one-time tokens outside mock', async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const pool = { async query(sql: string, values: unknown[]) { queries.push({ sql, values }); return { rows: [{ id: 'row-1' }], rowCount: 1 }; } } as unknown as Pool;
  const blocked: EmailProvider = { kind: 'blocked_integration', async send() { return { outcome: 'blocked_integration', errorCode: 'smtp_not_configured' }; } };
  const message = authEmailMessage('reset_password', 'owner@example.invalid', 'http://localhost:3002/reset-password?token=ONE-TIME-TOKEN');
  assert.equal((await deliverAuthEmail(pool, blocked, { purpose: 'reset_password', message, secret: 'ONE-TIME-TOKEN' })).outcome, 'blocked_integration');
  assert.match(queries[0]!.sql, /insert into field\.email_outbox/);
  assert.ok(!JSON.stringify(queries[0]!.values).includes('ONE-TIME-TOKEN'));
  assert.deepEqual(queries[1]!.values, ['row-1', 'blocked_integration', null, 'smtp_not_configured']);
  const throwing: EmailProvider = { kind: 'smtp', async send() { throw new Error('boom'); } };
  assert.equal((await deliverAuthEmail(pool, throwing, { purpose: 'reset_password', message, secret: 'ONE-TIME-TOKEN' })).errorCode, 'email_provider_error');
});

test('Field readiness stays ready but reports unconfigured email as a blocked integration detail', async () => {
  const runtime = { pool: { query: async () => ({ rows: [], rowCount: 0 }) }, resolveUserId: async () => null,
    emailDeliveryState: () => 'blocked_integration' } as unknown as FieldBusinessRuntime;
  process.env.FIELD_PROFILE = 'mock';
  const app = createFieldApp(async () => undefined, undefined, undefined, runtime);
  try {
    const ready = await app.inject('/health/ready');
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json(), { product: 'field', status: 'ready', integrations: { email: 'blocked_integration' } });
    assert.deepEqual((await app.inject('/v1/auth/email-delivery')).json(), { product: 'field', state: 'blocked_integration' });
  } finally { await app.close(); }
});
