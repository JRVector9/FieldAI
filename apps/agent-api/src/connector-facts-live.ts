import type { Pool, PoolClient } from 'pg';
import type { BusinessRuntime } from './business.js';
import { inspectFieldFacts } from './field-connector.js';
import type { AgentFact, AgentModelOutput } from './openai.js';

type ConnectorRelease = { source_kind: string; organization_id: string;
  source_revision: number | null; source_hash: string | null; source_id: string | null;
  connection_id: string | null; initiator_user_id: string | null;
  source_state: string | null; stored_revision: number | null;
  approved_revision: number | null; stored_hash: string | null;
  published_release_id: string | null; connection_status: string | null };
export type ConfirmedConnectorFacts = { facts: AgentFact[];
  state: 'native' | 'current' | 'unverified' };
const object = (value: unknown): Record<string, unknown> | null => value !== null
  && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const note = '연결된 Field 서비스의 최신 정보는 확인되지 않았습니다. 담당자에게 문의해 주세요.';

export async function approvedConnectorFacts(db: Pool | PoolClient, releaseId: string): Promise<AgentFact[]> {
  const found = await db.query<{ content: { sourceFacts?: unknown } }>(
    `select k.content from ap.knowledge_releases k
     join ap.knowledge_sources s on s.id = k.source_id
     join ap.field_connections c on c.id = s.connection_id
     where k.id = $1 and k.source_kind = 'connector'
       and s.state = 'current' and c.status = 'review_required'
       and k.source_revision = s.source_revision
       and k.source_revision = s.approved_source_revision
       and k.source_hash = s.content_hash
       and s.ap_knowledge_release_id = k.id
       and s.fetched_at > now() - interval '24 hours'`, [releaseId]);
  const items = found.rows[0]?.content.sourceFacts;
  return Array.isArray(items) && items.every(item => object(item)
    && typeof item.id === 'string' && item.id.trim().length > 0 && item.id.length <= 80
    && typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= 1000)
    ? items as AgentFact[] : [];
}

export async function confirmedConnectorFacts(runtime: BusinessRuntime,
  releaseId: string): Promise<ConfirmedConnectorFacts> {
  const release = (await runtime.pool.query<ConnectorRelease>(
    `select k.source_kind,k.organization_id,k.source_revision,k.source_hash,
       s.id as source_id,s.connection_id,s.state as source_state,
       s.source_revision as stored_revision,s.approved_source_revision as approved_revision,
       s.content_hash as stored_hash,s.ap_knowledge_release_id as published_release_id,
       c.initiator_user_id,c.status as connection_status
     from ap.knowledge_releases k
     left join ap.knowledge_sources s on s.id = k.source_id
     left join ap.field_connections c on c.id = s.connection_id
     where k.id = $1`, [releaseId])).rows[0];
  if (!release || release.source_kind !== 'connector') return { facts: [], state: 'native' };
  if (!release.source_id || !release.connection_id || !release.initiator_user_id
    || release.source_revision === null || !release.source_hash
    || release.source_state !== 'current' || release.connection_status !== 'review_required'
    || release.stored_revision !== release.source_revision
    || release.approved_revision !== release.source_revision
    || release.stored_hash !== release.source_hash
    || release.published_release_id !== releaseId)
    return { facts: [], state: 'unverified' };
  const live = await inspectFieldFacts(runtime, release.initiator_user_id,
    release.connection_id, { degradeOnGrantFailure: false });
  if (!live.ok || live.apOrganizationId !== release.organization_id
    || live.facts.revision !== release.source_revision
    || live.facts.contentHash !== release.source_hash)
    return { facts: [], state: 'unverified' };
  await runtime.pool.query(`update ap.knowledge_sources set fetched_at = now()
    where id = $1 and state = 'current' and source_revision = $2
      and approved_source_revision = $2 and content_hash = $3
      and ap_knowledge_release_id = $4`,
  [release.source_id, release.source_revision, release.source_hash, releaseId]);
  const cached = await approvedConnectorFacts(runtime.pool, releaseId);
  return cached.length ? { facts: cached, state: 'current' }
    : { facts: [], state: 'unverified' };
}

export function guardedConnectorAnswer(output: AgentModelOutput,
  checked: ConfirmedConnectorFacts, afterGeneration?: ConfirmedConnectorFacts): AgentModelOutput {
  if (afterGeneration && afterGeneration.state !== 'current')
    return { answer: '', evidenceIds: [], unknowns: [note], handoffRecommended: true };
  if (checked.state !== 'unverified') return output;
  return { ...output, unknowns: [...new Set([...output.unknowns, note])].slice(0, 10),
    handoffRecommended: true };
}
