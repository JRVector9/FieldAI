import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });

test('Field retention uses approved immutable periods and real closure, with native dispute holds and protected future work', async () => {
  const previous = process.env.FIELD_PROFILE; process.env.FIELD_PROFILE = 'mock';
  const users = Array.from({ length: 4 }, () => randomUUID());
  const [owner, operator, approver, auditor] = users as [string, string, string, string];
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool,
    resolveUserId: async headers => typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null });
  const headers = (user = operator, key?: string) => ({ 'x-test-user': user, ...(key ? { 'idempotency-key': key } : {}) });
  const post = (url: string, payload: Record<string, unknown>, user = operator, key = randomUUID()) => app.inject({ method: 'POST', url, headers: headers(user, key), payload });
  try {
    for (const user of users) await pool.query('insert into "user"(id,name,email,"emailVerified") values ($1,$2,$3,false)',
      [user, 'Synthetic retention actor', `${user}@example.invalid`]);
    for (const [user, role] of [[operator, 'operator'], [approver, 'operator'], [auditor, 'auditor']])
      await pool.query('insert into field.platform_admin_memberships(user_id,role) values ($1,$2)', [user, role]);
    const organization = await post('/v1/organizations', { name: '보존 검수 조직' }, owner);
    assert.equal(organization.statusCode, 201, organization.body);
    const org = organization.json().id, serviceId = randomUUID();
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: headers(owner), payload: {
      expectedRevision: 0, businessName: '보존 검수 조직', introduction: '', region: '', openingHours: '', contactPhone: '',
      services: [{ id: serviceId, name: '상담', description: '상담', bookingMode: 'request', durationMinutes: 30, priceAmount: null }],
    } })).statusCode, 200);
    assert.equal((await post('/v1/catalog/releases', { expectedRevision: 1 }, owner)).statusCode, 201);
    const created = await app.inject({ method: 'POST', url: `/v1/public/catalog/${org}/inquiries`, payload: {
      serviceId, name: 'PRIVATE_NAME', phone: '010-3456-7890', message: 'PRIVATE_ORIGINAL', consent: true,
    } });
    assert.equal(created.statusCode, 201, created.body);
    const inquiry = created.json();
    const requestPolicy = { workDays: 180, photoDays: 90, reference: 'SYNTHETIC-REVIEW-01', reason: '합성 업무 보존 기준 검토 요청입니다.' };
    const policyKey = randomUUID();
    const requested = await post('/v1/admin/retention/policies', requestPolicy, operator, policyKey);
    assert.equal(requested.statusCode, 201, requested.body);
    const policy = requested.json().id;
    assert.equal((await post('/v1/admin/retention/policies', requestPolicy, operator, policyKey)).json().id, policy);
    assert.equal((await post('/v1/admin/retention/policies', { ...requestPolicy, workDays: 181 }, operator, policyKey)).statusCode, 409);
    for (const invalid of [{ workDays: 0 }, { workDays: 3651 }, { photoDays: 181 }, { workDays: '180' }, { reason: '짧음' }])
      assert.equal((await post('/v1/admin/retention/policies', { ...requestPolicy, ...invalid })).statusCode, 400);
    for (const actor of [owner, auditor]) assert.equal((await post('/v1/admin/retention/policies', requestPolicy, actor)).statusCode, 403);
    assert.equal((await app.inject({ url: '/v1/admin/retention/policies' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/admin/retention/policies', headers: { ...headers(operator, randomUUID()), origin: 'https://wrong.example' }, payload: requestPolicy })).statusCode, 403);
    const preview = async () => {
      const response = await app.inject({ url: `/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}`, headers: headers(auditor) });
      assert.equal(response.statusCode, 200, response.body);
      assert.doesNotMatch(response.body, /PRIVATE_|010-3456|object_key|visitor_key|receiptKey|summary/);
      return response.json();
    };
    const row = async (kind = 'inquiry', id = inquiry.id) => (await preview()).items.find((item: { targetKind: string; targetId: string }) => item.targetKind === kind && item.targetId === id);
    assert.equal((await row()).reason, 'policy_not_approved');
    const approvalReason = { reason: '합성 검수용 보존 기준을 승인합니다.' };
    assert.equal((await post(`/v1/admin/retention/policies/${policy}/approve`, approvalReason, operator)).statusCode, 403);
    const approved = await post(`/v1/admin/retention/policies/${policy}/approve`, approvalReason, approver);
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal((await post(`/v1/admin/retention/policies/${policy}/approve`, approvalReason, approver)).json().approvedAt, approved.json().approvedAt);
    assert.equal((await row()).reason, 'active_work');
    assert.equal((await post(`/v1/owner/inquiries/${inquiry.id}/close`, { expectedRevision: 0 }, owner)).statusCode, 200);
    const closure = (await pool.query('select retention_closed_at from field.inquiries where id=$1', [inquiry.id])).rows[0].retention_closed_at;
    assert.ok(closure instanceof Date);
    assert.equal((await row()).reason, 'not_due');
    assert.equal((await post(`/v1/owner/inquiries/${inquiry.id}/close`, { expectedRevision: 0 }, owner)).statusCode, 200);
    assert.equal((await pool.query('select retention_closed_at from field.inquiries where id=$1', [inquiry.id])).rows[0].retention_closed_at.toISOString(), closure.toISOString());
    assert.equal((await app.inject({ method: 'POST', url: `/v1/inquiries/${inquiry.id}/messages`,
      headers: { authorization: `Bearer ${inquiry.receiptKey}` }, payload: { body: 'PRIVATE_FOLLOW_UP' } })).statusCode, 201);
    assert.equal((await pool.query('select retention_closed_at from field.inquiries where id=$1', [inquiry.id])).rows[0].retention_closed_at, null);
    assert.equal((await row()).reason, 'active_work');
    const revision = (await pool.query('select revision from field.inquiries where id=$1', [inquiry.id])).rows[0].revision;
    await post(`/v1/owner/inquiries/${inquiry.id}/close`, { expectedRevision: revision }, owner);
    // 과거 시각은 이 격리된 합성 업무에만 적용한다.
    await pool.query("update field.inquiries set retention_closed_at=now()-interval '200 days' where id=$1", [inquiry.id]);
    await pool.query("update field.inquiry_messages set created_at=now()-interval '201 days' where inquiry_id=$1", [inquiry.id]);
    assert.equal((await row()).reason, 'due');
    assert.equal((await row()).workDue, true); assert.equal((await row()).photosDue, true);
    const holdBody = { targetKind: 'inquiry', targetId: inquiry.id, organizationId: org, reasonCode: 'dispute',
      reason: '합성 고객 분쟁 조사를 위한 보류입니다.', reference: 'SYNTHETIC-HOLD-01', reviewDueAt: new Date(Date.now() + 86400000).toISOString() };
    const holdKey = randomUUID();
    const held = await post('/v1/admin/retention/holds', holdBody, operator, holdKey);
    assert.equal(held.statusCode, 201, held.body); const hold = held.json().id;
    assert.equal((await post('/v1/admin/retention/holds', holdBody, operator, holdKey)).json().id, hold);
    assert.equal((await post('/v1/admin/retention/holds', { ...holdBody, reasonCode: 'investigation' }, operator, holdKey)).statusCode, 409);
    assert.equal((await post('/v1/admin/retention/holds', { ...holdBody, organizationId: randomUUID() })).statusCode, 404);
    assert.equal((await post('/v1/admin/retention/holds', { ...holdBody, reasonCode: 'unknown' })).statusCode, 400);
    assert.equal((await post('/v1/admin/retention/holds', { ...holdBody, reasonCode: ['dispute'] })).statusCode, 400);
    assert.equal((await row()).reason, 'active_hold');
    await pool.query("update field.work_retention_holds set review_due_at=now()-interval '1 day' where id=$1", [hold]);
    assert.equal((await row()).reason, 'active_hold');
    const release = { reason: '합성 고객 분쟁 검토가 종료되었습니다.' }, releaseKey = randomUUID();
    assert.equal((await post(`/v1/admin/retention/holds/${hold}/release`, release, operator, releaseKey)).statusCode, 403);
    assert.equal((await post(`/v1/admin/retention/holds/${hold}/release`, release, approver, releaseKey)).statusCode, 200);
    assert.equal((await post(`/v1/admin/retention/holds/${hold}/release`, release, approver, releaseKey)).statusCode, 200);
    assert.equal((await post(`/v1/admin/retention/holds/${hold}/release`, { reason: '서로 다른 합성 검토 해제 사유입니다.' }, approver, releaseKey)).statusCode, 409);
    assert.equal((await row()).reason, 'due');
    await pool.query("update field.inquiry_messages set delivery_state='unknown' where inquiry_id=$1 and sender='owner'", [inquiry.id]);
    // 대기 원문 전달은 고객 메시지가 아닌 사업자 전달 메시지에서 검사한다.
    await pool.query(`insert into field.inquiry_messages(id,inquiry_id,sender,body,delivery_state) values($1,$2,'owner','PRIVATE_DELIVERY','unknown')`, [randomUUID(), inquiry.id]);
    assert.equal((await row()).reason, 'pending_delivery');
    await pool.query("delete from field.inquiry_messages where inquiry_id=$1 and sender='owner'", [inquiry.id]);
    const support = (await post('/v1/admin/support-access', { targetKind: 'inquiry', targetId: inquiry.id, purpose: 'security_incident',
      reference: 'SYNTHETIC-SUPPORT', reason: '합성 업무 보안 사고 확인 목적입니다.', minutes: 15, scopes: ['conversation'], minimumNecessary: true })).json().id;
    await post(`/v1/admin/support-access/${support}/approve`, approvalReason, approver);
    assert.equal((await row()).reason, 'active_support');
    await post(`/v1/admin/support-access/${support}/revoke`, release);
    await pool.query('update field.inquiries set retention_closed_at=null where id=$1', [inquiry.id]);
    assert.equal((await row()).reason, 'unknown_closure');
    const connection = randomUUID(), external = randomUUID();
    await pool.query(`insert into field.ap_connections
      (id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,
       allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values($1,$2,$3,'https://ap.example.invalid/api/auth','synthetic-retention',$4,$5,$6,'Synthetic AI',1,'{}','{}',$7,$7,now(),'revoked')`,
    [connection, org, owner, randomUUID(), randomUUID(), randomUUID(), Buffer.from('synthetic')]);
    await pool.query(`insert into field.external_work_requests
      (id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,body_hash,origin_conversation_id,source_deployment_id,kind,
       service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,consent_record_id,consent_confirmed_at,conditions_hash,is_test,status)
      values($1,$2,'agent-platform',$3,'synthetic',$4,$5,$6,$7,$8,'inquiry',$9,1,1,'{}','{}','{}','PRIVATE_SNAPSHOT',$10,now(),$6,true,'requested')`,
    [external, org, connection, randomUUID(), randomUUID(), 'c'.repeat(64), randomUUID(), randomUUID(), serviceId, randomUUID()]);
    assert.equal((await row('external_request', external)).reason, 'active_work');
    assert.equal((await post(`/v1/owner/external-requests/${external}/close`, { expectedRevision: 0 }, operator)).statusCode, 403);
    const closed = await post(`/v1/owner/external-requests/${external}/close`, { expectedRevision: 0 }, owner);
    assert.equal(closed.statusCode, 200, closed.body);
    assert.equal((await post(`/v1/owner/external-requests/${external}/close`, { expectedRevision: 0 }, owner)).json().closedAt, closed.json().closedAt);
    assert.equal((await row('external_request', external)).reason, 'not_due');
    assert.equal((await app.inject({ url: `/v1/owner/external-requests/${external}`, headers: headers(owner) })).json().fieldWorkState, 'closed');
    const pendingPhoto = randomUUID();
    await pool.query(`insert into field.external_request_attachments(id,organization_id,external_request_id,source_attachment_id,state,next_attempt_at)
      values($1,$2,$3,$4,'pending',now()+interval '1 year')`, [pendingPhoto, org, external, randomUUID()]);
    assert.equal((await row('external_request', external)).reason, 'pending_delivery');
    await pool.query('delete from field.external_request_attachments where id=$1', [pendingPhoto]);
    assert.equal((await pool.query('select status,summary from field.external_work_requests where id=$1', [external])).rows[0].status, 'requested');
    const reservation = randomUUID();
    await pool.query(`insert into field.reservations(id,organization_id,catalog_revision,service_id,service_snapshot,booking_mode,
      customer_name,customer_phone,visitor_key_hash,timezone,state,consent_at,confirmed_start_at,confirmed_end_at)
      values($1,$2,1,$3,'{}','request','PRIVATE_RESERVATION','010-3456-7891',$4,'Asia/Seoul','confirmed',now(),now()+interval '2 days',now()+interval '2 days 30 minutes')`,
    [reservation, org, serviceId, randomUUID()]);
    await pool.query("update field.reservations set state='canceled',revision=revision+1 where id=$1", [reservation]);
    assert.ok((await pool.query('select retention_closed_at from field.reservations where id=$1', [reservation])).rows[0].retention_closed_at);
    await pool.query("update field.reservations set retention_closed_at=now()-interval '200 days' where id=$1", [reservation]);
    assert.equal((await row('reservation', reservation)).reason, 'future_schedule');
    const receivedReservation = randomUUID();
    await pool.query(`insert into field.external_work_requests
      (id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,body_hash,origin_conversation_id,source_deployment_id,kind,
       service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,consent_record_id,consent_confirmed_at,conditions_hash,is_test,status,reservation_id)
      values($1,$2,'agent-platform',$3,'synthetic',$4,$5,$6,$7,$8,'reservation_request',$9,1,1,'{}','{}','{}','PRIVATE_RESERVATION_SNAPSHOT',$10,now(),$6,true,'requested',$11)`,
    [receivedReservation, org, connection, randomUUID(), randomUUID(), 'd'.repeat(64), randomUUID(), randomUUID(), serviceId, randomUUID(), reservation]);
    assert.equal((await row('external_request', receivedReservation)).reason, 'future_schedule');
    await pool.query("update field.reservations set confirmed_start_at=now()-interval '201 days',confirmed_end_at=now()-interval '201 days'+interval '30 minutes' where id=$1", [reservation]);
    assert.equal((await row('reservation', reservation)).reason, 'due');
    const relatedHold = (await post('/v1/admin/retention/holds', { ...holdBody, targetKind: 'external_request', targetId: receivedReservation })).json().id;
    assert.equal((await row('reservation', reservation)).reason, 'active_hold');
    await post(`/v1/admin/retention/holds/${relatedHold}/release`, release, approver);
    assert.equal((await row('reservation', reservation)).reason, 'due');
    const lateMessage = randomUUID(), lateEvent = randomUUID();
    await pool.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload,delivered_at)
      values($1,$2,'field.booking_message.customer',$3,'{}',now())`, [lateEvent, org, reservation]);
    await pool.query(`insert into field.reservation_messages(id,organization_id,reservation_id,sender,body,outbox_id)
      values($1,$2,$3,'customer','PRIVATE_LATE_MESSAGE',$4)`, [lateMessage, org, reservation, lateEvent]);
    assert.equal((await row('reservation', reservation)).reason, 'not_due');
    const ledger = await app.inject({ url: '/v1/admin/retention/audit', headers: headers(auditor) });
    for (const action of ['policy_requested', 'policy_approved', 'hold_created', 'hold_released', 'preview_read']) assert.match(ledger.body, new RegExp(action));
    assert.doesNotMatch(ledger.body, /PRIVATE_|010-3456|object_key|visitor_key/);
    assert.equal((await app.inject({ url: `/v1/inquiries/${inquiry.id}`, headers: { authorization: `Bearer ${inquiry.receiptKey}` } })).statusCode, 200);
    assert.equal((await pool.query('select body from field.inquiry_messages where inquiry_id=$1 order by created_at', [inquiry.id])).rows[0].body, 'PRIVATE_ORIGINAL');
    assert.equal((await post(`/v1/admin/retention/policies/${policy}/retire`, release, approver)).statusCode, 200);
    assert.equal((await row()).reason, 'policy_not_approved');
    const pagedIds = (await pool.query<{ id: string }>(`insert into field.inquiries(id,organization_id,catalog_revision,service_id,service_snapshot,
      customer_name,customer_phone,visitor_key_hash,state,consent_at,created_at)
      select gen_random_uuid(),$1,1,$2,'{}','PRIVATE_PAGINATION','010-3456-7892',gen_random_uuid()::text,'closed',now(),
        now()+interval '1 year'+n*interval '1 microsecond' from generate_series(1,105) n returning id`, [org, serviceId])).rows.map(r => r.id);
    const seen: string[] = []; let cursor: string | null = null;
    do {
      const page: { statusCode: number; body: string; json(): { items: { targetId: string }[]; nextCursor: string | null } }
        = await app.inject({ url: `/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}${cursor ? `&before=${cursor}` : ''}`, headers: headers(auditor) });
      assert.equal(page.statusCode, 200, page.body);
      seen.push(...page.json().items.map((w: { targetId: string }) => w.targetId));
      cursor = page.json().nextCursor;
      if (cursor) assert.equal((await app.inject({ url: `/v1/admin/retention/preview?organizationId=${randomUUID()}&policyId=${policy}&before=${cursor}`, headers: headers(auditor) })).statusCode, 400);
    } while (cursor);
    assert.equal(new Set(seen).size, seen.length);
    for (const id of pagedIds) assert.ok(seen.includes(id), 'microsecond ordered work must not be skipped');
    process.env.FIELD_PROFILE = 'sandbox';
    assert.equal((await app.inject({ url: '/v1/admin/retention/policies', headers: headers(approver) })).statusCode, 503);
  } finally {
    process.env.FIELD_PROFILE = previous; await app.close();
    await pool.query('delete from field.organizations where owner_user_id=any($1::text[])', [users]);
    await pool.query('delete from field.work_retention_policies where requested_by=any($1::text[])', [users]);
    await pool.query('delete from field.platform_admin_memberships where user_id=any($1::text[])', [users]);
    await pool.query('delete from "user" where id=any($1::text[])', [users]); await pool.end();
  }
});
