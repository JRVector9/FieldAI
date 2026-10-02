import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });

test('Field support grants bind each original work kind and approved scope, preserving work while private photo access expires or is revoked', async () => {
  const previous = process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE = 'mock';
  const users = Array.from({ length: 5 }, () => randomUUID());
  const [owner, operator, approver, auditor, stranger] = users as [string, string, string, string, string];
  const objects = new Map<string, Buffer>();
  let slowRead = false, unblock: (() => void) | undefined, entered: (() => void) | undefined;
  let measurePool = false, poolInUseDuringRead: number | null = null;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const reading = new Promise<void>(resolve => { entered = resolve; });
  const app = createFieldApp(async () => undefined, undefined, undefined, {
    pool, resolveUserId: async headers => typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null,
    inquiryMedia: { put: async (key, bytes) => { objects.set(key, bytes); },
      get: async key => { if (measurePool) poolInUseDuringRead = pool.totalCount - pool.idleCount;
        if (slowRead) { entered?.(); await gate; } return objects.get(key) ?? null; },
      delete: async key => { objects.delete(key); } },
  });
  const headers = (user: string, key?: string, access?: string) => ({ 'x-test-user': user,
    ...(key ? { 'idempotency-key': key } : {}), ...(access ? { 'x-support-access-id': access } : {}) });
  try {
    for (const user of users) await pool.query('insert into "user"(id,name,email,"emailVerified") values ($1,$2,$3,false)',
      [user, 'Synthetic Field support actor', `${user}@example.invalid`]);
    for (const [user, role] of [[operator, 'operator'], [approver, 'operator'], [auditor, 'auditor'], [stranger, 'operator']])
      await pool.query('insert into field.platform_admin_memberships(user_id,role) values ($1,$2)', [user, role]);
    const org = (await app.inject({ method: 'POST', url: '/v1/organizations', headers: headers(owner), payload: { name: '지원 검수 조직' } })).json().id;
    const serviceId = randomUUID();
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: headers(owner), payload: {
      expectedRevision: 0, businessName: '지원 검수 조직', introduction: '승인 소개', region: '서울', openingHours: '평일', contactPhone: '',
      services: [{ id: serviceId, name: '상담', description: '상담 설명', bookingMode: 'request', durationMinutes: 30, priceAmount: null }],
    } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: headers(owner), payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/booking-policy', headers: headers(owner), payload: {
      expectedRevision: 0, timezone: 'Asia/Seoul', weekly: { mon: { open: '10:00', close: '18:00' } },
      beforeMinutes: 0, afterMinutes: 0, minLeadMinutes: 0, horizonDays: 30,
    } })).statusCode, 200);
    const madeInquiry = await app.inject({ method: 'POST', url: `/v1/public/catalog/${org}/inquiries`, payload: {
      serviceId, name: 'PRIVATE_INQUIRY_CUSTOMER', phone: '010-3333-4444', message: 'PRIVATE_INQUIRY_BODY', visitRegion: 'PRIVATE_INQUIRY_REGION', consent: true,
    } });
    assert.equal(madeInquiry.statusCode, 201);
    const inquiry = madeInquiry.json();
    const original = (await app.inject({ url: `/v1/inquiries/${inquiry.id}`, headers: { authorization: `Bearer ${inquiry.receiptKey}` } })).json();
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${inquiry.id}/notes`, headers: headers(owner),
      payload: { body: 'PRIVATE_INTERNAL_NOTE', expectedRevision: original.revision } })).statusCode, 201);
    const madeReservation = await app.inject({ method: 'POST', url: `/v1/public/catalog/${org}/reservations`, payload: {
      serviceId, name: 'PRIVATE_RESERVATION_CUSTOMER', phone: '010-3333-4445', preferredTimeText: '다음 주 오전',
      requestMessage: 'PRIVATE_RESERVATION_SUBMISSION', visitRegion: 'PRIVATE_RESERVATION_REGION', consent: true,
    } });
    assert.equal(madeReservation.statusCode, 201, madeReservation.body);
    const reservation = madeReservation.json();
    assert.equal((await app.inject({ method: 'POST', url: `/v1/reservations/${reservation.id}/messages`,
      headers: { authorization: `Bearer ${reservation.receiptKey}` }, payload: { messageId: randomUUID(), body: 'PRIVATE_RESERVATION_MESSAGE' } })).statusCode, 201);
    const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#225588' } }).png().toBuffer();
    const photoFor = async (path: string, receipt: string) => {
      const result = await app.inject({ method: 'POST', url: path, headers: { authorization: `Bearer ${receipt}`, 'content-type': 'application/octet-stream' }, payload: png });
      assert.equal(result.statusCode, 201, result.body); return result.json().id;
    };
    const inquiryPhoto = await photoFor(`/v1/inquiries/${inquiry.id}/messages/${original.messages[0].id}/attachments`, inquiry.receiptKey);
    const reservationPhoto = await photoFor(`/v1/reservations/${reservation.id}/attachments`, reservation.receiptKey);
    // 예약 내보내기는 DB 연결을 반납한 뒤 사진을 읽고, 결과 형식은 그대로다.
    measurePool = true;
    const exportedReservation = await app.inject({ url: `/v1/owner/reservations/${reservation.id}/export`, headers: headers(owner) });
    measurePool = false;
    assert.equal(exportedReservation.statusCode, 200, exportedReservation.body);
    assert.equal(poolInUseDuringRead, 0);
    const exportedPhoto = exportedReservation.json().attachments[0];
    assert.equal(exportedPhoto.id, reservationPhoto);
    assert.equal(Buffer.from(exportedPhoto.dataBase64, 'base64').length, exportedPhoto.byteSize);
    const originalInquiry = (await pool.query('select * from field.inquiries where id=$1', [inquiry.id])).rows[0];
    const originalReservation = (await pool.query('select * from field.reservations where id=$1', [reservation.id])).rows[0];
    const outboxCount = (await pool.query('select count(*)::int as n from field.outbox where organization_id=$1', [org])).rows[0].n;
    const body = { targetKind: 'inquiry', targetId: inquiry.id, purpose: 'customer_requested_investigation', reference: 'SYNTHETIC-SUPPORT-001',
      reason: '고객이 요청한 업무 화면 장애 조사', minutes: 15, scopes: ['conversation'], minimumNecessary: true };
    const key = randomUUID();
    const requestAccess = (payload = body, submittedKey = key, user = operator) => app.inject({ method: 'POST',
      url: '/v1/admin/support-access', headers: { ...headers(user, submittedKey), origin: 'http://localhost:3002' }, payload });
    const requested = await requestAccess();
    assert.equal(requested.statusCode, 201, requested.body);
    const access = requested.json().id;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/admin/support-access',
      headers: { ...headers(operator, randomUUID()), origin: 'http://127.0.0.1:3002' }, payload: body })).statusCode, 201);
    assert.equal((await requestAccess()).json().id, access);
    assert.equal((await requestAccess({ ...body, targetKind: 'reservation', targetId: reservation.id })).statusCode, 409);
    for (const invalid of [{ scopes: ['conversation', 'conversation'] }, { scopes: ['all'] }, { minimumNecessary: false },
      { purpose: ['security_incident'] }, { reason: '짧음' }, { minutes: 0 }, { minutes: 61 }, { targetKind: 'ap_conversation' }])
      assert.equal((await requestAccess({ ...body, ...invalid } as typeof body, randomUUID())).statusCode, 400);
    assert.equal((await requestAccess(body, randomUUID(), owner)).statusCode, 403);
    assert.equal((await requestAccess(body, randomUUID(), auditor)).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/admin/support-access', headers: { ...headers(operator, randomUUID()), origin: 'https://wrong.example' }, payload: body })).statusCode, 403);
    assert.equal((await app.inject({ url: '/v1/admin/support-access' })).statusCode, 401);
    const queue = await app.inject({ url: '/v1/admin/support-access', headers: headers(auditor) });
    assert.equal(queue.statusCode, 200);
    assert.doesNotMatch(queue.body, /PRIVATE_|010-3333|object_key|visitor_key/);
    const details = (grant = access, kind = 'inquiry', id = inquiry.id, user = operator) => app.inject({ url: `/v1/admin/support/${kind}/${id}`, headers: headers(user, undefined, grant) });
    const approve = (grant: string, user = approver) => app.inject({ method: 'POST', url: `/v1/admin/support-access/${grant}/approve`,
      headers: headers(user), payload: { reason: '고객 요청 장애 조사 범위를 승인합니다.' } });
    assert.equal((await details()).statusCode, 403);
    assert.equal((await approve(access, operator)).statusCode, 403);
    assert.equal((await approve(access, auditor)).statusCode, 403);
    const approved = await approve(access);
    assert.equal(approved.statusCode, 200);
    assert.equal((await approve(access)).json().expiresAt, approved.json().expiresAt);
    assert.equal((await details(access, 'inquiry', inquiry.id, approver)).statusCode, 403);
    assert.equal((await details(access, 'inquiry', inquiry.id, stranger)).statusCode, 403);
    assert.equal((await details(access, 'reservation', reservation.id)).statusCode, 403);
    const granted = await details();
    assert.equal(granted.statusCode, 200);
    assert.match(granted.body, /PRIVATE_INQUIRY_BODY/);
    assert.doesNotMatch(granted.body, /PRIVATE_INTERNAL_NOTE|PRIVATE_INQUIRY_CUSTOMER|PRIVATE_INQUIRY_REGION|010-3333|visitor_key|receiptKey|object_key/);
    assert.equal(granted.json().contact, undefined);
    assert.equal(granted.json().attachments, undefined);
    const readPhoto = (grant: string, kind: string, id: string, photo: string) => app.inject({ url: `/v1/admin/support/${kind}/${id}/attachments/${photo}`, headers: headers(operator, undefined, grant) });
    assert.equal((await readPhoto(access, 'inquiry', inquiry.id, inquiryPhoto)).statusCode, 403);
    const inquiryPhotoAccess = (await requestAccess({ ...body, scopes: ['contact', 'photos'] }, randomUUID())).json().id;
    assert.equal((await approve(inquiryPhotoAccess)).statusCode, 200);
    const contact = await details(inquiryPhotoAccess);
    assert.equal(contact.json().contact.customerName, 'PRIVATE_INQUIRY_CUSTOMER');
    assert.equal(contact.json().contact.visitRegion, 'PRIVATE_INQUIRY_REGION');
    assert.equal(contact.json().contact.numberOwnership, 'unverified');
    assert.doesNotMatch(contact.body, /PRIVATE_INQUIRY_BODY|PRIVATE_INTERNAL_NOTE|object_key|sha256/);
    assert.equal((await readPhoto(inquiryPhotoAccess, 'inquiry', inquiry.id, inquiryPhoto)).statusCode, 200);
    const reservationAccess = (await requestAccess({ ...body, targetKind: 'reservation', targetId: reservation.id }, randomUUID())).json().id;
    assert.equal((await approve(reservationAccess)).statusCode, 200);
    const reservationDetail = await details(reservationAccess, 'reservation', reservation.id);
    assert.equal(reservationDetail.statusCode, 200);
    assert.match(reservationDetail.body, /PRIVATE_RESERVATION_SUBMISSION/);
    assert.match(reservationDetail.body, /PRIVATE_RESERVATION_MESSAGE/);
    assert.doesNotMatch(reservationDetail.body, /PRIVATE_RESERVATION_CUSTOMER|PRIVATE_RESERVATION_REGION|010-3333|visitor_key|outbox_id|actor_user_id/);
    const reservationPhotoAccess = (await requestAccess({ ...body, targetKind: 'reservation', targetId: reservation.id, scopes: ['contact', 'photos'] }, randomUUID())).json().id;
    await approve(reservationPhotoAccess);
    const reservationContact = await details(reservationPhotoAccess, 'reservation', reservation.id);
    assert.equal(reservationContact.json().contact.visitRegion, 'PRIVATE_RESERVATION_REGION');
    assert.equal(reservationContact.json().messages, undefined);
    assert.equal(reservationContact.json().submission, undefined);
    assert.equal((await readPhoto(reservationPhotoAccess, 'reservation', reservation.id, inquiryPhoto)).statusCode, 404);
    const bytes = await readPhoto(reservationPhotoAccess, 'reservation', reservation.id, reservationPhoto);
    assert.equal(bytes.statusCode, 200);
    assert.equal(bytes.headers['content-type'], 'image/webp');
    assert.equal(bytes.headers['cache-control'], 'private, no-store');
    assert.equal(createHash('sha256').update(bytes.rawPayload).digest('hex'), createHash('sha256').update([...objects.values()][0]!).digest('hex'));
    slowRead = true;
    const pending = readPhoto(reservationPhotoAccess, 'reservation', reservation.id, reservationPhoto);
    await reading;
    const revokeKey = randomUUID();
    const revoke = (user = approver) => app.inject({ method: 'POST', url: `/v1/admin/support-access/${reservationPhotoAccess}/revoke`,
      headers: headers(user, revokeKey), payload: { reason: '업무 장애 조사가 끝나 사진 열람 권한을 회수합니다.' } });
    assert.equal((await revoke(stranger)).statusCode, 403);
    assert.equal((await revoke()).statusCode, 200);
    assert.equal((await revoke()).statusCode, 200);
    unblock?.(); slowRead = false;
    assert.equal((await pending).statusCode, 403);
    assert.equal((await details(reservationPhotoAccess, 'reservation', reservation.id)).statusCode, 403);
    const connection = randomUUID(), external = randomUUID();
    await pool.query(`insert into field.ap_connections
      (id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,
       allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values ($1,$2,$3,'https://ap.example.invalid/api/auth','synthetic-support',$4,$5,$6,'Support AI',1,'{}','{}',$7,$8,now()+interval '1 hour','revoked')`,
    [connection, org, owner, randomUUID(), randomUUID(), randomUUID(), Buffer.from('PRIVATE_ACCESS_TOKEN'), Buffer.from('PRIVATE_REFRESH_TOKEN')]);
    await pool.query(`insert into field.external_work_requests
      (id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,body_hash,origin_conversation_id,source_deployment_id,kind,
       service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,consent_record_id,consent_confirmed_at,conditions_hash,is_test,status)
      values ($1,$2,'agent-platform',$3,'PRIVATE_CLIENT',$4,$5,$6,$7,$8,'inquiry',$9,1,1,'{}',$10::jsonb,$11::jsonb,'PRIVATE_RECEIVED_SUMMARY',$12,now(),$13,true,'requested')`,
    [external, org, connection, randomUUID(), randomUUID(), 'a'.repeat(64), randomUUID(), randomUUID(), serviceId,
      JSON.stringify({ name: 'PRIVATE_RECEIVED_CUSTOMER', phone: '010-3333-4446', verified: false, token: 'PRIVATE_CUSTOMER_TOKEN' }),
      JSON.stringify({ mode: 'inquiry', timezone: 'Asia/Seoul', debug: 'PRIVATE_SNAPSHOT_DEBUG' }), randomUUID(), 'b'.repeat(64)]);
    const copied = randomUUID(), waiting = randomUUID();
    const saved = [...objects.values()][0]!;
    objects.set(`${org}/${copied}.webp`, saved);
    await pool.query(`insert into field.external_request_attachments
      (id,organization_id,external_request_id,source_attachment_id,state,object_key,sha256,byte_size,width,height,copied_at)
      values ($1,$2,$3,$4,'copied',$5,$6,$7,4,3,now())`,
    [copied, org, external, randomUUID(), `${org}/${copied}.webp`, createHash('sha256').update(saved).digest('hex'), saved.length]);
    await pool.query(`insert into field.external_request_attachments(id,organization_id,external_request_id,source_attachment_id,state,next_attempt_at)
      values ($1,$2,$3,$4,'pending',now()+interval '1 year')`, [waiting, org, external, randomUUID()]);
    const externalAccess = (await requestAccess({ ...body, targetKind: 'external_request', targetId: external, scopes: ['conversation', 'contact', 'photos'] }, randomUUID())).json().id;
    assert.equal((await approve(externalAccess)).statusCode, 200);
    const received = await details(externalAccess, 'external_request', external);
    assert.equal(received.statusCode, 200);
    assert.equal(received.json().submission.summary, 'PRIVATE_RECEIVED_SUMMARY');
    assert.equal(received.json().contact.customerName, 'PRIVATE_RECEIVED_CUSTOMER');
    assert.equal(received.json().messages, undefined);
    assert.doesNotMatch(received.body, /PRIVATE_CLIENT|PRIVATE_ACCESS_TOKEN|PRIVATE_REFRESH_TOKEN|PRIVATE_CUSTOMER_TOKEN|PRIVATE_SNAPSHOT_DEBUG|source_deployment|origin_conversation|object_key|sha256/);
    assert.equal(received.json().attachments.find((item: { id: string }) => item.id === waiting).state, 'pending');
    assert.equal((await readPhoto(externalAccess, 'external_request', external, waiting)).statusCode, 409);
    assert.equal((await readPhoto(externalAccess, 'external_request', external, copied)).statusCode, 200);
    await pool.query("update field.customer_support_access_requests set approved_at=now()-interval '16 minutes',expires_at=now()-interval '1 second' where id=$1", [access]);
    assert.equal((await details()).statusCode, 403);
    await pool.query('delete from field.platform_admin_memberships where user_id=$1', [approver]);
    assert.equal((await details(reservationAccess, 'reservation', reservation.id)).statusCode, 403);
    await pool.query("insert into field.platform_admin_memberships(user_id,role) values ($1,'operator')", [approver]);
    await pool.query('delete from field.platform_admin_memberships where user_id=$1', [operator]);
    assert.equal((await details(externalAccess, 'external_request', external)).statusCode, 403);
    const audit = await app.inject({ url: '/v1/admin/support-audit', headers: headers(auditor) });
    assert.equal(audit.statusCode, 200);
    for (const action of ['requested', 'approved', 'detail_read', 'photo_read', 'revoked', 'read_denied']) assert.match(audit.body, new RegExp(action));
    assert.doesNotMatch(audit.body, /PRIVATE_|010-3333|object_key|visitor_key|sha256/);
    assert.deepEqual((await pool.query('select * from field.inquiries where id=$1', [inquiry.id])).rows[0], originalInquiry);
    assert.deepEqual((await pool.query('select * from field.reservations where id=$1', [reservation.id])).rows[0], originalReservation);
    assert.equal((await pool.query('select count(*)::int as n from field.outbox where organization_id=$1', [org])).rows[0].n, outboxCount);
    assert.equal((await pool.query('select count(*)::int as n from field.occupancies where organization_id=$1', [org])).rows[0].n, 0);
    for (const [kind, receipt] of [['inquiries', inquiry], ['reservations', reservation]])
      assert.equal((await app.inject({ url: `/v1/${kind}/${receipt.id}`, headers: { authorization: `Bearer ${receipt.receiptKey}` } })).statusCode, 200);
    process.env.FIELD_PROFILE = 'sandbox';
    assert.equal((await app.inject({ url: '/v1/admin/support-access', headers: headers(approver) })).json().error, 'blocked_integration');
  } finally {
    unblock?.(); process.env.FIELD_PROFILE = previous;
    await app.close();
    await pool.query('delete from field.organizations where owner_user_id=any($1::text[])', [users]);
    await pool.query('delete from "user" where id=any($1::text[])', [users]);
    await pool.end();
  }
});
