import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));

// A-03 / QA02, QA48, QA157, QA159: 관리자에게도 인증 링크·본문·주소 원문은 보내지 않는다.
test('Field email outbox admin listing enforces role and MFA, masks addresses and pages exact timestamps', async () => {
  const previousProfile = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool,
    resolveUserId: async headers => typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null });
  const operator = randomUUID(), auditor = randomUUID(), owner = randomUUID();
  const call = (query = '', user = operator) => app.inject({ url: `/v1/admin/email-outbox${query}`, headers: { 'x-test-user': user } });
  try {
    for (const id of [operator, auditor, owner]) await pool.query('insert into "user"(id,name,email,"emailVerified") values ($1,$1,$2,true)', [id, `${id}@example.invalid`]);
    await pool.query("insert into field.platform_admin_memberships(user_id,role) values ($1,'operator'),($2,'auditor')", [operator, auditor]);
    assert.equal((await app.inject('/v1/admin/email-outbox')).statusCode, 401);
    assert.equal((await call('', owner)).statusCode, 403);
    const ids = (await pool.query<{ id: string }>(`insert into field.email_outbox("to",subject,text,html,purpose,state,error_code,provider_message_id,created_at)
      select 'PRIVATE_ADDRESS_'||n||'@example.invalid','PRIVATE_SUBJECT','https://private.invalid/?token=PRIVATE_TOKEN','PRIVATE_HTML',
        'verify_email','failed','smtp_send_failed','PRIVATE_PROVIDER_ID','2030-01-01'::timestamptz+n*interval '1 microsecond'
      from generate_series(1,105) n returning id`)).rows.map(row => row.id);
    await pool.query(`insert into field.email_outbox("to",subject,text,purpose,state)
      values ('blocked@example.invalid','Synthetic','PRIVATE_BODY','reset_password','blocked_integration')`);
    const first = await call('?state=failed', auditor);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.headers['cache-control'], 'private, no-store');
    assert.equal(first.json().role, 'auditor');
    assert.equal(first.json().emails.length, 100);
    assert.equal(first.json().emails[0].maskedTo, 'P***@e***');
    assert.doesNotMatch(first.body, /PRIVATE_|token=|providerMessageId|"text"|"html"|"subject"/);
    const next = first.json().nextCursor;
    assert.equal(typeof next, 'string');
    const second = await call(`?state=failed&before=${encodeURIComponent(next)}`);
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().emails.length, 5);
    assert.equal(second.json().nextCursor, null);
    const seen = [...first.json().emails, ...second.json().emails].map((row: { id: string }) => row.id);
    assert.equal(new Set(seen).size, 105);
    assert.deepEqual(new Set(seen), new Set(ids));
    assert.equal((await call(`?state=blocked_integration&before=${encodeURIComponent(next)}`)).statusCode, 400);
    assert.equal((await call('?state=unknown')).statusCode, 400);
    assert.equal((await call('?before=bad-cursor')).statusCode, 400);
    const blocked = await call('?state=blocked_integration');
    assert.equal(blocked.json().emails.length, 1);
    assert.equal(blocked.json().emails[0].purpose, 'reset_password');
    assert.ok((await pool.query("select 1 from field.admin_access_audit where actor_user_id=$1 and resource='email_outbox'", [auditor])).rowCount);
    process.env.FIELD_PROFILE = 'live';
    assert.deepEqual((await call()).json(), { error: 'mfa_required' });
  } finally {
    await app.close(); await pool.end();
    if (previousProfile === undefined) delete process.env.FIELD_PROFILE;
    else process.env.FIELD_PROFILE = previousProfile;
  }
});
