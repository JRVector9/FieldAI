import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FieldBusinessRuntime } from './business.js';
import { normalizeSiteImage } from './site-media.js';
import { authorizedApDeployments } from './ap-connector.js';
import { publicInstallationFor } from './ap-public-installation-execution.js';
import { rejectExpiredTrial } from './trial-access.js';
import { activeSiteOrigin, primarySiteOrigin, resolvedCustomHost } from './custom-domains.js';
import { isSiteFont, type SiteFont } from './site-fonts.js';
import { bookingScheduleReady } from './bookings.js';

type Section = { id: string; kind: 'hero' | 'text' | 'service_list' | 'faq'; heading: string; body: string; assetId?: string; alt?: string };
type Page = { id: string; slug: string; title: string; sections: Section[] };
export type SiteContent = { template: 'essential' | 'editorial' | 'warm'; palette: string; font?: SiteFont; pages: Page[] };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const siteSlugPattern = /^field-[0-9a-f]{12}$/;
const proofPattern = /^[A-Za-z0-9_-]{32,64}$/;
export function publicSiteOrigin(slug: string): string | null {
  if (!siteSlugPattern.test(slug)) return null;
  if (process.env.FIELD_PROFILE === 'mock') return `http://${slug}.localhost:3002`;
  const domain = process.env.FIELD_SITE_BASE_DOMAIN;
  if (!domain || domain.length > 200 || !/^[a-z0-9.-]+$/.test(domain)
    || !domain.includes('.') || domain.endsWith('.localhost') || domain.startsWith('.')) return null;
  return `https://${slug}.${domain}`;
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function string(value: unknown, max: number, required = false): string | null {
  return typeof value === 'string' && value.length <= max && (!required || value.trim()) ? value.trim() : null;
}
function revisionFrom(value: unknown): number | null {
  const revision = object(value)?.expectedRevision;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}
export function parseContent(value: unknown): SiteContent | null {
  const body = object(value);
  if (!body || (body.template !== 'essential' && body.template !== 'editorial' && body.template !== 'warm')
      || typeof body.palette !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.palette)
      || (body.font !== undefined && !isSiteFont(body.font))
      || !Array.isArray(body.pages) || body.pages.length < 1 || body.pages.length > 5) return null;
  const pages: Page[] = [];
  const slugs = new Set<string>();
  const pageIds = new Set<string>();
  const sectionIds = new Set<string>();
  for (const entry of body.pages) {
    const page = object(entry);
    const id = page?.id;
    const slug = page?.slug;
    const title = string(page?.title, 100, true);
    if (typeof id !== 'string' || !uuidPattern.test(id) || pageIds.has(id)
        || typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug) || slugs.has(slug)
        || title === null || !Array.isArray(page?.sections) || page.sections.length > 20) return null;
    pageIds.add(id); slugs.add(slug);
    const sections: Section[] = [];
    for (const item of page.sections) {
      const section = object(item);
      const sectionId = section?.id;
      const kind = section?.kind;
      const heading = string(section?.heading, 200);
      const content = string(section?.body, 5000);
      const assetId = section?.assetId;
      const alt = section?.alt;
      if (typeof sectionId !== 'string' || !uuidPattern.test(sectionId) || sectionIds.has(sectionId)
          || (kind !== 'hero' && kind !== 'text' && kind !== 'service_list' && kind !== 'faq')
          || heading === null || content === null
          || (assetId !== undefined && (typeof assetId !== 'string' || !uuidPattern.test(assetId)
            || typeof alt !== 'string' || !alt.trim() || alt.length > 300))
          || (assetId === undefined && alt !== undefined)) return null;
      sectionIds.add(sectionId);
      sections.push({ id: sectionId, kind, heading, body: content,
        ...(typeof assetId === 'string' ? { assetId, alt: (alt as string).trim() } : {}) });
    }
    pages.push({ id, slug, title, sections });
  }
  if (!slugs.has('home')) return null;
  return { template: body.template, palette: body.palette, ...(isSiteFont(body.font) ? { font: body.font } : {}), pages };
}
function assetIds(content: SiteContent) {
  return [...new Set(content.pages.flatMap(page => page.sections.flatMap(section => section.assetId ? [section.assetId] : [])))];
}
async function ownedAssets(runtime: FieldBusinessRuntime, organizationId: string, ids: string[]) {
  if (!ids.length) return true;
  const result = await runtime.pool.query<{ id: string }>(
    "select id from field.site_assets where organization_id = $1 and state = 'ready' and id = any($2::uuid[])",
    [organizationId, ids],
  );
  return result.rows.length === ids.length;
}
export async function userFor(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime) {
  const userId = await runtime.resolveUserId(request.headers);
  if (!userId) reply.code(401).send({ error: 'authentication_required' });
  return userId;
}
export async function organizationFor(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime, userId: string, permission: 'read' | 'edit' | 'publish') {
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuidPattern.test(header))) {
    reply.code(400).send({ error: 'invalid_organization_id' });
    return null;
  }
  const result = await runtime.pool.query<{ organization_id: string; name: string }>(
    `select m.organization_id, o.name from field.memberships m
     join field.organizations o on o.id = m.organization_id
     where m.user_id = $1 and ($2::uuid is null or m.organization_id = $2::uuid)
       and ($3::text = 'read' or ($3::text = 'edit' and m.role in ('owner', 'editor')) or m.role = 'owner')
     order by m.created_at limit 1`, [userId, header ?? null, permission],
  );
  const organization = result.rows[0];
  if (!organization) reply.code(404).send({ error: 'organization_not_found' });
  return organization ?? null;
}
export async function siteFor(runtime: FieldBusinessRuntime, organizationId: string) {
  const result = await runtime.pool.query<{ id: string; slug: string }>(
    'select id, slug from field.sites where organization_id = $1', [organizationId],
  );
  return result.rows[0] ?? null;
}

