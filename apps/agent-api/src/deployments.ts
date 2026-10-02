import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { rejectExpiredTrial } from './trial-access.js';
import { activePlacement } from './placements.js';
import { guardPlacementEngagement } from './placement-limit.js';
import { distributionTrafficClass, recordDistributionEvent, type DistributionTrafficClass } from './distribution-events.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicId = /^dep_[A-Za-z0-9_-]{20,50}$/;
const token = () => randomBytes(24).toString('base64url');
const secret = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secretPattern = /^[A-Za-z0-9_-]{40,64}$/;
function publicWebOrigin() {
  const configured = process.env.AP_PUBLIC_WEB_ORIGIN;
  if (configured && originHost(configured)) return configured;
  return process.env.AP_PROFILE === 'mock' ? 'http://localhost:3001' : null;
}
type Deployment = { id: string; organization_id: string; public_id: string; kind: 'link' | 'owned_embed' | 'placement_embed';
  placement_id: string | null; agent_release_id: string | null;
  creation_key: string | null;
  allowed_origin: string | null; verification_proof: string | null; verified_at: string | null;
  status: 'pending' | 'active' | 'paused'; moderation_restricted: boolean;
  knowledge_revision: number | null; created_at: string };
export function originHost(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 253) return null;
  try {
    const parsed = new URL(value);
    if (process.env.AP_PROFILE === 'mock' && parsed.protocol === 'http:'
      && parsed.origin === value && /^[a-z0-9-]+\.localhost$/.test(parsed.hostname)
      && /^\d{4,5}$/.test(parsed.port) && Number(parsed.port) <= 65535
      && !parsed.username && !parsed.password) return parsed.hostname;
    if (parsed.protocol !== 'https:' || parsed.origin !== value || parsed.port || parsed.username || parsed.password
      || !/^[a-z0-9.-]+$/i.test(parsed.hostname) || !parsed.hostname.includes('.')
      || parsed.hostname.endsWith('.localhost') || /(^|\.)localhost$/.test(parsed.hostname)) return null;
    return parsed.hostname.toLowerCase();
  } catch { return null; }
}
export async function defaultVerifyDomain(host: string, proof: string, origin?: string): Promise<boolean> {
  try {
    if (process.env.AP_PROFILE === 'mock' && origin?.startsWith(`http://${host}:`)) {
      const response = await fetch(`${origin}/.well-known/ap-site-verification`, {
        redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      return response.ok && (await response.text()).trim() === `ap-site-verification=${proof}`;
    }
    const records = await Promise.race([
      resolveTxt(`_agent-platform.${host}`),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('dns_timeout')), 5000)),
    ]);
    return records.some(chunks => chunks.join('') === `ap-site-verification=${proof}`);
  } catch { return false; }
}
async function ownerOrganization(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' }); return null;
  }
  const membership = await runtime.pool.query<{ organization_id: string }>(
    `select organization_id from ap.memberships where user_id = $1 and role = 'owner'
       and ($2::uuid is null or organization_id = $2::uuid) order by created_at limit 1`, [userId, header ?? null]);
  const id = membership.rows[0]?.organization_id;
  if (!id) { reply.code(404).send({ error: 'organization_not_found' }); return null; }
  return { id, userId };
}
async function ownedDeployment(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, runtime: BusinessRuntime) {
  const organization = await ownerOrganization(request, reply, runtime);
  if (!organization) return null;
  if (!uuid.test(request.params.id)) { reply.code(404).send({ error: 'deployment_not_found' }); return null; }
  const result = await runtime.pool.query<Deployment>(
    "select * from ap.deployments where id = $1 and organization_id = $2 and kind <> 'placement_embed'",
    [request.params.id, organization.id]);
  if (!result.rows[0]) { reply.code(404).send({ error: 'deployment_not_found' }); return null; }
  return { organization, deployment: result.rows[0] };
}
// 공개 경로(active())와 같은 기준: 최신 AI 승인본과 그 승인본의 지식이 최신 지식 승인본일 때만 현재 연결이다
const currentBinding = `coalesce(d.agent_release_id = (select id from ap.agent_releases
    where organization_id = d.organization_id order by revision desc limit 1)
  and (select knowledge_release_id from ap.agent_releases where id = d.agent_release_id)
    = (select id from ap.knowledge_releases where organization_id = d.organization_id order by revision desc limit 1),
  false) as current`;
function output(row: Deployment) {
  return { id: row.id, publicId: row.public_id, organizationId: row.organization_id, kind: row.kind,
    origin: row.allowed_origin, verificationProof: row.verification_proof, verifiedAt: row.verified_at,
    status: row.status, moderationRestricted: row.moderation_restricted,
    knowledgeRevision: row.knowledge_revision, createdAt: row.created_at };
}

