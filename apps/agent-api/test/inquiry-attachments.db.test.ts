import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import sharp from 'sharp';
import { SYNTHETIC_HEIC } from './heic-fixture.js';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';

async function owner() {
  const email = `ap-attachment-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic AP owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('AP stores customer inquiry photos privately without sending them to AI or public routes', async () => {
  const first = await owner();
  const other = await owner();
  const objects = new Map<string, Buffer>();
  const runtime = {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    inquiryMedia: {
      put: async (key: string, data: Buffer) => { objects.set(key, data); },
      get: async (key: string) => objects.get(key) ?? null,
      delete: async (key: string) => { objects.delete(key); },
    },
  };
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, runtime);
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: first.cookie }, payload: { name: 'AP 비공개 사진 검수' } });
    assert.equal(created.statusCode, 201);
    const organizationId = created.json().id as string;
    const otherOrganization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: other.cookie }, payload: { name: '다른 AP 조직' } });
    assert.equal(otherOrganization.statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft',
      headers: { cookie: first.cookie }, payload: { expectedRevision: 0, businessName: 'AP 비공개 사진 검수',
        introduction: '문의 가능', services: [{ name: '상담', description: '서비스' }], faqs: [] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases',
      headers: { cookie: first.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const submitted = await app.inject({ method: 'POST', url: `/v1/public/organizations/${organizationId}/inquiries`,
      payload: { serviceName: '상담', name: '사진 고객', phone: '010-3333-4444',
        message: '사진을 확인해 주세요', consent: true } });
    assert.equal(submitted.statusCode, 201);
    const { id: inquiryId, receiptKey } = submitted.json() as { id: string; receiptKey: string };
    const customerHeaders = { authorization: `Bearer ${receiptKey}` };
    const initial = await app.inject({ url: `/v1/inquiries/${inquiryId}`, headers: customerHeaders });
    const messageId = initial.json().messages[0].id as string;
    const path = `/v1/inquiries/${inquiryId}/messages/${messageId}/attachments`;
    const jpeg = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#c84d32' } })
      .jpeg().withExif({ IFD0: { ImageDescription: 'private customer metadata' } }).toBuffer();
    const uploadHeaders = { ...customerHeaders, 'content-type': 'application/octet-stream' };
    const withoutStore = createAgentApp(async () => undefined, auth.handler, base, undefined, {
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
      headers: { cookie: first.cookie } });
    assert.equal(exportFile.statusCode, 200);
    assert.equal(exportFile.json().attachments[0].id, attachmentId);
    assert.equal(exportFile.json().attachments[0].downloadPath,
      `/v1/owner/inquiries/${inquiryId}/attachments/${attachmentId}`);
    assert.equal((await app.inject({ method: 'POST', url: path, headers: uploadHeaders, payload: jpeg })).statusCode, 200);
    assert.equal(objects.size, 1);
    const saved = [...objects.values()][0]!;
    const metadata = await sharp(saved).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.exif, undefined);
    const secondInquiry = await app.inject({ method: 'POST',
      url: `/v1/public/organizations/${organizationId}/inquiries`,
      payload: { serviceName: '상담', name: '두 번째 고객', phone: '010-5555-6666',
        message: '두 번째 대화', consent: true } });
    assert.equal(secondInquiry.statusCode, 201);
    const ownerId = (await pool.query<{ id: string }>('select id from "user" where email=$1',
      [first.email])).rows[0]!.id;
    const trialStarted = await app.inject({ method: 'POST', url: '/v1/subscription/trial',
      headers: { cookie: first.cookie },
      payload: { consentVersion: 'mock-trial-v1', termsAccepted: true } });
    assert.equal(trialStarted.statusCode, 201);
    const trialCanceled = await app.inject({ method: 'POST', url: '/v1/subscription/cancel',
      headers: { cookie: first.cookie }, payload: {} });
    assert.equal(trialCanceled.statusCode, 200);
    const deploymentId = randomUUID();
    const publicId = `dep_${randomBytes(20).toString('base64url')}`;
    await pool.query(`insert into ap.deployments
      (id,organization_id,public_id,kind,allowed_origin,verification_proof,created_by)
      values ($1,$2,$3,'owned_embed','https://owner.example.invalid',$4,$5)`,
    [deploymentId, organizationId, publicId, 'private-ap-site-proof', ownerId]);
    const archiveUrl = `/v1/owner/organizations/${organizationId}/inquiries/export`;
    assert.equal((await app.inject({ url: archiveUrl })).statusCode, 401);
    assert.equal((await app.inject({ url: archiveUrl, headers: { cookie: other.cookie } })).statusCode, 404);
    await pool.query(`insert into ap.memberships(organization_id,user_id,role)
       select $1,id,'editor' from "user" where email=$2`, [organizationId, other.email]);
    assert.equal((await app.inject({ url: archiveUrl, headers: { cookie: other.cookie } })).statusCode, 404);
    const archive = await app.inject({ url: archiveUrl, headers: { cookie: first.cookie } });
    assert.equal(archive.statusCode, 200);
    assert.equal(archive.headers['cache-control'], 'private, no-store');
    assert.match(String(archive.headers['content-disposition']), /ap-inquiries-/);
    const contents = archive.json() as { product: string;
      account: { id: string; email: string; name: string };
      memberships: { email: string; role: string }[];
      trialSubscription: { consentVersion: string; startedBy: string;
        cancelRequestedBy: string; cancelRequestedAt: string } | null;
      knowledge: { draft: { content: { businessName: string } };
        releases: { content: { businessName: string } }[] };
      agent: { draft: { content: { name: string } }; releases: unknown[] };
      deployments: { id: string; publicId: string; kind: string;
        allowedOrigin: string; status: string }[];
      inquiries: { id: string; messages: { body: string }[];
      attachments: { id: string; dataBase64: string; sha256: string }[] }[] };
    assert.equal(contents.product, 'agent');
    assert.equal(contents.account.id, ownerId);
    assert.equal(contents.account.email, first.email);
    assert.equal(contents.account.name, 'Synthetic AP owner');
    assert.deepEqual(contents.memberships.map(item => item.role).sort(), ['editor', 'owner']);
    assert.equal(contents.memberships.find(item => item.role === 'editor')?.email, other.email);
    assert.equal(contents.trialSubscription?.consentVersion, 'mock-trial-v1');
    assert.equal(contents.trialSubscription?.startedBy, ownerId);
    assert.equal(contents.trialSubscription?.cancelRequestedBy, ownerId);
    assert.ok(contents.trialSubscription?.cancelRequestedAt);
    assert.equal(contents.knowledge.draft.content.businessName, 'AP 비공개 사진 검수');
    assert.equal(contents.knowledge.releases[0]?.content.businessName, 'AP 비공개 사진 검수');
    assert.ok(contents.agent.draft.content.name);
    assert.deepEqual(contents.agent.releases, []);
    assert.equal(contents.deployments[0]?.id, deploymentId);
    assert.equal(contents.deployments[0]?.publicId, publicId);
    assert.equal(contents.deployments[0]?.kind, 'owned_embed');
    assert.equal(contents.deployments[0]?.allowedOrigin, 'https://owner.example.invalid');
    assert.equal(contents.deployments[0]?.status, 'pending');
    assert.equal(contents.inquiries.length, 2);
    assert.equal(contents.inquiries[0]?.id, inquiryId);
    assert.equal(contents.inquiries[1]?.id, secondInquiry.json().id);
    assert.equal(contents.inquiries[1]?.messages[0]?.body, '두 번째 대화');
    assert.equal(contents.inquiries[0]?.attachments[0]?.id, attachmentId);
    assert.deepEqual(Buffer.from(contents.inquiries[0]!.attachments[0]!.dataBase64, 'base64'), saved);
    assert.doesNotMatch(archive.body, /object_key|visitor_key_hash|submission_key_hash|receiptKey|private-ap-site-proof|verificationProof|password|session|accessToken|refreshToken/);
    const audit = await pool.query<{ inquiry_count: number; attachment_count: number; byte_size: number; sha256: string }>(
      `select inquiry_count,attachment_count,byte_size,sha256 from ap.inquiry_archive_audit
       where organization_id=$1 order by generated_at desc limit 1`, [organizationId]);
    assert.equal(audit.rows[0]?.inquiry_count, 2);
    assert.equal(audit.rows[0]?.attachment_count, 1);
    assert.equal(audit.rows[0]?.byte_size, Buffer.byteLength(archive.body));
    assert.equal(audit.rows[0]?.sha256, createHash('sha256').update(archive.body).digest('hex'));
    await pool.query(`delete from ap.memberships where organization_id=$1
      and user_id=(select id from "user" where email=$2)`, [organizationId, other.email]);
    const customerDetail = await app.inject({ url: `/v1/inquiries/${inquiryId}`, headers: customerHeaders });
    assert.equal(customerDetail.json().attachments[0].messageId, messageId);
    assert.doesNotMatch(customerDetail.body, /object_key|private customer metadata/);
    const view = `/v1/inquiries/${inquiryId}/attachments/${attachmentId}`;
    assert.equal((await app.inject({ url: view })).statusCode, 401);
    assert.equal((await app.inject({ url: view, headers: {
      authorization: `Bearer ${randomBytes(32).toString('base64url')}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: view, headers: customerHeaders })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${inquiryId}/attachments/${attachmentId}`,
      headers: { cookie: first.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${inquiryId}/attachments/${attachmentId}`,
      headers: { cookie: other.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: path, headers: {
      ...uploadHeaders, authorization: `Bearer ${randomBytes(32).toString('base64url')}` }, payload: jpeg })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: path, headers: uploadHeaders,
      payload: Buffer.from('<svg onload="alert(1)"/>') })).statusCode, 415);
    const heic = await app.inject({ method: 'POST', url: path, headers: uploadHeaders, payload: SYNTHETIC_HEIC });
    assert.equal(heic.statusCode, 415);
    assert.deepEqual(heic.json(), { error: 'unsupported_image_format', hint: 'heic_unsupported' });
    assert.equal((await app.inject({ method: 'POST', url: path, headers: uploadHeaders,
      payload: Buffer.alloc(8 * 1024 * 1024 + 1) })).statusCode, 413);
    for (const color of ['#103050', '#406080', '#7090a0', '#b0c0d0']) {
      const next = await sharp({ create: { width: 4, height: 3, channels: 3, background: color } }).jpeg().toBuffer();
      assert.equal((await app.inject({ method: 'POST', url: path, headers: uploadHeaders, payload: next })).statusCode, 201);
    }
    const sixth = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#e0a080' } }).jpeg().toBuffer();
    assert.equal((await app.inject({ method: 'POST', url: path, headers: uploadHeaders, payload: sixth })).statusCode, 429);
    assert.equal(objects.size, 5);
    assert.equal((await app.inject({ url: `/v1/inquiries/${inquiryId}`,
      headers: customerHeaders })).json().messages[0].body, '사진을 확인해 주세요');
    const nextReceipt = randomBytes(32).toString('base64url');
    assert.equal((await app.inject({ method: 'POST',
      url: `/v1/inquiries/${inquiryId}/receipt-key/rotate`,
      headers: { ...customerHeaders, 'idempotency-key': randomBytes(32).toString('base64url') },
      payload: { nextReceiptKey: nextReceipt } })).statusCode, 200);
    assert.equal((await app.inject({ url: view, headers: customerHeaders })).statusCode, 401);
    const newHeaders = { authorization: `Bearer ${nextReceipt}` };
    assert.equal((await app.inject({ url: view, headers: newHeaders })).statusCode, 200);
    objects.set([...objects.keys()][0]!, Buffer.from('damaged'));
    assert.equal((await app.inject({ url: view, headers: newHeaders })).statusCode, 503);
    assert.equal((await app.inject({ url: archiveUrl, headers: { cookie: first.cookie } })).statusCode, 503);
    assert.equal(Number((await pool.query<{ count: string }>(
      `select count(*)::text as count from ap.inquiry_archive_audit where organization_id=$1`,
      [organizationId])).rows[0]?.count), 1);
    assert.notEqual(otherOrganization.json().id, organizationId);
  } finally {
    await app.close();
    await pool.query(`delete from ap.trial_subscriptions where organization_id in
      (select id from ap.organizations where owner_user_id in
        (select id from "user" where email = any($1::text[])))`, [[first.email, other.email]]);
    await pool.query('delete from ap.receipt_attempts where target_id in (select id from ap.inquiries where organization_id = (select id from ap.organizations where owner_user_id = (select id from "user" where email = $1)))', [first.email]);
    await pool.query('DELETE FROM ap.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [first.email]);
    await pool.query('DELETE FROM ap.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [other.email]);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[first.email, other.email]]);
  }
});