export function registerSiteRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.get<{ Params: { id: string } }>('/v1/connections/ap/:id/deployments', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'publish');
    if (!organization) return reply;
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'connection_not_found' });
    const result = await authorizedApDeployments(runtime, organization.organization_id, userId, request.params.id);
    return reply.header('Cache-Control', 'private, no-store')
      .code('error' in result ? result.status : 200).send(result);
  });

  app.get('/v1/sites/ap-installation', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'publish');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const release = await runtime.pool.query<{ published: boolean }>(
      'select exists (select 1 from field.site_releases where site_id = $1) as published', [site.id]);
    const found = await runtime.pool.query<{ connection_id: string; ap_deployment_id: string;
      ap_public_id: string; site_origin: string; mode: string; status: string }>(
      'select connection_id, ap_deployment_id, ap_public_id, site_origin, mode, status from field.site_ap_installations where site_id = $1',
      [site.id]);
    const origin = await primarySiteOrigin(runtime.pool, site.id, publicSiteOrigin(site.slug));
    const row = found.rows.find(item => item.site_origin === origin);
    const publicInstallation = row && await runtime.pool.query(
      `select 1 from field.ap_public_installation_intents where site_id=$1 and site_origin=$2
       and connection_id=$3 and deployment->>'id'=$4 and sdk_approved_at is not null limit 1`,
      [site.id,row.site_origin,row.connection_id,row.ap_deployment_id]);
    return reply.header('Cache-Control', 'private, no-store').send({ siteOrigin: origin,
      defaultOrigin: publicSiteOrigin(site.slug),
      published: release.rows[0]?.published ?? false,
      installations: found.rows.map(item => ({ connectionId: item.connection_id, deploymentId: item.ap_deployment_id,
        publicId: item.ap_public_id, origin: item.site_origin, mode: item.mode, status: item.status })),
      installation: row ? { connectionId: row.connection_id, deploymentId: row.ap_deployment_id,
        publicId: row.ap_public_id, origin: row.site_origin, mode: row.mode, status: row.status,
        publicIntent: Boolean(publicInstallation?.rowCount) } : null });
  });

  app.post('/v1/sites/ap-installation', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'publish');
    if (!organization) return reply;
    const body = object(request.body);
    if (typeof body?.connectionId !== 'string' || !uuidPattern.test(body.connectionId)
      || typeof body.deploymentId !== 'string' || !uuidPattern.test(body.deploymentId)
      || (body.mode !== 'inline' && body.mode !== 'floating'))
      return reply.code(400).send({ error: 'invalid_installation' });
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const origin = await activeSiteOrigin(runtime.pool, site.id, object(request.body)?.origin, publicSiteOrigin(site.slug));
    if (!origin) return reply.code(409).send({ error: 'site_origin_not_allowed' });
    if (origin !== publicSiteOrigin(site.slug) && request.headers.origin !== (process.env.FIELD_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3002'))
      return reply.code(403).send({ error: 'invalid_origin' });
    const published = await runtime.pool.query(
      'select 1 from field.site_releases where site_id = $1 limit 1', [site.id]);
    if (!published.rowCount) return reply.code(409).send({ error: 'site_not_published' });
    const allowed = await authorizedApDeployments(runtime, organization.organization_id, userId, body.connectionId);
    if ('error' in allowed) return reply.code(allowed.status).send({ error: allowed.error });
    const selected = allowed.deployments.find(item => item.id === body.deploymentId);
    if (!selected || selected.kind !== 'owned_embed' || selected.origin !== origin)
      return reply.code(409).send({ error: 'deployment_not_allowed_for_site' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      if (!await activeSiteOrigin(db, site.id, origin, publicSiteOrigin(site.slug), true)) {
        await db.query('rollback'); return reply.code(409).send({ error: 'site_origin_not_allowed' });
      }
      const current = await db.query<{ connection_id: string; ap_deployment_id: string; mode: string;
        status: string; site_origin: string }>(
        'select connection_id, ap_deployment_id, mode, status, site_origin from field.site_ap_installations where site_id = $1 and site_origin=$2 for update',
        [site.id, origin]);
      const old = current.rows[0];
      if (old?.connection_id === body.connectionId && old.ap_deployment_id === body.deploymentId
        && old.mode === body.mode && old.status === 'active' && old.site_origin === origin) {
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').send({ status: 'active', publicId: selected.publicId, origin });
      }
      await db.query(`insert into field.site_ap_installations
        (site_id,connection_id,ap_deployment_id,ap_public_id,site_origin,mode,status,installed_by)
        values ($1,$2,$3,$4,$5,$6,'active',$7)
        on conflict (site_id,site_origin) do update set connection_id = excluded.connection_id,
          ap_deployment_id = excluded.ap_deployment_id, ap_public_id = excluded.ap_public_id,
          site_origin = excluded.site_origin, mode = excluded.mode, status = 'active',
          installed_by = excluded.installed_by, updated_at = now()`,
      [site.id, body.connectionId, body.deploymentId, selected.publicId, origin, body.mode, userId]);
      await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'field.site.ap_installation.activated',$3,$4::jsonb)`,
      [randomUUID(), organization.organization_id, site.id,
        JSON.stringify({ siteId: site.id, connectionId: body.connectionId, deploymentId: body.deploymentId })]);
      await db.query('commit');
      return reply.header('Cache-Control', 'private, no-store').code(201)
        .send({ status: 'active', publicId: selected.publicId, origin });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.post('/v1/sites/ap-installation/pause', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'publish');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      await db.query('update field.ap_public_installation_intents set revision=revision+1,updated_at=now() where site_id=$1',[site.id]);
      const paused = await db.query(
        "update field.site_ap_installations set status = 'paused', updated_at = now() where site_id = $1 and status = 'active' returning connection_id",
        [site.id]);
      if (paused.rowCount) await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'field.site.ap_installation.paused',$3,$4::jsonb)`,
      [randomUUID(), organization.organization_id, site.id, JSON.stringify({ siteId: site.id })]);
      await db.query('commit');
      return reply.header('Cache-Control', 'private, no-store').send({ status: 'paused' });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.post('/v1/sites/verification', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'publish');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const origin = await activeSiteOrigin(runtime.pool, site.id, object(request.body)?.origin, publicSiteOrigin(site.slug));
    if (!origin) return reply.code(409).send({ error: 'site_origin_not_allowed' });
    if (origin !== publicSiteOrigin(site.slug) && request.headers.origin !== (process.env.FIELD_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3002'))
      return reply.code(403).send({ error: 'invalid_origin' });
    const proof = object(request.body)?.proof;
    if (typeof proof !== 'string' || !proofPattern.test(proof))
      return reply.code(400).send({ error: 'invalid_verification_proof' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      if (!await activeSiteOrigin(db, site.id, origin, publicSiteOrigin(site.slug), true)) {
        await db.query('rollback'); return reply.code(409).send({ error: 'site_origin_not_allowed' });
      }
      const published = await db.query(
        'select 1 from field.site_releases where site_id = $1 limit 1', [site.id]);
      if (!published.rowCount) {
        await db.query('rollback');
        return reply.code(409).send({ error: 'site_not_published' });
      }
      const custom = origin === publicSiteOrigin(site.slug) ? null : await resolvedCustomHost(db, new URL(origin).hostname, true);
      const current = await db.query<{ proof: string; expires_at: Date }>(
        custom ? 'select proof,expires_at from field.custom_domain_ap_proofs where domain_id=$1 for update'
          : 'select proof,expires_at from field.site_verification_proofs where site_id=$1 for update', [custom?.id ?? site.id]);
      if (current.rows[0]?.proof === proof && current.rows[0].expires_at.getTime() > Date.now()) {
        await db.query('commit');
        return reply.header('Cache-Control', 'private, no-store').code(200).send({ origin, expiresAt: current.rows[0].expires_at });
      }
      const saved = await db.query<{ expires_at: Date }>(custom
        ? `insert into field.custom_domain_ap_proofs(domain_id,site_id,proof,created_by,expires_at)
          values($4,$1,$2,$3,now()+interval '1 day') on conflict(domain_id) do update
          set proof=excluded.proof,created_by=excluded.created_by,expires_at=excluded.expires_at,updated_at=now() returning expires_at`
        : `insert into field.site_verification_proofs(site_id,proof,created_by,expires_at)
          values($1,$2,$3,now()+interval '1 day') on conflict(site_id) do update
          set proof=excluded.proof,created_by=excluded.created_by,expires_at=excluded.expires_at,updated_at=now() returning expires_at`,
        custom ? [site.id,proof,userId,custom.id] : [site.id,proof,userId]);
      await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'field.site.verification.updated',$3,$4::jsonb)`, [randomUUID(),
        organization.organization_id, site.id, JSON.stringify({ siteId: site.id, origin })]);
      await db.query('commit');
      return reply.header('Cache-Control', 'private, no-store').code(201)
        .send({ origin, expiresAt: saved.rows[0]!.expires_at });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.get<{ Params: { slug: string }; Querystring: { host?: string } }>('/v1/public/site-verification/:slug', async (request, reply) => {
    const fallback = publicSiteOrigin(request.params.slug);
    const custom = request.query.host === undefined ? null : await resolvedCustomHost(runtime.pool, request.query.host);
    if (request.query.host !== undefined && custom?.slug !== request.params.slug) return reply.code(404).send({ error: 'site_not_found' });
    const origin = custom ? `https://${custom.hostname}` : fallback;
    if (!origin) return reply.code(404).send({ error: 'site_not_found' });
    const found = await runtime.pool.query<{ proof: string }>(custom
      ? `select p.proof from field.custom_domain_ap_proofs p where p.domain_id=$1 and p.expires_at>now()
          and exists(select 1 from field.site_releases r where r.site_id=p.site_id)`
      : `select p.proof from field.sites s join field.site_verification_proofs p on p.site_id=s.id
          where s.slug=$1 and p.expires_at>now() and exists(select 1 from field.site_releases r where r.site_id=s.id)`,
      [custom?.id ?? request.params.slug]);
    if (!found.rows[0]) return reply.code(404).send({ error: 'verification_not_found' });
    return reply.header('Cache-Control', 'no-store').send({ origin, proof: found.rows[0].proof });
  });

  app.get('/v1/sites/assets', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'read');
    if (!organization) return reply;
    const result = await runtime.pool.query<{
      id: string; state: string; width: number; height: number; byte_size: number; created_at: Date;
    }>(
      `select id, state, width, height, byte_size, created_at from field.site_assets
       where organization_id = $1 order by created_at desc limit 50`, [organization.organization_id],
    );
    reply.header('Cache-Control', 'private, no-store');
    return { assets: result.rows.map(row => ({ id: row.id, state: row.state, width: row.width,
      height: row.height, byteSize: row.byte_size, createdAt: row.created_at.toISOString() })) };
  });

  app.post('/v1/sites/assets', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'edit');
    if (!organization) return reply;
    if (await rejectExpiredTrial(reply, runtime.pool, organization.organization_id)) return reply;
    if (!runtime.siteMedia) return reply.code(503).send({ error: 'blocked_integration' });
    if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: 'unsupported_image' });
    const normalized = await normalizeSiteImage(request.body);
    if (!normalized) return reply.code(415).send({ error: 'unsupported_image' });
    const count = await runtime.pool.query<{ count: string }>(
      'select count(*) from field.site_assets where organization_id = $1', [organization.organization_id],
    );
    if (Number(count.rows[0]?.count ?? 0) >= 50) return reply.code(429).send({ error: 'asset_limit' });
    const id = randomUUID();
    const key = `${organization.organization_id}/${id}.webp`;
    try { await runtime.siteMedia.put(key, normalized.data); }
    catch { return reply.code(503).send({ error: 'media_unavailable' }); }
    try {
      await runtime.pool.query(
        `insert into field.site_assets
          (id, organization_id, object_key, content_type, byte_size, width, height, sha256, uploaded_by)
         values ($1, $2, $3, 'image/webp', $4, $5, $6, $7, $8)`,
        [id, organization.organization_id, key, normalized.data.length, normalized.width, normalized.height,
          createHash('sha256').update(normalized.data).digest('hex'), userId],
      );
    } catch (error) {
      await runtime.siteMedia.delete(key).catch(() => undefined);
      throw error;
    }
    return reply.code(201).send({ id, state: 'ready', contentType: 'image/webp',
      byteSize: normalized.data.length, width: normalized.width, height: normalized.height });
  });

  app.get<{ Params: { id: string } }>('/v1/sites/assets/:id', async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'asset_not_found' });
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const result = await runtime.pool.query<{ object_key: string; sha256: string }>(
      `select a.object_key, a.sha256 from field.site_assets a join field.memberships m
         on m.organization_id = a.organization_id
       where a.id = $1 and m.user_id = $2 and a.state = 'ready'`, [request.params.id, userId],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'asset_not_found' });
    if (!runtime.siteMedia) return reply.code(503).send({ error: 'blocked_integration' });
    try {
      const image = await runtime.siteMedia.get(result.rows[0].object_key);
      if (!image || createHash('sha256').update(image).digest('hex') !== result.rows[0].sha256)
        return reply.code(503).send({ error: 'media_unavailable' });
      return reply.header('Cache-Control', 'private, no-store').type('image/webp').send(image);
    } catch { return reply.code(503).send({ error: 'media_unavailable' }); }
  });

  app.get<{ Params: { id: string } }>('/v1/public/site-assets/:id', async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(404).send({ error: 'asset_not_found' });
    const result = await runtime.pool.query<{ object_key: string; sha256: string }>(
      `select a.object_key, a.sha256 from field.site_assets a
       join field.site_release_assets ra on ra.asset_id = a.id
       join field.site_releases r on r.id = ra.release_id
       where a.id = $1 and not exists (select 1 from field.site_visibility_holds h where h.site_id=r.site_id and h.released_at is null) and r.revision = (
         select max(latest.revision) from field.site_releases latest where latest.site_id = r.site_id)
       limit 1`, [request.params.id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'asset_not_found' });
    if (!runtime.siteMedia) return reply.code(503).send({ error: 'blocked_integration' });
    try {
      const image = await runtime.siteMedia.get(result.rows[0].object_key);
      if (!image || createHash('sha256').update(image).digest('hex') !== result.rows[0].sha256)
        return reply.code(503).send({ error: 'media_unavailable' });
      return reply.header('Cache-Control', 'public, max-age=60').type('image/webp').send(image);
    } catch { return reply.code(503).send({ error: 'media_unavailable' }); }
  });

  app.post('/v1/sites', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'publish');
    if (!organization) return reply;
    const id = randomUUID();
    const slug = `field-${randomBytes(6).toString('hex')}`;
    const content: SiteContent = { template: 'essential', palette: '#264653', pages: [{
      id: randomUUID(), slug: 'home', title: '홈', sections: [{ id: randomUUID(), kind: 'hero', heading: organization.name, body: '' }],
    }] };
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      if (await rejectExpiredTrial(reply, client, organization.organization_id)) {
        await client.query('rollback'); return reply;
      }
      const created = await client.query(
        'insert into field.sites(id, organization_id, slug) values ($1, $2, $3) on conflict do nothing returning id',
        [id, organization.organization_id, slug],
      );
      if (!created.rowCount) { await client.query('rollback'); return reply.code(409).send({ error: 'site_exists' }); }
      await client.query('insert into field.site_drafts(site_id, content, updated_by) values ($1, $2::jsonb, $3)',
        [id, JSON.stringify(content), userId]);
      await client.query('commit');
      return reply.code(201).send({ id, slug });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.get('/v1/sites/draft', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'read');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const result = await runtime.pool.query<{ revision: number; content: SiteContent }>(
      'select revision, content from field.site_drafts where site_id = $1', [site.id],
    );
    return { siteId: site.id, slug: site.slug, revision: result.rows[0]!.revision, ...result.rows[0]!.content };
  });

  app.put('/v1/sites/draft', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'edit');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const revision = revisionFrom(request.body);
    const content = parseContent(request.body);
    if (revision === null || !content) return reply.code(400).send({ error: 'invalid_site_draft' });
    if (!await ownedAssets(runtime, organization.organization_id, assetIds(content)))
      return reply.code(400).send({ error: 'invalid_site_asset' });
    const result = await runtime.pool.query<{ revision: number }>(
      `update field.site_drafts set revision = revision + 1, content = $3::jsonb,
         updated_by = $4, updated_at = now() where site_id = $1 and revision = $2 returning revision`,
      [site.id, revision, JSON.stringify(content), userId],
    );
    if (!result.rowCount) return reply.code(409).send({ error: 'revision_conflict' });
    return { siteId: site.id, slug: site.slug, revision: result.rows[0]!.revision, ...content };
  });

  app.get('/v1/sites/releases', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'read');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const result = await runtime.pool.query<{ id: string; revision: number; catalog_revision: number; published_at: string }>(
      'select id, revision, catalog_revision, published_at from field.site_releases where site_id = $1 order by revision desc limit 50',
      [site.id],
    );
    return { siteId: site.id, releases: result.rows };
  });

  app.post('/v1/sites/releases', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'publish');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const revision = revisionFrom(request.body);
    if (revision === null) return reply.code(400).send({ error: 'invalid_revision' });
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      await client.query('select id from field.sites where id=$1 for update', [site.id]);
      if ((await client.query('select 1 from field.site_visibility_holds where site_id=$1 and released_at is null', [site.id])).rowCount) {
        await client.query('rollback'); return reply.code(409).send({ error: 'site_visibility_restricted' });
      }
      const draft = await client.query<{ revision: number; content: SiteContent }>(
        'select revision, content from field.site_drafts where site_id = $1 for update', [site.id],
      );
      if (!draft.rows[0] || revision !== draft.rows[0].revision || revision === 0) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'revision_conflict' });
      }
      if (!await ownedAssets(runtime, organization.organization_id, assetIds(draft.rows[0].content))) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'site_asset_missing' });
      }
      const existing = await client.query<{ id: string; catalog_revision: number }>(
        'select id, catalog_revision from field.site_releases where site_id = $1 and revision = $2', [site.id, revision],
      );
      if (existing.rows[0]) {
        await client.query('commit');
        return reply.code(200).send({ releaseId: existing.rows[0].id, revision, catalogRevision: existing.rows[0].catalog_revision, slug: site.slug });
      }
      if (await rejectExpiredTrial(reply, client, organization.organization_id)) {
        await client.query('rollback'); return reply;
      }
      const catalog = await client.query<{ id: string; revision: number;
        content: { services: { bookingMode: 'request' | 'slot'; durationMinutes: number }[] } }>(
        `select id, revision, content from field.catalog_releases where organization_id = $1
         order by revision desc limit 1`, [organization.organization_id],
      );
      if (!catalog.rows[0]) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'catalog_not_approved' });
      }
      if (!await bookingScheduleReady(client, organization.organization_id, catalog.rows[0].content.services)) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'booking_schedule_not_ready' });
      }
      const id = randomUUID();
      const content = JSON.stringify(draft.rows[0].content);
      await client.query(
        `insert into field.site_releases
          (id, site_id, revision, content, content_hash, catalog_release_id, catalog_revision, published_by)
         values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
        [id, site.id, revision, content, createHash('sha256').update(content).digest('hex'), catalog.rows[0].id,
          catalog.rows[0].revision, userId],
      );
      for (const assetId of assetIds(draft.rows[0].content)) {
        await client.query('insert into field.site_release_assets(release_id, asset_id) values ($1, $2)', [id, assetId]);
      }
      await client.query(
        'insert into field.outbox(id, organization_id, event_type, aggregate_id, payload) values ($1, $2, $3, $4, $5::jsonb)',
        [randomUUID(), organization.organization_id, 'field.site.published', id,
          JSON.stringify({ siteId: site.id, releaseId: id, catalogRevision: catalog.rows[0].revision })],
      );
      await client.query('commit');
      return reply.code(201).send({ releaseId: id, revision, catalogRevision: catalog.rows[0].revision, slug: site.slug });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.post('/v1/sites/restore', async (request, reply) => {
    const userId = await userFor(request, reply, runtime);
    if (!userId) return reply;
    const organization = await organizationFor(request, reply, runtime, userId, 'edit');
    if (!organization) return reply;
    const site = await siteFor(runtime, organization.organization_id);
    if (!site) return reply.code(404).send({ error: 'site_not_found' });
    const revision = revisionFrom(request.body);
    const releaseId = object(request.body)?.releaseId;
    if (revision === null || typeof releaseId !== 'string' || !uuidPattern.test(releaseId)) {
      return reply.code(400).send({ error: 'invalid_restore' });
    }
    const client = await runtime.pool.connect();
    try {
      await client.query('begin');
      const draft = await client.query<{ revision: number }>(
        'select revision from field.site_drafts where site_id = $1 for update', [site.id],
      );
      if (draft.rows[0]?.revision !== revision) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'revision_conflict' });
      }
      const release = await client.query<{ content: SiteContent }>(
        'select content from field.site_releases where id = $1 and site_id = $2', [releaseId, site.id],
      );
      if (!release.rows[0]) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'release_not_found' });
      }
      const next = await client.query<{ revision: number }>(
        'update field.site_drafts set revision = revision + 1, content = $2::jsonb, updated_by = $3, updated_at = now() where site_id = $1 returning revision',
        [site.id, JSON.stringify(release.rows[0].content), userId],
      );
      await client.query('commit');
      return { siteId: site.id, slug: site.slug, revision: next.rows[0]!.revision, ...release.rows[0].content };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  });

  app.get<{ Params: { slug: string }; Querystring: { host?: string } }>('/v1/public/sites/:slug', async (request, reply) => {
    if (!siteSlugPattern.test(request.params.slug)) return reply.code(404).send({ error: 'site_not_found' });
    const result = await runtime.pool.query<{
      site_id: string; organization_id: string; revision: number; catalog_revision: number;
      latest_catalog_revision: number; content: SiteContent; catalog: unknown;
    }>(
      `select r.site_id, s.organization_id, r.revision, r.catalog_revision, r.content, c.content as catalog,
         (select max(newer.revision) from field.catalog_releases newer
          where newer.organization_id = s.organization_id) as latest_catalog_revision
       from field.sites s join field.site_releases r on r.site_id = s.id
       join field.catalog_releases c on c.id = r.catalog_release_id
       where s.slug = $1 order by r.revision desc limit 1`, [request.params.slug],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'site_not_found' });
    if ((await runtime.pool.query('select 1 from field.site_visibility_holds where site_id=$1 and released_at is null',
      [result.rows[0].site_id])).rowCount) return reply.header('Cache-Control', 'no-store').code(404).send({ error: 'site_visibility_restricted', organizationId: result.rows[0].organization_id });
    const row = result.rows[0];
    const defaultOrigin = publicSiteOrigin(request.params.slug);
    const custom = request.query.host === undefined ? null : await resolvedCustomHost(runtime.pool, request.query.host);
    if (request.query.host !== undefined && custom?.site_id !== row.site_id) return reply.code(404).send({ error: 'site_host_not_found' });
    const requestOrigin = custom ? `https://${custom.hostname}` : defaultOrigin;
    const siteOrigin = await primarySiteOrigin(runtime.pool, row.site_id, defaultOrigin);
    const installation = requestOrigin && await runtime.pool.query<{ ap_public_id: string; mode: 'inline' | 'floating' }>(
      `select i.ap_public_id, i.mode from field.site_ap_installations i
       join field.ap_connections c on c.id = i.connection_id
       where i.site_id = $1 and i.site_origin = $2 and i.status = 'active'
         and c.status = 'review_required'
         and not exists(select 1 from field.ap_public_installation_intents p
           where p.site_id=i.site_id and p.site_origin=i.site_origin and p.connection_id=i.connection_id
             and p.deployment->>'id'=i.ap_deployment_id::text and p.sdk_approved_at is not null)
         limit 1`, [row.site_id, requestOrigin]);
    const publicInstallation = requestOrigin && await publicInstallationFor(runtime.pool,row.site_id,requestOrigin);
    const widget = installation && installation.rows[0] || publicInstallation;
    const sdkSrc = runtime.apConnector && new URL('/sdk/v1.js', runtime.apConnector.issuer).toString();
    return { siteId: row.site_id, organizationId: row.organization_id, slug: request.params.slug,
      siteOrigin, defaultOrigin, requestOrigin, siteRevision: row.revision,
      catalogRevision: row.catalog_revision, latestCatalogRevision: row.latest_catalog_revision,
      stale: row.catalog_revision < row.latest_catalog_revision, ...row.content, catalog: row.catalog,
      apWidget: widget && sdkSrc
        ? { publicId: widget.ap_public_id, mode: widget.mode, sdkSrc } : null };
  });
}
