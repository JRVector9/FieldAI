import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BusinessRuntime } from './business.js';

type Grant = { id: string; token_id: string; organization_id: string; agent_id: string; actor_user_id: string;
  client_id: string; allowed_deployment_ids: string[]; requested_scopes: string[];
  token_scopes: string[]; token_resources: string[]; consent_scopes: string[] };

export async function integratorGrant(request: FastifyRequest, reply: FastifyReply,
  runtime: BusinessRuntime, requiredScope?: 'ap.agent.read' | 'ap.conversations.read'
    | 'ap.conversations.reply' | 'ap.sources.refresh'): Promise<Grant | null> {
  const bearer = /^Bearer ([A-Za-z0-9_-]{20,512})$/.exec(request.headers.authorization ?? '')?.[1];
  if (!bearer) { reply.code(401).send({ error: 'invalid_access_token' }); return null; }
  const digest = createHash('sha256').update(bearer).digest('base64url');
  const found = await runtime.pool.query<Grant>(
    `select s.id, t.id as token_id, s.organization_id, s.agent_id, s.actor_user_id, s.client_id,
       s.allowed_deployment_ids, s.requested_scopes,
       t.scopes as token_scopes, t.resources as token_resources,
       oc.scopes as consent_scopes
     from "oauthAccessToken" t
     join "oauthClient" c on c."clientId" = t."clientId"
     join ap.oauth_selections s on s.id::text = t."referenceId"
     join "oauthConsent" oc on oc."referenceId" = s.id::text
       and oc."userId" = s.actor_user_id and oc."clientId" = s.client_id
     join ap.memberships m on m.organization_id = s.organization_id
       and m.user_id = s.actor_user_id and m.role = 'owner'
     where t.token = $1 and t."expiresAt" > now() and t.revoked is null
       and coalesce(c.disabled, false) = false
       and t."userId" = s.actor_user_id and t."clientId" = s.client_id
       and s.revoked_at is null
       and exists (select 1 from ap.agent_releases a where a.organization_id = s.organization_id
         and a.agent_id = s.agent_id and a.id = (select id from ap.agent_releases
           where organization_id = s.organization_id order by revision desc limit 1))
     limit 1`, [digest],
  );
  const grant = found.rows[0];
  const resource = process.env.AP_AUTH_BASE_URL
    ? new URL('/integrations/v1', process.env.AP_AUTH_BASE_URL).toString() : null;
  if (!grant || !resource || !Array.isArray(grant.token_resources)
    || !grant.token_resources.includes(resource)) {
    reply.code(401).send({ error: 'invalid_access_token' }); return null;
  }
  if (!Array.isArray(grant.token_scopes) || !Array.isArray(grant.consent_scopes)
    || !grant.requested_scopes.some(scope => scope.startsWith('ap.')
      && grant.token_scopes.includes(scope) && grant.consent_scopes.includes(scope))) {
    reply.code(403).send({ error: 'insufficient_scope' }); return null;
  }
  if (requiredScope && (!grant.token_scopes.includes(requiredScope)
    || !grant.requested_scopes.includes(requiredScope)
    || !grant.consent_scopes.includes(requiredScope))) {
    reply.code(403).send({ error: 'insufficient_scope' }); return null;
  }
  return grant;
}
