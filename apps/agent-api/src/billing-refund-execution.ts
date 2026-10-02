import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { sealBilling,unsealBilling,type BillingContext } from './billing-context.js';
import { refundSelection,refundHash,refundEvent,refundOperatorsCurrent,type RefundPayment } from './billing-refund.js';
import type { BillingPayment,BillingCancellation } from './toss-billing.js';
async function pause(db:PoolClient,r:RefundPayment,code:string){
 const state=r.dispatched_at?'unknown':'blocked_integration';
 await db.query(`update ap.billing_refunds set state=$2,error_code=$3,claim_token=null,lease_expires_at=null,next_attempt_at=now()+interval '60 seconds' where id=$1`,[r.id,state,code]);
 if(r.state!==state||r.error_code!==code)await refundEvent(db,r,state,null,code);return state;
}
function configured(r:RefundPayment,billing?:BillingContext){
 const mode=['mock','sandbox'].includes(process.env.AP_PROFILE??'')?'test':'live';
 return billing&&billing.provider.refund&&billing.provider.mode===r.mode&&r.mode===mode&&billing.provider.mid===r.provider_mid
  &&(process.env.NODE_ENV!=='production'||process.env.AP_PROFILE==='live')?billing:null;
}
async function claim(pool:Pool,billing:BillingContext|undefined,now:Date){
 const candidates=(await pool.query<{id:string;organization_id:string}>(`select id,organization_id from ap.billing_refunds
 where state in ('pending','blocked_integration','unknown','processing') and next_attempt_at<=$1
 and (lease_expires_at is null or lease_expires_at<=$1) order by next_attempt_at,id limit 20`,[now])).rows;
 for(const candidate of candidates){const db=await pool.connect();try{
 await db.query('begin');if(!(await db.query('select id from ap.organizations where id=$1 for update skip locked',[candidate.organization_id])).rowCount){await db.query('rollback');continue;}
 const r=(await db.query<RefundPayment>(`${refundSelection} where r.id=$1 and r.state in ('pending','blocked_integration','unknown','processing') and r.next_attempt_at<=$2
 and (r.lease_expires_at is null or r.lease_expires_at<=$2) for update of p,t,r skip locked`,[candidate.id,now])).rows[0];
 if(!r){await db.query('rollback');continue;}
 const context=configured(r,billing);let paymentKey:string|null=null;
 if(context)try{paymentKey=unsealBilling(r.payment_key_ciphertext??r.original_payment_ciphertext,context.credentialKey,r.payment_key_ciphertext?`refund-payment:${r.id}`:`payment:${r.transaction_id}`);}catch{ /* bound cipher only */ }
 if(!context||!paymentKey||paymentKey.length>200||!r.dispatched_at&&(r.provider_key_fingerprint!==context.provider.keyFingerprint||!await refundOperatorsCurrent(db,r))){
 const state=await pause(db,r,'refund_configuration_or_authority_required');await db.query('commit');return state;}
 if(r.original_state!=='succeeded'||r.tax_free_amount===null||r.original_tax_free_amount===null||r.amount>r.total_amount-r.refunded_amount){const state=await pause(db,r,'refund_original_payment_reconciliation_required');await db.query('commit');return state;}
 const token=randomUUID();const row=(await db.query<RefundPayment>(`update ap.billing_refunds set state='processing',claim_token=$2,lease_expires_at=$3,
 started_at=coalesce(started_at,$4),payment_key_ciphertext=coalesce(payment_key_ciphertext,$5) where id=$1 returning *`,
 [r.id,token,new Date(now.getTime()+180000),now,sealBilling(paymentKey,context.credentialKey,`refund-payment:${r.id}`)])).rows[0]!;
 await db.query('commit');return {row:{...r,...row},token,context,paymentKey};
 }catch(error){await db.query('rollback');throw error;}finally{db.release();}}
 return 'empty';
}
function paymentBound(p:BillingPayment,r:RefundPayment,paymentKey:string,now:Date){
 return p.paymentKey===paymentKey&&p.orderId===r.order_id&&p.totalAmount===r.total_amount&&['DONE','PARTIAL_CANCELED','CANCELED'].includes(p.status)
 &&p.approvedAt!==null&&Date.parse(p.approvedAt)===r.paid_at.getTime()&&p.balanceAmount>=0&&p.balanceAmount<=r.total_amount
 &&p.taxFreeAmount>=0&&p.taxFreeAmount<=p.balanceAmount&&p.vat===Math.round((p.balanceAmount-p.taxFreeAmount)/11)
 &&p.suppliedAmount+p.vat+p.taxFreeAmount===p.balanceAmount&&Array.isArray(p.cancels)
 &&new Set(p.cancels.map(c=>c.transactionKey)).size===p.cancels.length
 &&p.cancels.every(c=>c.cancelStatus==='DONE'&&c.cancelAmount>0&&c.taxFreeAmount>=0&&c.taxFreeAmount<=c.cancelAmount
 &&Date.parse(c.canceledAt)>=r.paid_at.getTime()-60000&&Date.parse(c.canceledAt)<=now.getTime()+300000)
 &&p.cancels.reduce((n,c)=>n+c.cancelAmount,0)===r.total_amount-p.balanceAmount
 &&p.cancels.reduce((n,c)=>n+c.taxFreeAmount,0)===r.original_tax_free_amount!-p.taxFreeAmount
 &&(p.balanceAmount===r.total_amount?p.status==='DONE':p.balanceAmount===0?p.status==='CANCELED':p.status==='PARTIAL_CANCELED');
}
async function knownRefunds(db:PoolClient,r:RefundPayment){return (await db.query<{provider_transaction_hash:string;amount:number;tax_free_amount:number;cancel_reason:string;provider_canceled_at:Date}>(
 "select provider_transaction_hash,amount,tax_free_amount,cancel_reason,provider_canceled_at from ap.billing_refunds where transaction_id=$1 and state='succeeded' order by id",[r.transaction_id])).rows;}
