import { randomBytes, randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Permission = 'read' | 'edit' | 'approve';
type DomainRow = { id: string; publisher_id: string; origin: string; verification_proof: string;
  verified_at: string | null; verified_until: string | null; created_at: string };
type SlotRow = { id: string; publisher_id: string; domain_id: string; name: string;
  format: 'article' | 'sidebar'; state: 'active' | 'paused'; created_at: string;
  origin?: string; verified_until?: string | null };
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;
const shortName = (value: unknown) => typeof value === 'string' && value.trim() && value.length <= 160 ? value.trim() : null;
const proof = () => randomBytes(24).toString('base64url');

function originHost(value: unknown) {
  if (typeof value !== 'string' || value.length > 253) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || parsed.origin !== value || parsed.port || parsed.username || parsed.password
      || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || isIP(host)
      || host.endsWith('.') || host.startsWith('.') || host.includes('..')
      || host === 'localhost' || host.endsWith('.localhost')) return null;
    return host;
  } catch { return null; }
}

async function verifyDns(host: string, value: string) {
  try {
    const records = await Promise.race([
      resolveTxt(`_ap-publisher.${host}`),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('dns_timeout')), 5000)),
    ]);
    return records.some(chunks => chunks.join('') === `ap-publisher-verification=${value}`);
  } catch { return false; }
}

async function userId(request: FastifyRequest, reply: FastifyReply, runtime: BusinessRuntime) {
  const id = await runtime.resolveUserId(request.headers);
  if (!id) reply.code(401).send({ error: 'authentication_required' });
  return id;
}

async function publisher(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply,
  runtime: BusinessRuntime, permission: Permission) {
  const user = await userId(request, reply, runtime);
  if (!user) return null;
  if (!uuid.test(request.params.id)) { reply.code(404).send({ error: 'publisher_not_found' }); return null; }
  const member = await runtime.pool.query<{ role: string }>(
    `select role from ap.publisher_memberships where publisher_id = $1 and user_id = $2
      and ($3::text = 'read' or ($3::text = 'edit' and role in ('owner', 'editor')) or role = 'owner')`,
    [request.params.id, user, permission],
  );
  if (!member.rows[0]) { reply.code(404).send({ error: 'publisher_not_found' }); return null; }
  return { id: request.params.id, user, role: member.rows[0].role };
}

async function outbox(client: PoolClient, publisherId: string, eventType: string, aggregateId: string) {
  await client.query(
    'insert into ap.publisher_outbox(id, publisher_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
    [randomUUID(), publisherId, eventType, aggregateId, JSON.stringify({ publisherId, resourceId: aggregateId })],
  );
}

function domainOutput(row: DomainRow) {
  return { id: row.id, origin: row.origin, verificationProof: row.verification_proof,
    verifiedAt: row.verified_at, verifiedUntil: row.verified_until, createdAt: row.created_at };
}
function slotOutput(row: SlotRow) {
  const available = row.state === 'active' && !!row.verified_until && new Date(row.verified_until).getTime() > Date.now();
  return { id: row.id, domainId: row.domain_id, name: row.name, format: row.format, state: row.state,
    domainOrigin: row.origin, domainVerifiedUntil: row.verified_until, available, createdAt: row.created_at };
}

