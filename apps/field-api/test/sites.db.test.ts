import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
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
  const email = `field-site-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic site owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('Field publishes a site from a draft and restores design without restoring old catalog facts', async () => {
  const first = await owner();
  const second = await owner();
  const tokenKey = randomBytes(32);
  const apGrantId = randomUUID();
  const apOrganizationId = randomUUID();
  const apAgentId = randomUUID();
  const apDeploymentId = randomUUID();
  const apPublicId = `dep_${randomBytes(24).toString('base64url')}`;
  const apPlacementId = randomUUID();
  const apPlacementPublicId = `dep_${randomBytes(24).toString('base64url')}`;
  let apOrigin = '';
  let remoteActive = true;
  const apConnector = { issuer: 'http://127.0.0.1:4311/api/auth', clientId: 'field-test',
    clientSecret: 'test-secret', tokenKey, redirectUri: `${base}/v1/connections/ap/callback`,
    webOrigin: 'http://localhost:3002', fetcher: async (input: RequestInfo | URL) => {
      const path = String(input);
      const data = path.endsWith('/me')
        ? { grantId: apGrantId, organizationId: apOrganizationId, agentId: apAgentId,
          deploymentIds: [apDeploymentId, apPlacementId], scopes: ['ap.agent.read'],
          state: remoteActive ? 'active' : 'revoked' }
        : { deployments: [{ id: apDeploymentId, publicId: apPublicId, kind: 'owned_embed', origin: apOrigin },
          { id: apPlacementId, publicId: apPlacementPublicId, kind: 'placement_embed',
            origin: 'https://publisher.example.test' }] };
      return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    } };
  function encrypted(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', tokenKey, iv);
    return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  }
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    apConnector: { ...apConnector, fetcher: apConnector.fetcher as typeof fetch },
  });
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites', headers: { cookie: first.cookie } })).statusCode, 404);
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: first.cookie }, payload: { name: 'Field 사이트 검수 상호' } });
    const organizationId = (organization.json() as { id: string }).id;
    const serviceId = randomUUID();
    const catalog = {
      expectedRevision: 0, businessName: 'Field 사이트 검수 상호', introduction: '사업자 소개', region: '서울',
      openingHours: '평일', contactPhone: '010-1234-5678',
      services: [{ id: serviceId, name: '상담', description: '서비스 설명', bookingMode: 'request', durationMinutes: 30, priceAmount: 10000 }],
    };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: first.cookie }, payload: catalog })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const created = await app.inject({ method: 'POST', url: '/v1/sites', headers: { cookie: first.cookie } });
    assert.equal(created.statusCode, 201);
    const { slug } = created.json() as { slug: string };
    assert.match(slug, /^field-[a-f0-9]{12}$/);
    assert.equal((await app.inject({ url: `/v1/public/sites/${slug}` })).statusCode, 404);
    const draftInstallation = await app.inject({ url: '/v1/sites/ap-installation', headers: { cookie: first.cookie } });
    assert.equal(draftInstallation.statusCode, 200);
    assert.equal(draftInstallation.json().published, false);
    assert.equal((await app.inject({ url: '/v1/sites/draft', headers: { cookie: second.cookie } })).statusCode, 404);
    const initial = await app.inject({ url: '/v1/sites/draft', headers: { cookie: first.cookie } });
    assert.equal((initial.json() as { revision: number }).revision, 0);
    const site = { expectedRevision: 0, template: 'editorial', palette: '#264653', pages: [
      { id: randomUUID(), slug: 'home', title: '홈', sections: [{ id: randomUUID(), kind: 'hero', heading: '실제 상호', body: '사업자가 쓴 소개' }] },
      { id: randomUUID(), slug: 'about', title: '소개', sections: [{ id: randomUUID(), kind: 'text', heading: '우리 소개', body: '직접 확인한 사실' }] },
    ] };
    const saved = await app.inject({ method: 'PUT', url: '/v1/sites/draft', headers: { cookie: first.cookie }, payload: site });
    assert.equal(saved.statusCode, 200);
    assert.equal((saved.json() as { revision: number }).revision, 1);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 0 } })).statusCode, 409);
    const published = await app.inject({ method: 'POST', url: '/v1/sites/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(published.statusCode, 201);
    const releaseId = (published.json() as { releaseId: string }).releaseId;
    const versions = await app.inject({ url: '/v1/sites/releases', headers: { cookie: first.cookie } });
    assert.equal(versions.statusCode, 200);
    assert.equal((versions.json() as { releases: unknown[] }).releases.length, 1);
    const publicSite = await app.inject({ url: `/v1/public/sites/${slug}` });
    assert.equal(publicSite.statusCode, 200);
    const publishedInstallation = await app.inject({ url: '/v1/sites/ap-installation', headers: { cookie: first.cookie } });
    assert.equal(publishedInstallation.statusCode, 200);
    assert.equal(publishedInstallation.json().published, true);
    assert.equal((publicSite.json() as { template: string; pages: unknown[]; catalogRevision: number }).template, 'editorial');
    assert.equal((publicSite.json() as { pages: unknown[] }).pages.length, 2);
    assert.equal((publicSite.json() as { catalogRevision: number }).catalogRevision, 1);
    assert.equal(publicSite.json().siteOrigin, `http://${slug}.localhost:3002`);
    const proof = randomBytes(24).toString('base64url');
    const proofPath = '/v1/sites/verification';
    assert.equal((await app.inject({ method: 'POST', url: proofPath,
      payload: { proof } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: proofPath,
      headers: { cookie: second.cookie }, payload: { proof } })).statusCode, 404);
    const storedProof = await app.inject({ method: 'POST', url: proofPath,
      headers: { cookie: first.cookie }, payload: { proof } });
    assert.equal(storedProof.statusCode, 201, storedProof.body);
    assert.equal(storedProof.json().origin, `http://${slug}.localhost:3002`);
    const publicProof = await app.inject({ url: `/v1/public/site-verification/${slug}` });
    assert.equal(publicProof.statusCode, 200, publicProof.body);
    assert.equal(publicProof.json().proof, proof);
    assert.equal((await app.inject({ url: '/v1/public/site-verification/field-000000000000' })).statusCode, 404);
    const ownerUserId = (await auth.api.getSession({ headers: fromNodeHeaders({ cookie: first.cookie }) }))!.user.id;
    const connectionId = randomUUID();
    apOrigin = `http://${slug}.localhost:3002`;
    await pool.query(`insert into field.ap_connections(id, organization_id, initiator_user_id,
      ap_issuer, ap_client_id, ap_grant_id, ap_organization_id, ap_agent_id, ap_agent_name,
      ap_agent_revision, allowed_deployment_ids, scopes, access_token_cipher,
      refresh_token_cipher, access_expires_at, status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,'Test AI',1,$9,$10,$11,$12,now() + interval '1 hour','review_required')`,
    [connectionId, organizationId, ownerUserId, apConnector.issuer, apConnector.clientId,
      apGrantId, apOrganizationId, apAgentId, [apDeploymentId, apPlacementId], ['ap.agent.read'],
      encrypted('test-access'), encrypted('test-refresh')]);
    const selectedPath = `/v1/connections/ap/${connectionId}/deployments`;
    assert.equal((await app.inject({ url: selectedPath })).statusCode, 401);
    assert.equal((await app.inject({ url: selectedPath, headers: { cookie: second.cookie } })).statusCode, 404);
    const selected = await app.inject({ url: selectedPath, headers: { cookie: first.cookie } });
    assert.equal(selected.statusCode, 200, selected.body);
    assert.equal(selected.json().deployments[0].id, apDeploymentId);
    assert.equal(selected.json().deployments[1].kind, 'placement_embed');
    const installPath = '/v1/sites/ap-installation';
    const installBody = { connectionId, deploymentId: apDeploymentId, mode: 'floating' };
    assert.equal((await app.inject({ method: 'POST', url: installPath,
      headers: { cookie: first.cookie }, payload: { ...installBody, deploymentId: apPlacementId } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: installPath,
      headers: { cookie: second.cookie }, payload: installBody })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: installPath,
      headers: { cookie: first.cookie }, payload: { ...installBody, deploymentId: randomUUID() } })).statusCode, 409);
    apOrigin = 'http://field-000000000000.localhost:3002';
    assert.equal((await app.inject({ method: 'POST', url: installPath,
      headers: { cookie: first.cookie }, payload: installBody })).statusCode, 409);
    apOrigin = `http://${slug}.localhost:3002`;
    const installed = await app.inject({ method: 'POST', url: installPath,
      headers: { cookie: first.cookie }, payload: installBody });
    assert.equal(installed.statusCode, 201, installed.body);
    assert.equal((await app.inject({ method: 'POST', url: installPath,
      headers: { cookie: first.cookie }, payload: installBody })).statusCode, 200);
    const withWidget = (await app.inject({ url: `/v1/public/sites/${slug}` })).json();
    assert.equal(withWidget.apWidget.publicId, apPublicId);
    assert.equal(withWidget.apWidget.sdkSrc, 'http://127.0.0.1:4311/sdk/v1.js');
    remoteActive = false;
    assert.equal((await app.inject({ url: selectedPath, headers: { cookie: first.cookie } })).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/public/sites/${slug}` })).json().apWidget, null);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites/ap-installation/pause',
      headers: { cookie: first.cookie }, payload: {} })).statusCode, 200);
    const unsaved = await app.inject({ method: 'PUT', url: '/v1/sites/draft', headers: { cookie: first.cookie }, payload: { ...site, expectedRevision: 1, template: 'warm' } });
    assert.equal(unsaved.statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/sites/${slug}` })).json().template, 'editorial');
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: first.cookie }, payload: { ...catalog, expectedRevision: 1, services: [{ ...catalog.services[0], priceAmount: 20000 }] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 2 } })).statusCode, 201);
    const staleSite = (await app.inject({ url: `/v1/public/sites/${slug}` })).json() as { stale: boolean; latestCatalogRevision: number };
    assert.equal(staleSite.stale, true);
    assert.equal(staleSite.latestCatalogRevision, 2);
    const restored = await app.inject({ method: 'POST', url: '/v1/sites/restore', headers: { cookie: first.cookie }, payload: { releaseId, expectedRevision: 2 } });
    assert.equal(restored.statusCode, 200);
    assert.equal((restored.json() as { revision: number; template: string }).revision, 3);
    assert.equal((restored.json() as { template: string }).template, 'editorial');
    assert.equal((await app.inject({ url: `/v1/public/sites/${slug}` })).json().catalogRevision, 1);
    const republished = await app.inject({ method: 'POST', url: '/v1/sites/releases', headers: { cookie: first.cookie }, payload: { expectedRevision: 3 } });
    assert.equal(republished.statusCode, 201);
    const latest = (await app.inject({ url: `/v1/public/sites/${slug}` })).json() as { catalogRevision: number; catalog: { services: { priceAmount: number }[] } };
    assert.equal(latest.catalogRevision, 2);
    assert.equal(latest.catalog.services[0]?.priceAmount, 20000);
    assert.equal((await app.inject({ url: '/v1/sites/draft', headers: { cookie: first.cookie, 'x-organization-id': organizationId } })).statusCode, 200);
  } finally {
    await app.close();
    await pool.query('DELETE FROM field.sites WHERE organization_id = (SELECT o.id FROM field.organizations o JOIN "user" u ON u.id = o.owner_user_id WHERE u.email = $1)', [first.email]);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [first.email]);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[first.email, second.email]]);
  }
});

