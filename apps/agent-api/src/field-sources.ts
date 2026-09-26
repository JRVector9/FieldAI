import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { inspectFieldFacts, type InspectedFieldFacts } from './field-connector.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Source = { id: string; organization_id: string; external_org_id: string;
  source_revision: number; content_hash: string; state: string };
type Snapshot = { source_revision: number; content_hash: string; content: Record<string, unknown> };
type ServiceMapping = { fieldServiceId: string; priority: 'separate' | 'native' | 'field';
  nativeServiceIndex?: number };

async function event(db: PoolClient, organizationId: string, sourceId: string,
  eventType: string, revision: number) {
  await db.query(`insert into ap.outbox(id, organization_id, event_type, aggregate_id, payload)
    values ($1,$2,$3,$4,$5::jsonb)`, [randomUUID(), organizationId, eventType,
    sourceId, JSON.stringify({ sourceId, sourceRevision: revision })]);
}

async function snapshot(db: PoolClient, sourceId: string, facts: Record<string, unknown>) {
  await db.query(`insert into ap.knowledge_source_snapshots
    (id,source_id,source_revision,release_id,content_hash,entity_versions,content,published_at)
    values ($1,$2,$3,$4,$5,'{}'::jsonb,$6::jsonb,$7::timestamptz)`,
  [randomUUID(), sourceId, facts.revision, facts.releaseId, facts.contentHash,
    JSON.stringify(facts), facts.publishedAt]);
}

