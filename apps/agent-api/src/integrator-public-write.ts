import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { integratorGrant, type Grant } from './integrator-auth.js';
import { originHost, defaultVerifyDomain } from './deployments.js';
import { rejectExpiredTrial } from './trial-access.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v)
  ? v as Record<string, unknown> : null;
type Connection = { id: string; organization_id: string; agent_id: string; external_organization_id: string;
  origin: string; created_at: Date };
type Deployment = { id: string; public_id: string; connection_id: string; organization_id: string; agent_id: string;
  allowed_origin: string; verification_proof: string; verified_at: Date | null; status: string;
  moderation_restricted: boolean; knowledge_revision: number | null; public_write_revision: number; created_at: Date };
type Result = { status?: number; body: Record<string, unknown> };
const failure = (status: number, error: string): Result => ({ status, body: { error } });
function connectionView(c: Connection) {
  return { id: c.id, organizationId: c.organization_id, agentId: c.agent_id,
    externalOrganizationId: c.external_organization_id, origin: c.origin,
    revision: 1, createdAt: c.created_at.toISOString(), state: 'installation_only' };
}
function deploymentView(d: Deployment) {
  return { id: d.id, publicId: d.public_id, connectionId: d.connection_id,
    organizationId: d.organization_id, agentId: d.agent_id, kind: 'owned_embed', origin: d.allowed_origin,
    verificationProof: d.verification_proof, verifiedAt: d.verified_at?.toISOString() ?? null,
    knowledgeRevision: d.knowledge_revision, revision: d.public_write_revision,
    createdAt: d.created_at.toISOString(), state: d.status };
}
async function ownedConnection(db: PoolClient, grant: Grant, id: string) {
  const result = await db.query<Connection>(`select * from ap.public_installation_connections
    where id=$1 and selection_id=$2 and client_id=$3 and organization_id=$4 and agent_id=$5`,
  [id, grant.id, grant.client_id, grant.organization_id, grant.agent_id]);
  return result.rows[0];
}
async function ownedDeployment(db: PoolClient, grant: Grant, id: string) {
  const result = await db.query<Deployment>(`select d.*, b.connection_id, c.agent_id from ap.deployments d
    join ap.public_installation_deployments b on b.deployment_id=d.id
    join ap.public_installation_connections c on c.id=b.connection_id
    where d.id=$1 and b.selection_id=$2 and b.client_id=$3 and c.selection_id=$2 and c.client_id=$3
      and d.organization_id=$4 and c.organization_id=$4 and c.agent_id=$5 and d.kind='owned_embed'
      and d.allowed_origin=c.origin for update of d`,
  [id, grant.id, grant.client_id, grant.organization_id, grant.agent_id]);
  return result.rows[0];
}
function exactKeys(body: Record<string, unknown> | null, keys: string[]) {
  return body !== null && Object.keys(body).length === keys.length && keys.every(k => k in body);
}

export function registerIntegratorPublicWriteRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  const config = { publicWrite: true };
  app.addHook('preSerialization', async (request, reply, payload) => {
    if (!(request.routeOptions.config as { publicWrite?: boolean }).publicWrite) return payload;
    const body = object(payload);
    if (!body) return payload;
    return { ...body, request_id: request.id, ...(reply.statusCode >= 400
      ? { state: 'rejected', retryable: [429, 503].includes(reply.statusCode) }
      : { retryable: false }) };
  });
  async function run(request: FastifyRequest, reply: FastifyReply,
    scope: 'ap.connections.create' | 'ap.deployments.manage',
    execute: (db: PoolClient, grant: Grant) => Promise<Result | null>) {
    reply.header('Cache-Control', 'private, no-store');
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const grant = await integratorGrant(request, reply, runtime, scope, db, true);
      if (!grant) { await db.query('rollback'); return reply; }
      const result = await execute(db, grant);
      if (!result) { await db.query('rollback'); return reply; }
      if ((result.status ?? 200) >= 400) await db.query('rollback');
      else await db.query('commit');
      if (typeof result.body.revision === 'number') reply.header('ETag', `"${result.body.revision}"`);
      return reply.code(result.status ?? 200).send(result.body);
    } catch {
      await db.query('rollback').catch(() => undefined);
      return reply.code(503).send({ error: 'public_write_unavailable' });
    } finally { db.release(); }
  }
  async function write(request: FastifyRequest, reply: FastifyReply, db: PoolClient, grant: Grant,
    operation: string, target: string, content: unknown, perform: (operationId: string) => Promise<Result | null>) {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !uuid.test(key)) return failure(400, 'invalid_idempotency_key');
    const requestHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    // Stable operation key serialization; scope checks have already been locked and revalidated.
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',
      [JSON.stringify([grant.id, grant.client_id, operation, target, key.toLowerCase()])]);
    const previous = await db.query<{ request_hash: string; response: Record<string, unknown> }>(
      `select request_hash,response from ap.public_write_operations where selection_id=$1 and client_id=$2
       and operation=$3 and target_id=$4 and idempotency_key=$5`, [grant.id, grant.client_id, operation, target, key]);
    const existing = previous.rows[0];
    if (existing) return existing.request_hash === requestHash ? { body: existing.response }
      : failure(409, 'idempotency_key_reused');
    const operationId = randomUUID();
    const result = await perform(operationId);
    if (!result || (result.status ?? 200) >= 400 || reply.sent) return result;
    result.body.operation_id = operationId;
    await db.query(`insert into ap.public_write_operations(id,selection_id,client_id,organization_id,
      operation,target_id,idempotency_key,request_hash,response) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [operationId, grant.id, grant.client_id, grant.organization_id, operation, target, key, requestHash, JSON.stringify(result.body)]);
    return result;
  }
  async function event(db: PoolClient, grant: Grant, kind: string, aggregateId: string, operationId: string) {
    await db.query(`insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload)
      values($1,$2,$3,$4,$5)`, [randomUUID(), grant.organization_id, kind, aggregateId,
      JSON.stringify({ operationId, clientId: grant.client_id, grantId: grant.id, actorUserId: grant.actor_user_id })]);
  }

  app.post('/integrations/v1/connections', { config }, async (request, reply) => run(request, reply, 'ap.connections.create', async (db, grant) => {
    const body = object(request.body);
    if (!exactKeys(body, ['organizationId', 'agentId', 'externalOrganizationId', 'origin'])
      || !uuid.test(String(body!.organizationId)) || !uuid.test(String(body!.agentId))
      || !uuid.test(String(body!.externalOrganizationId)) || !originHost(body!.origin)) return failure(400, 'invalid_connection');
    if (body!.organizationId !== grant.organization_id || body!.agentId !== grant.agent_id)
      return failure(404, 'resource_not_found');
    const content = { organizationId: body!.organizationId, agentId: body!.agentId,
      externalOrganizationId: body!.externalOrganizationId, origin: body!.origin };
    return write(request, reply, db, grant, 'connection.create', 'new', content, async operationId => {
      if (await rejectExpiredTrial(reply, db, grant.organization_id)) return null;
      const id = randomUUID();
      const created = await db.query<Connection>(`insert into ap.public_installation_connections(id,selection_id,client_id,
        organization_id,agent_id,actor_user_id,external_organization_id,origin)
        values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [id, grant.id, grant.client_id, grant.organization_id, grant.agent_id, grant.actor_user_id,
        body!.externalOrganizationId, body!.origin]);
      await event(db, grant, 'integration.connection.created', id, operationId);
      return { status: 201, body: connectionView(created.rows[0]!) };
    });
  }));

  app.get<{ Params: { id: string } }>('/integrations/v1/connections/:id', { config }, async (request, reply) =>
    run(request, reply, 'ap.connections.create', async (db, grant) => {
      if (!uuid.test(request.params.id)) return failure(404, 'resource_not_found');
      const c = await ownedConnection(db, grant, request.params.id);
      return c ? { body: { ...connectionView(c), operation_id: c.id } } : failure(404, 'resource_not_found');
    }));

  app.post('/integrations/v1/deployments', { config }, async (request, reply) => run(request, reply, 'ap.deployments.manage', async (db, grant) => {
    const body = object(request.body);
    if (!exactKeys(body, ['connectionId', 'organizationId', 'agentId', 'kind', 'origin'])
      || !uuid.test(String(body!.connectionId)) || !uuid.test(String(body!.organizationId))
      || !uuid.test(String(body!.agentId)) || body!.kind !== 'owned_embed' || !originHost(body!.origin))
      return failure(400, 'invalid_deployment');
    if (body!.organizationId !== grant.organization_id || body!.agentId !== grant.agent_id) return failure(404, 'resource_not_found');
    const c = await ownedConnection(db, grant, body!.connectionId as string);
    if (!c || c.origin !== body!.origin) return failure(404, 'resource_not_found');
    const content = { connectionId: c.id, organizationId: grant.organization_id, agentId: grant.agent_id,
      kind: 'owned_embed', origin: c.origin };
    return write(request, reply, db, grant, 'deployment.create', c.id, content, async operationId => {
      if (await rejectExpiredTrial(reply, db, grant.organization_id)) return null;
      const id = randomUUID();
      await db.query(`insert into ap.deployments(id,organization_id,public_id,kind,allowed_origin,verification_proof,created_by)
        values($1,$2,$3,'owned_embed',$4,$5,$6)`, [id, grant.organization_id,
        `dep_${randomBytes(24).toString('base64url')}`, c.origin, randomBytes(24).toString('base64url'), grant.actor_user_id]);
      await db.query(`insert into ap.public_installation_deployments(deployment_id,connection_id,selection_id,client_id)
        values($1,$2,$3,$4)`, [id, c.id, grant.id, grant.client_id]);
      const d = await ownedDeployment(db, grant, id);
      await event(db, grant, 'integration.deployment.prepared', id, operationId);
      return { status: 201, body: deploymentView(d!) };
    });
  }));

  app.get<{ Params: { id: string } }>('/integrations/v1/deployments/:id', { config }, async (request, reply) =>
    run(request, reply, 'ap.deployments.manage', async (db, grant) => {
      if (!uuid.test(request.params.id)) return failure(404, 'resource_not_found');
      const d = await ownedDeployment(db, grant, request.params.id);
      return d ? { body: { ...deploymentView(d), operation_id: d.id } } : failure(404, 'resource_not_found');
    }));

  for (const action of ['verify', 'activate', 'pause'] as const) {
    app.post<{ Params: { id: string } }>(`/integrations/v1/deployments/:id/${action}`, { config }, async (request, reply) =>
      run(request, reply, 'ap.deployments.manage', async (db, grant) => {
        if (!uuid.test(request.params.id)) return failure(404, 'resource_not_found');
        if (request.body !== undefined && (!object(request.body) || Object.keys(request.body as object).length))
          return failure(400, 'invalid_deployment_operation');
        const d = await ownedDeployment(db, grant, request.params.id);
        if (!d) return failure(404, 'resource_not_found');
        const match = request.headers['if-match'];
        if (match === undefined) return failure(428, 'revision_required');
        const revision = typeof match === 'string' && /^"([1-9][0-9]*)"$/.exec(match)?.[1];
        if (!revision || !Number.isSafeInteger(Number(revision))) return failure(400, 'invalid_revision');
        return write(request, reply, db, grant, `deployment.${action}`, d.id, { revision: Number(revision) }, async operationId => {
          if (d.public_write_revision !== Number(revision)) return failure(409, 'revision_conflict');
          if (action !== 'pause' && d.moderation_restricted) return failure(409, 'deployment_moderation_restricted');
          if (action === 'verify') {
            const host = originHost(d.allowed_origin);
            if (!host) return failure(409, 'invalid_origin_configuration');
            const verified = await (runtime.verifyDomain ?? defaultVerifyDomain)(host, d.verification_proof, d.allowed_origin);
            if (!verified) return failure(409, 'domain_not_verified');
            await db.query('update ap.deployments set verified_at=now(),updated_at=now() where id=$1', [d.id]);
          } else if (action === 'activate') {
            if (await rejectExpiredTrial(reply, db, grant.organization_id)) return null;
            if (!d.verified_at) return failure(409, 'domain_not_verified');
            const approved = await db.query<{ id: string; knowledge_revision: number }>(`select id,knowledge_revision
              from ap.agent_releases where organization_id=$1 and agent_id=$2
                and knowledge_release_id=(select id from ap.knowledge_releases where organization_id=$1 order by revision desc limit 1)
              order by revision desc limit 1 for share`, [grant.organization_id, grant.agent_id]);
            if (!approved.rows[0]) return failure(409, 'knowledge_stale');
            await db.query(`update ap.deployments set status='active',agent_release_id=$2,knowledge_revision=$3,updated_at=now()
              where id=$1`, [d.id, approved.rows[0].id, approved.rows[0].knowledge_revision]);
          } else await db.query("update ap.deployments set status='paused',updated_at=now() where id=$1", [d.id]);
          const current = await ownedDeployment(db, grant, d.id);
          await event(db, grant, `integration.deployment.${action === 'verify' ? 'verified' : action === 'activate' ? 'activated' : 'paused'}`,
            d.id, operationId);
          return { body: deploymentView(current!) };
        });
      }));
  }
}
