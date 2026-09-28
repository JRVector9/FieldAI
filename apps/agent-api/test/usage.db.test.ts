import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
const user = (headers: IncomingHttpHeaders) =>
  typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null;

test('AP usage stays in its organization and separates customer AI from owner tests and billing', async () => {
  const db = await pool.connect();
  const firstUser = randomUUID();
  const secondUser = randomUUID();
  const firstOrg = randomUUID();
  const secondOrg = randomUUID();
  const knowledge = randomUUID();
  const agent = randomUUID();
  const inquiry = randomUUID();
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined,
    { pool: db as unknown as Pool, resolveUserId: async headers => user(headers) });
  try {
    await db.query('begin');
    for (const [id, name, org] of [[firstUser, 'First', firstOrg], [secondUser, 'Second', secondOrg]]) {
      await db.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,false)',
        [id, name, `${id}@example.invalid`]);
      await db.query('insert into ap.organizations(id,owner_user_id,name) values ($1,$2,$3)',
        [org, id, name]);
      await db.query("insert into ap.memberships(organization_id,user_id,role) values ($1,$2,'owner')",
        [org, id]);
    }
    await db.query(`insert into ap.knowledge_releases
      (id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by)
      values ($1,$2,1,1,'native','{}'::jsonb,$3,$4)`,
    [knowledge, firstOrg, '0'.repeat(64), firstUser]);
    await db.query(`insert into ap.agent_releases
      (id,organization_id,agent_id,revision,draft_revision,content,content_hash,
       knowledge_release_id,knowledge_revision,approved_by)
      values ($1,$2,$3,1,1,'{}'::jsonb,$4,$5,1,$6)`,
    [agent, firstOrg, randomUUID(), '0'.repeat(64), knowledge, firstUser]);
    await db.query(`insert into ap.inquiries
      (id,organization_id,knowledge_release_id,knowledge_revision,customer_name,customer_phone,
       visitor_key_hash,state,consent_at)
      values ($1,$2,$3,1,'Customer','01000000000',$4,'needs_owner',now())`,
    [inquiry, firstOrg, knowledge, '1'.repeat(64)]);
    for (const [kind, input, output, inquiryId] of [
      ['owner_test', 20, 5, null], ['customer_message', 100, 35, inquiry],
    ] as const) {
      const runId = randomUUID();
      await db.query(`insert into ap.ai_runs
        (id,organization_id,agent_release_id,knowledge_release_id,kind,question,status,
         provider_response_id,provider_model,input_tokens,output_tokens,inquiry_id,inquiry_revision)
        values ($1,$2,$3,$4,$5,'question','completed',$6,'synthetic-usage',$7,$8,$9,$10)`,
      [runId, firstOrg, agent, knowledge, kind, randomUUID(), input, output,
        inquiryId, inquiryId ? 0 : null]);
      await db.query(`insert into ap.ai_usage_ledger
        (run_id,organization_id,lane,state,provider_model)
        values ($1,$2,$3,'reserved','synthetic-usage')`, [runId, firstOrg, kind]);
      await db.query("update ap.ai_usage_ledger set state='dispatched',dispatched_at=now() where run_id=$1", [runId]);
      await db.query(`update ap.ai_usage_ledger
        set state='consumed',response_hash=$2,input_tokens=$3,output_tokens=$4,settled_at=now()
        where run_id=$1`, [runId, '0'.repeat(64), input, output]);
    }
    await db.query(`insert into ap.ai_runs
      (id,organization_id,agent_release_id,knowledge_release_id,kind,question,status,error_code)
      values ($1,$2,$3,$4,'owner_test','failed question','failed','provider_unavailable')`,
    [randomUUID(), firstOrg, agent, knowledge]);
    await db.query(`insert into ap.ai_runs
      (id,organization_id,agent_release_id,knowledge_release_id,kind,question,status,
       provider_response_id,input_tokens,output_tokens,started_at)
      values ($1,$2,$3,$4,'owner_test','old question','completed',$5,999,999,
        date_trunc('month',now()) - interval '1 day')`,
    [randomUUID(), firstOrg, agent, knowledge, randomUUID()]);
    await db.query(`insert into ap.field_action_requests
      (id,organization_id,inquiry_id,connection_id,submission_key_hash,input_hash,field_body_hash,
       field_request_body,kind,service_id,service_snapshot,consent_record_id,consent_confirmed_at,
       state,external_request_id)
      values ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,'inquiry',$8,'{}'::jsonb,$9,now(),
        'accepted_external',$10)`,
    [randomUUID(), firstOrg, inquiry, randomUUID(), '2'.repeat(64), '3'.repeat(64),
      '4'.repeat(64), randomUUID(), randomUUID(), randomUUID()]);

    const path = '/v1/usage/summary';
    assert.equal((await app.inject({ url: path })).statusCode, 401);
    assert.equal((await app.inject({ url: path, headers: {
      'x-test-user': secondUser, 'x-organization-id': firstOrg,
    } })).statusCode, 404);
    const response = await app.inject({ url: path, headers: { 'x-test-user': firstUser } });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['cache-control'] as string, /private.*no-store/);
    assert.deepEqual(response.json().ai, {
      customerAnswers: 1, ownerTests: 1, recordedCalls: 2, inputTokens: 120, outputTokens: 40,
      customerInputTokens: 100, customerOutputTokens: 35, ownerInputTokens: 20,
      ownerOutputTokens: 5,
    });
    assert.deepEqual(response.json().work, { inquiries: 1, acceptedFieldRequests: 1,
      unknownFieldRequests: 0 });
    assert.equal(response.json().product, 'agent');
    assert.equal(response.json().billingAmount, undefined);
  } finally {
    await app.close();
    await db.query('rollback');
    db.release();
    await pool.end();
  }
});
