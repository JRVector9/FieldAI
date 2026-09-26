import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { sealBilling, unsealBilling, type BillingContext } from './billing-context.js';

type Authorization = { id: string; subscription_id: string; organization_id: string; plan_id: string; created_by: string;
  customer_key: string; state: string; auth_key_ciphertext: string | null; request_key: string; provider_mode: string;
  provider_mid: string; started_at: Date | null; expires_at: Date; error_code: string | null; terminated_at: Date | null;
  cancel_requested_at: Date | null; claim_token: string | null };
type Claimed = { row: Authorization; token: string; authKey: string; context: BillingContext };
const idempotencyWindowMs = 15 * 86400000 - 60000;

async function event(db: PoolClient, row: Authorization, state: string, code: string | null) {
  await db.query(`insert into ap.billing_events(organization_id,subscription_id,plan_id,event_type,payload)
    values($1,$2,$3,$4,$5::jsonb)`, [row.organization_id,row.subscription_id,row.plan_id,
    `authorization_${state}`, JSON.stringify({ authorizationId: row.id, errorCode: code })]);
}
async function pause(db: PoolClient, row: Authorization, state: string, code: string) {
  await db.query(`update ap.billing_authorizations set state=$2,error_code=$3,claim_token=null,lease_expires_at=null,
    next_attempt_at=now()+interval '60 seconds',
    auth_key_ciphertext=case when $2='failed' then null else auth_key_ciphertext end,
    callback_token_ciphertext=case when $2='failed' then null else callback_token_ciphertext end where id=$1`, [row.id,state,code]);
  if (row.state !== state || row.error_code !== code) await event(db,row,state,code);
}

async function claim(pool: Pool, billing: BillingContext | undefined): Promise<Claimed | string> {
  // 먼저 조직을 잠근다. HTTP 동의/취소와 같은 순서이며 다른 worker의 조직은 건너뛴다.
  const candidates = (await pool.query(`select a.id,s.organization_id from ap.billing_authorizations a
    join ap.paid_subscriptions s on s.id=a.subscription_id
    where a.state in ('pending','processing','unknown','blocked_integration') and a.next_attempt_at<=now()
    and (a.lease_expires_at is null or a.lease_expires_at<=now()) order by a.next_attempt_at,a.created_at,a.id limit 20`)).rows;
  for (const candidate of candidates) {
    const db = await pool.connect();
    try {
      await db.query('begin');
      if (!(await db.query('select id from ap.organizations where id=$1 for update skip locked',[candidate.organization_id])).rowCount) {
        await db.query('rollback'); continue;
      }
      const row = (await db.query<Authorization>(`select a.*,s.organization_id,s.plan_id,s.created_by,s.customer_key,
        s.terminated_at,s.cancel_requested_at from ap.billing_authorizations a join ap.paid_subscriptions s on s.id=a.subscription_id
        where a.id=$1 and a.state in ('pending','processing','unknown','blocked_integration') and a.next_attempt_at<=now()
        and (a.lease_expires_at is null or a.lease_expires_at<=now()) for update of s,a`, [candidate.id])).rows[0];
      if (!row) { await db.query('rollback'); continue; }
      const started = row.started_at !== null;
      if (!started && (row.expires_at.getTime() <= Date.now() || row.terminated_at || row.cancel_requested_at)) {
        await pause(db,row,'failed','authorization_expired_or_stopped'); await db.query('commit'); return 'failed';
      }
      let code: string | null = null;
      if (started && Date.now() - row.started_at!.getTime() >= idempotencyWindowMs) code = 'authorization_reconciliation_required';
      else if (!billing) code = 'billing_provider_not_configured';
      else if (billing.provider.mode !== row.provider_mode || billing.provider.mid !== row.provider_mid) code = 'billing_provider_binding_changed';
      if (code) {
        const state = started ? 'unknown' : 'blocked_integration';
        await pause(db,row,state,code); await db.query('commit'); return state;
      }
      if (!started && !(await db.query(`select 1 from ap.memberships where organization_id=$1 and user_id=$2 and role='owner' for share`,
        [row.organization_id,row.created_by])).rowCount) {
        await pause(db,row,'blocked_integration','authorization_owner_changed'); await db.query('commit'); return 'blocked_integration';
      }
      let authKey: string;
      try {
        if (!row.auth_key_ciphertext) throw new Error('missing_authorization');
        authKey = unsealBilling(row.auth_key_ciphertext,billing!.credentialKey,`authorization:${row.id}`);
      } catch {
        const state = started ? 'unknown' : 'blocked_integration';
        await pause(db,row,state,'authorization_credential_unavailable'); await db.query('commit'); return state;
      }
      const token = randomUUID();
      await db.query(`update ap.billing_authorizations set state='processing',started_at=coalesce(started_at,now()),
        claim_token=$2,lease_expires_at=now()+interval '120 seconds',error_code=null where id=$1`, [row.id,token]);
      await event(db,row,'processing',null); await db.query('commit');
      return { row,token,authKey,context: billing! };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  }
  return 'empty';
}

export async function runBillingAuthorizationOnce(input: { pool: Pool; billing?: BillingContext }): Promise<string> {
  const claimed = await claim(input.pool,input.billing);
  if (typeof claimed === 'string') return claimed;
  const { row,token,authKey,context } = claimed;
  let billingKey: string | undefined;
  try {
    billingKey = await context.provider.issue({ authKey,customerKey: row.customer_key,requestKey: row.request_key });
    if (typeof billingKey !== 'string' || !billingKey || billingKey.length > 200) billingKey = undefined;
  } catch { /* 공급사 오류 원문과 비밀값은 저장하거나 출력하지 않는다. */ }
  const db = await input.pool.connect();
  try {
    await db.query('begin');
    await db.query('select id from ap.organizations where id=$1 for update',[row.organization_id]);
    const current = (await db.query(`select a.id from ap.billing_authorizations a join ap.paid_subscriptions s on s.id=a.subscription_id
      where a.id=$1 and a.state='processing' and a.claim_token=$2 for update of s,a`,[row.id,token])).rows[0];
    if (!current) { await db.query('rollback'); return 'superseded'; }
    if (!billingKey) {
      await pause(db,{...row,state:'processing'},'unknown','authorization_provider_result_unknown');
      await db.query('commit'); return 'unknown';
    }
    await db.query('insert into ap.billing_credentials(subscription_id,billing_key_ciphertext) values($1,$2)',
      [row.subscription_id,sealBilling(billingKey,context.credentialKey,`credential:${row.subscription_id}`)]);
    await db.query(`update ap.billing_authorizations set state='completed',auth_key_ciphertext=null,callback_token_ciphertext=null,
      claim_token=null,lease_expires_at=null,error_code=null where id=$1`,[row.id]);
    await event(db,row,'completed',null); await db.query('commit'); return 'completed';
  } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
}
