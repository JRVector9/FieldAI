import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { authorizedApSourceAccess } from './ap-connector.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const sourceStates = new Set(['not_synced', 'pending_review', 'current', 'stale',
  'unavailable', 'integrity_conflict', 'revoked']);
const jobStates = new Set(['pending', 'retry', 'completed', 'blocked']);
const object = (value: unknown): Record<string, unknown> | null => value !== null
  && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

function receiptTimestamp(value:unknown):value is string {
  if(typeof value!=='string'||value.length>64)return false;
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if(!match||!Number.isFinite(Date.parse(value)))return false;
  const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number);
  const calendar=new Date(0);calendar.setUTCFullYear(year!,month!-1,day!);
  return calendar.getUTCFullYear()===year&&calendar.getUTCMonth()===month!-1&&calendar.getUTCDate()===day
    && hour!<24&&minute!<60&&second!<60&&(!match[7]||(Number(match[8])<24&&Number(match[9])<60));
}

async function sourceAccess(runtime: FieldBusinessRuntime, request: FastifyRequest, id: string) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) return { error: 'authentication_required', status: 401 } as const;
  if (!uuid.test(id)) return { error: 'connection_not_found', status: 404 } as const;
  const found = await runtime.pool.query<{ organization_id: string }>(
    `select c.organization_id from field.ap_connections c
       join field.memberships m on m.organization_id = c.organization_id
      where c.id = $1 and m.user_id = $2 and m.role = 'owner'`, [id, userId]);
  const organizationId = found.rows[0]?.organization_id;
  if (!organizationId) return { error: 'connection_not_found', status: 404 } as const;
  return authorizedApSourceAccess(runtime, organizationId, userId, id);
}

function safeJob(value: unknown, id: string) {
  const job = object(value);
  if (!job || !uuid.test(String(job.operationId)) || job.connectionId !== id
    || typeof job.expectedSourceRevision !== 'number'
    || !Number.isSafeInteger(job.expectedSourceRevision) || job.expectedSourceRevision < 0
    || !jobStates.has(String(job.state)) || typeof job.retryable !== 'boolean'
    || (job.sourceRevision !== null && (typeof job.sourceRevision !== 'number'
      || !Number.isSafeInteger(job.sourceRevision) || job.sourceRevision < 1))
    || (job.outcome !== null && typeof job.outcome !== 'string')
    || (job.error !== null && typeof job.error !== 'string')) return null;
  return { operationId: job.operationId, connectionId: id,
    expectedSourceRevision: job.expectedSourceRevision, state: job.state,
    retryable: job.retryable, sourceRevision: job.sourceRevision,
    outcome: job.outcome, error: job.error };
}

