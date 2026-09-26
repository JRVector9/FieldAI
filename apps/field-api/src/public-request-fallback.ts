import type { PoolClient } from 'pg';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type FallbackInput = { origin: 'ap_customer_reported'; actionRequestId?: string };
export type FallbackRow = {
  fallback_origin: 'ap_customer_reported' | null;
  fallback_action_request_id: string | null;
  fallback_declared_at: Date | null;
};

// 선언은 고객 제공 정보다. AP 장애·접수·고객 신원을 확인한 것으로 취급하지 않는다.
export function parseRequestFallback(value: unknown): FallbackInput | null | undefined {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  if (body.origin !== 'ap_customer_reported'
      || Object.keys(body).some(key => key !== 'origin' && key !== 'actionRequestId')
      || (body.actionRequestId !== undefined
        && (typeof body.actionRequestId !== 'string' || !uuid.test(body.actionRequestId)))) return undefined;
  return { origin: 'ap_customer_reported', ...(typeof body.actionRequestId === 'string'
    ? { actionRequestId: body.actionRequestId.toLowerCase() } : {}) };
}

export function requestFallback(row: FallbackRow) {
  return row.fallback_origin ? { origin: row.fallback_origin,
    actionRequestId: row.fallback_action_request_id, declaredAt: row.fallback_declared_at?.toISOString() ?? null } : null;
}

// Field가 이미 받은 자기 조직 snapshot만 대조한다. AP DB·원문 접근을 만들지 않는다.
export async function reviewRequestFallback(db: Pick<PoolClient, 'query'>, organizationId: string, row: FallbackRow) {
  if (!row.fallback_origin || !row.fallback_action_request_id) return { candidates: [], hasMore: false };
  const result = await db.query<{ id: string; kind: string; reservation_id: string | null;
    status: string; service_name: string; received_at: Date }>(
    `select e.id,e.kind,e.reservation_id,coalesce(r.state,e.status) as status,
       e.service_snapshot->>'name' as service_name,e.received_at
     from field.external_work_requests e
     left join field.reservations r on r.id=e.reservation_id and r.organization_id=e.organization_id
     where e.organization_id=$1 and e.action_request_id=$2 and not e.is_test
     order by e.received_at desc,e.id desc limit 101`,
    [organizationId, row.fallback_action_request_id]);
  return { candidates: result.rows.slice(0, 100).map(item => ({ externalRequestId: item.id,
    kind: item.kind, reservationId: item.reservation_id, state: item.status,
    serviceName: item.service_name, receivedAt: item.received_at.toISOString() })),
    hasMore: result.rows.length > 100 };
}
