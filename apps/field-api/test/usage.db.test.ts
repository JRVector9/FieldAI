import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
const user = (headers: IncomingHttpHeaders) =>
  typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null;

test('Field usage stays in its organization and separates site AI, inquiries and reservation origins', async () => {
  const db = await pool.connect();
  const firstUser = randomUUID();
  const secondUser = randomUUID();
  const firstOrg = randomUUID();
  const secondOrg = randomUUID();
  const siteId = randomUUID();
  const serviceId = randomUUID();
  const app = createFieldApp(async () => undefined, undefined, undefined,
    { pool: db as unknown as Pool, resolveUserId: async headers => user(headers) });
  try {
    await db.query('begin');
    for (const [id, name, org] of [[firstUser, 'First', firstOrg], [secondUser, 'Second', secondOrg]]) {
      await db.query('insert into "user"("id","name","email","emailVerified") values ($1,$2,$3,false)',
        [id, name, `${id}@example.invalid`]);
      await db.query('insert into field.organizations(id,owner_user_id,name) values ($1,$2,$3)',
        [org, id, name]);
      await db.query("insert into field.memberships(organization_id,user_id,role) values ($1,$2,'owner')",
        [org, id]);
    }
    await db.query('insert into field.sites(id,organization_id,slug) values ($1,$2,$3)',
      [siteId, firstOrg, `field-${siteId.replaceAll('-', '').slice(0, 12)}`]);
    await db.query(`insert into field.site_generation_jobs
      (id,organization_id,site_id,requested_by,prompt,base_revision,catalog_revision,
       catalog_snapshot,status,model,provider_response_id,input_tokens,output_tokens)
      values ($1,$2,$3,$4,'draft',0,1,'{}'::jsonb,'proposed','test-model',$5,75,25)`,
    [randomUUID(), firstOrg, siteId, firstUser, randomUUID()]);
    await db.query(`insert into field.site_generation_jobs
      (id,organization_id,site_id,requested_by,prompt,base_revision,catalog_revision,
       catalog_snapshot,status,model,error_code)
      values ($1,$2,$3,$4,'failed request',0,1,'{}'::jsonb,'failed','test-model','provider_unavailable')`,
    [randomUUID(), firstOrg, siteId, firstUser]);
    await db.query(`insert into field.site_generation_jobs
      (id,organization_id,site_id,requested_by,prompt,base_revision,catalog_revision,
       catalog_snapshot,status,model,provider_response_id,input_tokens,output_tokens,created_at)
      values ($1,$2,$3,$4,'old request',0,1,'{}'::jsonb,'applied_to_draft','test-model',
        $5,999,999,date_trunc('month',now()) - interval '1 day')`,
    [randomUUID(), firstOrg, siteId, firstUser, randomUUID()]);
    await db.query(`insert into field.inquiries
      (id,organization_id,catalog_revision,service_id,service_snapshot,customer_name,
       customer_phone,visitor_key_hash,state,consent_at)
      values ($1,$2,1,$3,'{}'::jsonb,'Customer','01000000000',$4,'needs_owner',now())`,
    [randomUUID(), firstOrg, serviceId, '5'.repeat(64)]);
    let publicReservationId = '';
    for (const [source, hash, consent] of [
      ['public', '6'.repeat(64), true], ['owner_manual', null, false],
    ] as const) {
      const reservationId = randomUUID();
      await db.query(`insert into field.reservations
        (id,organization_id,catalog_revision,service_id,service_snapshot,booking_mode,
         customer_name,customer_phone,visitor_key_hash,timezone,state,consent_at,source)
        values ($1,$2,1,$3,'{}'::jsonb,'request','Customer','01000000000',$4,
          'Asia/Seoul','requested',$5,$6)`,
      [reservationId, firstOrg, serviceId, hash, consent ? new Date() : null, source]);
      if (source === 'public') publicReservationId = reservationId;
    }
    const messageId = randomUUID();
    const outboxId = randomUUID();
    await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
      values ($1,$2,'field.booking_message.customer',$3,$4::jsonb)`,
    [outboxId, firstOrg, publicReservationId, JSON.stringify({ messageId })]);
    await db.query(`insert into field.reservation_messages
      (id,reservation_id,organization_id,sender,body,outbox_id)
      values ($1,$2,$3,'customer','예약 추가 질문',$4)`,
    [messageId, publicReservationId, firstOrg, outboxId]);
    const path = '/v1/usage/summary';
    assert.equal((await app.inject({ url: path })).statusCode, 401);
    assert.equal((await app.inject({ url: path, headers: {
      'x-test-user': secondUser, 'x-organization-id': firstOrg,
    } })).statusCode, 404);
    const response = await app.inject({ url: path, headers: { 'x-test-user': firstUser } });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['cache-control'] as string, /private.*no-store/);
    assert.deepEqual(response.json().siteAi, {
      jobRequests: 2, recordedCalls: 1, inputTokens: 75, outputTokens: 25,
    });
    assert.deepEqual(response.json().work, { directInquiries: 1, publicReservations: 1,
      reservationMessages: 1,
      manualReservations: 1, externalReservations: 0 });
    assert.equal(response.json().product, 'field');
    assert.equal(response.json().billingAmount, undefined);
  } finally {
    await app.close();
    await db.query('rollback');
    db.release();
    await pool.end();
  }
});
