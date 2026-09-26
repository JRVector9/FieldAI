import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { subscriptionAccess } from './subscription-access.js';
type Db=Pool|PoolClient;
export class AiEntitlementError extends Error { constructor(readonly code:'ai_included_units_exhausted'|'ai_access_ended'|'ai_dispatch_already_started'){super(code);} }
export async function aiEntitlement(db:Db,organizationId:string,at?:Date){
 const access=await subscriptionAccess(db,organizationId,at);
 let periodId:string|null=('periodId' in access?access.periodId:null)??null;
 if(access.mode==='grace')periodId=(await db.query<{id:string}>(`select p.id from ap.billing_periods p join ap.paid_subscriptions s on s.id=p.subscription_id
 where s.id=$1 and s.organization_id=$2 and p.state='paid' and p.paid_at is not null and p.refunded_amount<p.total_amount order by p.ends_at desc,p.id desc limit 1`,[access.subscriptionId,organizationId])).rows[0]?.id??null;
 const row=periodId?(await db.query<{included_ai_units:number;consumed:string;reserved:string;unknown:string}>(`select p.included_ai_units,
 count(l.run_id) filter(where l.state='consumed')::text consumed,count(l.run_id) filter(where l.state in('reserved','dispatched'))::text reserved,
 count(l.run_id) filter(where l.state='unknown')::text unknown from ap.billing_periods p left join ap.ai_usage_ledger l on l.period_id=p.id where p.id=$1 group by p.id`,[periodId])).rows[0]:undefined;
 const consumedUnits=Number(row?.consumed??0),reservedUnits=Number(row?.reserved??0),unknownUnits=Number(row?.unknown??0),includedUnits=row?.included_ai_units??null;
 return {access,periodId,customer:{includedUnits,consumedUnits,reservedUnits,unknownUnits,remainingUnits:includedUnits===null?null:Math.max(0,includedUnits-consumedUnits-reservedUnits-unknownUnits)}};
}
export async function reserveAi(client:PoolClient,runId:string){
 const r=(await client.query<{organization_id:string;kind:string;provider_model:string}>('select organization_id,kind,provider_model from ap.ai_runs where id=$1',[runId])).rows[0]!;
 await client.query('select id from ap.organizations where id=$1 for update',[r.organization_id]);
 const entitlement=await aiEntitlement(client,r.organization_id);
 if(!entitlement.access.canStartNew)throw new AiEntitlementError('ai_access_ended');
 const paid=r.kind==='customer_message'&&['paid','grace'].includes(entitlement.access.mode);
 if(paid&&(!entitlement.periodId||!entitlement.customer.remainingUnits))throw new AiEntitlementError('ai_included_units_exhausted');
 await client.query(`insert into ap.ai_usage_ledger(run_id,organization_id,lane,period_id,included_units,state,provider_model) values($1,$2,$3,$4,$5,'reserved',$6)`,[runId,r.organization_id,r.kind,paid?entitlement.periodId:null,paid?entitlement.customer.includedUnits:null,r.provider_model]);
}
export async function dispatchAi(client:PoolClient,runId:string){
 const run=(await client.query<{organization_id:string}>('select organization_id from ap.ai_runs where id=$1',[runId])).rows[0]!;
 await client.query('select id from ap.organizations where id=$1 for update',[run.organization_id]);
 const ledger=(await client.query<{state:string;period_id:string|null;lane:string}>('select state,period_id,lane from ap.ai_usage_ledger where run_id=$1 for update',[runId])).rows[0];
 if(!ledger)throw Error('ai_usage_reservation_missing');
 if(ledger.state!=='reserved')throw new AiEntitlementError('ai_dispatch_already_started');
 const now=await aiEntitlement(client,run.organization_id);
 if(!now.access.canStartNew||(ledger.period_id&&ledger.period_id!==now.periodId)||(ledger.lane==='customer_message'&&!ledger.period_id&&['paid','grace'].includes(now.access.mode)))throw new AiEntitlementError('ai_access_ended');
 await client.query("update ap.ai_usage_ledger set state='dispatched',dispatched_at=clock_timestamp() where run_id=$1",[runId]);
}
export function validAiReceipt(value:{responseId:unknown;inputTokens:unknown;outputTokens:unknown}){
 const token=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=2147483647;
 return typeof value.responseId==='string'&&value.responseId.trim().length>0&&value.responseId.length<=200&&token(value.inputTokens)&&token(value.outputTokens);
}
async function mutate(pool:Pool,runId:string,fn:(client:PoolClient)=>Promise<void>){const client=await pool.connect();try{await client.query('begin');const row=(await client.query('select organization_id from ap.ai_usage_ledger where run_id=$1',[runId])).rows[0];if(!row)throw Error('ai_usage_reservation_missing');await client.query('select id from ap.organizations where id=$1 for update',[row.organization_id]);await fn(client);await client.query('commit');}catch(error){await client.query('rollback');throw error;}finally{client.release();}}
export async function settleAi(pool:Pool,runId:string,receipt:{responseId:unknown;inputTokens:unknown;outputTokens:unknown}){
 await mutate(pool,runId,async client=>{
  const row=(await client.query('select * from ap.ai_usage_ledger where run_id=$1 for update',[runId])).rows[0]!;
  if(!validAiReceipt(receipt)){if(row.state==='dispatched')await client.query("update ap.ai_usage_ledger set state='unknown',settled_at=clock_timestamp() where run_id=$1",[runId]);return;}
  const hash=createHash('sha256').update(receipt.responseId as string).digest('hex');
  if(row.state==='consumed'){if(row.response_hash!==hash||row.input_tokens!==receipt.inputTokens||row.output_tokens!==receipt.outputTokens)throw Error('ai_receipt_conflict');return;}
  if(!['dispatched','unknown'].includes(row.state))throw Error('ai_receipt_without_dispatch');
  await client.query("update ap.ai_usage_ledger set state='consumed',response_hash=$2,input_tokens=$3,output_tokens=$4,settled_at=clock_timestamp() where run_id=$1",[runId,hash,receipt.inputTokens,receipt.outputTokens]);
 });
}
export async function failAi(pool:Pool,runId:string,error:unknown){
 const definitive=error instanceof Error&&/^provider_http_(400|401|403|404|422|429)$/.test(error.message);
 let unknown=false;
 await mutate(pool,runId,async client=>{const row=(await client.query('select state,period_id from ap.ai_usage_ledger where run_id=$1 for update',[runId])).rows[0]!;
  if(row.state==='reserved'||(row.state==='dispatched'&&definitive))await client.query("update ap.ai_usage_ledger set state='released',settled_at=clock_timestamp() where run_id=$1",[runId]);
  else if(row.state==='dispatched')await client.query("update ap.ai_usage_ledger set state='unknown',settled_at=clock_timestamp() where run_id=$1",[runId]);
  unknown=!!row.period_id&&!definitive&&row.state!=='reserved';
 });return unknown;
}
