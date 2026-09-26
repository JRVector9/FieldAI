import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { preserveSitePhotos, reconcileQueuedSiteJobs, runSiteGenerationJob } from '../src/site-generation.js';
import type { SiteGenerationPlan } from '../src/field-openai.js';
import type { SiteContent } from '../src/sites.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4321';

test('Field layout preserves unmatched photo sections and refuses a full page budget', () => {
  const assetId = randomUUID();
  const home = { id: randomUUID(), slug: 'home', title: '홈', sections: [{ id: randomUUID(), kind: 'hero' as const, heading: '홈', body: '' }] };
  const original: SiteContent = { template: 'essential', palette: '#264653', pages: [home, {
    id: randomUUID(), slug: 'gallery', title: '현장 사진', sections: [{
      id: randomUUID(), kind: 'text', heading: '현장', body: '사업자 설명', assetId, alt: '현장 사진',
    }],
  }] };
  const layout: SiteContent = { template: 'warm', palette: '#9a5335', pages: [home] };
  const merged = preserveSitePhotos(layout, original);
  assert.ok(merged);
  assert.equal(merged.pages[1]?.slug, 'gallery');
  assert.equal(merged.pages[1]?.sections[0]?.assetId, assetId);
  assert.equal(merged.pages[1]?.sections[0]?.alt, '현장 사진');
  const full: SiteContent = { ...layout, pages: [home, ...['about', 'services', 'contact', 'faq'].map(slug => ({
    id: randomUUID(), slug, title: slug, sections: [],
  }))] };
  assert.equal(preserveSitePhotos(full, original), null);
});