test('Field accepts safe site photos, scopes them to one business, and publishes only approved references', async () => {
  const account = await owner();
  const other = await owner();
  const objects = new Map<string, Buffer>();
  const runtime = {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    siteMedia: {
      put: async (key: string, data: Buffer) => { objects.set(key, data); },
      get: async (key: string) => objects.get(key) ?? null,
      delete: async (key: string) => { objects.delete(key); },
    },
  };
  const app = createFieldApp(async () => undefined, auth.handler, base, runtime);
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: account.cookie }, payload: { name: 'Field 이미지 형식 검수' } });
    assert.equal(organization.statusCode, 201);
    const rejected = await app.inject({ method: 'POST', url: '/v1/sites/assets',
      headers: { cookie: account.cookie, 'content-type': 'application/octet-stream' },
      payload: Buffer.from('<svg onload="alert(1)"/>') });
    assert.equal(rejected.statusCode, 415);
    assert.equal((rejected.json() as { error: string }).error, 'unsupported_image');
    assert.equal(objects.size, 0);
    const jpeg = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#f16e50' } })
      .jpeg().withExif({ IFD0: { ImageDescription: 'private source metadata' } }).toBuffer();
    const withoutStore = createFieldApp(async () => undefined, auth.handler, base, {
      pool, resolveUserId: runtime.resolveUserId,
    });
    try {
      const blocked = await withoutStore.inject({ method: 'POST', url: '/v1/sites/assets',
        headers: { cookie: account.cookie, 'content-type': 'application/octet-stream' }, payload: jpeg });
      assert.equal(blocked.statusCode, 503);
      assert.equal((blocked.json() as { error: string }).error, 'blocked_integration');
    } finally { await withoutStore.close(); }
    const uploaded = await app.inject({ method: 'POST', url: '/v1/sites/assets',
      headers: { cookie: account.cookie, 'content-type': 'application/octet-stream' }, payload: jpeg });
    assert.equal(uploaded.statusCode, 201);
    const { id: assetId, state } = uploaded.json() as { id: string; state: string };
    assert.equal(state, 'ready');
    const library = await app.inject({ url: '/v1/sites/assets', headers: { cookie: account.cookie } });
    assert.equal(library.statusCode, 200);
    assert.equal((library.json() as { assets: { id: string; state: string }[] }).assets[0]?.id, assetId);
    assert.equal(objects.size, 1);
    const savedImage = [...objects.values()][0]!;
    const metadata = await sharp(savedImage).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.exif, undefined);
    assert.equal((await app.inject({ url: `/v1/public/site-assets/${assetId}` })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/sites/assets/${assetId}`, headers: { cookie: account.cookie } })).statusCode, 200);
    const otherOrg = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: other.cookie }, payload: { name: '다른 이미지 검수 사업체' } });
    assert.equal(otherOrg.statusCode, 201);
    assert.equal((await app.inject({ url: `/v1/sites/assets/${assetId}`, headers: { cookie: other.cookie } })).statusCode, 404);
    const site = await app.inject({ method: 'POST', url: '/v1/sites', headers: { cookie: account.cookie } });
    assert.equal(site.statusCode, 201);
    const slug = (site.json() as { slug: string }).slug;
    const original = (await app.inject({ url: '/v1/sites/draft', headers: { cookie: account.cookie } })).json() as {
      template: string; palette: string; pages: { id: string; slug: string; title: string;
        sections: { id: string; kind: string; heading: string; body: string }[] }[];
    };
    const withPhoto = { expectedRevision: 0, template: original.template, palette: original.palette,
      pages: original.pages.map(page => ({ ...page, sections: page.sections.map(section => ({ ...section, assetId, alt: '붉은 배경 사진' })) })) };
    const missingAlt = { ...withPhoto, pages: withPhoto.pages.map(page => ({ ...page,
      sections: page.sections.map(section => ({ ...section, alt: '' })) })) };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/sites/draft',
      headers: { cookie: account.cookie }, payload: missingAlt })).statusCode, 400);
    const saved = await app.inject({ method: 'PUT', url: '/v1/sites/draft',
      headers: { cookie: account.cookie }, payload: withPhoto });
    assert.equal(saved.statusCode, 200);
    const otherSite = await app.inject({ method: 'POST', url: '/v1/sites', headers: { cookie: other.cookie } });
    assert.equal(otherSite.statusCode, 201);
    const crossOrg = await app.inject({ method: 'PUT', url: '/v1/sites/draft',
      headers: { cookie: other.cookie }, payload: withPhoto });
    assert.equal(crossOrg.statusCode, 400);
    assert.equal((crossOrg.json() as { error: string }).error, 'invalid_site_asset');
    const serviceId = randomUUID();
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie: account.cookie },
      payload: { expectedRevision: 0, businessName: 'Field 이미지 형식 검수', introduction: '', region: '서울',
        openingHours: '평일', contactPhone: '', services: [
          { id: serviceId, name: '사진 상담', description: '', bookingMode: 'request', durationMinutes: 30, priceAmount: null },
        ] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: account.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    const published = await app.inject({ method: 'POST', url: '/v1/sites/releases',
      headers: { cookie: account.cookie }, payload: { expectedRevision: 1 } });
    assert.equal(published.statusCode, 201);
    assert.equal((await app.inject({ url: `/v1/public/sites/${slug}` })).statusCode, 200);
    const publicImage = await app.inject({ url: `/v1/public/site-assets/${assetId}` });
    assert.equal(publicImage.statusCode, 200);
    assert.equal(publicImage.headers['content-type'], 'image/webp');
    assert.deepEqual(publicImage.rawPayload, savedImage);
    const objectKey = [...objects.keys()][0]!;
    objects.set(objectKey, Buffer.from('corrupted object'));
    const corrupt = await app.inject({ url: `/v1/public/site-assets/${assetId}` });
    assert.equal(corrupt.statusCode, 503);
    assert.equal((corrupt.json() as { error: string }).error, 'media_unavailable');
    objects.set(objectKey, savedImage);
    const withoutPhoto = { expectedRevision: 1, template: original.template, palette: original.palette, pages: original.pages };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/sites/draft',
      headers: { cookie: account.cookie }, payload: withoutPhoto })).statusCode, 200);
    assert.equal((await app.inject({ url: `/v1/public/site-assets/${assetId}` })).statusCode, 200);
    assert.equal(objects.size, 1);
  } finally {
    await app.close();
    await pool.query('DELETE FROM field.sites WHERE organization_id IN (SELECT o.id FROM field.organizations o JOIN "user" u ON u.id = o.owner_user_id WHERE u.email = ANY($1::text[]))', [[account.email, other.email]]);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [account.email]);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [other.email]);
    await authPool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [[account.email, other.email]]);
  }
});

test('Field saves a draft near the content limit and keeps the photo cap under concurrent uploads', async () => {
  const account = await owner();
  const objects = new Map<string, Buffer>();
  // 동시 업로드 검수에서는 업로드 5건이 모두 저장소에 도달한 뒤에 진행시켜 경합을 재현한다(최대 2초 대기).
  let barrier: { waiting: number; size: number; release: () => void; done: Promise<void> } | null = null;
  const runtime = {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    siteMedia: {
      put: async (key: string, data: Buffer) => {
        if (barrier) {
          barrier.waiting += 1;
          if (barrier.waiting >= barrier.size) barrier.release();
          await Promise.race([barrier.done, new Promise(resolve => setTimeout(resolve, 2000))]);
        }
        objects.set(key, data);
      },
      get: async (key: string) => objects.get(key) ?? null,
      delete: async (key: string) => { objects.delete(key); },
    },
  };
  const app = createFieldApp(async () => undefined, auth.handler, base, runtime);
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: account.cookie }, payload: { name: 'Field 초안 크기 검수' } });
    assert.equal(organization.statusCode, 201);
    const organizationId = (organization.json() as { id: string }).id;
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites', headers: { cookie: account.cookie } })).statusCode, 201);
    const original = (await app.inject({ url: '/v1/sites/draft', headers: { cookie: account.cookie } })).json() as {
      template: string; palette: string };
    // 5페이지 × 20섹션 × 한글 본문 5000자(UTF-8 약 1.5MB)는 Fastify 기본 1MiB를 넘는다.
    const pages = ['home', 'about', 'services', 'faq', 'contact'].map((slug, pageIndex) => ({
      id: randomUUID(), slug, title: `페이지 ${pageIndex}`,
      sections: Array.from({ length: 20 }, () => ({ id: randomUUID(), kind: 'text',
        heading: '가'.repeat(200), body: '가'.repeat(5000) })),
    }));
    const payload = { expectedRevision: 0, template: original.template, palette: original.palette, pages };
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) > 1024 * 1024);
    const saved = await app.inject({ method: 'PUT', url: '/v1/sites/draft',
      headers: { cookie: account.cookie }, payload });
    assert.equal(saved.statusCode, 200);
    assert.equal((saved.json() as { revision: number }).revision, 1);
    const reloaded = (await app.inject({ url: '/v1/sites/draft', headers: { cookie: account.cookie } })).json() as {
      pages: { sections: { body: string }[] }[] };
    assert.equal(reloaded.pages.length, 5);
    assert.equal(reloaded.pages[4]!.sections[19]!.body.length, 5000);

    // 48장이 있는 상태에서 5장을 동시에 올려도 50장을 넘지 않는다.
    await pool.query(
      `insert into field.site_assets (id, organization_id, object_key, content_type, byte_size, width, height, sha256, uploaded_by)
       select gen_random_uuid(), $1::uuid, $1::text || '/seed-' || n || '.webp', 'image/webp', 1, 1, 1, 'seed',
         (select id from "user" where email = $2)
       from generate_series(1, 48) n`, [organizationId, account.email]);
    const jpeg = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#2f6f4e' } }).jpeg().toBuffer();
    let release!: () => void;
    barrier = { waiting: 0, size: 5, release: () => release(), done: new Promise<void>(resolve => { release = resolve; }) };
    const uploads = await Promise.all(Array.from({ length: 5 }, () => app.inject({ method: 'POST', url: '/v1/sites/assets',
      headers: { cookie: account.cookie, 'content-type': 'application/octet-stream' }, payload: jpeg })));
    assert.deepEqual(uploads.map(result => result.statusCode).sort(), [201, 201, 429, 429, 429]);
    assert.ok(uploads.filter(result => result.statusCode === 429)
      .every(result => (result.json() as { error: string }).error === 'asset_limit'));
    assert.equal((await pool.query<{ count: number }>(
      'select count(*)::int as count from field.site_assets where organization_id = $1', [organizationId])).rows[0]?.count, 50);
    // 거절된 업로드의 저장소 객체는 남기지 않는다.
    assert.equal(objects.size, 2);
  } finally {
    await app.close();
    await pool.query('DELETE FROM field.sites WHERE organization_id IN (SELECT o.id FROM field.organizations o JOIN "user" u ON u.id = o.owner_user_id WHERE u.email = $1)', [account.email]);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [account.email]);
    await authPool.query('DELETE FROM "user" WHERE email = $1', [account.email]);
  }
});
