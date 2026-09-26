import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { sealBilling, unsealBilling, type BillingContext } from './billing-context.js';
import { periodAt } from './billing-period.js';
import type { BillingPayment } from './toss-billing.js';

type Charge = { id:string;period_id:string;subscription_id:string;organization_id:string;plan_id:string;created_by:string;
  order_id:string;request_key:string;order_name:string;customer_key:string;state:string;mode:string;provider_mid:string;
  provider_key_fingerprint:string|null;billing_key_ciphertext:string|null;credential_ciphertext:string|null;deleted_at:Date|null;
  total_amount:number;supply_amount:number;vat_amount:number;tax_free_amount:number|null;currency:string;
  started_at:Date|null;lease_expires_at:Date|null;error_code:string|null;cancel_requested_at:Date|null;terminated_at:Date|null;anchor_at:Date|null };
type Claimed={row:Charge;token:string;context:BillingContext;initial:boolean;billingKey:string|null};
const replayWindowMs=15*86400000-120000;
const fpValid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const selection=`select t.*,p.subscription_id,p.total_amount,p.supply_amount,p.vat_amount,p.tax_free_amount,p.currency,
  s.organization_id,s.plan_id,s.created_by,s.cancel_requested_at,s.terminated_at,s.anchor_at,
  c.billing_key_ciphertext as credential_ciphertext,c.deleted_at
  from field.billing_transactions t join field.billing_periods p on p.id=t.period_id
  join field.paid_subscriptions s on s.id=p.subscription_id left join field.billing_credentials c on c.subscription_id=s.id`;
async function event(db:PoolClient,row:Charge,state:string,code:string|null) {
  await db.query(`insert into field.billing_events(organization_id,subscription_id,plan_id,event_type,payload)
    values($1,$2,$3,$4,$5::jsonb)`,[row.organization_id,row.subscription_id,row.plan_id,`payment_${state}`,
    JSON.stringify({transactionId:row.id,orderId:row.order_id,errorCode:code})]);
}
async function pause(db:PoolClient,row:Charge,code:string) {
  const state=row.started_at?'unknown':'blocked_integration';
  await db.query(`update field.billing_transactions set state=$2,error_code=$3,claim_token=null,lease_expires_at=null,
    next_attempt_at=now()+interval '60 seconds' where id=$1`,[row.id,state,code]);
  if(row.state!==state||row.error_code!==code)await event(db,row,state,code);
  return state;
}

