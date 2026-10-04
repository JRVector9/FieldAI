import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await pool.end(); });
const user = (headers: IncomingHttpHeaders) => typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null;

async function fixture() {
  const operator = randomUUID(), auditor = randomUUID(), owner = randomUUID(), organizationId = randomUUID();
  await pool.query(`insert into "user"("id","name","email","emailVerified")
    select id,id,id||'@example.invalid',true from unnest($1::text[]) id`, [[operator, auditor, owner]]);
  await pool.query("insert into ap.platform_admin_memberships(user_id,role) values ($1,'operator'),($2,'auditor')", [operator, auditor]);
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)', [organizationId, owner, '관리자 목록 검수']);
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, { pool, resolveUserId: async headers => user(headers) });
  return { app, operator, auditor, owner, organizationId };
}

// A-02 / QA139, QA157, QA159: no customer payload in the queue; all 101 requests remain reachable.
test('AP admin lists only closable unknown Field deliveries with metadata, pagination and read-only auditor access', async () => {
  const f = await fixture(), inquiryId = randomUUID(), releaseId = randomUUID();
  await pool.query(`insert into ap.knowledge_releases(id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by)
    values ($1,$2,1,1,'native','{}',$3,$4)`, [releaseId, f.organizationId, '0'.repeat(64), f.owner]);
  await pool.query(`insert into ap.inquiries(id,organization_id,knowledge_release_id,knowledge_revision,customer_name,customer_phone,
    visitor_key_hash,state,consent_at) values ($1,$2,$3,1,'PRIVATE_CUSTOMER','01012345678',$4,'needs_owner',now())`,
  [inquiryId, f.organizationId, releaseId, randomBytes(32).toString('hex')]);
  const connectionId = randomUUID();
  await pool.query(`insert into ap.field_action_requests(id,organization_id,inquiry_id,connection_id,submission_key_hash,input_hash,field_body_hash,
    field_request_body,kind,service_id,service_snapshot,consent_record_id,consent_confirmed_at,state,error_code)
    select gen_random_uuid(),$1,$2,$3,encode(sha256(n::text::bytea),'hex'),repeat('a',64),repeat('b',64),
      '{"phone":"PRIVATE_PAYLOAD"}','inquiry',gen_random_uuid(),'{"name":"PRIVATE_SERVICE"}',gen_random_uuid(),
      now()-interval '25 hours','delivery_unknown','field_result_unknown' from generate_series(1,101) n`,
  [f.organizationId, inquiryId, connectionId]);
  const path = '/v1/admin/field-actions?state=delivery_unknown&unreconcilable=true';
  try {
    assert.equal((await f.app.inject(path)).statusCode, 401);
    assert.equal((await f.app.inject({ url: path, headers: { 'x-test-user': f.owner } })).statusCode, 403);
    assert.equal((await f.app.inject({ url: '/v1/admin/field-actions?state=sending&unreconcilable=true', headers: { 'x-test-user': f.operator } })).statusCode, 400);
    const first = await f.app.inject({ url: path, headers: { 'x-test-user': f.auditor } });
    assert.equal(first.statusCode, 200, first.body);
    assert.match(first.headers['cache-control'] ?? '', /no-store/);
    assert.equal(first.json().role, 'auditor');
    assert.equal(first.json().actions.length, 100);
    assert.ok(first.json().nextCursor);
    assert.equal((await pool.query("select count(*)::int as n from ap.admin_access_audit where actor_user_id=$1 and resource='field_actions'", [f.auditor])).rows[0].n, 1);
    assert.doesNotMatch(first.body, /PRIVATE_CUSTOMER|PRIVATE_PAYLOAD|PRIVATE_SERVICE|01012345678|submissionKey|bodyHash/);
    const second = await f.app.inject({ url: `${path}&cursor=${first.json().nextCursor}`, headers: { 'x-test-user': f.operator } });
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().actions.length, 1);
    assert.equal(second.json().nextCursor, null);
    const id = second.json().actions[0].id;
    const close = (actor: string) => f.app.inject({ method: 'POST', url: `/v1/admin/field-actions/${id}/close-unknown`,
      headers: { 'x-test-user': actor }, payload: { reason: '상대 연결 해제 후 확인 불가로 종결합니다' } });
    assert.equal((await close(f.auditor)).statusCode, 403);
    assert.equal((await close(f.operator)).statusCode, 200);
    assert.equal((await close(f.operator)).statusCode, 409);
    assert.equal((await f.app.inject({ url: `${path}&cursor=${first.json().nextCursor}`, headers: { 'x-test-user': f.operator } })).json().actions.length, 0);
    // A fresh request is not closable; the same request appears after the 24 hour cutoff passes.
    await pool.query("update ap.field_action_requests set consent_confirmed_at=now()-interval '1 hour' where id=$1", [first.json().actions[0].id]);
    assert.equal((await f.app.inject({ url: path, headers: { 'x-test-user': f.operator } })).json().actions.length, 99);
    assert.equal((await f.app.inject({ url: `${path}&cursor=invalid`, headers: { 'x-test-user': f.operator } })).statusCode, 400);
    process.env.AP_PROFILE = 'sandbox';
    try { assert.equal((await f.app.inject({ url: path, headers: { 'x-test-user': f.operator } })).json().error, 'mfa_required'); }
    finally { process.env.AP_PROFILE = 'mock'; }
  } finally { await f.app.close(); }
});

