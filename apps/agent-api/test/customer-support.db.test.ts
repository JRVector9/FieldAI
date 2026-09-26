import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });

test('AP support access binds approved scopes to an inquiry and expires or revokes before returning customer originals and photos', async () => {
  const previous = process.env.AP_PROFILE;
  process.env.AP_PROFILE = 'mock';
  const users = Array.from({ length: 5 }, () => randomUUID());
  const [owner, operator, approver, auditor, stranger] = users as [string, string, string, string, string];
  const objects = new Map<string, Buffer>();
  let slowRead = false, unblock: (() => void) | undefined, entered: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const reading = new Promise<void>(resolve => { entered = resolve; });
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, {
    pool, resolveUserId: async headers => typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null,
    inquiryMedia: { put: async (key, bytes) => { objects.set(key, bytes); },
      get: async key => { if (slowRead) { entered?.(); await gate; } return objects.get(key) ?? null; },
      delete: async key => { objects.delete(key); } },
  });
  const headers = (user: string, key?: string, access?: string) => ({ 'x-test-user': user,
    ...(key ? { 'idempotency-key': key } : {}), ...(access ? { 'x-support-access-id': access } : {}) });
  try {
    for (const user of users) await pool.query('insert into "user"(id,name,email,"emailVerified") values ($1,$2,$3,false)',
      [user, 'Synthetic AP support actor', `${user}@example.invalid`]);
    for (const [user, role] of [[operator, 'operator'], [approver, 'operator'], [auditor, 'auditor'], [stranger, 'operator']])
      await pool.query('insert into ap.platform_admin_memberships(user_id,role) values ($1,$2)', [user, role]);
    const org = (await app.inject({ method: 'POST', url: '/v1/organizations', headers: headers(owner), payload: { name: '지원 검수 조직' } })).json().id;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: headers(owner), payload: {
      expectedRevision: 0, businessName: '지원 검수 조직', introduction: '승인 소개', services: [], faqs: [],
    } })).statusCode, 200);
    await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: headers(owner), payload: { expectedRevision: 1 } });
    const inquiries = [];
    for (let index = 0; index < 2; index++) {
      const made = await app.inject({ method: 'POST', url: `/v1/public/organizations/${org}/inquiries`,
        payload: { name: `PRIVATE_CUSTOMER_${index}`, phone: '010-3333-4444', message: `PRIVATE_CUSTOMER_BODY_${index}`, consent: true } });
      assert.equal(made.statusCode, 201);
      inquiries.push(made.json());
    }
    const [inquiry, other] = inquiries;
    const original = (await app.inject({ url: `/v1/inquiries/${inquiry.id}`, headers: { authorization: `Bearer ${inquiry.receiptKey}` } })).json();
    assert.equal((await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${inquiry.id}/notes`, headers: headers(owner),
      payload: { body: 'PRIVATE_INTERNAL_NOTE', expectedRevision: original.revision } })).statusCode, 201);
    const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#225588' } }).png().toBuffer();
    const upload = await app.inject({ method: 'POST', url: `/v1/inquiries/${inquiry.id}/messages/${original.messages[0].id}/attachments`,
      headers: { authorization: `Bearer ${inquiry.receiptKey}`, 'content-type': 'application/octet-stream' }, payload: png });
    assert.equal(upload.statusCode, 201);
    const photo = upload.json().id;
    const snapshot = (await pool.query('select * from ap.inquiries where id=$1', [inquiry.id])).rows[0];
    const body = { inquiryId: inquiry.id, purpose: 'customer_requested_investigation', reference: 'SYNTHETIC-SUPPORT-001',
      reason: '고객이 요청한 문의 화면 장애 조사', minutes: 15, scopes: ['conversation'], minimumNecessary: true };
    const key = randomUUID();
    const requestAccess = (payload = body, submittedKey = key, user = operator) => app.inject({ method: 'POST',
      url: '/v1/admin/support-access', headers: headers(user, submittedKey), payload });
    const made = await requestAccess();
    assert.equal(made.statusCode, 201, made.body);
    const access = made.json().id;
    assert.equal((await requestAccess()).json().id, access);
    assert.equal((await requestAccess({ ...body, reason: '고객 원본 변경을 위한 별도 목적' })).statusCode, 409);
    assert.equal((await requestAccess({ ...body, scopes: ['conversation', 'conversation'] }, randomUUID())).statusCode, 400);
    assert.equal((await requestAccess({ ...body, scopes: ['all'] }, randomUUID())).statusCode, 400);
    assert.equal((await requestAccess({ ...body, purpose: ['security_incident'] as unknown as string }, randomUUID())).statusCode, 400);
    assert.equal((await requestAccess({ ...body, reason: '짧은 사유' }, randomUUID())).statusCode, 400);
    assert.equal((await requestAccess({ ...body, minimumNecessary: false }, randomUUID())).statusCode, 400);
    assert.equal((await requestAccess(body, randomUUID(), owner)).statusCode, 403);
    assert.equal((await requestAccess(body, randomUUID(), auditor)).statusCode, 403);
    assert.equal((await app.inject({ url: '/v1/admin/support-access' })).statusCode, 401);
    const queue = await app.inject({ url: '/v1/admin/support-access', headers: headers(auditor) });
    assert.equal(queue.statusCode, 200);
    assert.doesNotMatch(queue.body, /PRIVATE_CUSTOMER|010-3333|object_key|visitor_key/);
    const details = (grant = access, user = operator, id = inquiry.id) => app.inject({ url: `/v1/admin/support/inquiries/${id}`,
      headers: headers(user, undefined, grant) });
    assert.equal((await details()).statusCode, 403);
    const approve = (grant = access, user = approver) => app.inject({ method: 'POST', url: `/v1/admin/support-access/${grant}/approve`,
      headers: headers(user), payload: { reason: '고객 요청 장애 조사 범위를 승인합니다.' } });
    assert.equal((await approve(access, operator)).statusCode, 403);
    assert.equal((await approve(access, auditor)).statusCode, 403);
    const approved = await approve();
    assert.equal(approved.statusCode, 200);
    assert.equal((await approve()).json().expiresAt, approved.json().expiresAt);
    assert.equal((await details(access, approver)).statusCode, 403);
    assert.equal((await details(access, stranger)).statusCode, 403);
    assert.equal((await details(access, operator, other.id)).statusCode, 403);
    const granted = await details();
    assert.equal(granted.statusCode, 200);
    assert.match(granted.body, /PRIVATE_CUSTOMER_BODY_0/);
    assert.doesNotMatch(granted.body, /PRIVATE_INTERNAL_NOTE|PRIVATE_CUSTOMER_0|010-3333|visitor_key|receiptKey|object_key|consult_session/);
    assert.equal(granted.json().contact, undefined);
    assert.equal(granted.json().attachments, undefined);
    const readPhoto = (grant = access, id = inquiry.id) => app.inject({ url: `/v1/admin/support/inquiries/${id}/attachments/${photo}`,
      headers: headers(operator, undefined, grant) });
    assert.equal((await readPhoto()).statusCode, 403);
    const photoAccess = (await requestAccess({ ...body, scopes: ['photos', 'contact'] }, randomUUID())).json().id;
    assert.equal((await approve(photoAccess)).statusCode, 200);
    const photoDetails = await details(photoAccess);
    assert.equal(photoDetails.statusCode, 200);
    assert.equal(photoDetails.json().contact.customerName, 'PRIVATE_CUSTOMER_0');
    assert.equal(photoDetails.json().contact.numberOwnership, 'unverified');
    assert.equal(photoDetails.json().messages, undefined);
    assert.equal(photoDetails.json().attachments[0].id, photo);
    assert.doesNotMatch(photoDetails.body, /PRIVATE_INTERNAL_NOTE|PRIVATE_CUSTOMER_BODY|visitor_key|object_key|sha256/);
    assert.equal((await readPhoto(photoAccess, other.id)).statusCode, 403);
    const bytes = await readPhoto(photoAccess);
    assert.equal(bytes.statusCode, 200);
    assert.equal(bytes.headers['content-type'], 'image/webp');
    assert.equal(bytes.headers['cache-control'], 'private, no-store');
    assert.equal(createHash('sha256').update(bytes.rawPayload).digest('hex'), createHash('sha256').update([...objects.values()][0]!).digest('hex'));
    slowRead = true;
    const pending = readPhoto(photoAccess);
    await reading;
    const revokeBody = { reason: '고객 요청에 따라 사진 열람 권한을 회수합니다.' };
    const revokeKey = randomUUID();
    const revoke = (user = approver) => app.inject({ method: 'POST', url: `/v1/admin/support-access/${photoAccess}/revoke`,
      headers: headers(user, revokeKey), payload: revokeBody });
    assert.equal((await revoke(stranger)).statusCode, 403);
    assert.equal((await revoke()).statusCode, 200);
    assert.equal((await revoke()).statusCode, 200);
    unblock?.();
    assert.equal((await pending).statusCode, 403);
    assert.equal((await details(photoAccess)).statusCode, 403);
    await pool.query("update ap.customer_support_access_requests set approved_at=now()-interval '16 minutes',expires_at=now()-interval '1 second' where id=$1", [access]);
    assert.equal((await details()).statusCode, 403);
    const renewed = (await requestAccess(body, randomUUID())).json().id;
    assert.equal((await approve(renewed)).statusCode, 200);
    await pool.query('delete from ap.platform_admin_memberships where user_id=$1', [approver]);
    assert.equal((await details(renewed)).statusCode, 403);
    const audit = (await pool.query('select action from ap.customer_support_audit where inquiry_id=$1', [inquiry.id])).rows.map(row => row.action);
    for (const action of ['requested', 'approved', 'detail_read', 'photo_read', 'revoked', 'read_denied']) assert.ok(audit.includes(action), action);
    const auditQueue = await app.inject({ url: '/v1/admin/support-audit', headers: headers(auditor) });
    assert.equal(auditQueue.statusCode, 200);
    assert.match(auditQueue.body, /photo_read/);
    assert.doesNotMatch(auditQueue.body, /PRIVATE_CUSTOMER|PRIVATE_INTERNAL|010-3333|object_key|visitor_key|sha256/);
    assert.deepEqual((await pool.query('select * from ap.inquiries where id=$1', [inquiry.id])).rows[0], snapshot);
    assert.equal((await app.inject({ url: `/v1/inquiries/${inquiry.id}`, headers: { authorization: `Bearer ${inquiry.receiptKey}` } })).statusCode, 200);
    process.env.AP_PROFILE = 'sandbox';
    assert.equal((await app.inject({ url: '/v1/admin/support-access', headers: headers(operator) })).json().error, 'blocked_integration');
  } finally {
    unblock?.(); process.env.AP_PROFILE = previous;
    await app.close();
    await pool.query('delete from ap.organizations where owner_user_id=any($1::text[])', [users]);
    await pool.query('delete from "user" where id=any($1::text[])', [users]);
    await pool.end();
  }
});