async function baseline(db:PoolClient,p:BillingPayment,r:RefundPayment,paymentKey:string,now:Date){
 if(!paymentBound(p,r,paymentKey,now)||r.amount>p.balanceAmount||r.tax_free_amount!>p.taxFreeAmount||r.amount-r.tax_free_amount!>p.balanceAmount-p.taxFreeAmount
 ||r.amount<p.balanceAmount&&p.isPartialCancelable!==true)return false;
 const known=await knownRefunds(db,r);
 return known.length===p.cancels!.length&&known.reduce((n,c)=>n+c.amount,0)===r.refunded_amount&&known.every(k=>p.cancels!.some(c=>refundHash(c.transactionKey)===k.provider_transaction_hash
 &&c.cancelAmount===k.amount&&c.taxFreeAmount===k.tax_free_amount&&c.cancelReason===k.cancel_reason&&Date.parse(c.canceledAt)===k.provider_canceled_at.getTime()));
}
async function confirmed(db:PoolClient,p:BillingPayment|null,r:RefundPayment,paymentKey:string,now:Date):Promise<BillingCancellation|null>{
 if(!p||!r.dispatched_at||!r.baseline_keys||r.baseline_amount===null||r.baseline_tax_free_amount===null||!paymentBound(p,r,paymentKey,now))return null;
 const candidates=p.cancels!.filter(c=>!r.baseline_keys!.includes(refundHash(c.transactionKey))&&c.cancelReason===r.cancel_reason&&c.cancelAmount===r.amount
 &&c.taxFreeAmount===r.tax_free_amount&&Date.parse(c.canceledAt)>=r.dispatched_at!.getTime()-60000);
 if(candidates.length!==1)return null;const candidate=candidates[0]!;
 const known=await knownRefunds(db,r);
 if(known.length!==r.baseline_keys.length||known.reduce((n,c)=>n+c.amount,0)!==r.baseline_amount
 ||known.reduce((n,c)=>n+c.tax_free_amount,0)!==r.baseline_tax_free_amount||known.some(k=>!r.baseline_keys!.includes(k.provider_transaction_hash)
 ||!p.cancels!.some(c=>refundHash(c.transactionKey)===k.provider_transaction_hash&&c.cancelAmount===k.amount&&c.taxFreeAmount===k.tax_free_amount&&c.cancelReason===k.cancel_reason&&Date.parse(c.canceledAt)===k.provider_canceled_at.getTime()))
 ||p.cancels!.length!==r.baseline_keys.length+1||p.balanceAmount!==r.total_amount-r.baseline_amount-r.amount
 ||p.taxFreeAmount!==r.original_tax_free_amount!-r.baseline_tax_free_amount-r.tax_free_amount!||candidate.refundableAmount!==p.balanceAmount
 ||r.refunded_amount!==r.baseline_amount)return null;
 if((await db.query('select 1 from ap.billing_refunds where provider_transaction_hash=$1',[refundHash(candidate.transactionKey)])).rowCount)return null;
 return candidate;
}
export async function runBillingRefundOnce(input:{pool:Pool;billing?:BillingContext;now?:Date}):Promise<string>{
 const began=Date.now(),now=input.now??(await input.pool.query<{now:Date}>('select clock_timestamp() as now')).rows[0]!.now,
  clock=()=>new Date(now.getTime()+Date.now()-began);
 const claimed=await claim(input.pool,input.billing,now);if(typeof claimed==='string')return claimed;
 const {token,context,paymentKey}=claimed;let row=claimed.row,payment:BillingPayment|null=null,code='refund_provider_result_unknown';
 const gate=await input.pool.connect(),gateKey=`ap-refund-send:${row.transaction_id}`;let reusable=true;
 try{
 await gate.query('select pg_advisory_lock(hashtextextended($1,0))',[gateKey]);
 const current=(await gate.query<RefundPayment>(`${refundSelection} where r.id=$1 and r.state='processing' and r.claim_token=$2`,[row.id,token])).rows[0];
 if(!current)return 'superseded';row=current;
 try{
 payment=await context.provider.lookup(row.order_id);
 if(!row.dispatched_at){
 await gate.query('begin');await gate.query('select id from ap.organizations where id=$1 for update',[row.organization_id]);
 const fresh=(await gate.query<RefundPayment>(`${refundSelection} where r.id=$1 and r.state='processing' and r.claim_token=$2 for update of p,t,r`,[row.id,token])).rows[0];
 if(!fresh){await gate.query('rollback');return 'superseded';}row=fresh;
 if(!await refundOperatorsCurrent(gate,row)||row.provider_key_fingerprint!==context.provider.keyFingerprint){const state=await pause(gate,row,'refund_configuration_or_authority_required');await gate.query('commit');return state;}
 if(!payment||!await baseline(gate,payment,row,paymentKey,clock())){const state=await pause(gate,row,'refund_original_payment_reconciliation_required');await gate.query('commit');return state;}
 const dispatched=clock();await gate.query(`update ap.billing_refunds set dispatched_at=$3,baseline_keys=$4::jsonb,baseline_amount=$5,baseline_tax_free_amount=$6 where id=$1 and claim_token=$2`,
 [row.id,token,dispatched,JSON.stringify(payment.cancels!.map(c=>refundHash(c.transactionKey))),row.refunded_amount,row.original_tax_free_amount!-payment.taxFreeAmount]);
 row={...row,dispatched_at:dispatched,baseline_keys:payment.cancels!.map(c=>refundHash(c.transactionKey)),baseline_amount:row.refunded_amount,baseline_tax_free_amount:row.original_tax_free_amount!-payment.taxFreeAmount};
 await gate.query('commit');payment=null;
 payment=await context.provider.refund!({paymentKey,orderId:row.order_id,amount:row.amount,taxFreeAmount:row.tax_free_amount!,reason:row.cancel_reason,requestKey:row.request_key});
 }
 }catch{await gate.query('rollback').catch(()=>undefined);payment=null; /* unknown financial result: GET only on subsequent claims */ }
 }finally{try{await gate.query('select pg_advisory_unlock(hashtextextended($1,0))',[gateKey]);}catch{reusable=false;}gate.release(!reusable);}
 const db=await input.pool.connect();try{
 await db.query('begin');await db.query('select id from ap.organizations where id=$1 for update',[row.organization_id]);
 const current=(await db.query<RefundPayment>(`${refundSelection} where r.id=$1 and r.state='processing' and r.claim_token=$2 for update of p,t,r`,[row.id,token])).rows[0];
 if(!current){await db.query('rollback');return 'superseded';}
 const proof=await confirmed(db,payment,current,paymentKey,clock());
 if(!proof){if(payment)code='refund_proof_requires_reconciliation';const state=await pause(db,current,code);await db.query('commit');return state;}
 await db.query(`update ap.billing_refunds set state='succeeded',provider_transaction_hash=$2,provider_transaction_ciphertext=$3,provider_canceled_at=$4,
 completed_at=now(),claim_token=null,lease_expires_at=null,error_code=null where id=$1`,[row.id,refundHash(proof.transactionKey),sealBilling(proof.transactionKey,context.credentialKey,`refund-provider:${row.id}`),new Date(proof.canceledAt)]);
 await db.query(`update ap.billing_periods set refunded_amount=refunded_amount+$2,state=case when refunded_amount+$2=total_amount then 'refunded' else 'paid' end where id=$1`,[row.period_id,row.amount]);
 // 마지막 기간이 전액 환불되면 접근·갱신이 모두 멈춘 active 상태로 남기지 않고 구독을 종료한다(재가입 허용, 원장·이벤트는 보존).
 const ended=await db.query(`update ap.paid_subscriptions s set state='ended',terminated_at=now()
 where s.id=$1 and s.terminated_at is null and s.cancel_requested_at is null
 and exists(select 1 from ap.billing_periods p where p.id=$2 and p.state='refunded'
  and not exists(select 1 from ap.billing_periods n where n.subscription_id=s.id and n.billing_period>p.billing_period)) returning s.plan_id`,[row.subscription_id,row.period_id]);
 if(ended.rowCount)await db.query(`insert into ap.billing_events(organization_id,subscription_id,plan_id,event_type,payload)
 values($1,$2,$3,'subscription_ended_by_full_refund',$4::jsonb)`,[row.organization_id,row.subscription_id,ended.rows[0].plan_id,JSON.stringify({refundId:row.id,periodId:row.period_id})]);
 await refundEvent(db,current,'succeeded');await db.query('commit');return 'succeeded';
 }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}