export async function storeFacts(runtime: BusinessRuntime, connectionId: string, inspected: InspectedFieldFacts) {
  const facts = inspected.facts;
  const revision = facts.revision as number;
  const contentHash = (facts.contentHash as string).toLowerCase();
  const db = await runtime.pool.connect();
  try {
    await db.query('begin');
    const connection = await db.query<{ id: string }>(
      `select c.id from ap.field_connections c
       join ap.oauth_selections s on s.id = c.ap_grant_id
       where c.id = $1 and c.ap_organization_id = $2 and c.field_organization_id = $3
         and c.field_grant_id = $4 and c.status = 'review_required'
         and s.revoked_at is null for update of c`,
      [connectionId, inspected.apOrganizationId, inspected.fieldOrganizationId,
        inspected.fieldGrantId]);
    if (!connection.rowCount) {
      await db.query('rollback');
      return { statusCode: 409, body: { error: 'source_connection_unavailable' } };
    }
    const sourceId = randomUUID();
    const created = await db.query<{ id: string }>(`insert into ap.knowledge_sources
      (id,organization_id,provider,connection_id,external_org_id,source_revision,
       content_hash,published_at,state)
      values ($1,$2,'field',$3,$4,$5,$6,$7::timestamptz,'pending_review')
      on conflict (connection_id) do nothing returning id`,
    [sourceId, inspected.apOrganizationId, connectionId, inspected.fieldOrganizationId,
      revision, contentHash, facts.publishedAt]);
    if (created.rowCount) {
      await snapshot(db, sourceId, facts);
      await event(db, inspected.apOrganizationId, sourceId, 'knowledge.source.pending_review', revision);
      await db.query('commit');
      return { statusCode: 201, body: { sourceId, sourceRevision: revision,
        contentHash, state: 'pending_review', outcome: 'created', facts } };
    }
    const found = await db.query<Source>(
      'select * from ap.knowledge_sources where connection_id = $1 for update', [connectionId]);
    const source = found.rows[0];
    if (!source || source.organization_id !== inspected.apOrganizationId
      || source.external_org_id !== inspected.fieldOrganizationId) {
      await db.query('rollback');
      return { statusCode: 409, body: { error: 'source_mapping_conflict' } };
    }
    const sameRevision = await db.query<Snapshot>(
      `select source_revision, content_hash, content from ap.knowledge_source_snapshots
       where source_id = $1 and source_revision = $2`, [source.id, revision]);
    const prior = sameRevision.rows[0];
    if (prior && prior.content_hash !== contentHash) {
      const conflict = await db.query(`insert into ap.knowledge_source_integrity_conflicts
        (id,source_id,source_revision,expected_hash,observed_hash,observed_content)
        values ($1,$2,$3,$4,$5,$6::jsonb)
        on conflict (source_id,source_revision,observed_hash) do nothing returning id`,
      [randomUUID(), source.id, revision, prior.content_hash, contentHash, JSON.stringify(facts)]);
      await db.query(`update ap.knowledge_sources set state = 'integrity_conflict',
        updated_at = now() where id = $1`, [source.id]);
      if (conflict.rowCount) await event(db, source.organization_id, source.id,
        'knowledge.source.integrity_conflict', revision);
      await db.query('commit');
      return { statusCode: 409, body: { error: 'integrity_conflict', sourceId: source.id,
        sourceRevision: revision, expectedHash: prior.content_hash, observedHash: contentHash } };
    }
    if (revision < source.source_revision) {
      await db.query('commit');
      return { statusCode: 200, body: { sourceId: source.id,
        sourceRevision: source.source_revision, contentHash: source.content_hash,
        state: source.state, outcome: 'ignored_older' } };
    }
    if (revision === source.source_revision) {
      await db.query('update ap.knowledge_sources set fetched_at = now() where id = $1', [source.id]);
      await db.query('commit');
      return { statusCode: 200, body: { sourceId: source.id, sourceRevision: revision,
        contentHash, state: source.state, outcome: 'unchanged', facts: prior?.content ?? facts } };
    }
    await snapshot(db, source.id, facts);
    await db.query(`update ap.knowledge_sources set source_revision = $2,
      content_hash = $3, published_at = $4::timestamptz, fetched_at = now(),
      state = 'pending_review', updated_at = now() where id = $1`,
    [source.id, revision, contentHash, facts.publishedAt]);
    await event(db, source.organization_id, source.id, 'knowledge.source.pending_review', revision);
    await db.query('commit');
    return { statusCode: 201, body: { sourceId: source.id,
      sourceRevision: revision, contentHash, state: 'pending_review', outcome: 'updated', facts } };
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally { db.release(); }
}

export function registerFieldSourceRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.post<{ Params: { id: string } }>('/v1/connections/field/:id/sync', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const inspected = await inspectFieldFacts(runtime, userId, request.params.id);
    if (!inspected.ok) return reply.code(inspected.statusCode).send({ error: inspected.error,
      ...(inspected.status ? { status: inspected.status } : {}) });
    const result = await storeFacts(runtime, request.params.id, inspected);
    return reply.header('Cache-Control', 'private, no-store')
      .code(result.statusCode).send(result.body);
  });

  app.get<{ Params: { id: string } }>('/v1/connections/field/:id/source', async (request, reply) => {
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    if (!uuid.test(request.params.id)) return reply.code(400).send({ error: 'invalid_connection_id' });
    const found = await runtime.pool.query<Source & { approved_source_revision: number | null;
      approved_by: string | null; approved_at: Date | null;
      ap_knowledge_release_id: string | null;
      fetched_at: Date; published_at: Date; content: Record<string, unknown> }>(
      `select s.*, snap.content from ap.knowledge_sources s
       join ap.knowledge_source_snapshots snap on snap.source_id = s.id
         and snap.source_revision = s.source_revision
       join ap.memberships m on m.organization_id = s.organization_id
       where s.connection_id = $1 and m.user_id = $2 and m.role = 'owner'`,
      [request.params.id, userId]);
    const source = found.rows[0];
    if (!source) return reply.code(404).send({ error: 'source_not_found' });
    return reply.header('Cache-Control', 'private, no-store').send({
      sourceId: source.id, connectionId: request.params.id, state: source.state,
      sourceRevision: source.source_revision, contentHash: source.content_hash,
      approvedSourceRevision: source.approved_source_revision,
      approvedBy: source.approved_by, approvedAt: source.approved_at,
      knowledgeReleaseId: source.ap_knowledge_release_id,
      fetchedAt: source.fetched_at, publishedAt: source.published_at, facts: source.content,
    });
  });

  app.post<{ Params: { id: string } }>('/v1/connections/field/:id/source/approve',
    async (request, reply) => {
      const userId = await runtime.resolveUserId(request.headers);
      if (!userId) return reply.code(401).send({ error: 'authentication_required' });
      if (!uuid.test(request.params.id)) return reply.code(400).send({ error: 'invalid_connection_id' });
      const body = request.body !== null && typeof request.body === 'object'
        && !Array.isArray(request.body) ? request.body as Record<string, unknown> : null;
      const expectedRevision = body?.expectedSourceRevision;
      const expectedHash = body?.expectedContentHash;
      if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 1 || typeof expectedHash !== 'string'
        || !/^[a-f0-9]{64}$/.test(expectedHash)) {
        return reply.code(400).send({ error: 'invalid_source_approval' });
      }
      const owned = await runtime.pool.query(
        `select 1 from ap.knowledge_sources s
         join ap.memberships m on m.organization_id = s.organization_id
         where s.connection_id = $1 and m.user_id = $2 and m.role = 'owner'`,
        [request.params.id, userId]);
      if (!owned.rowCount) return reply.code(404).send({ error: 'source_not_found' });
      const inspected = await inspectFieldFacts(runtime, userId, request.params.id);
      if (!inspected.ok) return reply.code(inspected.statusCode).send({ error: inspected.error });
      if (inspected.facts.revision !== expectedRevision
        || inspected.facts.contentHash !== expectedHash) {
        return reply.code(409).send({ error: 'source_version_changed' });
      }
      const db = await runtime.pool.connect();
      try {
        await db.query('begin');
        const found = await db.query<Source & { approved_source_revision: number | null }>(
          `select s.* from ap.knowledge_sources s
           join ap.memberships m on m.organization_id = s.organization_id
           join ap.field_connections c on c.id = s.connection_id
           where s.connection_id = $1 and m.user_id = $2 and m.role = 'owner'
             and c.status = 'review_required' for update of s`,
          [request.params.id, userId]);
        const source = found.rows[0];
        if (!source) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_permission_changed' });
        }
        if (source.organization_id !== inspected.apOrganizationId
          || source.external_org_id !== inspected.fieldOrganizationId) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_mapping_conflict' });
        }
        if (source.state === 'integrity_conflict') {
          await db.query('rollback');
          return reply.code(409).send({ error: 'integrity_conflict' });
        }
        if (source.source_revision !== expectedRevision || source.content_hash !== expectedHash) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_version_changed' });
        }
        if (source.state === 'current' && source.approved_source_revision === expectedRevision) {
          await db.query('commit');
          return reply.header('Cache-Control', 'private, no-store').code(200).send({
            sourceId: source.id, state: 'current', approvedSourceRevision: expectedRevision,
            outcome: 'unchanged', knowledgeReleaseReady: false,
          });
        }
        if (source.state !== 'pending_review') {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_not_reviewable' });
        }
        await db.query(`update ap.knowledge_sources set approved_source_revision = $2,
          approved_by = $3, approved_at = now(), fetched_at = now(),
          state = 'current', updated_at = now() where id = $1`,
          [source.id, expectedRevision, userId]);
        await event(db, source.organization_id, source.id,
          'knowledge.source.approved', expectedRevision);
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').code(201).send({
          sourceId: source.id, state: 'current', approvedSourceRevision: expectedRevision,
          outcome: 'approved', knowledgeReleaseReady: false,
        });
      } catch (error) {
        await db.query('rollback');
        throw error;
      } finally { db.release(); }
    });

  app.get<{ Params: { id: string } }>('/v1/connections/field/:id/source/mapping-options',
    async (request, reply) => {
      const userId = await runtime.resolveUserId(request.headers);
      if (!userId) return reply.code(401).send({ error: 'authentication_required' });
      if (!uuid.test(request.params.id)) return reply.code(400).send({ error: 'invalid_connection_id' });
      const source = await runtime.pool.query<{ id: string; organization_id: string;
        source_revision: number }>(
        `select s.id, s.organization_id, s.source_revision from ap.knowledge_sources s
         join ap.memberships m on m.organization_id = s.organization_id
         where s.connection_id = $1 and m.user_id = $2 and m.role = 'owner'`,
        [request.params.id, userId]);
      const ownedSource = source.rows[0];
      if (!ownedSource) return reply.code(404).send({ error: 'source_not_found' });
      const native = await runtime.pool.query<{ id: string; revision: number;
        draft_revision: number; content: { services: { name: string; description: string }[] } }>(
        `select id, revision, draft_revision, content from ap.knowledge_releases
         where organization_id = $1 and source_kind = 'native'
         order by revision desc limit 1`, [ownedSource.organization_id]);
      const base = native.rows[0];
      if (!base) return reply.code(409).send({ error: 'native_knowledge_release_required' });
      const latest = await runtime.pool.query<{ source_id: string | null;
        source_revision: number | null; draft_revision: number; source_selection: Record<string, unknown> | null }>(
        `select source_id, source_revision, draft_revision, source_selection
         from ap.knowledge_releases where organization_id = $1
         order by revision desc limit 1`, [ownedSource.organization_id]);
      const previous = latest.rows[0];
      const currentSelection = previous?.source_id === ownedSource.id
        && previous.source_revision === ownedSource.source_revision
        && previous.draft_revision === base.draft_revision
        && previous.source_selection?.nativeReleaseId === base.id
        ? previous.source_selection : null;
      return reply.header('Cache-Control', 'private, no-store').send({
        nativeReleaseId: base.id, nativeKnowledgeRevision: base.revision,
        services: base.content.services.map((service, index) => ({ index,
          name: service.name, description: service.description })), currentSelection,
      });
    });

  app.post<{ Params: { id: string } }>('/v1/connections/field/:id/source/publish',
    async (request, reply) => {
      const userId = await runtime.resolveUserId(request.headers);
      if (!userId) return reply.code(401).send({ error: 'authentication_required' });
      if (!uuid.test(request.params.id)) return reply.code(400).send({ error: 'invalid_connection_id' });
      const body = request.body !== null && typeof request.body === 'object'
        && !Array.isArray(request.body) ? request.body as Record<string, unknown> : null;
      const expectedRevision = body?.expectedSourceRevision;
      const expectedHash = body?.expectedContentHash;
      const includeBusiness = body?.includeBusinessIntroduction;
      const includeFaqs = body?.includeFaqs ?? false;
      const ids = body?.includedServiceIds;
      const expectedNativeReleaseId = body?.expectedNativeReleaseId;
      const rawMappings = body?.serviceMappings;
      if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 1 || typeof expectedHash !== 'string'
        || !/^[a-f0-9]{64}$/.test(expectedHash) || typeof includeBusiness !== 'boolean'
        || typeof includeFaqs !== 'boolean'
        || !Array.isArray(ids) || ids.length > 100
        || ids.some(id => typeof id !== 'string' || !uuid.test(id))
        || new Set(ids).size !== ids.length || (!includeBusiness && !includeFaqs && ids.length === 0)
        || (expectedNativeReleaseId !== undefined
          && (typeof expectedNativeReleaseId !== 'string' || !uuid.test(expectedNativeReleaseId)))
        || (rawMappings !== undefined && (!Array.isArray(rawMappings)
          || rawMappings.length > 100 || expectedNativeReleaseId === undefined))) {
        return reply.code(400).send({ error: 'invalid_source_selection' });
      }
      const mappings: ServiceMapping[] = [];
      for (const item of rawMappings ?? []) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return reply.code(400).send({ error: 'invalid_source_selection' });
        }
        const mapping = item as Record<string, unknown>;
        if (typeof mapping.fieldServiceId !== 'string' || !ids.includes(mapping.fieldServiceId)
          || !['separate', 'native', 'field'].includes(String(mapping.priority))
          || (mapping.priority !== 'separate' && !Number.isSafeInteger(mapping.nativeServiceIndex))
          || (mapping.priority === 'separate' && mapping.nativeServiceIndex !== undefined)
          || (mapping.nativeServiceIndex !== undefined
            && (!Number.isSafeInteger(mapping.nativeServiceIndex)
              || (mapping.nativeServiceIndex as number) < 0))) {
          return reply.code(400).send({ error: 'invalid_source_selection' });
        }
        mappings.push({ fieldServiceId: mapping.fieldServiceId,
          priority: mapping.priority as ServiceMapping['priority'],
          ...(mapping.nativeServiceIndex === undefined ? {}
            : { nativeServiceIndex: mapping.nativeServiceIndex as number }) });
      }
      if (new Set(mappings.map(item => item.fieldServiceId)).size !== mappings.length
        || new Set(mappings.filter(item => item.priority !== 'separate')
          .map(item => item.nativeServiceIndex)).size !== mappings.filter(item => item.priority !== 'separate').length) {
        return reply.code(400).send({ error: 'invalid_source_selection' });
      }
      const owned = await runtime.pool.query(
        `select 1 from ap.knowledge_sources s join ap.memberships m
         on m.organization_id = s.organization_id
         where s.connection_id = $1 and m.user_id = $2 and m.role = 'owner'`,
        [request.params.id, userId]);
      if (!owned.rowCount) return reply.code(404).send({ error: 'source_not_found' });
      const inspected = await inspectFieldFacts(runtime, userId, request.params.id);
      if (!inspected.ok) return reply.code(inspected.statusCode).send({ error: inspected.error });
      if (inspected.facts.revision !== expectedRevision
        || inspected.facts.contentHash !== expectedHash) {
        return reply.code(409).send({ error: 'source_version_changed' });
      }
      const db = await runtime.pool.connect();
      try {
        await db.query('begin');
        await db.query('select id from ap.organizations where id = $1 for update',
          [inspected.apOrganizationId]);
        const sources = await db.query<Source & { approved_source_revision: number | null }>(
          `select s.* from ap.knowledge_sources s
           join ap.memberships m on m.organization_id = s.organization_id
           join ap.field_connections c on c.id = s.connection_id
           where s.connection_id = $1 and m.user_id = $2 and m.role = 'owner'
             and c.status = 'review_required' for update of s`,
          [request.params.id, userId]);
        const source = sources.rows[0];
        if (!source || source.organization_id !== inspected.apOrganizationId
          || source.external_org_id !== inspected.fieldOrganizationId) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_mapping_conflict' });
        }
        if (source.state !== 'current' || source.approved_source_revision !== expectedRevision
          || source.source_revision !== expectedRevision || source.content_hash !== expectedHash) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_not_approved' });
        }
        const native = await db.query<{ id: string; revision: number; draft_revision: number;
          content: { businessName: string; introduction: string;
            services: { name: string; description: string }[];
            faqs: { question: string; answer: string }[] } }>(
          `select id, revision, draft_revision, content from ap.knowledge_releases
           where organization_id = $1 and source_kind = 'native'
           order by revision desc limit 1`, [source.organization_id]);
        const base = native.rows[0];
        if (!base) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'native_knowledge_release_required' });
        }
        if (expectedNativeReleaseId !== undefined && expectedNativeReleaseId !== base.id) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'native_knowledge_release_changed' });
        }
        const snapshot = await db.query<{ content: { businessName: string; introduction: string;
          region: string; services: { id: string; name: string; description: string }[];
          faqs?: { question: string; answer: string }[] } }>(
          `select content from ap.knowledge_source_snapshots
           where source_id = $1 and source_revision = $2 and content_hash = $3`,
          [source.id, expectedRevision, expectedHash]);
        const field = snapshot.rows[0]?.content;
        if (!field) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_snapshot_missing' });
        }
        const selected = field.services.filter(service => ids.includes(service.id));
        if (selected.length !== ids.length) {
          await db.query('rollback');
          return reply.code(400).send({ error: 'unknown_field_service' });
        }
        if (mappings.some(item => item.nativeServiceIndex !== undefined
          && item.nativeServiceIndex >= base.content.services.length)) {
          await db.query('rollback');
          return reply.code(400).send({ error: 'invalid_source_selection' });
        }
        const byService = new Map(mappings.map(item => [item.fieldServiceId, item]));
        const nativeNames = new Set(base.content.services.map(service => service.name.trim().toLocaleLowerCase()));
        const fieldNames = selected.map(service => service.name.trim().toLocaleLowerCase());
        if (selected.some((service) => {
          const name = service.name.trim().toLocaleLowerCase();
          const mapping = byService.get(service.id);
          return nativeNames.has(name) && (!mapping
            || (mapping.priority !== 'separate' && base.content.services[
              mapping.nativeServiceIndex!]?.name.trim().toLocaleLowerCase() !== name));
        }) || new Set(fieldNames).size !== fieldNames.length) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_mapping_conflict' });
        }
        const mappedFieldServices = selected.filter(service =>
          byService.get(service.id)?.priority !== 'native');
        const selectedFaqs = includeFaqs ? field.faqs ?? [] : [];
        if (includeFaqs && selectedFaqs.length === 0) {
          await db.query('rollback');
          return reply.code(400).send({ error: 'invalid_source_selection' });
        }
        const sourceTexts = [
          ...(includeBusiness ? [`Field 사업장: ${field.businessName}. 소개: ${field.introduction}. 지역: ${field.region}`] : []),
          ...mappedFieldServices.map(service => `Field 서비스: ${service.name}. ${service.description}`),
          ...selectedFaqs.map(faq => `Field FAQ 질문: ${faq.question}. 승인 답변: ${faq.answer}`),
        ];
        if (sourceTexts.some(value => /\d/.test(value))) {
          await db.query('rollback');
          return reply.code(409).send({ error: 'source_numeric_review_required' });
        }
        const selection = { nativeReleaseId: base.id,
          includeBusinessIntroduction: includeBusiness,
          includeFaqs,
          includedServiceIds: [...ids].sort(),
          serviceMappings: [...mappings].sort((a, b) => a.fieldServiceId.localeCompare(b.fieldServiceId)) };
        const latest = await db.query<{ id: string; revision: number; draft_revision: number;
          source_id: string | null; source_revision: number | null; source_hash: string | null;
          source_selection: Record<string, unknown> | null }>(
          `select id, revision, draft_revision, source_id, source_revision,
            source_hash, source_selection from ap.knowledge_releases
           where organization_id = $1 order by revision desc limit 1`, [source.organization_id]);
        const previous = latest.rows[0];
        const previousSelection = previous?.source_selection;
        const previousMappings = Array.isArray(previousSelection?.serviceMappings)
          ? (previousSelection.serviceMappings as ServiceMapping[]).map(item =>
            [item.fieldServiceId, item.priority, item.nativeServiceIndex ?? null]) : null;
        const requestedMappings = selection.serviceMappings.map(item =>
          [item.fieldServiceId, item.priority, item.nativeServiceIndex ?? null]);
        const sameSelection = previousSelection?.nativeReleaseId === selection.nativeReleaseId
          && previousSelection.includeBusinessIntroduction === includeBusiness
          && (previousSelection.includeFaqs ?? false) === includeFaqs
          && JSON.stringify(previousSelection.includedServiceIds) === JSON.stringify(selection.includedServiceIds)
          && JSON.stringify(previousMappings) === JSON.stringify(requestedMappings);
        if (previous?.source_id === source.id && previous.source_revision === expectedRevision
          && previous.source_hash === expectedHash && previous.draft_revision === base.draft_revision
          && sameSelection) {
          await db.query('commit');
          return reply.header('Cache-Control', 'private, no-store').code(200).send({
            releaseId: previous.id, knowledgeRevision: previous.revision,
            sourceRevision: expectedRevision, outcome: 'unchanged', aiReleaseRequired: true,
          });
        }
        const releaseId = randomUUID();
        const revision = (previous?.revision ?? 0) + 1;
        const fieldPriorityIndices = new Set(mappings.filter(item => item.priority === 'field')
          .map(item => item.nativeServiceIndex));
        const content = { ...base.content,
          services: base.content.services.filter((_service, index) => !fieldPriorityIndices.has(index)),
          sourceFacts: [
          ...(includeBusiness ? [{ id: `field:business:${source.id}`, text: sourceTexts[0] }] : []),
          ...mappedFieldServices.map((service, index) => ({ id: `field:service:${service.id}`,
            text: sourceTexts[(includeBusiness ? 1 : 0) + index] })),
          ...selectedFaqs.map((faq, index) => ({ id: `field:faq:${source.id}:${index}`,
            text: sourceTexts[(includeBusiness ? 1 : 0) + mappedFieldServices.length + index] })),
        ] };
        const serialized = JSON.stringify(content);
        await db.query(`insert into ap.knowledge_releases
          (id,organization_id,revision,draft_revision,source_kind,content,content_hash,
           approved_by,source_id,source_revision,source_hash,source_selection)
          values ($1,$2,$3,$4,'connector',$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb)`,
          [releaseId, source.organization_id, revision, base.draft_revision,
            serialized, createHash('sha256').update(serialized).digest('hex'), userId,
            source.id, expectedRevision, expectedHash, JSON.stringify(selection)]);
        await db.query(`update ap.knowledge_sources set ap_knowledge_release_id = $2,
          updated_at = now() where id = $1`, [source.id, releaseId]);
        await event(db, source.organization_id, source.id,
          'knowledge.source.published', expectedRevision);
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').code(201).send({
          releaseId, knowledgeRevision: revision, sourceRevision: expectedRevision,
          outcome: 'published', aiReleaseRequired: true,
        });
      } catch (error) {
        await db.query('rollback');
        throw error;
      } finally { db.release(); }
    });
}