// A-03 / QA02, QA48, QA157, QA159: operational email metadata does not expose auth links or recipients.
test('AP email outbox admin filters states and masks recipients without exposing authentication content', async () => {
  const f = await fixture();
  const ids: string[] = [];
  for (const state of ['failed', 'blocked_integration', 'pending', 'sent', 'suppressed_duplicate']) {
    const id = randomUUID(); ids.push(id);
    await pool.query(`insert into ap.email_outbox(id,"to",subject,text,html,purpose,state,provider_message_id,error_code,sent_at)
      values ($1,'private-recipient@example.invalid','PRIVATE_SUBJECT','PRIVATE_TOKEN','PRIVATE_HTML','verify_email',$2,
        'PRIVATE_PROVIDER_ID','smtp_send_failed',case when $2='sent' then now() else null end)`, [id, state]);
  }
  try {
    assert.equal((await f.app.inject('/v1/admin/email-outbox?state=failed')).statusCode, 401);
    assert.equal((await f.app.inject({ url: '/v1/admin/email-outbox?state=failed', headers: { 'x-test-user': f.owner } })).statusCode, 403);
    assert.equal((await f.app.inject({ url: '/v1/admin/email-outbox?state=bogus', headers: { 'x-test-user': f.operator } })).statusCode, 400);
    for (const state of ['failed', 'blocked_integration', 'pending', 'sent', 'suppressed_duplicate']) {
      const response = await f.app.inject({ url: `/v1/admin/email-outbox?state=${state}`, headers: { 'x-test-user': f.auditor } });
      assert.equal(response.statusCode, 200, response.body);
      assert.match(response.headers['cache-control'] ?? '', /no-store/);
      const row = response.json().emails.find((entry: { id: string }) => ids.includes(entry.id));
      assert.equal(row.state, state);
      assert.equal(row.maskedTo, 'p***@e***');
      assert.doesNotMatch(response.body, /private-recipient|example\.invalid|PRIVATE_SUBJECT|PRIVATE_TOKEN|PRIVATE_HTML|PRIVATE_PROVIDER_ID/);
      assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'errorCode', 'id', 'maskedTo', 'purpose', 'sentAt', 'state']);
    }
    assert.equal((await pool.query("select count(*)::int as n from ap.admin_access_audit where actor_user_id=$1 and resource='email_outbox'", [f.auditor])).rows[0].n, 5);
    await pool.query(`insert into ap.email_outbox("to",subject,text,purpose,state,created_at)
      select 'page@example.invalid','PAGE_SUBJECT','PAGE_TOKEN','reset_password','pending',now()+interval '1 day' from generate_series(1,101)`);
    const first = await f.app.inject({ url: '/v1/admin/email-outbox?state=pending', headers: { 'x-test-user': f.operator } });
    assert.equal(first.json().emails.length, 100);
    assert.ok(first.json().nextCursor);
    const next = await f.app.inject({ url: `/v1/admin/email-outbox?state=pending&cursor=${first.json().nextCursor}`, headers: { 'x-test-user': f.operator } });
    assert.equal(next.json().emails.length, 2);
    assert.equal(next.json().nextCursor, null);
    assert.equal(new Set([...first.json().emails, ...next.json().emails].map((row: { id: string }) => row.id)).size, 102);
    await pool.query('delete from ap.email_outbox where id=$1',[first.json().emails.at(-1).id]);
    const afterRetention=await f.app.inject({url:`/v1/admin/email-outbox?state=pending&cursor=${first.json().nextCursor}`,headers:{'x-test-user':f.operator}});
    assert.equal(afterRetention.statusCode,200,'retention deleting the boundary must not invalidate the cursor');
    assert.deepEqual(afterRetention.json().emails,next.json().emails);
    assert.equal((await f.app.inject({ url: '/v1/admin/email-outbox?cursor=invalid', headers: { 'x-test-user': f.operator } })).statusCode, 400);
    process.env.AP_PROFILE = 'sandbox';
    try { assert.equal((await f.app.inject({ url: '/v1/admin/email-outbox?state=failed', headers: { 'x-test-user': f.operator } })).json().error, 'mfa_required'); }
    finally { process.env.AP_PROFILE = 'mock'; }
  } finally { await f.app.close(); }
});
