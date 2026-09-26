import type { Pool, PoolClient } from 'pg';

export type RetentionKind = 'inquiry' | 'reservation' | 'external_request';
export const RETENTION_TABLES = { inquiry: 'field.inquiries', reservation: 'field.reservations', external_request: 'field.external_work_requests' };
export type RetentionPolicy = { id: string; work_days: number; photo_days: number; reference: string; reason: string;
  requested_by: string; request_hash: string; created_at: Date; approved_by: string | null; approved_at: Date | null;
  approval_reason: string | null; retired_at: Date | null };
export type RetentionWork = { target_kind: RetentionKind; target_id: string; organization_id: string; state: string;
  revision: number; closed_at: Date | null; activity_at: Date | null; future_at: Date | null; pending: boolean; created_at: Date; cursor_at: string };

// 이 조회는 Field 원장의 메타데이터만 읽는다. AP 원문/접속이나 개인정보를 포함하지 않는다.
export const RETENTION_WORK_QUERY = `
  select 'inquiry'::text as target_kind,i.id as target_id,i.organization_id,i.state,i.revision,i.retention_closed_at as closed_at,
    greatest((select max(m.created_at) from field.inquiry_messages m where m.inquiry_id=i.id),
      (select max(a.created_at) from field.inquiry_attachments a where a.inquiry_id=i.id)) as activity_at,
    null::timestamptz as future_at,
    exists(select 1 from field.inquiry_messages m where m.inquiry_id=i.id and m.sender='owner' and m.delivery_state in ('pending','unknown')) as pending,i.created_at
  from field.inquiries i where i.organization_id=$1
  union all
  select 'reservation',r.id,r.organization_id,r.state,r.revision,r.retention_closed_at,
    greatest((select max(m.created_at) from field.reservation_messages m where m.reservation_id=r.id),
      (select max(a.created_at) from field.reservation_attachments a where a.reservation_id=r.id)),
    greatest(r.requested_start_at,r.confirmed_end_at,r.proposal_end_at,
      (select max(upper(o.occupied)) from field.occupancies o where o.reservation_id=r.id)),
    exists(select 1 from field.outbox o where o.aggregate_id=r.id::text and o.organization_id=r.organization_id
      and o.payload->>'notification' in ('pending','unknown') and o.delivered_at is null),r.created_at
  from field.reservations r where r.organization_id=$1
  union all
  select 'external_request',e.id,e.organization_id,
    case when e.reservation_id is null then e.field_work_state else r.state end,
    case when e.reservation_id is null then e.field_work_revision else r.revision end,
    case when e.reservation_id is null then e.retention_closed_at else r.retention_closed_at end,
    greatest(e.received_at,(select max(a.created_at) from field.external_request_attachments a where a.external_request_id=e.id),
      (select max(m.created_at) from field.reservation_messages m where m.reservation_id=e.reservation_id),
      (select max(a.created_at) from field.reservation_attachments a where a.reservation_id=e.reservation_id)),
    greatest(r.requested_start_at,r.confirmed_end_at,r.proposal_end_at,
      (select max(upper(o.occupied)) from field.occupancies o where o.reservation_id=r.id)),
    exists(select 1 from field.external_request_attachments a where a.external_request_id=e.id and a.state<>'copied')
      or exists(select 1 from field.ap_reply_drafts d where d.external_request_id=e.id and d.state<>'accepted')
      or exists(select 1 from field.outbox o where o.aggregate_id=r.id::text and o.organization_id=e.organization_id
        and o.payload->>'notification' in ('pending','unknown') and o.delivered_at is null),e.received_at
  from field.external_work_requests e left join field.reservations r on r.id=e.reservation_id and r.organization_id=e.organization_id
  where e.organization_id=$1`;

export async function previewRetention(db: Pool | PoolClient, organizationId: string, policyId: string, before?: string) {
  const policy = (await db.query<RetentionPolicy>('select * from field.work_retention_policies where id=$1', [policyId])).rows[0];
  const now = (await db.query<{ now: Date }>('select clock_timestamp() as now')).rows[0]!.now;
  const cursor = before ? JSON.parse(Buffer.from(before, 'base64url').toString()) as { kind: string; id: string; at: string } : null;
  const rows = (await db.query<RetentionWork>(`with work as (${RETENTION_WORK_QUERY}) select *,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at from work
    where $2::timestamptz is null or (created_at,target_kind,target_id)<($2::timestamptz,$3::text,$4::uuid)
    order by created_at desc,target_kind desc,target_id desc limit 101`,
  [organizationId, cursor?.at ?? null, cursor?.kind ?? null, cursor?.id ?? null])).rows;
  const items = [];
  for (const row of rows.slice(0, 100)) {
    // 수신 예약과 원본 예약의 보류·지원 승인도 양방향으로 확인한다.
    const protection = (await db.query<{ held: boolean; supported: boolean }>(`with related as (
      select $2::text as kind,$3::uuid as id union
      select 'reservation',reservation_id from field.external_work_requests where id=$3 and $2='external_request' and reservation_id is not null union
      select 'external_request',id from field.external_work_requests where reservation_id=$3 and $2='reservation'
    ) select exists(select 1 from field.work_retention_holds h join related r on r.kind=h.target_kind and r.id=h.target_id
      where h.organization_id=$1 and h.released_at is null) as held,
      exists(select 1 from field.customer_support_access_requests a join related r on r.kind=a.target_kind and r.id=a.target_id
        where a.organization_id=$1 and a.revoked_at is null and a.expires_at>$4
          and exists(select 1 from field.platform_admin_memberships m where m.user_id=a.requested_by and m.role='operator')
          and exists(select 1 from field.platform_admin_memberships m where m.user_id=a.approved_by and m.role='operator')) as supported`,
    [organizationId, row.target_kind, row.target_id, now])).rows[0]!;
    const anchor = row.closed_at ? new Date(Math.max(row.closed_at.getTime(), row.activity_at?.getTime() ?? 0)) : null;
    const workDueAt = anchor && policy ? new Date(anchor.getTime() + policy.work_days * 86400000) : null;
    const photoDueAt = anchor && policy ? new Date(anchor.getTime() + policy.photo_days * 86400000) : null;
    const reason = !policy?.approved_at || policy.retired_at ? 'policy_not_approved'
      : !['closed','completed','canceled','rejected','expired','no_show'].includes(row.state) ? 'active_work'
        : !row.closed_at ? 'unknown_closure' : row.future_at && row.future_at > now ? 'future_schedule'
          : protection.held ? 'active_hold' : row.pending ? 'pending_delivery' : protection.supported ? 'active_support'
            : photoDueAt! <= now || workDueAt! <= now ? 'due' : 'not_due';
    items.push({ targetKind: row.target_kind, targetId: row.target_id, organizationId, state: row.state, revision: row.revision,
      closedAt: row.closed_at, activityAt: row.activity_at, anchorAt: anchor, workDueAt, photoDueAt, reason,
      workDue: reason === 'due' && workDueAt! <= now, photosDue: reason === 'due' && photoDueAt! <= now });
  }
  const last = rows[99];
  return { snapshotAt: now, policyId, execution: 'preview_only', items,
    nextCursor: rows.length > 100 && last ? Buffer.from(JSON.stringify({ org: organizationId, policy: policyId,
      kind: last.target_kind, id: last.target_id, at: last.cursor_at })).toString('base64url') : null };
}
