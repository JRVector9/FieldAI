import type { CustomDomainContext } from './custom-domains.js';
import type { NotificationContext } from './notification-context.js';
import type { BillingContext } from './billing-context.js';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { FieldSiteGenerator } from './field-openai.js';
import type { FieldSiteMediaStore } from './site-media.js';
import type { ApConnectorConfig } from './ap-connector.js';
import { rejectExpiredTrial } from './trial-access.js';
import type { FieldRevocationJournal } from './revocation-journal.js';

export type FieldBusinessRuntime = {
  notification?: NotificationContext;
  customDomain?: CustomDomainContext;
  billing?: BillingContext;
  pool: Pool;
  resolveUserId: (headers: IncomingHttpHeaders) => Promise<string | null>;
  resolveSession?: (headers: IncomingHttpHeaders) => Promise<{ id: string; userId: string } | null>;
  siteGenerator?: FieldSiteGenerator;
  siteQueue?: { enqueue: (id: string) => Promise<void> };
  siteMedia?: FieldSiteMediaStore;
  inquiryMedia?: FieldSiteMediaStore;
  apConnector?: ApConnectorConfig;
  revocationJournal?: Pick<FieldRevocationJournal, 'append'>;
  oauthLifecycleGuard?: () => Promise<void>;
};

type Service = {
  id: string;
  name: string;
  description: string;
  bookingMode: 'inherit' | 'request' | 'slot';
  durationMinutes: number;
  priceAmount: number | null;
};
type Faq = { question: string; answer: string };
type Catalog = {
  businessName: string;
  industry: string;
  introduction: string;
  region: string;
  openingHours: string;
  contactPhone: string;
  defaultBookingMode: 'request' | 'slot';
  services: Service[];
  faqs: Faq[];
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function fieldText(value: unknown, max: number, required = false): string | null {
  return typeof value === 'string' && value.length <= max && (!required || value.trim()) ? value.trim() : null;
}
function expectedRevision(value: unknown): number | null {
  const revision = object(value)?.expectedRevision;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}
function parseCatalog(value: unknown, fallbackBookingMode: 'request' | 'slot' = 'request',
  allowIncomplete = false, fallbackIndustry = ''): Catalog | null {
  const body = object(value);
  if (!body) return null;
  const businessName = fieldText(body.businessName, 160, !allowIncomplete);
  const industry = fieldText(body.industry === undefined ? fallbackIndustry : body.industry, 160);
  const introduction = fieldText(body.introduction, 5000);
  const region = fieldText(body.region, 200);
  const openingHours = fieldText(body.openingHours, 500);
  const contactPhone = fieldText(body.contactPhone, 30);
  const defaultBookingMode = body.defaultBookingMode === undefined ? fallbackBookingMode : body.defaultBookingMode;
  if (businessName === null || industry === null || introduction === null || region === null || openingHours === null
      || contactPhone === null || (defaultBookingMode !== 'request' && defaultBookingMode !== 'slot')
      || !Array.isArray(body.services) || body.services.length > 100) return null;
  const services: Service[] = [];
  const ids = new Set<string>();
  for (const value of body.services) {
    const item = object(value);
    const id = item?.id;
    const name = fieldText(item?.name, 160, !allowIncomplete);
    const description = fieldText(item?.description, 2000);
    const bookingMode = item?.bookingMode;
    const durationMinutes = item?.durationMinutes;
    const priceAmount = item?.priceAmount;
    if (typeof id !== 'string' || !uuidPattern.test(id) || ids.has(id) || name === null || description === null
        || (bookingMode !== 'inherit' && bookingMode !== 'request' && bookingMode !== 'slot')
        || typeof durationMinutes !== 'number' || !Number.isSafeInteger(durationMinutes)
        || durationMinutes < (allowIncomplete ? 0 : 1) || durationMinutes > 1440
        || (priceAmount !== null && (typeof priceAmount !== 'number' || !Number.isSafeInteger(priceAmount)
          || priceAmount < 0 || priceAmount > 1_000_000_000))) return null;
    ids.add(id);
    services.push({ id, name, description, bookingMode, durationMinutes, priceAmount: priceAmount as number | null });
  }
  const rawFaqs = body.faqs ?? [];
  if (!Array.isArray(rawFaqs) || rawFaqs.length > 100) return null;
  const faqs: Faq[] = [];
  for (const value of rawFaqs) {
    const item = object(value);
    const question = fieldText(item?.question, 500, !allowIncomplete);
    const answer = fieldText(item?.answer, 2000, !allowIncomplete);
    if (question === null || answer === null) return null;
    faqs.push({ question, answer });
  }
  return { businessName, industry, introduction, region, openingHours, contactPhone, defaultBookingMode, services, faqs };
}
async function userFor(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) reply.code(401).send({ error: 'authentication_required' });
  return userId;
}
async function organizationFor(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime, userId: string, permission: 'read' | 'edit' | 'approve') {
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuidPattern.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' });
    return null;
  }
  const result = await runtime.pool.query<{ organization_id: string }>(
    `select organization_id from field.memberships where user_id = $1
       and ($2::uuid is null or organization_id = $2::uuid)
       and ($3::text = 'read' or ($3::text = 'edit' and role in ('owner', 'editor')) or role = 'owner')
     order by created_at limit 1`, [userId, header ?? null, permission],
  );
  const id = result.rows[0]?.organization_id;
  if (!id) reply.code(404).send({ error: 'organization_not_found' });
  return id ?? null;
}

