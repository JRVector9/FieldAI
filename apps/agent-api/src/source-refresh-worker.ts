import type { BusinessRuntime } from './business.js';
import { inspectFieldFacts } from './field-connector.js';
import { storeFacts } from './field-sources.js';

type Claim = { id: string; connection_id: string; ap_grant_id: string;
  expected_source_revision: number; attempts: number };
type CurrentSource = { source_revision: number; content_hash: string; state: string };

export async function processFieldSourceRefreshOnce(runtime: BusinessRuntime):
  Promise<'empty' | 'retry' | 'blocked' | 'completed'> {
  const claim = (await runtime.pool.query<Claim>(`with candidate as (
      select id from ap.source_refresh_jobs
      where (state in ('pending','retry') and next_attempt_at <= now())
         or (state = 'sending' and lease_until <= now())
      order by next_attempt_at,created_at for update skip locked limit 1
    ) update ap.source_refresh_jobs j set state = 'sending',attempts = j.attempts + 1,
      lease_until = now() + interval '30 seconds',updated_at = now()
      from candidate where j.id = candidate.id
      returning j.id,j.connection_id,j.ap_grant_id,j.expected_source_revision,j.attempts`)).rows[0];
  if (!claim) return 'empty';

  const finish = async (state: 'retry' | 'blocked' | 'completed', error: string | null,
    revision: number | null = null, outcome: string | null = null) => {
    const seconds = Math.min(300, 2 ** Math.min(claim.attempts, 8));
    await runtime.pool.query(`update ap.source_refresh_jobs set state = $3,
       next_attempt_at = case when $3 = 'retry'
         then now() + ($4::text || ' seconds')::interval else next_attempt_at end,
       lease_until = null,source_revision = $5,outcome = $6,last_error = $7,updated_at = now()
       where id = $1 and attempts = $2 and state = 'sending'`,
    [claim.id, claim.attempts, state, seconds, revision, outcome, error]);
    return state;
  };

  const connection = (await runtime.pool.query<{ initiator_user_id: string }>(
    `select c.initiator_user_id from ap.field_connections c
      join ap.oauth_selections s on s.id = c.ap_grant_id
      join ap.memberships m on m.organization_id = c.ap_organization_id
        and m.user_id = c.initiator_user_id and m.role = 'owner'
      where c.id = $1 and c.ap_grant_id = $2 and c.status = 'review_required'
        and s.revoked_at is null and s.organization_id = c.ap_organization_id
        and s.agent_id = c.ap_agent_id and s.actor_user_id = c.initiator_user_id
        and s.requested_scopes @> array['ap.sources.refresh']
        and exists (select 1 from "oauthConsent" oc where oc."referenceId" = s.id::text
          and oc."clientId" = s.client_id and oc."userId" = s.actor_user_id
          and oc.scopes @> '["ap.sources.refresh"]'::jsonb)
        and exists (select 1 from "oauthRefreshToken" t where t."referenceId" = s.id::text
          and t."clientId" = s.client_id and t."userId" = s.actor_user_id
          and t.revoked is null and t."expiresAt" > now())`,
    [claim.connection_id, claim.ap_grant_id])).rows[0];
  if (!connection) return finish('blocked', 'connection_or_grant_unavailable');

  const inspected = await inspectFieldFacts(runtime, connection.initiator_user_id,
    claim.connection_id);
  if (!inspected.ok) return finish([502, 503].includes(inspected.statusCode) ? 'retry' : 'blocked',
    inspected.error);
  const factsRevision = inspected.facts.revision as number;
  const factsHash = String(inspected.facts.contentHash).toLowerCase();
  const current = (await runtime.pool.query<CurrentSource>(
    'select source_revision,content_hash,state from ap.knowledge_sources where connection_id = $1',
    [claim.connection_id])).rows[0];
  if ((current?.source_revision ?? 0) !== claim.expected_source_revision) {
    if (current?.source_revision === factsRevision && current.content_hash === factsHash
      && current.state !== 'integrity_conflict' && current.state !== 'revoked')
      return finish('completed', null, current.source_revision, 'recovered');
    return finish('blocked', 'source_version_changed');
  }
  const saved = await storeFacts(runtime, claim.connection_id, inspected);
  if (saved.statusCode === 409 || saved.body.state === 'integrity_conflict')
    return finish('blocked', saved.body.error ?? 'integrity_conflict');
  return finish('completed', null, saved.body.sourceRevision, saved.body.outcome);
}
