import type { PoolClient } from 'pg';

// Both runtime closure and offline replay need original-business reconciliation.
export async function routeKeyReconciliationReason(db:PoolClient,connectionId:string) {
  const ack=(await db.query(`select
    (exists(select 1 from field.ap_connection_revocations where connection_id=$1 and state='acked')
      or exists(select 1 from field.ap_received_connection_revocations where connection_id=$1))
    and not exists(select 1 from field.ap_connection_revocations where connection_id=$1 and state<>'acked') as ready`,[connectionId])).rows[0].ready;
  if(!ack)return 'remote_revoke_unacknowledged';
  else if((await db.query(`select 1 from field.ap_event_deliveries where connection_id=$1 and state in ('pending','sending','retry')
    union all select 1 from field.facts_change_deliveries where connection_id=$1 and state in ('pending','sending','retry') limit 1`,[connectionId])).rowCount)return 'delivery_reconciliation_pending';
  else {
    // Lock current route rows until the metadata-only terminal fence is committed.
    await db.query('select reservation_id from field.external_reservation_notification_routes where connection_id=$1 for share',[connectionId]);
    const unresolved=await db.query(`select 1 from field.external_work_requests w
      left join field.external_reservation_notification_routes n on n.reservation_id=w.reservation_id and n.connection_id=w.connection_id
      where w.connection_id=$1 and w.kind='reservation_request'
        and (n.reservation_id is null or n.route_generation<>2 or n.ap_closed_revision is null or n.ap_closed_event_id is null
          or n.pending_transfer_id is not null) limit 1`,[connectionId]);
    if(unresolved.rowCount)return 'original_routes_unreconciled';
  }
  return null;
}
