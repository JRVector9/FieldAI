import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { FieldSiteProviderResultError, type FieldModelUsage, type SiteGenerationCatalog, type SiteGenerationPlan } from './field-openai.js';
import { organizationFor, parseContent, siteFor, userFor, type SiteContent } from './sites.js';
import { rejectExpiredTrial } from './trial-access.js';
import { consumeFieldAi, dispatchFieldAi, fieldAiCanExpose, fieldAiEntitlement, fieldProviderDefinitelyRefused,
  markFieldAiUnknown, releaseFieldAi, reserveFieldAi } from './ai-entitlement.js';

type Job = {
  id: string; organization_id: string; site_id: string; requested_by: string; prompt: string;
  base_revision: number; catalog_revision: number; catalog_snapshot: SiteGenerationCatalog;
  status: string; proposal: SiteContent | null; model: string; input_tokens: number | null;
  output_tokens: number | null; error_code: string | null; created_at: string;
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageKinds = ['home', 'about', 'services', 'contact'] as const;
const sectionKinds = ['hero', 'introduction', 'services', 'region', 'hours', 'contact'] as const;
const palettes = ['#264653', '#9a5335', '#405b43', '#384d7d', '#7a4665'];
function body(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function publicJob(job: Job) {
  return { id: job.id, status: job.status, prompt: job.prompt, baseRevision: job.base_revision,
    catalogRevision: job.catalog_revision, proposal: job.proposal, model: job.model,
    inputTokens: job.input_tokens, outputTokens: job.output_tokens,
    costStatus: job.input_tokens === null ? 'pending' : 'unpriced',
    errorCode: job.error_code, createdAt: job.created_at };
}

export function layoutToSite(plan: unknown, catalog: SiteGenerationCatalog): SiteContent | null {
  const value = body(plan);
  if (!value || !['essential', 'editorial', 'warm'].includes(String(value.template))
      || !palettes.includes(String(value.palette)) || !Array.isArray(value.pages)
      || value.pages.length < 1 || value.pages.length > 4) return null;
  const seen = new Set<string>();
  const pages: SiteContent['pages'] = [];
  for (const rawPage of value.pages) {
    const page = body(rawPage);
    if (!page || !pageKinds.includes(page.kind as typeof pageKinds[number]) || seen.has(String(page.kind))
        || !Array.isArray(page.sections) || page.sections.length < 1 || page.sections.length > 6) return null;
    const kind = page.kind as typeof pageKinds[number];
    seen.add(kind);
    const sections: SiteContent['pages'][number]['sections'] = [];
    for (const rawSection of page.sections) {
      if (!sectionKinds.includes(rawSection as typeof sectionKinds[number])) return null;
      const section = rawSection as typeof sectionKinds[number];
      const content = section === 'hero' ? { kind: 'hero' as const, heading: catalog.businessName, body: catalog.introduction }
        : section === 'introduction' ? { kind: 'text' as const, heading: '소개', body: catalog.introduction }
        : section === 'services' ? { kind: 'service_list' as const, heading: '서비스', body: '' }
        : section === 'region' ? { kind: 'text' as const, heading: '서비스 지역', body: catalog.region }
        : section === 'hours' ? { kind: 'text' as const, heading: '운영 시간', body: catalog.openingHours }
        : { kind: 'text' as const, heading: '연락 방법', body: catalog.contactPhone };
      // hero 제목은 필수 승인값인 상호이므로 소개가 비어 있어도 유지한다.
      if (content.body || section === 'services' || section === 'hero') sections.push({ id: randomUUID(), ...content });
    }
    if (!sections.length) return null;
    pages.push({ id: randomUUID(), slug: kind, title: kind === 'home' ? '홈' : kind === 'about' ? '소개' : kind === 'services' ? '서비스' : '연락', sections });
  }
  if (!seen.has('home')) return null;
  return parseContent({ template: value.template, palette: value.palette, pages });
}

// 템플릿 시작 초안: 승인 카탈로그 값만 복사해 편집기 기본 템플릿·색으로 홈 섹션을 채운다.
// 서비스·질문 목록은 렌더 시 승인 카탈로그에서 읽으므로 여기서 문구를 만들지 않는다.
export function catalogStarterSite(catalog: SiteGenerationCatalog & { faqs?: unknown[] }): SiteContent | null {
  const layout = layoutToSite({ template: 'essential', palette: palettes[0], pages: [{ kind: 'home',
    sections: ['hero', 'introduction', 'services', 'region', 'hours', 'contact'] }] }, catalog);
  if (!layout || !Array.isArray(catalog.faqs) || !catalog.faqs.length) return layout;
  const home = layout.pages[0]!;
  home.sections.splice(home.sections.findIndex(section => section.kind === 'service_list') + 1, 0,
    { id: randomUUID(), kind: 'faq', heading: '자주 묻는 질문', body: '' });
  return parseContent(layout);
}

export function preserveSitePhotos(proposal: SiteContent, draft: SiteContent): SiteContent | null {
  const pages: SiteContent['pages'] = proposal.pages.map(page => ({
    ...page, sections: page.sections.map(section => ({ ...section })),
  }));
  const assigned = new Set<string>();
  for (const sourcePage of draft.pages) {
    const photos = sourcePage.sections.filter(section => section.assetId);
    if (!photos.length) continue;
    let targetPage = pages.find(page => page.slug === sourcePage.slug);
    if (!targetPage) {
      if (pages.length >= 5) return null;
      targetPage = { id: sourcePage.id, slug: sourcePage.slug, title: sourcePage.title, sections: [] };
      pages.push(targetPage);
    }
    for (const photo of photos) {
      const match = targetPage.sections.find(section => section.kind === photo.kind
        && section.heading === photo.heading && !assigned.has(section.id))
        ?? targetPage.sections.find(section => section.kind === photo.kind && !assigned.has(section.id));
      if (match) {
        match.assetId = photo.assetId;
        match.alt = photo.alt;
        assigned.add(match.id);
      } else {
        if (targetPage.sections.length >= 20) return null;
        targetPage.sections.push({ ...photo });
      }
    }
  }
  return parseContent({ ...proposal, pages, font: draft.font });
}

export function registerSiteGenerationRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.post('/v1/sites/generation-jobs', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'edit');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const input = body(request.body);
    const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
    const revision = input?.expectedRevision;
    if (!prompt || prompt.length > 1000 || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)
      return reply.code(400).send({ error: 'invalid_generation_request' });
    if (await rejectExpiredTrial(reply, runtime.pool, organization.organization_id)) return reply;
    if (!runtime.siteGenerator) return reply.code(503).send({ error: 'blocked_integration' });
    if (!runtime.siteQueue) return reply.code(503).send({ error: 'queue_unavailable' });
    const id = randomUUID();
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      await client.query('select id from field.organizations where id=$1 for update', [organization.organization_id]);
      if (!(await client.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role in ('owner','editor') for share",
        [organization.organization_id, userId])).rowCount) {
        await client.query('rollback'); return reply.code(404).send({ error: 'organization_not_found' });
      }
      await client.query('select id from field.sites where id = $1 for update', [site.id]);
      const draft = await client.query<{ revision: number }>('select revision from field.site_drafts where site_id = $1', [site.id]);
      if (draft.rows[0]?.revision !== revision) { await client.query('rollback'); return reply.code(409).send({ error: 'revision_conflict' }); }
      const active = await client.query<{ id: string }>(
        `select id from field.site_generation_jobs where site_id = $1 and status in ('queued', 'running', 'proposed')`, [site.id]);
      if (active.rowCount) { await client.query('rollback'); return reply.code(409).send({ error: 'generation_active', jobId: active.rows[0]!.id }); }
      const entitlement = await fieldAiEntitlement(client, organization.organization_id);
      if (entitlement.mode !== 'paid' && entitlement.mode !== 'grace') {
        const count = await client.query<{ count: string }>(`select count(*)::text as count from (
          select reserved_at as created_at from field.ai_entitlements where organization_id=$1
          union all select created_at from field.site_generation_jobs j where organization_id=$1
            and not exists(select 1 from field.ai_entitlements e where e.job_id=j.id)
          ) jobs where created_at>=date_trunc('day',now())`, [organization.organization_id]);
        if (Number(count.rows[0]?.count) >= 20) { await client.query('rollback'); return reply.code(429).send({ error: 'generation_daily_limit' }); }
      }
      const catalog = await client.query<{ revision: number; content: SiteGenerationCatalog }>(
        'select revision, content from field.catalog_releases where organization_id = $1 order by revision desc limit 1',
        [organization.organization_id]);
      if (!catalog.rows[0]) { await client.query('rollback'); return reply.code(409).send({ error: 'catalog_not_approved' }); }
      await client.query(
        `insert into field.site_generation_jobs
         (id, organization_id, site_id, requested_by, prompt, base_revision, catalog_revision, catalog_snapshot, status, model)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'queued',$9)`,
        [id, organization.organization_id, site.id, userId, prompt, revision, catalog.rows[0].revision,
          JSON.stringify(catalog.rows[0].content), runtime.siteGenerator.model]);
      const quotaError = await reserveFieldAi(client, organization.organization_id, id);
      if (quotaError) {
        await client.query('rollback');
        return reply.code(quotaError === 'ai_quota_exhausted' ? 429 : 403).send({ error: quotaError });
      }
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
    try { await runtime.siteQueue.enqueue(id); }
    catch { return reply.code(503).send({ error: 'queue_unavailable', jobId: id }); }
    return reply.code(202).send({ id, status: 'queued' });
  });

  app.get('/v1/sites/generation-jobs/latest', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'read');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const result = await runtime.pool.query<Job>(
      'select * from field.site_generation_jobs where site_id = $1 order by created_at desc, id desc limit 1', [site.id]);
    return { job: result.rows[0] ? publicJob(result.rows[0]) : null };
  });

  app.post<{ Params: { id: string } }>('/v1/sites/generation-jobs/:id/cancel', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'edit');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site || !uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'job_not_found' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      await client.query('select id from field.organizations where id=$1 for update', [organization.organization_id]);
      if (!(await client.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role in ('owner','editor') for share",
        [organization.organization_id, userId])).rowCount) {
        await client.query('rollback'); return reply.code(404).send({ error: 'organization_not_found' });
      }
      const result = await client.query<Job>(
        `update field.site_generation_jobs set status = 'canceled', updated_at = now(), completed_at = now()
         where id = $1 and site_id = $2 and status in ('queued', 'running', 'proposed') returning *`, [request.params.id, site.id]);
      if (!result.rows[0]) { await client.query('rollback'); return reply.code(409).send({ error: 'job_not_cancelable' }); }
      await releaseFieldAi(client, request.params.id, 'canceled_before_dispatch');
      await client.query('commit');
      return publicJob(result.rows[0]);
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  });

  app.post<{ Params: { id: string } }>('/v1/sites/generation-jobs/:id/apply', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'edit');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site || !uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'job_not_found' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<Job>(
        'select * from field.site_generation_jobs where id = $1 and site_id = $2 for update', [request.params.id, site.id]);
      const job = result.rows[0];
      if (!job) { await client.query('rollback'); return reply.code(404).send({ error: 'job_not_found' }); }
      if (job.status !== 'proposed' || !job.proposal) { await client.query('rollback'); return reply.code(409).send({ error: 'job_not_proposed' }); }
      const draft = await client.query<{ revision: number; content: SiteContent }>(
        'select revision, content from field.site_drafts where site_id = $1 for update', [site.id]);
      const catalog = await client.query<{ revision: number }>(
        'select revision from field.catalog_releases where organization_id = $1 order by revision desc limit 1', [organization.organization_id]);
      if (draft.rows[0]?.revision !== job.base_revision || catalog.rows[0]?.revision !== job.catalog_revision) {
        await client.query(`update field.site_generation_jobs set status = 'stale', updated_at = now(), completed_at = now(), error_code = 'source_changed' where id = $1`, [job.id]);
        await client.query('commit');
        return reply.code(409).send({ error: 'generation_stale' });
      }
      const parsed = parseContent(job.proposal);
      const proposal = parsed && parseContent({ ...parsed, font: draft.rows[0]!.content.font });
      if (!proposal) { await client.query('rollback'); return reply.code(422).send({ error: 'invalid_proposal' }); }
      const updated = await client.query<{ revision: number }>(
        'update field.site_drafts set revision = revision + 1, content = $2::jsonb, updated_by = $3, updated_at = now() where site_id = $1 returning revision',
        [site.id, JSON.stringify(proposal), userId]);
      await client.query(`update field.site_generation_jobs set status = 'applied_to_draft', updated_at = now(), completed_at = now() where id = $1`, [job.id]);
      await client.query('commit');
      return { revision: updated.rows[0]!.revision, ...proposal };
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  });
}

