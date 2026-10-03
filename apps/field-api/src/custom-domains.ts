import type { Pool, PoolClient } from 'pg';
import { createDomainDnsInspector, normalizeCustomHostname, type DomainDnsInspector } from './custom-domain-dns.js';
import { domainEdgeFromEnvironment } from './custom-domain-edge-caddy.js';

export type DomainEdgeProvider = {
  // The adapter must enforce monotonically increasing generation on bind/remove, attest the exact
  // hostname -> Field site binding and validate its trusted TLS certificate. Revisions are scoped to domainId;
  // retained tombstones reject old operations, and remove never changes another domainId/site binding.
  // organizationId(추가)는 edge 응답이 같은 조직의 사이트를 가리키는지 대조할 때 쓴다.
  // failed(추가)는 어댑터가 확정한 TLS 실패다(작업자는 error/domain_tls_failed로 기록하고 다시 점검한다).
  // pending이 tls_pending에서 유예(15분) 넘게 이어져도 작업자가 error/domain_tls_failed로 기록한다.
  // Caddy 어댑터(추가)는 바인딩 원본이 Field DB라 위 tombstone 조건 대신 ask·site-hosts 조회 거부로 해제를 대신한다
  // (이미 발급된 인증서는 만료까지 Caddy 저장소에 남는다).
  ensureBinding: (input: { hostname: string; siteId: string; organizationId: string; requestKey: string; domainId: string; generation: number }) => Promise<{
    hostname: string; siteId: string; generation: number; state: 'pending' | 'ready' | 'failed'; certificateExpiresAt: string | null;
  }>;
  removeBinding: (input: { hostname: string; siteId: string; requestKey: string; domainId: string; generation: number }) => Promise<boolean>;
};
export type CustomDomainContext = {
  webOrigin: string; baseDomain?: string; target?: string; dns?: DomainDnsInspector; edge?: DomainEdgeProvider;
};
export function customDomainContextFromEnvironment(): CustomDomainContext {
  const origin = new URL(process.env.FIELD_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3002');
  if (origin.origin !== origin.href.replace(/\/$/, '') || origin.username || origin.password
    || !['http:', 'https:'].includes(origin.protocol)
    || origin.protocol==='http:' && (process.env.FIELD_PROFILE!=='mock' || !['localhost','127.0.0.1'].includes(origin.hostname)))
    throw new Error('Field custom domain owner web origin is invalid');
  const target = process.env.FIELD_CUSTOM_DOMAIN_CNAME_TARGET;
  return { webOrigin: origin.origin, baseDomain: process.env.FIELD_SITE_BASE_DOMAIN, target,
    dns: target ? createDomainDnsInspector(target) : undefined, edge: domainEdgeFromEnvironment() };
}
export type SiteDomain = {
  id: string; organization_id: string; site_id: string; hostname: string; request_key: string; created_by: string;
  hostname_claimed: boolean; ownership_token: string; desired_state: string; state: string; ownership_state: string; dns_state: string;
  tls_state: string; binding_state: string; is_primary: boolean; generation: number; ownership_release_generation: number | null; claim_token: string | null;
  lease_expires_at: Date | null; next_check_at: Date; checked_at: Date | null; valid_until: Date | null;
  certificate_expires_at: Date | null; last_error: string | null;
};
export function domainView(row: SiteDomain, context: CustomDomainContext) {
  const connected = row.desired_state==='active' && row.state==='connected' && row.valid_until && row.valid_until.getTime()>Date.now();
  return { id: row.id, hostname: row.hostname, state: row.state==='connected' && !connected ? 'verification_expired' : row.state,
    desiredState: row.desired_state, ownership: row.ownership_state, dns: row.dns_state, tls: row.tls_state,
    binding: row.binding_state, isPrimary: row.is_primary, origin: connected ? `https://${row.hostname}` : null,
    checkedAt: row.checked_at, validUntil: row.valid_until, certificateExpiresAt: row.certificate_expires_at,
    error: row.last_error, verification: { txtName: `_field-site.${row.hostname}`, txtValue: `field-domain=${row.ownership_token}`,
      cnameName: row.hostname, cnameTarget: context.target ?? null },
    apOrigin: { origin: `https://${row.hostname}`, approvalRequired: true } };
}
const usable = `d.ownership_release_generation is null and d.hostname_claimed and d.desired_state='active' and d.state='connected' and d.ownership_state='verified'
  and d.dns_state='verified' and d.tls_state='ready' and d.binding_state='ready'
  and d.valid_until>now() and d.certificate_expires_at>now()`;
export async function resolvedCustomHost(db: Pick<Pool | PoolClient, 'query'>, hostname: unknown, lock = false) {
  const normalized = normalizeCustomHostname(hostname);
  if (!normalized) return null;
  const found = await db.query<{ id: string; site_id: string; organization_id: string; slug: string; hostname: string }>(
    `select d.id,d.site_id,d.organization_id,s.slug,d.hostname from field.site_domains d
      join field.sites s on s.id=d.site_id where d.hostname=$1 and ${usable}
      and exists(select 1 from field.site_releases r where r.site_id=s.id)${lock ? ' for share of d' : ''}`, [normalized]);
  return found.rows[0] ?? null;
}
// 도메인 연결 해제(사업자 해제·조직 삭제 실행 공통). 호출자가 해당 행을 for update로 잠근 트랜잭션 안에서 부른다.
// edge 바인딩 제거와 hostname claim 해제는 custom-domain 작업자가 release_pending을 이어서 처리한다.
export async function disconnectSiteDomain(db: Pick<PoolClient, 'query'>, row: Pick<SiteDomain, 'id' | 'site_id' | 'hostname' | 'desired_state'>) {
  if(row.desired_state==='active')await db.query(`update field.site_domains set desired_state='disconnected',state='release_pending',
    is_primary=false,generation=generation+1,claim_token=null,lease_expires_at=null,valid_until=null,next_check_at=now(),updated_at=now() where id=$1`,[row.id]);
  await db.query("update field.site_ap_installations set status='paused',updated_at=now() where site_id=$1 and site_origin=$2 and status='active'",[row.site_id,`https://${row.hostname}`]);
  await db.query('delete from field.custom_domain_ap_proofs where domain_id=$1',[row.id]);
}
export async function primarySiteOrigin(db: Pick<Pool | PoolClient, 'query'>, siteId: string, fallback: string | null) {
  const found = await db.query<{ hostname: string }>(`select d.hostname from field.site_domains d
    where d.site_id=$1 and d.is_primary and ${usable}`, [siteId]);
  return found.rows[0] ? `https://${found.rows[0].hostname}` : fallback;
}
export async function activeSiteOrigin(db: Pick<Pool | PoolClient, 'query'>, siteId: string, requested: unknown, fallback: string | null, lock = false) {
  if (requested===undefined) return fallback;
  if (requested===fallback) return fallback;
  if (typeof requested!=='string') return null;
  let hostname: string;
  try { const url=new URL(requested); if(url.protocol!=='https:' || url.origin!==requested) return null;hostname=url.hostname; }catch{return null;}
  const host=await resolvedCustomHost(db,hostname,lock);
  return host?.site_id===siteId ? requested : null;
}