export function registerFieldBusinessRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.post('/v1/organizations', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const name = fieldText(object(request.body)?.name, 160, true);
    if (name === null) return reply.code(400).send({ error: 'invalid_name' });
    const id = randomUUID();
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const created = await client.query(
        'insert into field.organizations(id, owner_user_id, name) values ($1, $2, $3) on conflict (owner_user_id) do nothing returning id',
        [id, userId, name],
      );
      if (!created.rowCount) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'organization_exists' });
      }
      await client.query("insert into field.memberships(organization_id, user_id, role) values ($1, $2, 'owner')", [id, userId]);
      const content: Catalog = { businessName: name, industry: '', introduction: '', region: '', openingHours: '',
        contactPhone: '', defaultBookingMode: 'request', services: [], faqs: [] };
      await client.query(
        'insert into field.catalog_drafts(organization_id, content, updated_by) values ($1, $2::jsonb, $3)',
        [id, JSON.stringify(content), userId],
      );
      await client.query(
        'insert into field.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
        [randomUUID(), id, 'field.organization.created', id, JSON.stringify({ organizationId: id })],
      );
      await client.query('commit');
      return reply.code(201).send({ id });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.get('/v1/business/draft', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organizationId = await organizationFor(request, reply, runtime, userId, 'read');
    if (!organizationId) return reply;
    const result = await runtime.pool.query<{ revision: number; content: Catalog }>(
      'select revision, content from field.catalog_drafts where organization_id = $1', [organizationId],
    );
    return { organizationId, revision: result.rows[0]!.revision, ...result.rows[0]!.content,
      industry: result.rows[0]!.content.industry ?? '',
      defaultBookingMode: result.rows[0]!.content.defaultBookingMode ?? 'request',
      faqs: result.rows[0]!.content.faqs ?? [] };
  });

  app.put('/v1/business/draft', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organizationId = await organizationFor(request, reply, runtime, userId, 'edit');
    if (!organizationId) return reply;
    const revision = expectedRevision(request.body);
    const body = object(request.body);
    if (revision === null || !body) return reply.code(400).send({ error: 'invalid_catalog' });
    const previous = body.defaultBookingMode === undefined || body.industry === undefined
      ? await runtime.pool.query<{ content: Pick<Catalog, 'defaultBookingMode' | 'industry'> }>(
        'select content from field.catalog_drafts where organization_id = $1', [organizationId])
      : null;
    const fallback = previous?.rows[0]?.content.defaultBookingMode === 'slot' ? 'slot' : 'request';
    const content = parseCatalog(body, fallback, true, previous?.rows[0]?.content.industry ?? '');
    if (!content) return reply.code(400).send({ error: 'invalid_catalog' });
    const result = await runtime.pool.query<{ revision: number }>(
      `update field.catalog_drafts set revision = revision + 1, content = $3::jsonb,
         updated_by = $4, updated_at = now()
       where organization_id = $1 and revision = $2 returning revision`,
      [organizationId, revision, JSON.stringify(content), userId],
    );
    if (!result.rowCount) return reply.code(409).send({ error: 'revision_conflict' });
    return { organizationId, revision: result.rows[0]!.revision, ...content };
  });

  app.post('/v1/catalog/releases', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organizationId = await organizationFor(request, reply, runtime, userId, 'approve');
    if (!organizationId) return reply;
    const revision = expectedRevision(request.body);
    if (revision === null) return reply.code(400).send({ error: 'invalid_revision' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const draft = await client.query<{ revision: number; content: Catalog }>(
        'select revision, content from field.catalog_drafts where organization_id = $1 for update', [organizationId],
      );
      if (!draft.rows[0] || revision !== draft.rows[0].revision || revision === 0) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'revision_conflict' });
      }
      const existing = await client.query<{ id: string }>(
        'select id from field.catalog_releases where organization_id = $1 and revision = $2', [organizationId, revision],
      );
      if (existing.rows[0]) {
        await client.query('commit');
        return reply.code(200).send({ releaseId: existing.rows[0].id, revision });
      }
      if (await rejectExpiredTrial(reply, client, organizationId)) {
        await client.query('rollback'); return reply;
      }
      const id = randomUUID();
      const source = draft.rows[0].content;
      const defaultBookingMode = source.defaultBookingMode ?? 'request';
      if (!parseCatalog(source, defaultBookingMode)) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'catalog_incomplete' });
      }
      const content = JSON.stringify({ ...source, industry: source.industry ?? '', defaultBookingMode, faqs: source.faqs ?? [],
        services: source.services.map(service => ({ ...service,
          bookingMode: service.bookingMode === 'inherit' ? defaultBookingMode : service.bookingMode })) });
      await client.query(
        'insert into field.catalog_releases(id, organization_id, revision, content, content_hash, approved_by) values ($1, $2, $3, $4::jsonb, $5, $6)',
        [id, organizationId, revision, content, createHash('sha256').update(content).digest('hex'), userId],
      );
      await client.query(
        'insert into field.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
        [randomUUID(), organizationId, 'field.catalog.approved', id, JSON.stringify({ organizationId, releaseId: id, revision })],
      );
      await client.query('commit');
      return reply.code(201).send({ releaseId: id, revision });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Params: { id: string } }>('/v1/public/catalog/:id', async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'not_found' });
    const result = await runtime.pool.query<{ revision: number; content: Catalog }>(
      'select revision, content from field.catalog_releases where organization_id = $1 order by revision desc limit 1',
      [request.params.id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'not_found' });
    return { organizationId: request.params.id, revision: result.rows[0].revision, ...result.rows[0].content,
      industry: result.rows[0].content.industry ?? '',
      faqs: result.rows[0].content.faqs ?? [] };
  });
}