async function prepareFirstPeriod(pool:Pool) {
  const candidates=(await pool.query(`select s.id,s.organization_id from field.paid_subscriptions s
    join field.billing_authorizations a on a.subscription_id=s.id and a.state='completed'
    join field.billing_credentials c on c.subscription_id=s.id and c.billing_key_ciphertext is not null and c.deleted_at is null
    where s.anchor_at is null and s.state='awaiting_authorization' and s.cancel_requested_at is null and s.terminated_at is null
    and not exists(select 1 from field.billing_periods p where p.subscription_id=s.id and p.billing_period=0)
    order by s.created_at,s.id limit 20`)).rows;
  for(const candidate of candidates) {
    const db=await pool.connect();
    try {
      await db.query('begin');
      if(!(await db.query('select id from field.organizations where id=$1 for update skip locked',[candidate.organization_id])).rowCount){await db.query('rollback');continue;}
      const s=(await db.query(`select s.*,a.provider_mode,a.provider_mid,p.name,c.id as consent_id,
        c.total_amount,c.supply_amount,c.vat_amount,c.tax_free_amount,c.currency
        from field.paid_subscriptions s join field.billing_authorizations a on a.subscription_id=s.id and a.state='completed'
        join field.billing_credentials k on k.subscription_id=s.id and k.billing_key_ciphertext is not null and k.deleted_at is null
        join field.billing_consents c on c.subscription_id=s.id join field.billing_plans p on p.id=s.plan_id
        where s.id=$1 and s.anchor_at is null and s.state='awaiting_authorization' and s.cancel_requested_at is null and s.terminated_at is null
        and not exists(select 1 from field.billing_periods bp where bp.subscription_id=s.id and bp.billing_period=0) for update of s`,[candidate.id])).rows[0];
      if(!s){await db.query('rollback');continue;}
      const period=randomUUID(),transaction=randomUUID(),order=`field_${randomUUID().replaceAll('-','')}`;
      await db.query(`insert into field.billing_periods(id,subscription_id,billing_period,consent_id,plan_id,starts_at,ends_at,
        total_amount,supply_amount,vat_amount,tax_free_amount,currency)
        values($1,$2,0,$3,$4,null,null,$5,$6,$7,$8,$9)`,[period,s.id,s.consent_id,s.plan_id,s.total_amount,s.supply_amount,s.vat_amount,s.tax_free_amount,s.currency]);
      await db.query(`insert into field.billing_transactions(id,period_id,order_id,request_key,mode,provider_mid,customer_key,order_name)
        values($1,$2,$3,$4,$5,$6,$7,$8)`,[transaction,period,order,randomUUID(),s.provider_mode,s.provider_mid,s.customer_key,s.name]);
      await event(db,{...s,id:transaction,subscription_id:s.id,order_id:order},'pending',null);
      await db.query('commit');return;
    } catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
}

async function claim(pool:Pool,billing:BillingContext|undefined):Promise<Claimed|string> {
  const candidates=(await pool.query(`select t.id,s.organization_id from field.billing_transactions t
    join field.billing_periods p on p.id=t.period_id join field.paid_subscriptions s on s.id=p.subscription_id
    where p.billing_period=0 and t.state in ('pending','processing','unknown','blocked_integration') and t.next_attempt_at<=now()
    and(t.lease_expires_at is null or t.lease_expires_at<=now()) order by t.next_attempt_at,t.created_at,t.id limit 20`)).rows;
  for(const candidate of candidates) {
    const db=await pool.connect();
    try {
      await db.query('begin');
      if(!(await db.query('select id from field.organizations where id=$1 for update skip locked',[candidate.organization_id])).rowCount){await db.query('rollback');continue;}
      const row=(await db.query<Charge>(`${selection} where t.id=$1 and t.state in ('pending','processing','unknown','blocked_integration')
        and t.next_attempt_at<=now() and(t.lease_expires_at is null or t.lease_expires_at<=now()) for update of s,p,t`,[candidate.id])).rows[0];
      if(!row){await db.query('rollback');continue;}
      const initial=row.started_at===null;
      if(initial&&(row.cancel_requested_at||row.terminated_at)) {
        await db.query("update field.billing_transactions set state='canceled',claim_token=null,lease_expires_at=null where id=$1",[row.id]);
        await db.query("update field.billing_periods set state='canceled' where id=$1",[row.period_id]);
        await db.query("update field.paid_subscriptions set state='canceled',terminated_at=coalesce(terminated_at,now()) where id=$1",[row.subscription_id]);
        await event(db,row,'canceled',null);await db.query('commit');return 'canceled';
      }
      let code:string|null=null;
      if(row.tax_free_amount===null)code='billing_tax_policy_not_configured';
      else if(!billing)code='billing_provider_not_configured';
      else if(row.mode!==billing.provider.mode||row.provider_mid!==billing.provider.mid)code='billing_provider_binding_changed';
      else if(initial&&!fpValid(billing.provider.keyFingerprint))code='billing_provider_key_identity_unavailable';
      else if(initial&&!(await db.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role='owner' for share",
        [row.organization_id,row.created_by])).rowCount)code='billing_owner_changed';
      if(code){const state=await pause(db,row,code);await db.query('commit');return state;}
      let billingKey:string|null=null;
      try {
        if(initial) {
          if(!row.credential_ciphertext||row.deleted_at)throw new Error('credential_unavailable');
          billingKey=unsealBilling(row.credential_ciphertext,billing!.credentialKey,`credential:${row.subscription_id}`);
        } else if(row.billing_key_ciphertext)billingKey=unsealBilling(row.billing_key_ciphertext,billing!.credentialKey,`transaction-billing:${row.id}`);
      } catch {
        if(initial){const state=await pause(db,row,'billing_credential_unavailable');await db.query('commit');return state;}
        // 기존 청구 결과 조회에는 원래 billingKey의 복호화가 필요하지 않다.
      }
      const token=randomUUID();
      const persisted=(await db.query<{started_at:Date;provider_key_fingerprint:string}>(`update field.billing_transactions
        set state='processing',started_at=coalesce(started_at,now()),claim_token=$2,lease_expires_at=now()+interval '180 seconds',error_code=null,
        provider_key_fingerprint=case when started_at is null then $3 else provider_key_fingerprint end,
        billing_key_ciphertext=case when started_at is null then $4 else billing_key_ciphertext end
        where id=$1 returning started_at,provider_key_fingerprint`,[row.id,token,billing!.provider.keyFingerprint??null,
        initial?sealBilling(billingKey!,billing!.credentialKey,`transaction-billing:${row.id}`):null])).rows[0]!;
      await event(db,row,'processing',null);await db.query('commit');
      return {row:{...row,...persisted},token,context:billing!,initial,billingKey};
    } catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
  return 'empty';
}

function validApproval(payment:BillingPayment,row:Charge) {
  const at=payment.approvedAt?Date.parse(payment.approvedAt):NaN;
  return payment.orderId===row.order_id&&payment.totalAmount===row.total_amount&&payment.balanceAmount===row.total_amount
    &&payment.taxFreeAmount===row.tax_free_amount&&payment.vat===row.vat_amount
    &&payment.suppliedAmount+payment.taxFreeAmount===row.supply_amount&&payment.status==='DONE'
    &&typeof payment.paymentKey==='string'&&payment.paymentKey.length>0&&payment.paymentKey.length<=200
    &&Number.isFinite(at)&&at>=row.started_at!.getTime()-60000&&at<=Date.now()+300000;
}

export async function runBillingChargeOnce(input:{pool:Pool;billing?:BillingContext}):Promise<string> {
  await prepareFirstPeriod(input.pool);
  const claimed=await claim(input.pool,input.billing);if(typeof claimed==='string')return claimed;
  const {row,token,context,initial,billingKey}=claimed;
  let payment:BillingPayment|null=null,code='payment_provider_result_unknown';
  try {
    if(!initial)payment=await context.provider.lookup(row.order_id);
    if(!payment) {
      if(!initial&&(Date.now()-row.started_at!.getTime()>=replayWindowMs||row.provider_key_fingerprint!==context.provider.keyFingerprint
        ||!billingKey||row.cancel_requested_at||row.terminated_at))code='payment_reconciliation_required';
      else payment=await context.provider.charge({billingKey:billingKey!,customerKey:row.customer_key,orderId:row.order_id,
        orderName:row.order_name,amount:row.total_amount,taxFreeAmount:row.tax_free_amount!,requestKey:row.request_key});
    }
  } catch { /* 응답 원문/비밀값 대신 불확실한 기존 주문을 보존한다. */ }
  const db=await input.pool.connect();
  try {
    await db.query('begin');await db.query('select id from field.organizations where id=$1 for update',[row.organization_id]);
    const current=(await db.query<Charge>(`${selection} where t.id=$1 and t.state='processing' and t.claim_token=$2 for update of s,p,t`,[row.id,token])).rows[0];
    if(!current){await db.query('rollback');return 'superseded';}
    if(!payment){const state=await pause(db,current,code);await db.query('commit');return state;}
    if(payment.orderId===row.order_id&&payment.totalAmount===row.total_amount&&['ABORTED','EXPIRED'].includes(payment.status)) {
      await db.query("update field.billing_transactions set state='failed',error_code='payment_provider_confirmed_failed',completed_at=now(),claim_token=null,lease_expires_at=null,billing_key_ciphertext=null where id=$1",[row.id]);
      await db.query("update field.billing_periods set state='failed' where id=$1",[row.period_id]);
      await db.query("update field.paid_subscriptions set state=case when cancel_requested_at is null then 'past_due' else 'canceled' end where id=$1",[row.subscription_id]);
      await event(db,current,'failed','payment_provider_confirmed_failed');await db.query('commit');return 'failed';
    }
    if(!validApproval(payment,row)||current.anchor_at&&current.anchor_at.getTime()!==Date.parse(payment.approvedAt!)) {
      const state=await pause(db,current,'payment_approval_requires_reconciliation');await db.query('commit');return state;
    }
    const anchor=new Date(payment.approvedAt!),period=periodAt(anchor,0);
    await db.query(`update field.paid_subscriptions set anchor_at=$2,state=case when cancel_requested_at is not null or terminated_at is not null
      then 'canceled' when $3::timestamptz<=$4::timestamptz then 'past_due' else 'active' end where id=$1`,[row.subscription_id,anchor,period.endsAt,new Date(Date.now())]);
    await db.query("update field.billing_periods set starts_at=$2,ends_at=$3,paid_at=$2,state='paid' where id=$1",[row.period_id,period.startsAt,period.endsAt]);
    await db.query(`update field.billing_transactions set state='succeeded',completed_at=now(),payment_key_ciphertext=$2,
      claim_token=null,lease_expires_at=null,billing_key_ciphertext=null,error_code=null where id=$1`,[row.id,sealBilling(payment.paymentKey,context.credentialKey,`payment:${row.id}`)]);
    await event(db,current,'paid',null);await db.query('commit');return 'paid';
  } catch(error){await db.query('rollback');throw error;}finally{db.release();}
}