export function registerDeploymentRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/deployments', async (request, reply) => {
    const organization = await ownerOrganization(request, reply, runtime);
    if (!organization) return reply;
    const result = await runtime.pool.query<Deployment & { current: boolean }>(
      `select d.*, ${currentBinding} from ap.deployments d
       where d.organization_id = $1 and d.kind <> 'placement_embed' order by d.created_at desc`,
      [organization.id]);
    return { deployments: result.rows.map(row => ({ ...output(row), current: row.current })) };
  });
  app.post('/v1/deployments', async (request, reply) => {
    const organization = await ownerOrganization(request, reply, runtime);
    if (!organization) return reply;
    const body = request.body as { kind?: unknown; origin?: unknown; idempotencyKey?: unknown } | undefined;
    const kind = body?.kind;
    const host = kind === 'owned_embed' ? originHost(body?.origin) : null;
    if ((kind !== 'link' && kind !== 'owned_embed') || (kind === 'owned_embed' && !host)
      || (kind === 'link' && body?.origin !== undefined)
      || (body?.idempotencyKey !== undefined && (typeof body.idempotencyKey !== 'string'
        || !uuid.test(body.idempotencyKey)))) return reply.code(400).send({ error: 'invalid_deployment' });
    const creationKey = body?.idempotencyKey as string | undefined;
    const requestedOrigin = kind === 'owned_embed' ? body?.origin as string : null;
    const existingForKey = async () => {
      if (!creationKey) return null;
      const found = await runtime.pool.query<Deployment>(
        'select * from ap.deployments where organization_id = $1 and creation_key = $2',
        [organization.id, creationKey]);
      return found.rows[0] ?? null;
    };
    const replay = (existing: Deployment) => existing.kind === kind && existing.allowed_origin === requestedOrigin
      ? reply.code(200).send(output(existing)) : reply.code(409).send({ error: 'idempotency_key_reused' });
    const previous = await existingForKey();
    if (previous) return replay(previous);
    const agent = await runtime.pool.query<{ id: string }>(
      'select id from ap.agent_releases where organization_id = $1 order by revision desc limit 1', [organization.id]);
    if (!agent.rows[0]) return reply.code(409).send({ error: 'agent_not_active' });
    if (await rejectExpiredTrial(reply, runtime.pool, organization.id)) return reply;
    const id = randomUUID();
    const proof = kind === 'owned_embed' ? token() : null;
    const result = await runtime.pool.query<Deployment>(
      `insert into ap.deployments (id, organization_id, public_id, kind, allowed_origin, verification_proof, created_by, creation_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict on constraint deployments_creation_unique do nothing returning *`,
      [id, organization.id, `dep_${token()}`, kind, requestedOrigin, proof, organization.userId, creationKey ?? null]);
    if (!result.rows[0]) {
      const concurrent = await existingForKey();
      if (!concurrent) throw new Error('deployment_creation_conflict_without_row');
      return replay(concurrent);
    }
    return reply.code(201).send(output(result.rows[0]!));
  });
  app.post<{ Params: { id: string } }>('/v1/deployments/:id/verify', async (request, reply) => {
    const found = await ownedDeployment(request, reply, runtime);
    if (!found) return reply;
    const row = found.deployment;
    if (row.kind !== 'owned_embed' || !row.allowed_origin || !row.verification_proof)
      return reply.code(400).send({ error: 'verification_not_required' });
    const host = originHost(row.allowed_origin);
    if (!host) return reply.code(409).send({ error: 'invalid_origin_configuration' });
    const verified = await (runtime.verifyDomain ?? defaultVerifyDomain)(host, row.verification_proof, row.allowed_origin);
    if (!verified) return reply.code(409).send({ error: 'domain_not_verified' });
    const result = await runtime.pool.query<Deployment>(
      'update ap.deployments set verified_at = now(), updated_at = now() where id = $1 returning *', [row.id]);
    return output(result.rows[0]!);
  });
  app.post<{ Params: { id: string } }>('/v1/deployments/:id/activate', async (request, reply) => {
    const found = await ownedDeployment(request, reply, runtime);
    if (!found) return reply;
    if (await rejectExpiredTrial(reply, runtime.pool, found.organization.id)) return reply;
    const row = found.deployment;
    if (row.kind === 'owned_embed' && !row.verified_at)
      return reply.code(409).send({ error: 'domain_not_verified' });
    const current = await runtime.pool.query<{ id: string; knowledge_revision: number; knowledge_release_id: string }>(
      'select id, knowledge_revision, knowledge_release_id from ap.agent_releases where organization_id = $1 order by revision desc limit 1',
      [found.organization.id]);
    const knowledge = await runtime.pool.query<{ id: string }>(
      'select id from ap.knowledge_releases where organization_id = $1 order by revision desc limit 1', [found.organization.id]);
    if (!current.rows[0] || current.rows[0].knowledge_release_id !== knowledge.rows[0]?.id)
      return reply.code(409).send({ error: 'knowledge_stale' });
    const result = await runtime.pool.query<Deployment & { current: boolean }>(
      `update ap.deployments d set status = 'active', agent_release_id = $2, knowledge_revision = $3, updated_at = now()
       where d.id = $1 and not d.moderation_restricted returning d.*, ${currentBinding}`,
      [row.id, current.rows[0].id, current.rows[0].knowledge_revision]);
    if (!result.rows[0]) return reply.code(409).send({ error: 'deployment_moderation_restricted' });
    return { ...output(result.rows[0]!), current: result.rows[0]!.current };
  });
  app.post<{ Params: { id: string } }>('/v1/deployments/:id/pause', async (request, reply) => {
    const found = await ownedDeployment(request, reply, runtime);
    if (!found) return reply;
    const result = await runtime.pool.query<Deployment>(
      "update ap.deployments set status = 'paused', updated_at = now() where id = $1 returning *", [found.deployment.id]);
    return output(result.rows[0]!);
  });

  async function active(publicDeploymentId: string, kind?: string, allowRestricted = false,
    db: Pool | PoolClient = runtime.pool) {
    if (!publicId.test(publicDeploymentId)) return null;
    const found = await db.query<Deployment & { business_name: string; introduction: string }>(
      `select d.*, k.content->>'businessName' as business_name, k.content->>'introduction' as introduction
       from ap.deployments d join ap.agent_releases a on a.id = d.agent_release_id
       join ap.knowledge_releases k on k.id = a.knowledge_release_id
       where d.public_id = $1 and d.status = 'active' and (not d.moderation_restricted or $3::boolean) and ($2::text is null or d.kind = $2)
         and (d.kind = 'link' or d.verified_at is not null)
         and a.id = (select id from ap.agent_releases where organization_id = d.organization_id order by revision desc limit 1)
         and k.id = (select id from ap.knowledge_releases where organization_id = d.organization_id order by revision desc limit 1)`,
      [publicDeploymentId, kind ?? null, allowRestricted]);
    const row = found.rows[0];
    if (!row) return null;
    if (row.kind === 'placement_embed') {
      const placement = row.placement_id && await activePlacement(db, row.placement_id);
      if (!placement || placement.origin !== row.allowed_origin || placement.organizationId !== row.organization_id) return null;
    }
    return row;
  }
  app.get<{ Params: { publicId: string } }>('/v1/public/deployments/:publicId', async (request, reply) => {
    const row = await active(request.params.publicId);
    if (!row) return reply.code(404).send({ error: 'deployment_not_found' });
    const placement = row.placement_id ? await activePlacement(runtime.pool, row.placement_id) : null;
    return reply.header('Cache-Control', 'no-store').send({ publicId: row.public_id, kind: row.kind,
      organizationId: row.organization_id, businessName: row.business_name,
      introduction: row.introduction, knowledgeRevision: row.knowledge_revision,
      ...(placement ? { placementId: placement.id, serviceName: placement.card.serviceName,
        advertisementLabel: placement.card.advertisementLabel } : {}) });
  });
  app.get<{ Querystring: { deployment?: string } }>('/sdk/v1.js', async (request, reply) => {
    const configuredId = request.query.deployment;
    if (configuredId) {
      const configured = await active(configuredId);
      if (!configured || (configured.kind !== 'owned_embed' && configured.kind !== 'placement_embed'))
        return reply.code(404).send({ error: 'deployment_not_found' });
    }
    const script = `(() => {
      const source = document.currentScript;
      if (!source) return;
      const api = new URL(source.src);
      const id = ${JSON.stringify(configuredId ?? null)} || source.getAttribute('data-deployment');
      if (!/^dep_[A-Za-z0-9_-]{20,50}$/.test(id || '')) return;
      const mode = source.getAttribute('data-mode') === 'floating' ? 'floating' : 'inline';
      const host = document.createElement('div');
      const frame = document.createElement('iframe');
      frame.title = '사업자 상담';
      frame.referrerPolicy = 'origin';
      frame.src = api.origin + '/embed/v1/' + id + '/frame';
      frame.addEventListener('load', () => frame.contentWindow?.postMessage({
        type: 'fieldai:embed-init', deploymentId: id }, api.origin));
      if (mode === 'floating') {
        host.style.cssText = 'position:fixed;right:12px;bottom:12px;width:min(380px,calc(100vw - 24px));z-index:2147483000';
        frame.style.cssText = 'display:none;box-sizing:border-box;width:100%;height:min(520px,calc(100dvh - 92px));border:1px solid #ccd6e2;border-radius:12px;background:#fff;box-shadow:0 12px 36px #17243a33';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '상담 열기';
        button.setAttribute('aria-label', '사업자 상담 열기');
        button.setAttribute('aria-expanded', 'false');
        button.style.cssText = 'display:block;margin-left:auto;margin-bottom:8px;padding:12px 18px;border:0;border-radius:999px;background:#174f9f;color:#fff;font:600 16px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px #17243a33';
        button.addEventListener('click', () => {
          const opened = button.getAttribute('aria-expanded') !== 'true';
          button.setAttribute('aria-expanded', String(opened));
          button.setAttribute('aria-label', opened ? '사업자 상담 닫기' : '사업자 상담 열기');
          button.textContent = opened ? '상담 닫기' : '상담 열기';
          frame.style.display = opened ? 'block' : 'none';
        });
        host.append(button, frame);
      } else {
        frame.style.cssText = 'width:100%;min-height:420px;border:0';
        host.append(frame);
      }
      source.insertAdjacentElement('afterend', host);
    })();`;
    return reply.headers({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff' }).send(script);
  });
  app.get<{ Params: { publicId: string } }>('/embed/v1/:publicId/frame', async (request, reply) => {
    const row = await active(request.params.publicId);
    if (!row || (row.kind !== 'owned_embed' && row.kind !== 'placement_embed'))
      return reply.code(404).send({ error: 'deployment_not_found' });
    let refererOrigin: string | null = null;
    try { refererOrigin = new URL(request.headers.referer ?? '').origin; } catch { /* explicit denial */ }
    if (refererOrigin !== row.allowed_origin) return reply.code(403).send({ error: 'origin_denied' });
    const safeName = row.business_name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const placement = row.placement_id ? await activePlacement(runtime.pool, row.placement_id) : null;
    const safeService = placement?.card.serviceName.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const safeDescription = placement?.card.description.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const webOrigin = publicWebOrigin();
    if (!webOrigin) return reply.code(503).send({ error: 'public_web_origin_not_configured' });
    const link = `${webOrigin}/public/${row.organization_id}`;
    const handshakeNonce = secret();
    await runtime.pool.query(
      `insert into ap.embed_nonces(nonce_hash, deployment_id, expires_at)
       values ($1, $2, now() + interval '2 minutes')`, [hash(handshakeNonce), row.id]);
    const scriptNonce = secret();
    const script = `
      const deploymentId = ${JSON.stringify(row.public_id)};
      const allowedOrigin = ${JSON.stringify(row.allowed_origin)};
      const handshakeNonce = ${JSON.stringify(handshakeNonce)};
      const status = document.getElementById('status');
      const continueButton = document.getElementById('continue');
      const askButton = document.getElementById('ask');
      const question = document.getElementById('question');
      const conditions = document.getElementById('conditions');
      const transcript = document.getElementById('transcript');
      const provisionalAnswer = document.getElementById('provisional-answer');
      const recoverAiButton = document.getElementById('recover-ai');
      const newConversationButton = document.getElementById('new-conversation');
      const endedNotice = document.getElementById('ended-notice');
      let sessionToken, conversationId, pendingTab, pendingTicket, tabReady = false, started = false;
      let pendingAiKey, pendingAiQuestion, pendingAiAnswer = null;
      let ended = false, lifecycle = 0, newStartBusy = false;
      const newAiKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
        .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
      const refresh = async expectedAnswer => {
        if (!conversationId) return;
        const generation = lifecycle;
        const response = await fetch('/v1/engagements/' + conversationId, {
          headers: { authorization: 'Bearer ' + sessionToken } });
        if (generation !== lifecycle) return false;
        if (!response.ok) throw new Error('conversation_unavailable');
        const result = await response.json();
        if (generation !== lifecycle) return false;
        // The registered retention-consumers preSerialization hook adds current tombstones to this authenticated GET.
        if (result.retention?.workPurgedAt) { markEnded(result.id); return false; }
        if (!Array.isArray(result.messages) || (expectedAnswer && !result.messages.some(item =>
          item.actor === 'assistant' && item.body === expectedAnswer)))
          throw new Error('answer_not_in_conversation');
        transcript.replaceChildren();
        for (const item of result.messages) {
          const entry = document.createElement('li');
          const actor = document.createElement('strong');
          actor.textContent = item.actor === 'assistant' ? 'AI' : '고객';
          const body = document.createElement('p');
          body.textContent = item.body;
          entry.append(actor, body);
          transcript.append(entry);
        }
        return true;
      };
      const clearPendingAi = () => {
        pendingAiKey = undefined; pendingAiQuestion = undefined; pendingAiAnswer = null;
        provisionalAnswer.hidden = true; provisionalAnswer.textContent = '';
        recoverAiButton.hidden = true; recoverAiButton.disabled = false; askButton.disabled = ended || newStartBusy;
      };
      const markEnded = id => {
        if (typeof id === 'string') conversationId = id;
        ended = true; lifecycle += 1;
        clearPendingAi(); transcript.replaceChildren();
        question.value = ''; question.disabled = true;
        if (conditions) { conditions.value = ''; conditions.disabled = true; }
        continueButton.disabled = true; pendingTicket = undefined;
        endedNotice.hidden = false; newConversationButton.hidden = false;
        status.textContent = '보존 기간이 종료되었습니다. 새 상담을 시작하면 별도 대화로 저장됩니다.';
      };
      const adoptNewConversation = id => {
        lifecycle += 1; ended = false; newStartBusy = false; conversationId = id;
        pendingTab = undefined; pendingTicket = undefined; tabReady = false;
        clearPendingAi(); transcript.replaceChildren(); question.value = ''; question.disabled = false;
        if (conditions) { conditions.value = ''; conditions.disabled = false; }
        endedNotice.hidden = true; newConversationButton.hidden = true; continueButton.disabled = false;
        status.textContent = '새 상담을 시작했습니다. 이전 대화와 별도로 저장됩니다.';
      };
      newConversationButton.addEventListener('click', async () => {
        if (!ended || !sessionToken || !conversationId || newStartBusy) return;
        const previous = conversationId, generation = lifecycle;
        newStartBusy = true; newConversationButton.disabled = true;
        const recoverNewConversation = async () => {
          const response = await fetch('/v1/public/deployments/' + deploymentId + '/engagements/current', {
            headers: { authorization: 'Bearer ' + sessionToken } });
          if (!response.ok) return false;
          const current = (await response.json()).engagement;
          if (generation !== lifecycle || !current || typeof current.id !== 'string'
              || current.id === previous || current.retention?.workPurgedAt || current.state !== 'ai_assisting') return false;
          adoptNewConversation(current.id); return true;
        };
        try {
          const response = await fetch('/v1/embed/engagements', { method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + sessionToken },
            body: JSON.stringify({ startNewFrom: previous }) });
          const result = await response.json().catch(() => ({}));
          if (generation !== lifecycle) return;
          if (response.status === 201 && typeof result.id === 'string' && result.id !== previous)
            adoptNewConversation(result.id);
          else if (!await recoverNewConversation())
            status.textContent = '새 상담을 시작하지 못했습니다. 기존 종료 상태를 유지합니다. 다시 시도하거나 직접 문의 링크를 이용해 주세요.';
        } catch {
          try {
            if (!await recoverNewConversation()) status.textContent = '새 상담 결과를 확인하지 못했습니다. 다시 시도하면 현재 대화를 확인합니다.';
          } catch { status.textContent = '새 상담 결과를 읽지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'; }
        } finally {
          newConversationButton.disabled = false;
          if (generation === lifecycle) newStartBusy = false;
        }
      });
      const recoverPendingAi = async () => {
        if (ended || !conversationId || !pendingAiKey) return;
        const generation = lifecycle;
        recoverAiButton.disabled = true;
        try {
          const response = await fetch('/v1/engagements/' + conversationId + '/messages/recover', {
            headers: { authorization: 'Bearer ' + sessionToken, 'idempotency-key': pendingAiKey } });
          if (generation !== lifecycle) return;
          if (response.status === 410) { markEnded(conversationId); return; }
          if (!response.ok) {
            status.textContent = 'AI 질문 결과를 확인하지 못했습니다. 같은 질문으로 재시도하거나 AP 상담 화면에서 사람에게 문의해 주세요.';
            return;
          }
          const run = await response.json();
          if (generation !== lifecycle) return;
          if (run.state === 'completed') {
            if (typeof run.answer !== 'string') throw new Error('invalid_recovery_answer');
            pendingAiAnswer = run.answer;
            provisionalAnswer.textContent = pendingAiAnswer || '확인된 답변이 없습니다. 사람에게 문의해 주세요.';
            provisionalAnswer.hidden = false;
            try {
              if (!await refresh(pendingAiAnswer)) return;
              if (question.value.trim() === run.question) question.value = '';
              clearPendingAi();
              status.textContent = 'AI 대화를 복구했습니다. 이어서 질문하거나 AP에서 사람에게 문의할 수 있습니다.';
            } catch {
              if (generation !== lifecycle) return;
              status.textContent = 'AI 답변은 저장됐지만 대화 목록을 읽지 못했습니다. 상태를 다시 확인해 주세요.';
            }
          } else if (run.state === 'failed' || run.state === 'rejected') {
            clearPendingAi();
            status.textContent = 'AI 답변이 확정되지 않았습니다. 질문을 AP 상담 화면에서 사람에게 문의해 주세요.';
          } else if (run.state === 'result_unknown') {
            status.textContent = 'AI 실행 결과 미상입니다. 같은 요청 상태를 다시 확인하거나 AP 상담 화면에서 사람에게 문의해 주세요. 새 AI 질문은 기다려야 합니다.';
          } else status.textContent = 'AI 질문을 처리 중입니다. 잠시 뒤 상태를 다시 확인하거나 사람에게 문의해 주세요.';
        } catch {
          if (generation === lifecycle) status.textContent = 'AI 질문 결과를 확인하지 못했습니다. 네트워크 확인 뒤 같은 실행 상태를 다시 조회해 주세요.';
        } finally {
          if (generation === lifecycle) {
            recoverAiButton.disabled = false;
            if (pendingAiKey) recoverAiButton.hidden = false;
            askButton.disabled = ended || newStartBusy || pendingAiAnswer !== null;
          }
        }
      };
      recoverAiButton.addEventListener('click', recoverPendingAi);
      const deliver = () => {
        if (!ended && !newStartBusy && pendingTab && pendingTicket && tabReady) {
          pendingTab.postMessage({ type: 'fieldai:handoff-ticket', ticket: pendingTicket }, location.origin);
          pendingTicket = undefined;
        }
      };
      window.addEventListener('message', event => {
        if (event.source === pendingTab && event.origin === location.origin &&
            event.data?.type === 'fieldai:handoff-ready') { tabReady = true; deliver(); }
      });
      window.addEventListener('message', async event => {
        if (started || event.source !== window.parent || event.origin !== allowedOrigin ||
            event.data?.type !== 'fieldai:embed-init' || event.data?.deploymentId !== deploymentId) return;
        started = true;
        try {
          const response = await fetch('/v1/embed/sessions', { method: 'POST',
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nonce: handshakeNonce }) });
          if (!response.ok) throw new Error('session_failed');
          sessionToken = (await response.json()).token;
          continueButton.disabled = false;
          askButton.disabled = false;
          status.textContent = '상담 연결 준비 완료';
        } catch { status.textContent = '상담 연결에 실패했습니다. 직접 문의 링크를 이용해 주세요.'; }
      });
      document.getElementById('ai-form').addEventListener('submit', async event => {
        event.preventDefault();
        const asked = question.value.trim();
        if (ended || newStartBusy || !sessionToken || !asked || pendingAiAnswer !== null) return;
        const generation = lifecycle;
        if (pendingAiKey && pendingAiQuestion !== asked) {
          status.textContent = '이전 AI 질문 결과가 미확인입니다. 같은 질문을 다시 입력하거나 요청 상태를 먼저 확인해 주세요.';
          return;
        }
        askButton.disabled = true;
        status.textContent = '승인된 정보로 답변을 확인하고 있습니다.';
        try {
          if (!conversationId) {
            const started = await fetch('/v1/embed/engagements', { method: 'POST',
              headers: { authorization: 'Bearer ' + sessionToken } });
            const result = await started.json().catch(() => ({}));
            if (generation !== lifecycle) return;
            if (started.status === 410 && result.error === 'retention_work_ended') { markEnded(result.id); return; }
            if (!started.ok) {
              status.textContent = started.status === 503
                ? 'AI 공급사가 연결되지 않았습니다. AP 상담 화면에서 사람에게 문의할 수 있습니다.'
                : '상담을 시작하지 못했습니다. AP 상담 화면에서 사람에게 문의할 수 있습니다.';
              return;
            }
            conversationId = result.id;
          }
          if (!pendingAiKey) { pendingAiKey = newAiKey(); pendingAiQuestion = asked; }
          const response = await fetch('/v1/engagements/' + conversationId + '/messages', { method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + sessionToken,
              'idempotency-key': pendingAiKey },
            body: JSON.stringify({ question: asked }) });
          if (generation !== lifecycle) return;
          if (response.status === 202) {
            recoverAiButton.hidden = false;
            const ongoing = await response.json().catch(() => ({}));
            if (generation !== lifecycle) return;
            status.textContent = ongoing.state === 'result_unknown'
              ? 'AI 실행 결과 미상입니다. 같은 요청 상태를 다시 확인하거나 AP 상담 화면에서 사람에게 문의해 주세요. 새 AI 질문은 기다려야 합니다.'
              : 'AI 질문을 처리 중입니다. 같은 실행 상태를 다시 확인하거나 AP에서 사람에게 문의해 주세요.';
            return;
          }
          const result = await response.json().catch(() => ({}));
          if (generation !== lifecycle) return;
          if (!response.ok) {
            if (response.status === 410 && result.error === 'retention_work_ended') {
              markEnded(conversationId);
            } else if (response.status === 429) {
              clearPendingAi();
              status.textContent = 'AI 질문 한도에 도달했습니다. 사람에게 문의할 수 있습니다.';
            } else if (response.status === 503 && ['blocked_integration', 'budget_not_configured',
              'provider_unavailable'].includes(result.error)) {
              clearPendingAi();
              status.textContent = 'AI 공급사 또는 예산 설정을 사용할 수 없습니다. AP 상담 화면에서 사람에게 문의할 수 있습니다.';
            } else if (response.status < 500) {
              clearPendingAi();
              status.textContent = 'AI 답변을 제공하지 못했습니다. 질문을 AP 상담 화면에서 사람에게 문의해 주세요.';
            } else {
              recoverAiButton.hidden = false;
              status.textContent = 'AI 질문 결과를 확인하지 못했습니다. 같은 실행 상태를 다시 조회해 주세요.';
            }
            return;
          }
          if (typeof result.answer !== 'string' || typeof result.runId !== 'string')
            throw new Error('invalid_ai_response');
          pendingAiAnswer = result.answer;
          provisionalAnswer.textContent = pendingAiAnswer || '확인된 답변이 없습니다. 사람에게 문의해 주세요.';
          provisionalAnswer.hidden = false;
          try {
            if (!await refresh(pendingAiAnswer)) return;
            if (question.value.trim() === asked) question.value = '';
            clearPendingAi();
            status.textContent = result.handoffRecommended
              ? '확인이 필요한 내용입니다. AP 상담 화면에서 사람에게 문의해 주세요.'
              : 'AI 답변을 확인했습니다.';
          } catch {
            if (generation !== lifecycle) return;
            recoverAiButton.hidden = false;
            status.textContent = 'AI 답변은 저장됐지만 대화 목록을 읽지 못했습니다. 상태를 다시 확인해 주세요.';
          }
        } catch {
          if (generation !== lifecycle) return;
          if (pendingAiKey) await recoverPendingAi();
          else status.textContent = '답변을 받지 못했습니다. AP 상담 화면에서 사람에게 문의할 수 있습니다.';
        } finally { if (generation === lifecycle) askButton.disabled = ended || newStartBusy || pendingAiAnswer !== null; }
      });
      continueButton.addEventListener('click', async () => {
        if (ended || newStartBusy || !sessionToken) return;
        const generation = lifecycle;
        const tab = window.open('/embed/v1/wait', 'ap-handoff-' + crypto.randomUUID());
        if (!tab) { status.textContent = '새 창이 차단됐습니다. 직접 문의 링크를 이용해 주세요.'; return; }
        pendingTab = tab; pendingTicket = undefined; tabReady = false; continueButton.disabled = true;
        try {
          const response = await fetch('/v1/embed/handoffs', { method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + sessionToken },
            body: JSON.stringify({ question: question.value, conditions: conditions?.value || '' }) });
          const result = await response.json().catch(() => ({}));
          if (generation !== lifecycle) { tab.close(); return; }
          if (response.status === 410 && result.error === 'retention_work_ended') { markEnded(result.id); tab.close(); return; }
          if (!response.ok) throw new Error('handoff_failed');
          pendingTicket = result.ticket;
          deliver();
          status.textContent = 'AP 상담 창으로 이동하고 있습니다.';
        } catch { tab.close(); if (generation === lifecycle && !ended) { status.textContent = '연결에 실패했습니다. 직접 문의 링크를 이용해 주세요.'; continueButton.disabled = false; } }
      });`;
    return reply.headers({
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'none'; frame-ancestors ${row.allowed_origin}; style-src 'nonce-${scriptNonce}'; script-src 'nonce-${scriptNonce}'; connect-src 'self'`,
    }).send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>사업자 상담</title><style nonce="${scriptNonce}">body{font:16px system-ui,sans-serif;color:#17243a;background:#fff;padding:16px}p{line-height:1.5}textarea{box-sizing:border-box;width:100%;min-height:72px;font:inherit}button,a{display:inline-block;margin-top:12px;padding:12px 16px;border-radius:8px;font:inherit}button{border:0;background:#174f9f;color:#fff}[hidden]{display:none!important}a{color:#174f9f}button:disabled{opacity:.6}ol{padding-left:24px}li{margin:12px 0}li p{margin:4px 0}.ad-card{border:1px solid #dce5ef;border-radius:14px;padding:16px;background:#f8fbff}.ad-label{display:inline-block;padding:4px 8px;border-radius:6px;background:#eaf1f9;color:#235887;font-size:14px;font-weight:700}.ad-card h2{font-size:21px;margin:12px 0 8px}.ad-card p{margin:8px 0;white-space:pre-wrap}</style></head><body><main>${placement ? `<article class="ad-card"><span class="ad-label">광고</span><p>${safeName}</p><h2>${safeService}</h2><p>${safeDescription}</p></article>` : `<strong>${safeName}</strong>`}<p>승인된 사업 정보에 대해 AI에 질문할 수 있습니다. 연락처와 개인 정보는 입력하지 마세요. 사람 문의는 AP 상담 화면에서 접수합니다.</p><ol id="transcript" aria-label="AI 상담 대화"></ol><p id="provisional-answer" hidden></p><form id="ai-form"><label for="question">질문 또는 문의 초안 (연락처 제외)</label><textarea id="question" maxlength="1000" required></textarea><button id="ask" type="submit" disabled>AI에 질문</button></form><button id="recover-ai" type="button" hidden>AI 요청 상태 다시 확인</button>${placement ? '<label for="conditions">희망 조건 (선택, 연락처 제외)</label><textarea id="conditions" maxlength="1000"></textarea>' : ''}<p id="ended-notice" hidden>이 대화는 보존 기간이 종료되어 추가 질문을 받지 않습니다. 이전 접수 확인키와 기록은 새 상담과 구분됩니다.</p><button id="new-conversation" type="button" hidden>새 상담 시작</button><p id="status" role="status">상담 연결 중</p><button id="continue" type="button" disabled>AP에서 이어가기</button><br><a href="${link}" target="_blank" rel="noopener noreferrer">직접 문의 링크</a></main><script nonce="${scriptNonce}">${script}</script></body></html>`);
  });

  app.post('/v1/embed/sessions', async (request, reply) => {
    const nonce = (request.body as { nonce?: unknown } | undefined)?.nonce;
    if (typeof nonce !== 'string' || !secretPattern.test(nonce))
      return reply.code(400).send({ error: 'invalid_nonce' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const consumed = await client.query<{ deployment_id: string; public_id: string; placement_id: string | null }>(
        `delete from ap.embed_nonces n where n.nonce_hash = $1 and n.expires_at > now()
          and exists (select 1 from ap.deployments d where d.id = n.deployment_id and d.status = 'active')
         returning n.deployment_id,
           (select public_id from ap.deployments where id = n.deployment_id) as public_id,
           (select placement_id from ap.deployments where id = n.deployment_id) as placement_id`, [hash(nonce)]);
      const deploymentId = consumed.rows[0]?.deployment_id;
      if (!deploymentId) { await client.query('rollback'); return reply.code(409).send({ error: 'nonce_expired_or_used' }); }
      const owner = await client.query<{ organization_id: string }>(
        'select organization_id from ap.deployments where id = $1', [deploymentId]);
      if (await rejectExpiredTrial(reply, client, owner.rows[0]!.organization_id)) {
        await client.query('rollback'); return reply;
      }
      if (consumed.rows[0]!.placement_id)
        await client.query('select id from ap.placements where id=$1 for share', [consumed.rows[0]!.placement_id]);
      await client.query('select id from ap.deployments where id=$1 for share', [deploymentId]);
      if (!await active(consumed.rows[0]!.public_id, undefined, false, client)) {
        await client.query('rollback'); return reply.code(409).send({ error: 'deployment_inactive' });
      }
      const sessionToken = secret();
      await client.query(
        `insert into ap.embed_sessions(id, token_hash, deployment_id, expires_at, distribution_traffic_class)
         values ($1, $2, $3, now() + interval '1 hour', $4)`,
        [randomUUID(), hash(sessionToken), deploymentId,
          consumed.rows[0]!.placement_id ? distributionTrafficClass(request.headers, 'embed') : null]);
      await client.query('commit');
      return reply.header('Cache-Control', 'no-store').code(201).send({ token: sessionToken });
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });
  app.post('/v1/embed/handoffs', async (request, reply) => {
    const bearer = /^Bearer ([A-Za-z0-9_-]{40,64})$/.exec(request.headers.authorization ?? '')?.[1];
    if (!bearer) return reply.code(401).send({ error: 'invalid_embed_session' });
    const body = request.body as { question?: unknown; conditions?: unknown } | undefined;
    const question = body?.question;
    const conditions = body?.conditions ?? '';
    if (typeof question !== 'string' || question.length > 1000
      || typeof conditions !== 'string' || conditions.length > 1000
      || /(?:\+?\d[\d\s-]{8,}\d|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i.test(question + '\n' + conditions))
      return reply.code(400).send({ error: 'question_contains_contact_or_invalid' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const session = await client.query<{ id: string; public_id: string; conversation_id: string | null }>(
        `select s.id,d.public_id,s.conversation_id from ap.embed_sessions s join ap.deployments d on d.id=s.deployment_id
         where s.token_hash=$1 and s.expires_at>now() and s.transferred_at is null and d.status='active'
         for update of s`, [hash(bearer)]);
      const current = session.rows[0];
      const retained = current?.conversation_id ? (await client.query<{ retention_work_purged_at: Date | null }>(
        'select retention_work_purged_at from ap.inquiries where id=$1 for share', [current.conversation_id])).rows[0] : null;
      if (retained?.retention_work_purged_at) {
        await client.query('rollback'); return reply.code(410).send({ error: 'retention_work_ended',
          id: current!.conversation_id, retention: { workPurgedAt: retained.retention_work_purged_at.toISOString() } });
      }
      const deployment = current && await active(current.public_id, undefined, !!current.conversation_id, client);
      if (!current || !deployment || (deployment.kind !== 'owned_embed' && deployment.kind !== 'placement_embed')) {
        await client.query('rollback'); return reply.code(401).send({ error: 'invalid_embed_session' });
      }
      const ticket = secret();
      await client.query(
        `insert into ap.embed_handoffs(ticket_hash, session_id, question, conditions, expires_at)
         values ($1,$2,$3,$4,now()+interval '1 minute')`,
        [hash(ticket), current.id, question.trim(), conditions.trim()]);
      await client.query('commit');
      return reply.header('Cache-Control', 'no-store').code(201).send({ ticket });
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });
  app.get('/embed/v1/wait', async (_request, reply) => {
    const nonce = secret();
    const script = `
      const status = document.getElementById('status');
      if (!window.opener) status.textContent = '상담 연결 창을 확인할 수 없습니다.';
      else {
        window.addEventListener('message', async event => {
          if (event.source !== window.opener || event.origin !== location.origin ||
              event.data?.type !== 'fieldai:handoff-ticket' ||
              typeof event.data.ticket !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(event.data.ticket)) return;
          try {
            const response = await fetch('/v1/embed/continue', { method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin', body: JSON.stringify({ ticket: event.data.ticket }) });
            if (!response.ok) throw new Error('handoff_failed');
            const result = await response.json();
            location.replace('/consult/' + encodeURIComponent(result.publicId) + '?handoff=1');
          } catch { status.textContent = '상담 연결에 실패했습니다. 원래 사이트에서 다시 시도해 주세요.'; }
        });
        window.opener.postMessage({ type: 'fieldai:handoff-ready' }, location.origin);
      }`;
    return reply.headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'`,
    }).send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AP 상담 연결</title></head><body><main><p id="status">상담 화면 연결 중</p></main><script nonce="${nonce}">${script}</script></body></html>`);
  });
  app.post('/v1/embed/continue', async (request, reply) => {
    const expected = publicWebOrigin();
    if (!expected) return reply.code(503).send({ error: 'public_web_origin_not_configured' });
    if (request.headers.origin !== expected) return reply.code(403).send({ error: 'origin_denied' });
    const ticket = (request.body as { ticket?: unknown } | undefined)?.ticket;
    if (typeof ticket !== 'string' || !secretPattern.test(ticket))
      return reply.code(400).send({ error: 'invalid_ticket' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      // Restart, handoff creation and consumption all lock the session before a ticket.
      await client.query(
        `select id from ap.embed_sessions where id=(select session_id from ap.embed_handoffs where ticket_hash=$1) for update`,
        [hash(ticket)]);
      const consumed = await client.query<{ deployment_id: string; public_id: string; question: string; conditions: string;
        session_id: string; placement_id: string | null; organization_id: string; agent_release_id: string;
        conversation_id: string | null;
        distribution_traffic_class: DistributionTrafficClass | null }>(
        `update ap.embed_handoffs h set consumed_at = now()
         from ap.embed_sessions s, ap.deployments d
         where h.ticket_hash = $1 and h.consumed_at is null and h.expires_at > now()
           and s.id = h.session_id and s.expires_at > now() and s.transferred_at is null
           and d.id = s.deployment_id and d.status = 'active'
         returning d.id as deployment_id, d.public_id, d.placement_id, d.organization_id,
           s.distribution_traffic_class,
           d.agent_release_id, h.question, h.conditions, s.id as session_id,s.conversation_id`, [hash(ticket)]);
      const row = consumed.rows[0];
      if (!row) { await client.query('rollback'); return reply.code(410).send({ error: 'ticket_expired_or_used' }); }
      if (await rejectExpiredTrial(reply, client, row.organization_id)) {
        await client.query('rollback'); return reply;
      }
      if (row.placement_id) await client.query('select id from ap.placements where id = $1 for share', [row.placement_id]);
      await client.query('select id from ap.deployments where id=$1 for share', [row.deployment_id]);
      const deployment = await active(row.public_id, undefined, !!row.conversation_id, client);
      if (!deployment || (deployment.kind !== 'owned_embed' && deployment.kind !== 'placement_embed')) {
        await client.query('rollback'); return reply.code(410).send({ error: 'deployment_inactive' });
      }
      const transferred = await client.query<{ conversation_id: string | null }>(
        `update ap.embed_sessions set transferred_at = now()
         where id = $1 and transferred_at is null returning conversation_id`, [row.session_id]);
      if (!transferred.rows[0]) { await client.query('rollback'); return reply.code(410).send({ error: 'ticket_expired_or_used' }); }
      let conversationId = transferred.rows[0].conversation_id;
      const consultSecret = secret();
      if (!conversationId) {
        if (row.placement_id) {
          const guard = await guardPlacementEngagement(client, row.organization_id);
          if (guard) { await client.query('rollback'); return reply.code(guard === 'budget_not_configured' ? 503 : 429).send({ error: guard }); }
        }
        const agent = await client.query<{ knowledge_release_id: string; knowledge_revision: number }>(
          'select knowledge_release_id, knowledge_revision from ap.agent_releases where id = $1',
          [row.agent_release_id],
        );
        if (!agent.rows[0]) { await client.query('rollback'); return reply.code(410).send({ error: 'agent_unavailable' }); }
        conversationId = randomUUID();
        await client.query(
          `insert into ap.inquiries(id, organization_id, knowledge_release_id, knowledge_revision,
             deployment_id, agent_release_id, placement_id, consult_session_hash, consult_session_expires_at,
             distribution_traffic_class, state, mode, automation_paused)
           values ($1,$2,$3,$4,$5,$6,$7,$8,now() + interval '1 hour',$9,'ai_assisting','ai',false)`,
          [conversationId, row.organization_id, agent.rows[0].knowledge_release_id,
            agent.rows[0].knowledge_revision, row.deployment_id, row.agent_release_id,
            row.placement_id, hash(consultSecret), row.distribution_traffic_class ?? 'unclassified'],
        );
        await recordDistributionEvent(client, conversationId, row.placement_id, 'engagement_started',
          row.distribution_traffic_class ?? 'unclassified');
        await client.query('update ap.embed_sessions set conversation_id = $2 where id = $1',
          [row.session_id, conversationId]);
      }
      const capability = secret();
      await client.query(
        `insert into ap.first_party_handoffs(token_hash, deployment_id, question, conditions,
           conversation_id, expires_at)
         values ($1, $2, $3, $4, $5, now() + interval '1 hour')`,
        [hash(capability), row.deployment_id, row.question, row.conditions, conversationId]);
      if (conversationId && transferred.rows[0].conversation_id) {
        const adopted = await client.query(
          `update ap.inquiries set consult_session_hash = $2, consult_session_expires_at = now() + interval '1 hour'
           where id = $1 and deployment_id = $3 and state = 'ai_assisting' and automation_paused = false
           returning id`, [conversationId, hash(consultSecret), row.deployment_id]);
        if (!adopted.rows[0]) { await client.query('rollback'); return reply.code(410).send({ error: 'conversation_unavailable' }); }
      }
      await client.query('commit');
      const secure = expected.startsWith('https:') ? '; Secure' : '';
      const cookies = [`ap_embed_context=${capability}; HttpOnly; SameSite=Lax; Path=/v1/embed/context; Max-Age=3600${secure}`];
      cookies.push(`ap_consult_session=${consultSecret}; HttpOnly; SameSite=Lax; Path=/v1; Max-Age=3600${secure}`);
      return reply.headers({ 'Set-Cookie': cookies,
        'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).send({ publicId: row.public_id });
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });
  app.get('/v1/embed/context', async (request, reply) => {
    const capability = /(?:^|;\s*)ap_embed_context=([A-Za-z0-9_-]{40,64})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
    if (!capability) return reply.code(401).send({ error: 'context_required' });
    const result = await runtime.pool.query<{ public_id: string; question: string; conditions: string;
      conversation_id: string | null;
      placement_id: string | null; service_name: string | null }>(
      `select d.public_id, d.placement_id, r.content->>'serviceName' as service_name,
         f.question, f.conditions, f.conversation_id from ap.first_party_handoffs f
       join ap.deployments d on d.id = f.deployment_id
       left join ap.placements p on p.id = d.placement_id
       left join ap.campaign_releases r on r.id = p.campaign_release_id
       where f.token_hash = $1 and f.expires_at > now()`, [hash(capability)]);
    if (!result.rows[0]) return reply.code(401).send({ error: 'context_required' });
    return reply.headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      .send({ publicId: result.rows[0].public_id, question: result.rows[0].question,
        ...(result.rows[0].conversation_id ? { conversationId: result.rows[0].conversation_id } : {}),
        ...(result.rows[0].placement_id ? { placementId: result.rows[0].placement_id,
          serviceName: result.rows[0].service_name, conditions: result.rows[0].conditions } : {}) });
  });
}