export async function failAbandonedSiteJobs(runtime: FieldBusinessRuntime): Promise<void> {
  const candidates = (await runtime.pool.query<Job>(`select j.* from field.site_generation_jobs j
    where j.started_at<clock_timestamp()-interval '60 seconds' and (j.status='running' or (
      j.status='canceled' and exists(select 1 from field.ai_entitlements e where e.job_id=j.id and e.state='dispatched'))) limit 100`)).rows;
  for (const job of candidates) {
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      await client.query('select id from field.organizations where id=$1 for update', [job.organization_id]);
      const current = (await client.query<Job>(`select * from field.site_generation_jobs where id=$1
        and started_at<clock_timestamp()-interval '60 seconds' and status in ('running','canceled') for update`, [job.id])).rows[0];
      if (current) {
        await markFieldAiUnknown(client, job.id, 'result_unknown_after_restart');
        await client.query(`update field.site_generation_jobs set status='failed',error_code='result_unknown_after_restart',
          updated_at=now(),completed_at=now() where id=$1 and status='running'`, [job.id]);
      }
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  }
}

export async function reconcileQueuedSiteJobs(runtime: FieldBusinessRuntime): Promise<number> {
  if (!runtime.siteQueue) return 0;
  await failAbandonedSiteJobs(runtime);
  const pending = await runtime.pool.query<{ id: string }>(
    `select id from field.site_generation_jobs where status = 'queued' order by created_at limit 100`);
  for (const row of pending.rows) await runtime.siteQueue.enqueue(row.id);
  return pending.rows.length;
}

