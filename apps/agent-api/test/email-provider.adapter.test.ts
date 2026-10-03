import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';
import type { BusinessRuntime } from '../src/business.js';
import { authEmailMessage, createSmtpEmailProvider, deliverAuthEmail, emailDeliveryState,
  emailProviderFromEnvironment, type EmailProvider } from '../src/email-provider.js';
process.env.AP_AUTH_SECRET ??= 'synthetic-email-provider-secret-32-bytes-ok';

test('AP SMTP adapter sends through the injected transport and never reports success without a message id', async () => {
  const sent: unknown[] = [];
  const provider = createSmtpEmailProvider({ from: 'AP <no-reply@example.invalid>',
    transport: { async sendMail(message) { sent.push(message); return { messageId: '<synthetic@example.invalid>' }; } } });
  const message = authEmailMessage('verify_email', 'owner@example.invalid', 'http://localhost:3001/verify-email?token=SECRET');
  assert.deepEqual(await provider.send(message), { outcome: 'sent', providerMessageId: '<synthetic@example.invalid>' });
  assert.equal((sent[0] as { from: string }).from, 'AP <no-reply@example.invalid>');
  assert.equal((sent[0] as { to: string }).to, 'owner@example.invalid');
  const silent = createSmtpEmailProvider({ from: 'no-reply@example.invalid', transport: { async sendMail() { return {}; } } });
  assert.equal((await silent.send(message)).outcome, 'failed');
  const broken = createSmtpEmailProvider({ from: 'no-reply@example.invalid',
    transport: { async sendMail() { throw Object.assign(new Error('refused'), { code: 'ECONNECTION' }); } } });
  assert.deepEqual(await broken.send(message), { outcome: 'failed', errorCode: 'smtp_econnection' });
});

test('AP email environment: mock forbids real SMTP, unconfigured non-mock is blocked_integration, Field keys are ignored', () => {
  assert.equal(emailProviderFromEnvironment({ AP_PROFILE: 'mock' }).kind, 'mock');
  assert.throws(() => emailProviderFromEnvironment({ AP_PROFILE: 'mock', AP_SMTP_URL: 'smtps://u:p@smtp.example.invalid' }), /forbidden_in_mock/);
  const blocked = emailProviderFromEnvironment({ AP_PROFILE: 'sandbox', FIELD_SMTP_URL: 'smtps://u:p@smtp.example.invalid', FIELD_MAIL_FROM: 'f@example.invalid' });
  assert.equal(blocked.kind, 'blocked_integration');
  assert.equal(emailDeliveryState(blocked), 'blocked_integration');
  assert.throws(() => emailProviderFromEnvironment({ AP_PROFILE: 'sandbox', AP_SMTP_URL: 'smtps://u:p@smtp.example.invalid' }), /incomplete_AP_email/);
  assert.throws(() => emailProviderFromEnvironment({ AP_PROFILE: 'live', AP_SMTP_URL: 'smtp://u:p@smtp.example.invalid', AP_MAIL_FROM: 'a@example.invalid' }), /invalid_AP_smtp_url/);
  assert.throws(() => emailProviderFromEnvironment({ AP_PROFILE: 'sandbox', AP_SMTP_URL: 'https://smtp.example.invalid', AP_MAIL_FROM: 'a@example.invalid' }), /invalid_AP_smtp_url/);
  const configured = emailProviderFromEnvironment({ AP_PROFILE: 'live', AP_SMTP_URL: 'smtps://u:p@smtp.example.invalid:465', AP_MAIL_FROM: 'Agent Platform <no-reply@example.invalid>' });
  assert.equal(emailDeliveryState(configured), 'configured');
});

test('AP auth email outbox always records the attempt and redacts one-time tokens outside mock', async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const pool = { async query(sql: string, values: unknown[]) { queries.push({ sql, values }); return { rows: [{ id: 'row-1' }], rowCount: 1 }; } } as unknown as Pool;
  const blocked: EmailProvider = { kind: 'blocked_integration', async send() { return { outcome: 'blocked_integration', errorCode: 'smtp_not_configured' }; } };
  const message = authEmailMessage('reset_password', 'owner@example.invalid', 'http://localhost:3001/reset-password?token=ONE-TIME-TOKEN');
  assert.equal((await deliverAuthEmail(pool, blocked, { purpose: 'reset_password', message, secret: 'ONE-TIME-TOKEN' })).outcome, 'blocked_integration');
  assert.match(queries[0]!.sql, /insert into ap\.email_outbox/);
  assert.ok(!JSON.stringify(queries[0]!.values).includes('ONE-TIME-TOKEN'));
  assert.deepEqual(queries[1]!.values, ['row-1', 'blocked_integration', null, 'smtp_not_configured']);
  const throwing: EmailProvider = { kind: 'smtp', async send() { throw new Error('boom'); } };
  assert.equal((await deliverAuthEmail(pool, throwing, { purpose: 'reset_password', message, secret: 'ONE-TIME-TOKEN' })).errorCode, 'email_provider_error');
  // 같은 주소·목적의 10분 내 재요청은 감사 행만 suppressed_duplicate로 남기고 공급사를 부르지 않는다
  const duplicates: { sql: string; values: unknown[] }[] = [];
  const duplicatePool = { async query(sql: string, values: unknown[]) { duplicates.push({ sql, values });
    return { rows: [{ id: 'row-2', state: 'suppressed_duplicate' }], rowCount: 1 }; } } as unknown as Pool;
  let sends = 0;
  const counting: EmailProvider = { kind: 'smtp', async send() { sends++; return { outcome: 'sent', providerMessageId: 'x' }; } };
  assert.deepEqual(await deliverAuthEmail(duplicatePool, counting, { purpose: 'reset_password', message, secret: 'ONE-TIME-TOKEN' }),
    { outcome: 'suppressed_duplicate' });
  assert.equal(sends, 0);
  assert.equal(duplicates.length, 1);
  assert.match(duplicates[0]!.sql, /suppressed_duplicate/);
  assert.equal(duplicates[0]!.values.at(-1), 10);
});

test('AP readiness stays ready but reports unconfigured email as a blocked integration detail', async () => {
  const runtime = { pool: { query: async () => ({ rows: [], rowCount: 0 }) }, resolveUserId: async () => null,
    emailDeliveryState: () => 'blocked_integration' } as unknown as BusinessRuntime;
  process.env.AP_PROFILE = 'mock';
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, runtime);
  try {
    const ready = await app.inject('/health/ready');
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json(), { product: 'agent', status: 'ready', integrations: { email: 'blocked_integration' } });
    assert.deepEqual((await app.inject('/v1/auth/email-delivery')).json(), { product: 'agent', state: 'blocked_integration' });
  } finally { await app.close(); }
});
