import { routeKeyReconciliationReason } from './ap-route-key-reconciliation.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { fingerprint, lifecycleJournalFromEnvironment, recordLifecycle, type LifecycleJournal } from './oauth-lifecycle-journal.js';
import { applyLifecycleEntry } from './oauth-lifecycle-restore.js';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
type Close={id:string;connection_id:string;organization_id:string;actor_user_id:string;key_id:string;state:string;last_reason:string};
export async function finalizeApRouteKeyRequest(pool:Pool,journal:LifecycleJournal|undefined,id:string) {
  const db=await pool.connect();try{
    await db.query('begin');
    const snapshot=(await db.query<Close>('select * from field.ap_route_key_close_requests where id=$1',[id])).rows[0];
    if(!snapshot){await db.query('rollback');return null;}
    // The owner API locks connection then request. Use the same order for workers.
    const source=(await db.query<{status:string;event_key_id:string;event_secret_cipher:Buffer|null;route_key_closed_at:Date|null}>(
      'select status,event_key_id,event_secret_cipher,route_key_closed_at from field.ap_connections where id=$1 and organization_id=$2 for update',[snapshot.connection_id,snapshot.organization_id])).rows[0];
    const request=(await db.query<Close>('select * from field.ap_route_key_close_requests where id=$1 for update',[id])).rows[0];
    if(!request){await db.query('rollback');return null;}
    if(request.connection_id!==snapshot.connection_id||request.organization_id!==snapshot.organization_id||request.key_id!==snapshot.key_id)throw new Error('route key intent binding changed');
    if(request.state!=='pending'){await db.query('commit');return {closeId:id,state:request.state,reason:request.last_reason};}
    let reason:string|null=null;
    if(!source||source.status!=='revoked'||source.event_key_id!==request.key_id)reason='connection_snapshot_changed';
    else if(!(await db.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role='owner' for share",[request.organization_id,request.actor_user_id])).rowCount)reason='owner_permission_changed';
    else if(!source.route_key_closed_at){
      reason=await routeKeyReconciliationReason(db,request.connection_id);
    }
    if(reason){await db.query('update field.ap_route_key_close_requests set last_reason=$2 where id=$1',[id,reason]);await db.query('commit');return {closeId:id,state:'pending',reason};}
    if(!source!.route_key_closed_at){
      const [entry]=await recordLifecycle(pool,journal,[{kind:'route-key',targetKey:fingerprint(`route:${request.connection_id}:${request.key_id}`),
        clientId:null,userId:null,referenceId:null,codeId:null,tokenId:null,tokenType:null,tokenFingerprint:null,
        connectionId:request.connection_id,organizationId:request.organization_id,keyId:request.key_id}]);
      await applyLifecycleEntry(db,entry!);
    }
    await db.query("update field.ap_route_key_close_requests set state='closed',last_reason='reconciled',closed_at=coalesce(closed_at,now()) where id=$1",[id]);
    await db.query('commit');return {closeId:id,state:'closed',reason:'reconciled'};
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}
export async function finalizeApRouteKeyRequestsOnce(pool:Pool,journal:LifecycleJournal|undefined) {
  const pending=await pool.query<{id:string}>("select id from field.ap_route_key_close_requests where state='pending' order by requested_at limit 20");
  let closed=0;for(const row of pending.rows)if((await finalizeApRouteKeyRequest(pool,journal,row.id))?.state==='closed')closed++;
  return closed;
}
export function registerApRouteKeyLifecycleRoutes(app:FastifyInstance,runtime:FieldBusinessRuntime,journal=lifecycleJournalFromEnvironment()) {
  const path='/v1/connections/ap/:id/route-key';
  app.get<{Params:{id:string}}>(path,async(request,reply)=>{
    const actor=await runtime.resolveUserId(request.headers);if(!actor)return reply.code(401).send({error:'authentication_required'});
    if(!uuid.test(request.params.id))return reply.code(404).send({error:'connection_not_found'});
    const source=(await runtime.pool.query(`select c.route_key_closed_at,c.event_secret_cipher is not null as retained,r.id as close_id,r.state,r.last_reason
      from field.ap_connections c join field.memberships m on m.organization_id=c.organization_id and m.user_id=$2 and m.role='owner'
      left join lateral(select * from field.ap_route_key_close_requests where connection_id=c.id order by requested_at desc limit 1)r on true
      where c.id=$1`,[request.params.id,actor])).rows[0];
    if(!source)return reply.code(404).send({error:'connection_not_found'});
    return reply.header('Cache-Control','private, no-store').send({closeId:source.close_id??null,state:source.route_key_closed_at?'closed':source.state??'retained',reason:source.last_reason??'not_requested',keyRetained:source.retained});
  });
  app.post<{Params:{id:string}}>(`${path}/close`,async(request,reply)=>{
    const actor=await runtime.resolveUserId(request.headers);if(!actor)return reply.code(401).send({error:'authentication_required'});
    const origin=runtime.apConnector?.webOrigin??process.env.FIELD_PUBLIC_WEB_ORIGIN;
    if(!origin||request.headers.origin!==origin)return reply.code(403).send({error:'origin_not_allowed'});
    const value=request.body as Record<string,unknown>|undefined;
    if(!uuid.test(request.params.id)||!value||typeof value!=='object'||Array.isArray(value)||!uuid.test(String(value.closeId))||value.confirm!==true
      ||Object.keys(value).some(k=>!['closeId','confirm'].includes(k)))return reply.code(400).send({error:'invalid_route_key_close'});
    const db=await runtime.pool.connect();try{
      await db.query('begin');
      const source=(await db.query<{organization_id:string;event_key_id:string;status:string;route_key_closed_at:Date|null}>(`select c.organization_id,c.event_key_id,c.status,c.route_key_closed_at
        from field.ap_connections c join field.memberships m on m.organization_id=c.organization_id and m.user_id=$2 and m.role='owner' where c.id=$1 for update of c`,[request.params.id,actor])).rows[0];
      if(!source){await db.query('rollback');return reply.code(404).send({error:'connection_not_found'});}
      if(source.status!=='revoked'||!source.event_key_id){await db.query('rollback');return reply.code(409).send({error:'route_key_close_not_ready'});}
      const original=(await db.query<Close>('select * from field.ap_route_key_close_requests where id=$1',[value.closeId])).rows[0];
      if(original&&(original.connection_id!==request.params.id||original.actor_user_id!==actor||original.organization_id!==source.organization_id||original.key_id!==source.event_key_id)){
        await db.query('rollback');return reply.code(409).send({error:'close_id_conflict'});}
      if(!original){
        const prior=(await db.query<Close>("select * from field.ap_route_key_close_requests where connection_id=$1 and state='pending' for update",[request.params.id])).rows[0];
        if(prior){
          const currentOwner=(await db.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role='owner'",[prior.organization_id,prior.actor_user_id])).rowCount;
          if(currentOwner){await db.query('rollback');return reply.code(409).send({error:'route_key_close_in_progress',closeId:prior.id});}
          await db.query("update field.ap_route_key_close_requests set state='cancelled',last_reason='owner_permission_changed' where id=$1",[prior.id]);
        }
        await db.query('insert into field.ap_route_key_close_requests(id,connection_id,organization_id,actor_user_id,key_id) values($1,$2,$3,$4,$5)',[value.closeId,request.params.id,source.organization_id,actor,source.event_key_id]);
      }
      await db.query('commit');
    }catch(error){await db.query('rollback');throw error;}finally{db.release();}
    const result=await finalizeApRouteKeyRequest(runtime.pool,journal,String(value.closeId));
    return reply.header('Cache-Control','private, no-store').code(result?.state==='closed'?200:202).send(result);
  });
}