export async function runSiteGenerationJob(runtime: FieldBusinessRuntime, id?: string): Promise<boolean> {
  const provider = runtime.siteGenerator;
  if (!provider) return false;
  if (id && !uuidPattern.test(id)) return false;
  await failAbandonedSiteJobs(runtime);
  const candidate = (await runtime.pool.query<Job>(`select * from field.site_generation_jobs where status='queued'
    and ($1::uuid is null or id=$1::uuid) order by created_at,id limit 1`, [id ?? null])).rows[0];
  if (!candidate) return false;
  const dispatch = await runtime.pool.connect();
  let job: Job | undefined;
  try {
    await dispatch.query('begin');
    if (!(await dispatch.query('select id from field.organizations where id=$1 for update skip locked', [candidate.organization_id])).rowCount) {
      await dispatch.query('rollback'); return false;
    }
    job = (await dispatch.query<Job>("select * from field.site_generation_jobs where id=$1 and status='queued' for update", [candidate.id])).rows[0];
    if (!job) { await dispatch.query('rollback'); return false; }
    const authorized = (await dispatch.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role in ('owner','editor') for share",
      [job.organization_id, job.requested_by])).rowCount;
    const refusal = !authorized ? 'requester_authority_changed' : job.model !== provider.model ? 'model_changed'
      : await dispatchFieldAi(dispatch, job.organization_id, job.id);
    if (refusal) {
      await releaseFieldAi(dispatch, job.id, refusal);
      await dispatch.query("update field.site_generation_jobs set status='failed',error_code=$2,completed_at=now(),updated_at=now() where id=$1", [job.id, refusal]);
      await dispatch.query('commit'); return true;
    }
    await dispatch.query("update field.site_generation_jobs set status='running',started_at=clock_timestamp(),updated_at=now() where id=$1", [job.id]);
    await dispatch.query('commit');
  } catch (error) { await dispatch.query('rollback'); throw error; }
  finally { dispatch.release(); }
  const recordUsage = async (response: FieldModelUsage) => {
    const usage = await runtime.pool.connect();
    try {
      await usage.query('begin');
      await usage.query('select id from field.organizations where id=$1 for update', [job.organization_id]);
      await consumeFieldAi(usage, job.id, response);
      await usage.query(`update field.site_generation_jobs set input_tokens=$2,output_tokens=$3,
        provider_response_id=$4,updated_at=now() where id=$1 and input_tokens is null
        and (status in ('running','canceled') or (status='failed' and error_code='result_unknown_after_restart'))`,
        [job.id, response.inputTokens, response.outputTokens, response.responseId]);
      await usage.query('commit');
    } catch (error) { await usage.query('rollback'); throw error; }
    finally { usage.release(); }
  };
  try {
    const response = await provider.generate({ prompt: job.prompt, catalog: job.catalog_snapshot });
    if (!Number.isSafeInteger(response.inputTokens) || response.inputTokens < 0 || response.inputTokens > 2147483647
        || !Number.isSafeInteger(response.outputTokens) || response.outputTokens < 0 || response.outputTokens > 2147483647
        || !response.responseId || response.responseId.length > 200) throw new Error('provider_invalid_usage');
    await recordUsage(response);
    const layout = layoutToSite(response.plan as SiteGenerationPlan, job.catalog_snapshot);
    if (!layout) throw new Error('provider_invalid_plan');
    const draft = await runtime.pool.query<{ revision: number; content: SiteContent }>(
      'select revision, content from field.site_drafts where site_id = $1', [job.site_id]);
    const catalog = await runtime.pool.query<{ revision: number }>(
      'select revision from field.catalog_releases where organization_id = $1 order by revision desc limit 1', [job.organization_id]);
    const stale = draft.rows[0]?.revision !== job.base_revision || catalog.rows[0]?.revision !== job.catalog_revision;
    const current = stale ? null : parseContent(draft.rows[0]?.content);
    if (!stale && !current) throw new Error('draft_invalid');
    const proposal = current ? preserveSitePhotos(layout, current) : layout;
    if (!proposal) throw new Error('media_layout_conflict');
    const finish = await runtime.pool.connect();
    try {
      await finish.query('begin');
      await finish.query('select id from field.organizations where id=$1 for update', [job.organization_id]);
      const allowed = await fieldAiCanExpose(finish, job.organization_id, job.id)
        && !!(await finish.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role in ('owner','editor') for share",
          [job.organization_id, job.requested_by])).rowCount;
      const status = !allowed ? 'stale' : stale ? 'stale' : 'proposed';
      await finish.query(`update field.site_generation_jobs set status=case when status='running' then $2 else status end,
        proposal=case when status='running' and $4 then $3::jsonb else proposal end,
        error_code=case when status='running' and $2='stale' then $5 else error_code end,
        completed_at=now(),updated_at=now() where id=$1 and status in ('running','canceled')`,
        [job.id, status, JSON.stringify(proposal), allowed, allowed ? 'source_changed' : 'subscription_or_authority_changed']);
      await finish.query('commit');
    } catch (error) { await finish.query('rollback'); throw error; }
    finally { finish.release(); }
  } catch (error) {
    if (error instanceof FieldSiteProviderResultError) await recordUsage(error.usage);
    const code = error instanceof Error && ['provider_invalid_plan', 'provider_refusal', 'provider_incomplete', 'provider_empty_output', 'media_layout_conflict', 'draft_invalid'].includes(error.message)
      ? error.message : 'provider_failed';
    const failed = await runtime.pool.connect();
    try {
      await failed.query('begin');
      await failed.query('select id from field.organizations where id=$1 for update', [job.organization_id]);
      if (fieldProviderDefinitelyRefused(error)) await releaseFieldAi(failed, job.id, 'provider_definitive_refusal', true);
      else await markFieldAiUnknown(failed, job.id, 'provider_outcome_unknown');
      await failed.query(`update field.site_generation_jobs set status='failed',error_code=$2,completed_at=now(),updated_at=now()
        where id=$1 and status='running'`, [job.id, code]);
      await failed.query('commit');
    } catch (failure) { await failed.query('rollback'); throw failure; }
    finally { failed.release(); }
  }
  return true;
}
