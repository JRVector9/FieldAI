import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { integratorGrant } from './integrator-auth.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
type Job = { id: string; connection_id: string; expected_source_revision: number;
  state: string; source_revision: number | null; outcome: string | null; last_error: string | null };

function publicJob(job: Job) {
  const state = job.state === 'sending' ? 'pending' : job.state;
  return { operationId: job.id, connectionId: job.connection_id,
    expectedSourceRevision: job.expected_source_revision, state,
    retryable: state === 'pending' || state === 'retry',
    sourceRevision: job.source_revision, outcome: job.outcome, error: job.last_error };
}

export function registerSourceRefreshRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get<{ Params: { id: string } }>('/integrations/v1/connections/:id/source',
    async (request, reply) => {
      const grant = await integratorGrant(request, reply, runtime, 'ap.sources.refresh');
      if (!grant) return reply;
      if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'connection_not_found' });
      const found = await runtime.pool.query<{ source_revision: number | null;
        approved_source_revision: number | null; state: string | null; synced_at: Date | null }>(
        `select s.source_revision,s.approved_source_revision,s.state,snap.fetched_at as synced_at
           from ap.field_connections c left join ap.knowledge_sources s on s.connection_id = c.id
           left join ap.knowledge_source_snapshots snap on snap.source_id=s.id
             and snap.source_revision=s.source_revision
          where c.id = $1 and c.ap_grant_id = $2 and c.ap_organization_id = $3
            and c.ap_agent_id = $4 and c.initiator_user_id = $5 and c.status = 'review_required'`,
        [request.params.id, grant.id, grant.organization_id, grant.agent_id, grant.actor_user_id]);
      if (!found.rows[0]) return reply.code(404).send({ error: 'connection_not_found' });
      const source = found.rows[0];
      return reply.header('Cache-Control', 'private, no-store').send({
        connectionId: request.params.id, sourceRevision: source.source_revision ?? 0,
        approvedSourceRevision: source.approved_source_revision,
        state: source.state ?? 'not_synced',
        syncedAt: source.synced_at?.toISOString() ?? null,
      });
    });

  app.post<{ Params: { id: string } }>('/integrations/v1/connections/:id/source-refreshes',
    async (request, reply) => {
      const grant = await integratorGrant(request, reply, runtime, 'ap.sources.refresh');
      if (!grant) return reply;
      if (!uuid.test(request.params.id)) return reply.code(404).send({ error: 'connection_not_found' });
      const body = request.body !== null && typeof request.body === 'object'
        && !Array.isArray(request.body) ? request.body as Record<string, unknown> : null;
      const expected = body?.expectedSourceRevision;
      const key = request.headers['idempotency-key'];
      if (!body || Object.keys(body).length !== 1 || typeof expected !== 'number'
        || !Number.isSafeInteger(expected) || expected < 0
        || typeof key !== 'string' || !keyPattern.test(key))
        return reply.code(400).send({ error: 'invalid_source_refresh_request' });
      const digest = createHash('sha256').update(key).digest('hex');
      const db = await runtime.pool.connect();
      try {
        await db.query('begin');
        const connection = await db.query<{ id: string }>(
          `select id from ap.field_connections where id = $1 and ap_grant_id = $2
             and ap_organization_id = $3 and ap_agent_id = $4
             and initiator_user_id = $5 and status = 'review_required'
           for update`,
          [request.params.id, grant.id, grant.organization_id, grant.agent_id, grant.actor_user_id]);
        if (!connection.rowCount) {
          await db.query('rollback'); return reply.code(404).send({ error: 'connection_not_found' });
        }
        const previous = await db.query<Job>(
          `select id,connection_id,expected_source_revision,state,source_revision,outcome,last_error
             from ap.source_refresh_jobs where connection_id = $1 and idempotency_key_hash = $2`,
          [request.params.id, digest]);
        if (previous.rows[0]) {
          await db.query('commit');
          if (previous.rows[0].expected_source_revision !== expected)
            return reply.code(409).send({ error: 'idempotency_conflict' });
          return reply.header('Cache-Control', 'private, no-store').code(202).send(publicJob(previous.rows[0]));
        }
        const source = await db.query<{ source_revision: number }>(
          'select source_revision from ap.knowledge_sources where connection_id = $1',
          [request.params.id]);
        const current = source.rows[0]?.source_revision ?? 0;
        if (current !== expected) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_version_changed', currentRevision: current });
        }
        const id = randomUUID();
        await db.query(`insert into ap.source_refresh_jobs
          (id,connection_id,ap_grant_id,organization_id,expected_source_revision,idempotency_key_hash)
          values ($1,$2,$3,$4,$5,$6)`,
        [id, request.params.id, grant.id, grant.organization_id, expected, digest]);
        await db.query(`insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload)
          values ($1,$2,'knowledge.source.refresh_requested',$3,$4::jsonb)`,
        [randomUUID(), grant.organization_id, id,
          JSON.stringify({ operationId: id, connectionId: request.params.id, expectedSourceRevision: expected })]);
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').code(202).send(publicJob({
          id, connection_id: request.params.id, expected_source_revision: expected,
          state: 'pending', source_revision: null, outcome: null, last_error: null,
        }));
      } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
    });

  app.get<{ Params: { id: string; operationId: string } }>(
    '/integrations/v1/connections/:id/source-refreshes/:operationId', async (request, reply) => {
      const grant = await integratorGrant(request, reply, runtime, 'ap.sources.refresh');
      if (!grant) return reply;
      if (!uuid.test(request.params.id) || !uuid.test(request.params.operationId))
        return reply.code(404).send({ error: 'source_refresh_not_found' });
      const found = await runtime.pool.query<Job>(
        `select j.id,j.connection_id,j.expected_source_revision,j.state,j.source_revision,
           j.outcome,j.last_error from ap.source_refresh_jobs j
         join ap.field_connections c on c.id = j.connection_id
         where j.id = $1 and j.connection_id = $2 and j.ap_grant_id = $3
           and c.ap_grant_id = $3 and c.ap_organization_id = $4 and c.ap_agent_id = $5
           and c.initiator_user_id = $6 and c.status = 'review_required'`,
        [request.params.operationId, request.params.id, grant.id, grant.organization_id,
          grant.agent_id, grant.actor_user_id]);
      if (!found.rows[0]) return reply.code(404).send({ error: 'source_refresh_not_found' });
      return reply.header('Cache-Control', 'private, no-store').send(publicJob(found.rows[0]));
    });
}
