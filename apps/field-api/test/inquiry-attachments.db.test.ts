import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createFieldApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4321';

async function owner() {
  const email = `field-attachment-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('Field keeps customer inquiry photos private and retrievable by receipt or organization member', async () => {
  const account = await owner();
  const other = await owner();
  const objects = new Map<string, Buffer>();
  const siteObjects = new Map<string, Buffer>();
  const runtime = {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    inquiryMedia: {
      put: async (key: string, data: Buffer) => { objects.set(key, data); },
      get: async (key: string) => objects.get(key) ?? null,
      delete: async (key: string) => { objects.delete(key); },
    },
    siteMedia: {
      put: async (key: string, data: Buffer) => { siteObjects.set(key, data); },
      get: async (key: string) => siteObjects.get(key) ?? null,
      delete: async (key: string) => { siteObjects.delete(key); },
    },
  };
  const app = createFieldApp(async () => undefined, auth.handler, base, runtime);
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: account.cookie }, payload: { name: 'Field 비공개 사진 검수' } });
    assert.equal(organization.statusCode, 201);
    const organizationId = organization.json().id as string;
    const otherOrganization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: other.cookie }, payload: { name: '다른 사진 검수 조직' } });
    assert.equal(otherOrganization.statusCode, 201);
    const serviceId = randomUUID();
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: account.cookie }, payload: {
        expectedRevision: 0, businessName: 'Field 비공개 사진 검수', introduction: '문의 가능',
        region: '서울', openingHours: '평일', contactPhone: '010-0000-0000', services: [
          { id: serviceId, name: '상담', description: '서비스', bookingMode: 'request',
            durationMinutes: 30, priceAmount: null },
        ],
      } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: account.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const submitted = await app.inject({ method: 'POST', url: `/v1/public/catalog/${organizationId}/inquiries`,
      payload: { serviceId, name: '사진 고객', phone: '010-3333-4444', message: '사진을 확인해 주세요', consent: true } });
    assert.equal(submitted.statusCode, 201);
    const { id: inquiryId, receiptKey } = submitted.json() as { id: string; receiptKey: string };
    const opened = await app.inject({ url: `/v1/inquiries/${inquiryId}`,
      headers: { authorization: `Bearer ${receiptKey}` } });
    const messageId = opened.json().messages[0].id as string;
    const path = `/v1/inquiries/${inquiryId}/messages/${messageId}/attachments`;
    const jpeg = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#c84d32' } })
      .jpeg().withExif({ IFD0: { ImageDescription: 'private customer metadata' } }).toBuffer();
    const uploadHeaders = { authorization: `Bearer ${receiptKey}`, 'content-type': 'application/octet-stream' };
    const withoutStore = createFieldApp(async () => undefined, auth.handler, base, {
      pool, resolveUserId: runtime.resolveUserId,
    });
    try {
      const blocked = await withoutStore.inject({ method: 'POST', url: path,
        headers: uploadHeaders, payload: jpeg });
      assert.equal(blocked.statusCode, 503);
      assert.equal(blocked.json().error, 'blocked_integration');
    } finally { await withoutStore.close(); }
    const uploaded = await app.inject({ method: 'POST', url: path, headers: uploadHeaders, payload: jpeg });
    assert.equal(uploaded.statusCode, 201);
    const attachmentId = uploaded.json().id as string;
    const exportFile = await app.inject({ url: `/v1/owner/inquiries/${inquiryId}/export`,
      headers: { cookie: account.cookie } });
    assert.equal(exportFile.statusCode, 200);
    assert.equal(exportFile.json().attachments[0].id, attachmentId);
    assert.equal(exportFile.json().attachments[0].downloadPath,
      `/v1/owner/inquiries/${inquiryId}/attachments/${attachmentId}`);
    assert.equal(objects.size, 1);
    const repeated = await app.inject({ method: 'POST', url: path, headers: uploadHeaders, payload: jpeg });
    assert.equal(repeated.statusCode, 200);
    assert.equal(repeated.json().id, attachmentId);
    assert.equal(objects.size, 1);
    const saved = [...objects.values()][0]!;
    const metadata = await sharp(saved).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.exif, undefined);
    const secondInquiry = await app.inject({ method: 'POST',
      url: `/v1/public/catalog/${organizationId}/inquiries`,
      payload: { serviceId, name: '두 번째 고객', phone: '010-5555-6666',
        message: '두 번째 Field 문의', consent: true } });
    assert.equal(secondInquiry.statusCode, 201);
    const reservationId = randomUUID();
    await pool.query(`insert into field.reservations
      (id,organization_id,catalog_revision,service_id,service_snapshot,booking_mode,
       customer_name,customer_phone,visitor_key_hash,preferred_time_text,timezone,state,consent_at)
      values ($1,$2,1,$3,$4::jsonb,'request','예약 고객','010-7777-8888',$5,
        '다음 주 오후','Asia/Seoul','requested',now())`,
    [reservationId, organizationId, serviceId, JSON.stringify({ id: serviceId, name: '상담' }),
      randomBytes(32).toString('hex')]);
    await pool.query(`insert into field.reservation_events
      (id,reservation_id,organization_id,revision,actor_type,event_type,next_state)
      values ($1,$2,$3,0,'customer','requested','requested')`,
    [randomUUID(), reservationId, organizationId]);
    const assetId = randomUUID();
    const assetKey = `${organizationId}/${assetId}.webp`;
    siteObjects.set(assetKey, saved);
    await pool.query(`insert into field.site_assets
      (id,organization_id,object_key,content_type,byte_size,width,height,sha256,uploaded_by)
      select $1,$2,$3,'image/webp',$4,$5,$6,$7,id from "user" where email=$8`,
    [assetId, organizationId, assetKey, saved.length, metadata.width, metadata.height,
      createHash('sha256').update(saved).digest('hex'), account.email]);
    const ownerId = (await pool.query<{ id: string }>('select id from "user" where email=$1',
      [account.email])).rows[0]!.id;
    const connectionId = randomUUID();
    await pool.query(`insert into field.ap_connections
      (id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,
       ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,
       allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,
       access_expires_at,status)
      values ($1,$2,$3,'http://127.0.0.1:4311/api/auth','archive-test',$4,$5,$6,
        'Archive AI',1,'{}','{}',$7,$8,now() + interval '1 hour','revoked')`,
    [connectionId, organizationId, ownerId, randomUUID(), randomUUID(), randomUUID(),
      Buffer.from('private-field-access-token'), Buffer.from('private-field-refresh-token')]);
    await pool.query(`insert into field.ap_connection_revocations
      (id,connection_id,state,acknowledged_at) values ($1,$2,'acked',now())`,
    [randomUUID(), connectionId]);
    await pool.query(`insert into field.ap_received_connection_revocations
      (id,connection_id) values ($1,$2)`, [randomUUID(), connectionId]);
    const trialStarted = await app.inject({ method: 'POST', url: '/v1/subscription/trial',
      headers: { cookie: account.cookie },
      payload: { consentVersion: 'mock-trial-v1', termsAccepted: true } });
    assert.equal(trialStarted.statusCode, 201);
    const trialCanceled = await app.inject({ method: 'POST', url: '/v1/subscription/cancel',
      headers: { cookie: account.cookie }, payload: {} });
    assert.equal(trialCanceled.statusCode, 200);
    const externalInquiryId = randomUUID();
    const externalReservationId = randomUUID();
    const externalRequest = async (id: string, kind: 'inquiry' | 'reservation_request',
      linkedReservationId: string | null) => pool.query(`insert into field.external_work_requests
        (id,organization_id,provider,connection_id,client_id,field_grant_id,
         action_request_id,body_hash,origin_conversation_id,source_deployment_id,kind,
         service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,
         request_snapshot,summary,consent_record_id,consent_confirmed_at,conditions_hash,
         is_test,reservation_id,status)
        values ($1,$2,'agent-platform',$3,'private-client',$4,$5,$6,$7,$8,$9,$10,
          1,1,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,now(),$16,false,$17,'requested')`,
      [id, organizationId, connectionId, randomUUID(), randomUUID(), 'a'.repeat(64),
        randomUUID(), randomUUID(), kind, serviceId,
        JSON.stringify({ id: serviceId, name: '상담' }),
        JSON.stringify({ name: '전달 고객', phone: '010-1111-2222', verified: false }),
        JSON.stringify({ note: 'Field가 받은 문의' }), kind === 'inquiry' ? '외부 문의' : '외부 예약',
        randomUUID(), 'b'.repeat(64), linkedReservationId]);
    await externalRequest(externalInquiryId, 'inquiry', null);
    await externalRequest(externalReservationId, 'reservation_request', reservationId);
    const copiedId = assetId;
    const copiedKey = `${organizationId}/${copiedId}.webp`;
    const externalSaved = await sharp({ create: { width: 4, height: 3, channels: 3,
      background: '#247ac2' } }).webp().toBuffer();
    objects.set(copiedKey, externalSaved);
    await pool.query(`insert into field.external_request_attachments
      (id,organization_id,external_request_id,source_attachment_id,state,object_key,
       sha256,byte_size,width,height,copied_at)
      values ($1,$2,$3,$4,'copied',$5,$6,$7,$8,$9,now())`,
    [copiedId, organizationId, externalInquiryId, randomUUID(), copiedKey,
      createHash('sha256').update(externalSaved).digest('hex'), externalSaved.length,
      metadata.width, metadata.height]);
    const pendingId = randomUUID();
    await pool.query(`insert into field.external_request_attachments
      (id,organization_id,external_request_id,source_attachment_id,state,next_attempt_at)
      values ($1,$2,$3,$4,'pending',now() + interval '1 year')`,
    [pendingId, organizationId, externalInquiryId, randomUUID()]);
    const failedId = randomUUID();
    await pool.query(`insert into field.external_request_attachments
      (id,organization_id,external_request_id,source_attachment_id,state,error_code,next_attempt_at)
      values ($1,$2,$3,$4,'copy_failed','source_attachment_unavailable',now() + interval '1 year')`,
    [failedId, organizationId, externalInquiryId, randomUUID()]);
    const archiveUrl = `/v1/owner/organizations/${organizationId}/operations/export`;
    assert.equal((await app.inject({ url: archiveUrl })).statusCode, 401);
    assert.equal((await app.inject({ url: archiveUrl, headers: { cookie: other.cookie } })).statusCode, 404);
    await pool.query(`insert into field.memberships(organization_id,user_id,role)
      select $1,id,'editor' from "user" where email=$2`, [organizationId, other.email]);
    assert.equal((await app.inject({ url: archiveUrl, headers: { cookie: other.cookie } })).statusCode, 404);
    const archived = await app.inject({ url: archiveUrl, headers: { cookie: account.cookie } });
    assert.equal(archived.statusCode, 200);
    assert.equal(archived.headers['cache-control'], 'private, no-store');
    assert.match(String(archived.headers['content-disposition']), /field-operations-/);
    const content = archived.json() as { product: string; organization: { id: string };
      account: { id: string; email: string; name: string; emailVerified: boolean };
      memberships: { userId: string; email: string; role: string }[];
      trialSubscription: { consentVersion: string; startedBy: string;
        cancelRequestedBy: string; cancelRequestedAt: string } | null;
      apConnections: { id: string; agentName: string; status: string;
        outboundRevocationState: string; outboundAcknowledgedAt: string;
        inboundRevokedAt: string }[];
      inquiries: { id: string; messages: { body: string }[];
        attachments: { id: string; dataBase64: string }[] }[];
      reservations: { id: string; events: { event_type: string }[];
        externalSources: { id: string }[] }[];
      siteAssets: { id: string; dataBase64: string }[];
      externalRequests: { id: string; kind: string; reservationId: string | null;
        customerSnapshot: { phone: string };
        attachments: { id: string; state: string; errorCode: string | null;
          dataBase64?: string }[] }[] };
    assert.equal(content.product, 'field');
    assert.equal(content.organization.id, organizationId);
    assert.equal(content.account.email, account.email);
    assert.equal(content.account.name, 'Synthetic owner');
    assert.equal(content.account.emailVerified, false);
    assert.deepEqual(content.memberships.map(item => item.role).sort(), ['editor', 'owner']);
    assert.equal(content.memberships.find(item => item.role === 'editor')?.email, other.email);
    assert.equal(content.trialSubscription?.consentVersion, 'mock-trial-v1');
    assert.equal(content.trialSubscription?.startedBy, ownerId);
    assert.equal(content.trialSubscription?.cancelRequestedBy, ownerId);
    assert.ok(content.trialSubscription?.cancelRequestedAt);
    assert.equal(content.apConnections[0]?.id, connectionId);
    assert.equal(content.apConnections[0]?.agentName, 'Archive AI');
    assert.equal(content.apConnections[0]?.status, 'revoked');
    assert.equal(content.apConnections[0]?.outboundRevocationState, 'acked');
    assert.ok(content.apConnections[0]?.outboundAcknowledgedAt);
    assert.ok(content.apConnections[0]?.inboundRevokedAt);
    assert.equal(content.inquiries.length, 2);
    assert.equal(content.inquiries[0]?.id, inquiryId);
    assert.equal(content.inquiries[1]?.id, secondInquiry.json().id);
    assert.equal(content.inquiries[1]?.messages[0]?.body, '두 번째 Field 문의');
    assert.equal(content.inquiries[0]?.attachments[0]?.id, attachmentId);
    assert.deepEqual(Buffer.from(content.inquiries[0]!.attachments[0]!.dataBase64, 'base64'), saved);
    assert.equal(content.siteAssets[0]?.id, assetId);
    assert.deepEqual(Buffer.from(content.siteAssets[0]!.dataBase64, 'base64'), saved);
    assert.equal(content.reservations[0]?.id, reservationId);
    assert.equal(content.reservations[0]?.events[0]?.event_type, 'requested');
    assert.equal(content.externalRequests.length, 2);
    assert.equal(content.externalRequests[0]?.id, externalInquiryId);
    assert.equal(content.externalRequests[0]?.kind, 'inquiry');
    assert.equal(content.externalRequests[0]?.customerSnapshot.phone, '010-1111-2222');
    assert.equal(content.externalRequests[0]?.attachments.length, 3);
    assert.deepEqual(Buffer.from(content.externalRequests[0]!.attachments.find(item => item.id === copiedId)!.dataBase64!, 'base64'), externalSaved);
    assert.deepEqual(Buffer.from(content.siteAssets[0]!.dataBase64, 'base64'), saved);
    assert.equal(content.externalRequests[0]?.attachments.find(item => item.id === pendingId)?.state, 'pending');
    assert.equal(content.externalRequests[0]?.attachments.find(item => item.id === pendingId)?.dataBase64, undefined);
    assert.equal(content.externalRequests[0]?.attachments.find(item => item.id === failedId)?.state, 'copy_failed');
    assert.equal(content.externalRequests[0]?.attachments.find(item => item.id === failedId)?.errorCode,
      'source_attachment_unavailable');
    assert.equal(content.externalRequests[0]?.attachments.find(item => item.id === failedId)?.dataBase64,
      undefined);
    assert.equal(content.externalRequests[1]?.id, externalReservationId);
    assert.equal(content.externalRequests[1]?.reservationId, reservationId);
    assert.equal(content.reservations[0]?.externalSources[0]?.id, externalReservationId);
    assert.doesNotMatch(archived.body, /object_key|visitor_key_hash|submission_key_hash|receiptKey|accessToken|private-client|bodyHash|originConversationId|private-field-access-token|private-field-refresh-token|password|session/);
    const audit = await pool.query<{ inquiry_count: number; reservation_count: number; media_count: number;
      byte_size: number; sha256: string }>(
      `select inquiry_count,reservation_count,media_count,byte_size,sha256
       from field.operations_archive_audit where organization_id=$1 order by generated_at desc limit 1`,
      [organizationId]);
    assert.equal(audit.rows[0]?.inquiry_count, 2);
    assert.equal(audit.rows[0]?.reservation_count, 1);
    assert.equal(audit.rows[0]?.media_count, 3);
    assert.equal(audit.rows[0]?.byte_size, Buffer.byteLength(archived.body));
    assert.equal(audit.rows[0]?.sha256, createHash('sha256').update(archived.body).digest('hex'));
    objects.set(copiedKey, Buffer.from('damaged'));
    assert.equal((await app.inject({ url: archiveUrl, headers: { cookie: account.cookie } })).statusCode, 503);
    objects.set(copiedKey, externalSaved);
    siteObjects.set(assetKey, Buffer.from('damaged'));
    assert.equal((await app.inject({ url: archiveUrl, headers: { cookie: account.cookie } })).statusCode, 503);
    siteObjects.set(assetKey, saved);
    await pool.query(`delete from field.memberships where organization_id=$1
      and user_id=(select id from "user" where email=$2)`, [organizationId, other.email]);
    const afterUpload = await app.inject({ url: `/v1/inquiries/${inquiryId}`,
      headers: { authorization: `Bearer ${receiptKey}` } });
    assert.equal(afterUpload.json().attachments[0].id, attachmentId);
    assert.equal(afterUpload.json().attachments[0].messageId, messageId);
    const viewPath = `/v1/inquiries/${inquiryId}/attachments/${attachmentId}`;
    assert.equal((await app.inject({ url: viewPath })).statusCode, 401);
    assert.equal((await app.inject({ url: viewPath,
      headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: viewPath, headers: uploadHeaders })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${inquiryId}/attachments/${attachmentId}`,
      headers: { cookie: account.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${inquiryId}/attachments/${attachmentId}`,
      headers: { cookie: other.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/public/site-assets/${attachmentId}` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: path,
      headers: { ...uploadHeaders, authorization: `Bearer ${randomBytes(32).toString('base64url')}` }, payload: jpeg })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: path,
      headers: uploadHeaders, payload: Buffer.from('<svg onload="alert(1)"/>') })).statusCode, 415);
    assert.equal((await app.inject({ method: 'POST', url: path,
      headers: uploadHeaders, payload: Buffer.alloc(8 * 1024 * 1024 + 1) })).statusCode, 413);
    for (const color of ['#103050', '#406080', '#7090a0', '#b0c0d0']) {
      const nextImage = await sharp({ create: { width: 4, height: 3, channels: 3, background: color } })
        .jpeg().toBuffer();
      assert.equal((await app.inject({ method: 'POST', url: path,
        headers: uploadHeaders, payload: nextImage })).statusCode, 201);
    }
    const sixthImage = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#e0a080' } })
      .jpeg().toBuffer();
    assert.equal((await app.inject({ method: 'POST', url: path,
      headers: uploadHeaders, payload: sixthImage })).statusCode, 429);
    assert.equal(objects.size, 6);
    assert.equal(objects.has(copiedKey), true);
    assert.equal((await app.inject({ url: `/v1/inquiries/${inquiryId}`,
      headers: { authorization: `Bearer ${receiptKey}` } })).json().messages[0].body, '사진을 확인해 주세요');
    const nextReceipt = randomBytes(32).toString('base64url');
    assert.equal((await app.inject({ method: 'POST',
      url: `/v1/inquiries/${inquiryId}/receipt-key/rotate`,
      headers: { authorization: `Bearer ${receiptKey}`,
        'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { nextReceiptKey: nextReceipt } })).statusCode, 200);
    assert.equal((await app.inject({ url: viewPath, headers: uploadHeaders })).statusCode, 401);
    const newHeaders = { authorization: `Bearer ${nextReceipt}` };
    assert.equal((await app.inject({ url: viewPath, headers: newHeaders })).statusCode, 200);
    objects.set([...objects.keys()][0]!, Buffer.from('damaged'));
    assert.equal((await app.inject({ url: viewPath, headers: newHeaders })).statusCode, 503);
    assert.equal((await app.inject({ url: archiveUrl, headers: { cookie: account.cookie } })).statusCode, 503);
    assert.equal(Number((await pool.query<{ count: string }>(
      `select count(*)::text as count from field.operations_archive_audit where organization_id=$1`,
      [organizationId])).rows[0]?.count), 1);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${inquiryId}`,
      headers: { cookie: other.cookie } })).statusCode, 404);
    assert.equal(otherOrganization.json().id !== organizationId, true);
  } finally {
    await app.close();
    await pool.query(`delete from field.trial_subscriptions where organization_id in
      (select id from field.organizations where owner_user_id in
        (select id from "user" where email = any($1::text[])))`, [[account.email, other.email]]);
    await pool.query('delete from field.receipt_attempts where target_kind = $1 and target_id in (select id from field.inquiries where organization_id = (select id from field.organizations where owner_user_id = (select id from "user" where email = $2)))', ['inquiry', account.email]);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [account.email]);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [other.email]);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[account.email, other.email]]);
  }
});