export function registerApSourceRefreshRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get<{ Params: { id: string } }>('/v1/connections/ap/:id/source-refresh', async (request, reply) => {
    const grant = await sourceAccess(runtime, request, request.params.id);
    if ('error' in grant) return reply.code(grant.status).send({ error: grant.error });
    try {
      const result = await (runtime.apConnector?.fetcher ?? fetch)(
        `${grant.resource}/connections/${request.params.id}/source`,
        { headers: { authorization: `Bearer ${grant.token}` }, signal: AbortSignal.timeout(8000) });
      if (result.status === 404) return reply.code(404).send({ error: 'source_not_found' });
      if (!result.ok) return reply.code(503).send({ error: 'ap_source_unavailable' });
      const source = object(await result.json().catch(() => null));
      if (!source || source.connectionId !== request.params.id
        || typeof source.sourceRevision !== 'number' || !Number.isSafeInteger(source.sourceRevision)
        || source.sourceRevision < 0 || !sourceStates.has(String(source.state))
        || (source.approvedSourceRevision !== null
          && (typeof source.approvedSourceRevision !== 'number'
            || !Number.isSafeInteger(source.approvedSourceRevision)
            || source.approvedSourceRevision < 1))
        || (source.syncedAt !== undefined && source.syncedAt !== null && !receiptTimestamp(source.syncedAt)))
        return reply.code(502).send({ error: 'invalid_ap_source_response' });
      return reply.header('Cache-Control', 'private, no-store').send({
        connectionId: request.params.id, sourceRevision: source.sourceRevision,
        approvedSourceRevision: source.approvedSourceRevision, state: source.state,
        syncedAt: source.syncedAt ?? null });
    } catch { return reply.code(503).send({ error: 'ap_source_unavailable' }); }
  });

  app.post<{ Params: { id: string } }>('/v1/connections/ap/:id/source-refresh', async (request, reply) => {
    const grant = await sourceAccess(runtime, request, request.params.id);
    if ('error' in grant) return reply.code(grant.status).send({ error: grant.error });
    const body = object(request.body);
    const expected = body?.expectedSourceRevision;
    const key = request.headers['idempotency-key'];
    if (!body || Object.keys(body).length !== 1 || typeof expected !== 'number'
      || !Number.isSafeInteger(expected) || expected < 0
      || typeof key !== 'string' || !keyPattern.test(key))
      return reply.code(400).send({ error: 'invalid_source_refresh_request' });
    let response: Response;
    try {
      response = await (runtime.apConnector?.fetcher ?? fetch)(
        `${grant.resource}/connections/${request.params.id}/source-refreshes`, {
          method: 'POST', headers: { authorization: `Bearer ${grant.token}`,
            'content-type': 'application/json', 'idempotency-key': key },
          body: JSON.stringify({ expectedSourceRevision: expected }), signal: AbortSignal.timeout(8000),
        });
    } catch { return reply.code(503).send({ error: 'source_refresh_delivery_unknown' }); }
    if (response.status === 409) {
      const conflict = object(await response.json().catch(() => null));
      return reply.code(409).send({ error: typeof conflict?.error === 'string'
        ? conflict.error : 'source_version_changed',
      ...(typeof conflict?.currentRevision === 'number'
        && Number.isSafeInteger(conflict.currentRevision) ? { currentRevision: conflict.currentRevision } : {}) });
    }
    if (response.status === 403) return reply.code(403).send({ error: 'ap_scope_not_granted' });
    if (response.status === 404) return reply.code(404).send({ error: 'source_not_found' });
    if (response.status !== 202) return reply.code(503).send({ error: 'ap_source_unavailable' });
    const job = safeJob(await response.json().catch(() => null), request.params.id);
    if (!job || job.expectedSourceRevision !== expected)
      return reply.code(502).send({ error: 'invalid_ap_source_response' });
    return reply.header('Cache-Control', 'private, no-store').code(202).send(job);
  });

  app.get<{ Params: { id: string; operationId: string } }>(
    '/v1/connections/ap/:id/source-refresh/:operationId', async (request, reply) => {
      const grant = await sourceAccess(runtime, request, request.params.id);
      if ('error' in grant) return reply.code(grant.status).send({ error: grant.error });
      if (!uuid.test(request.params.operationId))
        return reply.code(404).send({ error: 'source_refresh_not_found' });
      try {
        const response = await (runtime.apConnector?.fetcher ?? fetch)(
          `${grant.resource}/connections/${request.params.id}/source-refreshes/${request.params.operationId}`,
          { headers: { authorization: `Bearer ${grant.token}` }, signal: AbortSignal.timeout(8000) });
        if (response.status === 404) return reply.code(404).send({ error: 'source_refresh_not_found' });
        if (!response.ok) return reply.code(503).send({ error: 'ap_source_unavailable' });
        const job = safeJob(await response.json().catch(() => null), request.params.id);
        if (!job || job.operationId !== request.params.operationId)
          return reply.code(502).send({ error: 'invalid_ap_source_response' });
        return reply.header('Cache-Control', 'private, no-store').send(job);
      } catch { return reply.code(503).send({ error: 'ap_source_unavailable' }); }
    });
}