export function registerPublisherRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.get('/v1/publishers', async (request, reply) => {
    const user = await userId(request, reply, runtime);
    if (!user) return reply;
    const result = await runtime.pool.query<{ id: string; name: string; role: string; created_at: string }>(
      `select p.id, p.name, m.role, p.created_at from ap.publisher_memberships m
       join ap.publishers p on p.id = m.publisher_id where m.user_id = $1 order by p.created_at desc`, [user],
    );
    return { publishers: result.rows.map(row => ({ id: row.id, name: row.name, role: row.role, createdAt: row.created_at })) };
  });

  app.post('/v1/publishers', async (request, reply) => {
    const user = await userId(request, reply, runtime);
    if (!user) return reply;
    const body = object(request.body);
    const name = shortName(body?.name);
    if (!name) return reply.code(400).send({ error: 'invalid_publisher_name' });
    const key = body?.idempotencyKey;
    if (key !== undefined && (typeof key !== 'string' || !uuid.test(key)))
      return reply.code(400).send({ error: 'invalid_idempotency_key' });
    const creationKey = key as string | undefined;
    const existingForKey = async () => {
      if (!creationKey) return null;
      const found = await runtime.pool.query<{ id: string; name: string }>(
        'select id, name from ap.publishers where owner_user_id = $1 and creation_key = $2',
        [user, creationKey],
      );
      return found.rows[0] ?? null;
    };
    const replay = (existing: { id: string; name: string }) => existing.name === name
      ? reply.code(200).send({ id: existing.id, name, role: 'owner' })
      : reply.code(409).send({ error: 'idempotency_key_reused' });
    const previous = await existingForKey();
    if (previous) return replay(previous);
    const id = randomUUID();
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const created = await client.query<{ id: string }>(
        `insert into ap.publishers(id, owner_user_id, name, creation_key) values ($1, $2, $3, $4)
         on conflict on constraint publishers_creation_unique do nothing returning id`,
        [id, user, name, creationKey ?? null],
      );
      if (!created.rows[0]) {
        await client.query('rollback');
        const concurrent = await existingForKey();
        if (!concurrent) throw new Error('publisher_creation_conflict_without_row');
        return replay(concurrent);
      }
      await client.query("insert into ap.publisher_memberships(publisher_id, user_id, role) values ($1, $2, 'owner')", [id, user]);
      await outbox(client, id, 'publisher.created', id);
      await client.query('commit');
      return reply.code(201).send({ id, name, role: 'owner' });
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/publishers/:id/domains', async (request, reply) => {
    const actor = await publisher(request, reply, runtime, 'read');
    if (!actor) return reply;
    const result = await runtime.pool.query<DomainRow>(
      'select * from ap.publisher_domains where publisher_id = $1 order by created_at desc', [actor.id],
    );
    return { domains: result.rows.map(domainOutput) };
  });

  app.post<{ Params: { id: string } }>('/v1/publishers/:id/domains', async (request, reply) => {
    const actor = await publisher(request, reply, runtime, 'approve');
    if (!actor) return reply;
    const input = object(request.body)?.origin;
    const host = originHost(input);
    if (!host) return reply.code(400).send({ error: 'invalid_origin' });
    const id = randomUUID();
    const value = proof();
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      // 검증 기간(verified_until) 안의 origin은 계속 점유하고, 다른 매체의 미검증 등록은 24시간 뒤 만료되어 실제 소유자가 등록할 수 있다.
      // 검증 기간이 지난 다른 매체의 행은 더 이상 막지 않는다(추가, P2-2. 새 소유자가 검증하면 그 행의 검증 표시를 해제한다).
      await client.query("select pg_advisory_xact_lock(hashtextextended('ap-publisher-origin:' || $1, 0))", [input]);
      const claimed = await client.query(
        `select 1 from ap.publisher_domains where origin = $1 and publisher_id <> $2
           and ((verified_at is not null and verified_until > now())
             or (verified_at is null and created_at > now() - interval '24 hours')) limit 1`, [input, actor.id]);
      if (claimed.rowCount) { await client.query('rollback'); return reply.code(409).send({ error: 'origin_already_registered' }); }
      const result = await client.query<DomainRow>(
        `insert into ap.publisher_domains(id, publisher_id, origin, verification_proof)
         values ($1, $2, $3, $4) returning *`, [id, actor.id, input, value],
      );
      await outbox(client, actor.id, 'publisher.domain_registered', id);
      await client.query('commit');
      return reply.code(201).send(domainOutput(result.rows[0]!));
    } catch (error) {
      await client.query('rollback');
      if ((error as { code?: string }).code === '23505') return reply.code(409).send({ error: 'origin_already_registered' });
      throw error;
    } finally { client.release(); }
  });

  app.post<{ Params: { id: string; domainId: string } }>('/v1/publishers/:id/domains/:domainId/verify', async (request, reply) => {
    const actor = await publisher(request, reply, runtime, 'approve');
    if (!actor) return reply;
    if (!uuid.test(request.params.domainId)) return reply.code(404).send({ error: 'domain_not_found' });
    const result = await runtime.pool.query<DomainRow>(
      'select * from ap.publisher_domains where id = $1 and publisher_id = $2', [request.params.domainId, actor.id],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: 'domain_not_found' });
    const host = originHost(row.origin);
    if (!host || !await (runtime.verifyDomain ?? verifyDns)(host, row.verification_proof))
      return reply.code(409).send({ error: 'domain_not_verified' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      // 같은 origin 등록과 직렬화하고, 다른 매체의 검증 기간이 지난 점유(verified_at만 남은 행)를 해제한 뒤 검증 표시를 옮긴다(추가)
      await client.query("select pg_advisory_xact_lock(hashtextextended('ap-publisher-origin:' || $1, 0))", [row.origin]);
      await client.query(`update ap.publisher_domains set verified_at = null, verified_until = null
        where origin = $1 and publisher_id <> $2 and verified_at is not null and verified_until <= now()`, [row.origin, actor.id]);
      const updated = await client.query<DomainRow>(
        `update ap.publisher_domains set verified_at = now(), verified_until = now() + interval '7 days'
         where id = $1 and publisher_id = $2 returning *`, [row.id, actor.id],
      );
      if (!updated.rows[0]) { await client.query('rollback'); return reply.code(404).send({ error: 'domain_not_found' }); }
      await outbox(client, actor.id, 'publisher.domain_verified', row.id);
      await client.query('commit');
      return domainOutput(updated.rows[0]);
    } catch (error) {
      await client.query('rollback');
      // 같은 origin을 다른 매체가 먼저 검증했으면 검증된 점유를 넘기지 않는다
      if ((error as { code?: string }).code === '23505') return reply.code(409).send({ error: 'origin_already_registered' });
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/publishers/:id/slots', async (request, reply) => {
    const actor = await publisher(request, reply, runtime, 'read');
    if (!actor) return reply;
    const result = await runtime.pool.query<SlotRow>(
      `select s.*, d.origin, d.verified_until from ap.publisher_slots s
       join ap.publisher_domains d on d.id = s.domain_id
       where s.publisher_id = $1 order by s.created_at desc`, [actor.id],
    );
    return { slots: result.rows.map(slotOutput) };
  });

  app.post<{ Params: { id: string } }>('/v1/publishers/:id/slots', async (request, reply) => {
    const actor = await publisher(request, reply, runtime, 'edit');
    if (!actor) return reply;
    const body = object(request.body);
    const domainId = body?.domainId;
    const name = shortName(body?.name);
    const format = body?.format;
    if (typeof domainId !== 'string' || !uuid.test(domainId) || !name || (format !== 'article' && format !== 'sidebar'))
      return reply.code(400).send({ error: 'invalid_slot' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const domain = await client.query<DomainRow>('select * from ap.publisher_domains where id = $1 and publisher_id = $2',
        [domainId, actor.id]);
      if (!domain.rows[0]) { await client.query('rollback'); return reply.code(404).send({ error: 'domain_not_found' }); }
      const id = randomUUID();
      const created = await client.query<SlotRow>(
        `insert into ap.publisher_slots(id, publisher_id, domain_id, name, format, created_by)
         values ($1, $2, $3, $4, $5, $6) returning *`, [id, actor.id, domainId, name, format, actor.user],
      );
      await outbox(client, actor.id, 'publisher.slot_registered', id);
      await client.query('commit');
      return reply.code(201).send(slotOutput({ ...created.rows[0]!, origin: domain.rows[0].origin,
        verified_until: domain.rows[0].verified_until }));
    } catch (error) {
      await client.query('rollback');
      if ((error as { code?: string }).code === '23505') return reply.code(409).send({ error: 'slot_already_registered' });
      throw error;
    } finally { client.release(); }
  });

  for (const action of ['activate', 'pause'] as const) {
    app.post<{ Params: { id: string; slotId: string } }>(`/v1/publishers/:id/slots/:slotId/${action}`, async (request, reply) => {
      const actor = await publisher(request, reply, runtime, 'approve');
      if (!actor) return reply;
      if (!uuid.test(request.params.slotId)) return reply.code(404).send({ error: 'slot_not_found' });
      const client = await runtime.pool.connect();
      try {
        await client.query('begin');
        const found = await client.query<SlotRow>(
          `select s.*, d.origin, d.verified_until from ap.publisher_slots s
           join ap.publisher_domains d on d.id = s.domain_id
           where s.id = $1 and s.publisher_id = $2 for update of s`, [request.params.slotId, actor.id],
        );
        const row = found.rows[0];
        if (!row) { await client.query('rollback'); return reply.code(404).send({ error: 'slot_not_found' }); }
        if (action === 'activate' && (!row.verified_until || new Date(row.verified_until).getTime() <= Date.now())) {
          await client.query('rollback'); return reply.code(409).send({ error: 'domain_verification_required' });
        }
        const state = action === 'activate' ? 'active' : 'paused';
        if (row.state !== state) {
          await client.query('update ap.publisher_slots set state = $2, updated_at = now() where id = $1', [row.id, state]);
          await outbox(client, actor.id, `publisher.slot_${state}`, row.id);
        }
        await client.query('commit');
        return slotOutput({ ...row, state });
      } catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    });
  }
}
