import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { authorizedApConversationAccess, type ApConnectorConfig } from './ap-connector.js';
import type { FieldSiteMediaStore } from './site-media.js';
import { normalizeSiteImage } from './site-media.js';

type Claim = { id: string; organization_id: string; external_request_id: string;
  source_attachment_id: string; attempt_count: number; connection_id: string;
  action_request_id: string; source_deployment_id: string; initiator_user_id: string };

export async function copyExternalRequestAttachmentOnce(pool: Pool, connector: ApConnectorConfig,
  media?: FieldSiteMediaStore): Promise<'empty' | 'copied' | 'retry'> {
  const selected = await pool.query<Claim>(
    `with candidate as (
       select p.id from field.external_request_attachments p
       join field.external_work_requests w on w.id=p.external_request_id
       where w.retention_work_purged_at is null and ((p.state in ('pending','copy_failed') and p.next_attempt_at <= now())
          or (p.state = 'copying' and p.lease_until <= now()))
       order by p.next_attempt_at,p.created_at for update of p skip locked limit 1
     )
     update field.external_request_attachments p
       set state = 'copying',attempt_count = p.attempt_count + 1,
           lease_until = now() + interval '2 minutes',error_code = null
     from candidate,field.external_work_requests w,field.ap_connections c
     where p.id = candidate.id and w.id = p.external_request_id
       and c.id = w.connection_id
     returning p.id,p.organization_id,p.external_request_id,p.source_attachment_id,
       p.attempt_count,w.connection_id,w.action_request_id,w.source_deployment_id,c.initiator_user_id`,
  );
  const claim = selected.rows[0];
  if (!claim) return 'empty';
  const fail = async (errorCode: string) => {
    const seconds = Math.min(3600, 2 ** Math.min(claim.attempt_count, 10) * 5);
    await pool.query(`update field.external_request_attachments
       set state = 'copy_failed',lease_until = null,error_code = $3,
         next_attempt_at = now() + ($4::text || ' seconds')::interval
       where id = $1 and attempt_count = $2 and state = 'copying'`,
    [claim.id, claim.attempt_count, errorCode, seconds]);
    return 'retry' as const;
  };
  if (!media) return fail('media_unavailable');
  const access = await authorizedApConversationAccess({ pool, apConnector: connector },
    claim.organization_id, claim.initiator_user_id, claim.connection_id,
    claim.source_deployment_id, 'ap.conversations.read');
  if ('error' in access) return fail(access.error);
  let response: Response;
  try {
    response = await (connector.fetcher ?? fetch)(
      `${access.resource}/action-requests/${claim.action_request_id}/attachments/${claim.source_attachment_id}`,
      { headers: { authorization: `Bearer ${access.token}` }, signal: AbortSignal.timeout(15000) });
  } catch { return fail('ap_media_unavailable'); }
  if (!response.ok) return fail(response.status === 404 ? 'source_attachment_unavailable'
    : response.status === 401 || response.status === 403 ? 'ap_grant_unavailable'
      : 'ap_media_unavailable');
  if (response.headers.get('content-type')?.split(';')[0] !== 'image/webp')
    return fail('invalid_source_media');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > 4 * 1024 * 1024) return fail('invalid_source_media');
  if (!response.body) return fail('invalid_source_media');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      received += part.value.byteLength;
      if (received > 4 * 1024 * 1024) {
        await reader.cancel().catch(() => undefined);
        return fail('invalid_source_media');
      }
      chunks.push(Buffer.from(part.value));
    }
  } catch { return fail('ap_media_unavailable'); }
  const bytes = Buffer.concat(chunks, received);
  const normalized = await normalizeSiteImage(bytes);
  if (!normalized) return fail('invalid_source_media');
  const key = `${claim.organization_id}/${claim.id}.webp`;
  const db = await pool.connect();
  try {
    await db.query('begin');
    // 파일 쓰기 전 현재 업무/claim을 잠가 늦은 복사가 정리된 파일을 재생성하지 못하게 한다.
    const parent = (await db.query<{ retention_work_purged_at: Date | null }>(`select retention_work_purged_at from field.external_work_requests
      where id=$1 and organization_id=$2 for update`, [claim.external_request_id, claim.organization_id])).rows[0];
    const current = (await db.query<{ state: string; attempt_count: number }>('select state,attempt_count from field.external_request_attachments where id=$1 for update', [claim.id])).rows[0];
    if (!parent || parent.retention_work_purged_at || current?.state !== 'copying' || current.attempt_count !== claim.attempt_count) {
      await db.query('rollback'); return 'retry';
    }
    await media.put(key, normalized.data);
    const saved = await db.query(`update field.external_request_attachments
     set state = 'copied',object_key = $3,sha256 = $4,byte_size = $5,
       width = $6,height = $7,copied_at = now(),lease_until = null,error_code = null
     where id = $1 and attempt_count = $2 and state = 'copying'`,
  [claim.id, claim.attempt_count, key,
    createHash('sha256').update(normalized.data).digest('hex'), normalized.data.length,
    normalized.width, normalized.height]);
    await db.query('commit'); return saved.rowCount ? 'copied' : 'retry';
  } catch { await db.query('rollback'); return fail('media_unavailable'); }
  finally { db.release(); }
}