test('Field site generation records a job and applies only after owner review', async () => {
  const email = `field-generation-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  const cookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool, resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  });
  let generatedApp: ReturnType<typeof createFieldApp> | null = null;
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie }, payload: { name: '검수 사업자' } });
    assert.equal(organization.statusCode, 201);
    const catalog = { expectedRevision: 0, businessName: '검수 사업자', industry: '상담·컨설팅', introduction: '직접 쓴 소개', region: '서울', openingHours: '평일', contactPhone: '010-1234-5678', services: [{ id: randomUUID(), name: '방문 상담', description: '서비스 설명', bookingMode: 'request', durationMinutes: 30, priceAmount: 10000 }] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie }, payload: catalog })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases', headers: { cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/sites', headers: { cookie } })).statusCode, 201);
    const queued = await app.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '따뜻한 소개 사이트', expectedRevision: 0 } });
    assert.equal(queued.statusCode, 503);
    assert.equal(queued.json().error, 'blocked_integration');
    await app.close();
    let modelWait: Promise<void> | null = null;
    let modelEntered: (() => void) | null = null;
    let invalidPlan = false;
    let enqueueFails = false;
    let generateCount = 0;
    const queueIds: string[] = [];
    const runtime = {
      pool, resolveUserId: async (headers: import('node:http').IncomingHttpHeaders) =>
        (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
      siteQueue: { enqueue: async (id: string) => { if (enqueueFails) throw new Error('synthetic_queue_outage'); queueIds.push(id); } },
      siteGenerator: { model: 'synthetic-layout', generate: async (input: { catalog: { industry?: string } }) => {
        assert.equal(input.catalog.industry, '상담·컨설팅');
        generateCount += 1;
        modelEntered?.();
        if (modelWait) await modelWait;
        return {
        plan: (invalidPlan ? { template: 'warm', palette: '#9a5335', pages: [{ kind: 'home', sections: ['invented_claim'] }] } : { template: 'warm', palette: '#9a5335', pages: [
          { kind: 'home' as const, sections: ['hero' as const, 'services' as const] },
          { kind: 'about' as const, sections: ['introduction' as const, 'region' as const] },
        ] }) as SiteGenerationPlan, inputTokens: 24, outputTokens: 16, responseId: randomUUID(),
        };
      } },
    };
    generatedApp = createFieldApp(async () => undefined, auth.handler, base, runtime);
    const start = () => generatedApp!.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '따뜻한 소개 사이트', expectedRevision: 0 } });
    const created = await start();
    assert.equal(created.statusCode, 202);
    const jobId = created.json().id as string;
    assert.deepEqual(queueIds, [jobId]);
    assert.equal((await pool.query('select catalog_snapshot from field.site_generation_jobs where id = $1',
      [jobId])).rows[0].catalog_snapshot.industry, '상담·컨설팅');
    assert.equal((await generatedApp.inject({ method: 'PUT', url: '/v1/business/draft', headers: { cookie },
      payload: { ...catalog, expectedRevision: 1, industry: '미승인 제작 업종' } })).statusCode, 200);
    assert.equal((await start()).json().error, 'generation_active');
    assert.equal((await generatedApp.inject({ url: '/v1/sites/draft', headers: { cookie } })).json().revision, 0);
    assert.equal(await runSiteGenerationJob(runtime, randomUUID()), false);
    assert.equal(await runSiteGenerationJob(runtime), true);
    const proposed = (await generatedApp.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job;
    assert.equal(proposed.status, 'proposed');
    assert.equal(proposed.inputTokens, 24);
    assert.equal(proposed.costStatus, 'unpriced');
    assert.equal(proposed.proposal.pages[0].sections[0].heading, '검수 사업자');
    assert.equal(proposed.proposal.pages[0].sections[0].body, '직접 쓴 소개');
    assert.equal((await generatedApp.inject({ url: '/v1/sites/draft', headers: { cookie } })).json().revision, 0);
    const applied = await generatedApp.inject({ method: 'POST', url: `/v1/sites/generation-jobs/${jobId}/apply`, headers: { cookie } });
    assert.equal(applied.statusCode, 200);
    assert.equal(applied.json().revision, 1);
    assert.equal((await generatedApp.inject({ method: 'POST', url: `/v1/sites/generation-jobs/${jobId}/apply`, headers: { cookie } })).statusCode, 409);
    assert.equal((await generatedApp.inject({ url: '/v1/sites/draft', headers: { cookie } })).json().template, 'warm');
    const second = await generatedApp.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '다시 구성', expectedRevision: 1 } });
    assert.equal(second.statusCode, 202);
    const site = (await generatedApp.inject({ url: '/v1/sites/draft', headers: { cookie } })).json();
    assert.equal((await generatedApp.inject({ method: 'PUT', url: '/v1/sites/draft', headers: { cookie }, payload: { expectedRevision: 1, template: 'editorial', palette: site.palette, pages: site.pages } })).statusCode, 200);
    assert.equal(await runSiteGenerationJob(runtime), true);
    assert.equal((await generatedApp.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job.status, 'stale');
    assert.equal((await generatedApp.inject({ method: 'POST', url: `/v1/sites/generation-jobs/${second.json().id}/apply`, headers: { cookie } })).statusCode, 409);
    assert.equal((await generatedApp.inject({ url: '/v1/sites/draft', headers: { cookie } })).json().template, 'editorial');
    const canceled = await generatedApp.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '취소할 작업', expectedRevision: 2 } });
    assert.equal(canceled.statusCode, 202);
    assert.equal((await generatedApp.inject({ method: 'POST', url: `/v1/sites/generation-jobs/${canceled.json().id}/cancel`, headers: { cookie } })).json().status, 'canceled');
    assert.equal(await runSiteGenerationJob(runtime), false);
    const gate: { release: () => void } = { release: () => undefined };
    modelWait = new Promise<void>(resolve => { gate.release = resolve; });
    const entered = new Promise<void>(resolve => { modelEntered = resolve; });
    const running = await generatedApp.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '진행 중 취소', expectedRevision: 2 } });
    assert.equal(running.statusCode, 202);
    const work = runSiteGenerationJob(runtime);
    await entered;
    assert.equal((await generatedApp.inject({ method: 'POST', url: `/v1/sites/generation-jobs/${running.json().id}/cancel`, headers: { cookie } })).json().status, 'canceled');
    gate.release();
    assert.equal(await work, true);
    const canceledAfterCall = (await generatedApp.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job;
    assert.equal(canceledAfterCall.status, 'canceled');
    assert.equal(canceledAfterCall.inputTokens, 24);
    assert.equal((await generatedApp.inject({ url: '/v1/sites/draft', headers: { cookie } })).json().revision, 2);
    modelWait = null;
    modelEntered = null;
    invalidPlan = true;
    const bad = await generatedApp.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '허위 출력 거부', expectedRevision: 2 } });
    assert.equal(bad.statusCode, 202);
    assert.equal(await runSiteGenerationJob(runtime), true);
    const failed = (await generatedApp.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job;
    assert.equal(failed.status, 'failed');
    assert.equal(failed.errorCode, 'provider_invalid_plan');
    assert.equal(failed.inputTokens, 24);
    invalidPlan = false;
    enqueueFails = true;
    const delayed = await generatedApp.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '큐 복구 후 생성', expectedRevision: 2 } });
    assert.equal(delayed.statusCode, 503);
    assert.equal(delayed.json().error, 'queue_unavailable');
    const delayedId = delayed.json().jobId as string;
    assert.equal((await generatedApp.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job.status, 'queued');
    enqueueFails = false;
    assert.equal(await reconcileQueuedSiteJobs(runtime), 1);
    assert.equal(queueIds.at(-1), delayedId);
    assert.equal(await runSiteGenerationJob(runtime, delayedId), true);
    assert.equal(await runSiteGenerationJob(runtime, delayedId), false);
    assert.equal((await generatedApp.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job.status, 'proposed');
    assert.equal((await generatedApp.inject({ method: 'POST', url: `/v1/sites/generation-jobs/${delayedId}/cancel`, headers: { cookie } })).statusCode, 200);
    const oldModel = await generatedApp.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie }, payload: { prompt: '모델 변경 검사', expectedRevision: 2 } });
    assert.equal(oldModel.statusCode, 202);
    const countBeforeChange = generateCount;
    runtime.siteGenerator.model = 'new-synthetic-model';
    assert.equal(await runSiteGenerationJob(runtime, oldModel.json().id), true);
    const changed = (await generatedApp.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job;
    assert.equal(changed.status, 'failed');
    assert.equal(changed.errorCode, 'model_changed');
    assert.equal(generateCount, countBeforeChange);
    const draftWithPhoto = (await generatedApp.inject({ url: '/v1/sites/draft', headers: { cookie } })).json();
    const assetId = randomUUID();
    const owner = await pool.query<{ owner_user_id: string }>('select owner_user_id from field.organizations where id = $1', [organization.json().id]);
    await pool.query(
      `insert into field.site_assets(id, organization_id, object_key, content_type, byte_size, width, height, sha256, uploaded_by)
       values ($1,$2,$3,'image/webp',1,1,1,$4,$5)`,
      [assetId, organization.json().id, `${organization.json().id}/${assetId}.webp`, 'a'.repeat(64), owner.rows[0]!.owner_user_id]);
    draftWithPhoto.pages[0].sections[0].assetId = assetId;
    draftWithPhoto.pages[0].sections[0].alt = '사업자가 업로드한 현장 사진';
    const savedPhoto = await generatedApp.inject({ method: 'PUT', url: '/v1/sites/draft', headers: { cookie }, payload: {
      expectedRevision: draftWithPhoto.revision, template: draftWithPhoto.template,
      palette: draftWithPhoto.palette, pages: draftWithPhoto.pages,
    } });
    assert.equal(savedPhoto.statusCode, 200);
    const photoRevision = savedPhoto.json().revision as number;
    const photoJob = await generatedApp.inject({ method: 'POST', url: '/v1/sites/generation-jobs', headers: { cookie },
      payload: { prompt: '사진이 있는 사이트 재배치', expectedRevision: photoRevision } });
    assert.equal(photoJob.statusCode, 202);
    assert.equal(await runSiteGenerationJob(runtime, photoJob.json().id), true);
    const photoProposal = (await generatedApp.inject({ url: '/v1/sites/generation-jobs/latest', headers: { cookie } })).json().job;
    assert.equal(photoProposal.status, 'proposed');
    assert.equal(photoProposal.proposal.pages[0].sections[0].assetId, assetId);
    assert.equal(photoProposal.proposal.pages[0].sections[0].alt, '사업자가 업로드한 현장 사진');
    const appliedPhoto = await generatedApp.inject({ method: 'POST', url: `/v1/sites/generation-jobs/${photoJob.json().id}/apply`, headers: { cookie } });
    assert.equal(appliedPhoto.statusCode, 200);
    assert.equal(appliedPhoto.json().pages[0].sections[0].assetId, assetId);
  } finally {
    await app.close();
    if (generatedApp) await generatedApp.close();
    await pool.query('DELETE FROM field.sites WHERE organization_id = (SELECT o.id FROM field.organizations o JOIN "user" u ON u.id = o.owner_user_id WHERE u.email = $1)', [email]);
    await pool.query('DELETE FROM field.organizations WHERE owner_user_id = (SELECT id FROM "user" WHERE email = $1)', [email]);
    await authPool.query('DELETE FROM "user" WHERE email = $1', [email]);
  }
});
