import type { Pool, PoolClient } from 'pg';

export type RetentionKind = 'inquiry';
export const RETENTION_TABLES = { inquiry: 'ap.inquiries' };
export type RetentionPolicy = { id:string; anonymous_days:number; work_days:number; photo_days:number; reference:string; reason:string;
  requested_by:string; request_hash:string; created_at:Date; approved_by:string|null; approved_at:Date|null;
  approval_reason:string|null; retired_at:Date|null };
type RetentionWork = { target_id:string; organization_id:string; state:string; mode:string; revision:number; closed_at:Date|null;
  activity_at:Date; created_at:Date; cursor_at:string; anonymous:boolean; pending:boolean; external_pending:boolean;
  future_at:Date|null; held:boolean; supported:boolean };

// AP 자체 원장만 사용한다. 외부 업무 상태는 AP가 검증해 받은 사건이며 Field DB를 조회하지 않는다.
export const RETENTION_WORK_QUERY = `select i.id as target_id,i.organization_id,i.state,i.mode,i.revision,i.retention_closed_at as closed_at,i.created_at,
  greatest(i.created_at,(select max(m.created_at) from ap.inquiry_messages m where m.inquiry_id=i.id),
    (select max(a.created_at) from ap.inquiry_attachments a where a.inquiry_id=i.id),
    (select max(r.started_at) from ap.ai_runs r where r.inquiry_id=i.id),
    (select max(r.updated_at) from ap.field_action_requests r where r.inquiry_id=i.id)) as activity_at,
  i.consent_at is null and i.submitted_at is null and i.mode<>'human'
    and not exists(select 1 from ap.field_action_requests r where r.inquiry_id=i.id and r.state<>'rejected') as anonymous,
  exists(select 1 from ap.ai_runs r where r.inquiry_id=i.id and r.status='in_progress')
    or exists(select 1 from ap.inquiry_messages m where m.inquiry_id=i.id and m.actor='owner' and m.delivery_state in ('pending','unknown')) as pending,
  exists(select 1 from ap.field_action_requests r where r.inquiry_id=i.id and (r.state in ('sending','delivery_unknown')
    or (r.state='accepted_external' and (r.kind='inquiry' or coalesce((select e.state from ap.field_reservation_events e
      where e.action_request_id=r.id order by e.revision desc limit 1),'unknown') not in ('completed','canceled','rejected','expired','no_show'))))) as external_pending,
  (select max(greatest(e.start_at,e.end_at)) from ap.field_reservation_events e join ap.field_action_requests r on r.id=e.action_request_id where r.inquiry_id=i.id) as future_at,
  exists(select 1 from ap.work_retention_holds h where h.inquiry_id=i.id and h.released_at is null) as held,
  exists(select 1 from ap.customer_support_access_requests s where s.inquiry_id=i.id and s.revoked_at is null and s.expires_at>clock_timestamp()
    and exists(select 1 from ap.platform_admin_memberships m where m.user_id=s.requested_by and m.role='operator')
    and exists(select 1 from ap.platform_admin_memberships m where m.user_id=s.approved_by and m.role='operator')) as supported
  from ap.inquiries i where i.organization_id=$1`;

export async function previewRetention(db:Pool|PoolClient,organizationId:string,policyId:string,before?:string,
  only?:{kind:RetentionKind;id:string}) {
  const policy=(await db.query<RetentionPolicy>('select * from ap.work_retention_policies where id=$1',[policyId])).rows[0];
  const now=(await db.query<{now:Date}>('select clock_timestamp() as now')).rows[0]!.now;
  const cursor=before?JSON.parse(Buffer.from(before,'base64url').toString()) as {id:string;at:string}:null;
  const rows=(await db.query<RetentionWork>(`with work as (${RETENTION_WORK_QUERY}) select *,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at from work
    where ($2::timestamptz is null or (created_at,target_id)<($2::timestamptz,$3::uuid)) and ($4::uuid is null or target_id=$4)
    order by created_at desc,target_id desc limit 101`,[organizationId,cursor?.at??null,cursor?.id??null,only?.id??null])).rows;
  const items=rows.slice(0,100).map(row=>{
    const anchor=row.anonymous?row.activity_at:row.closed_at?new Date(Math.max(row.closed_at.getTime(),row.activity_at.getTime())):null;
    const workDueAt=anchor&&policy?new Date(anchor.getTime()+(row.anonymous?policy.anonymous_days:policy.work_days)*86400000):null;
    const photoDueAt=anchor&&policy?new Date(anchor.getTime()+(row.anonymous?policy.anonymous_days:policy.photo_days)*86400000):null;
    const reason=!policy?.approved_at||policy.retired_at?'policy_not_approved':row.external_pending?'external_work_unresolved'
      :!row.anonymous&&row.state!=='closed'?'active_work':!anchor?'unknown_closure':row.future_at&&row.future_at>now?'future_schedule'
        :row.held?'active_hold':row.pending?'pending_delivery':row.supported?'active_support'
          :workDueAt!<=now||photoDueAt!<=now?'due':'not_due';
    return {targetKind:'inquiry' as const,targetId:row.target_id,organizationId,classification:row.anonymous?'anonymous':'work',state:row.state,
      revision:row.revision,closedAt:row.closed_at,activityAt:row.activity_at,anchorAt:anchor,workDueAt,photoDueAt,reason,
      workDue:reason==='due'&&workDueAt!<=now,photosDue:reason==='due'&&photoDueAt!<=now};
  });
  const last=rows[99];
  return {snapshotAt:now,policyId,execution:'preview_only',items,nextCursor:rows.length>100&&last?
    Buffer.from(JSON.stringify({org:organizationId,policy:policyId,kind:'inquiry',id:last.target_id,at:last.cursor_at})).toString('base64url'):null};
}
