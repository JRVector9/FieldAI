import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { sealBilling, unsealBilling, type BillingContext } from './billing-context.js';
import type { BillingPlan } from './billing.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const fail = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });
type Actor = { user: string; org: string; session: string | null };
type Authorization = { id: string; subscription_id: string; customer_key: string; created_by: string; state: string;
  session_id: string; provider_mode: string; provider_mid: string; expires_at: Date; callback_token_hash: string; callback_token_ciphertext: string | null; auth_key_hash: string | null };

async function ownerFor(request: FastifyRequest, reply: FastifyReply, runtime: FieldBusinessRuntime): Promise<Actor | null> {
  reply.headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  const origin = request.headers.origin, allowed = runtime.billing?.webOrigin ?? process.env.FIELD_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3002';
  if (request.method !== 'GET' && (origin !== undefined && origin !== allowed || request.headers['sec-fetch-site'] === 'cross-site')) {
    fail(reply, 403, 'origin_denied'); return null;
  }
  const user = await runtime.resolveUserId(request.headers);
  if (!user) { fail(reply, 401, 'authentication_required'); return null; }
  const header = request.headers['x-organization-id'];
  if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) { fail(reply, 400, 'invalid_organization_id'); return null; }
  const m = (await runtime.pool.query<{ organization_id: string; role: string }>(
    'select organization_id,role from field.memberships where user_id=$1 and ($2::uuid is null or organization_id=$2) order by created_at limit 1', [user, header ?? null])).rows[0];
  if (!m) { fail(reply, 404, 'organization_not_found'); return null; }
  if (m.role !== 'owner') { fail(reply, 403, 'owner_required'); return null; }
  const session = await runtime.resolveSession?.(request.headers);
  return { user, org: m.organization_id, session: session?.userId === user ? session.id : null };
}
async function lockOwner(db: PoolClient, a: Actor) {
  await db.query('select id from field.organizations where id=$1 for update', [a.org]);
  return Boolean((await db.query("select 1 from field.memberships where organization_id=$1 and user_id=$2 and role='owner' for share", [a.org, a.user])).rowCount);
}
async function replay(db: PoolClient, a: Actor, key: string, digest: string) {
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`field-billing:${a.user}:${key}`]);
  const old = (await db.query<{ request_hash: string; result: { authorizationId: string } }>(
    'select request_hash,result from field.billing_requests where actor_user_id=$1 and key_hash=$2', [a.user, key])).rows[0];
  return old ? { conflict: old.request_hash !== digest, result: old.result } : null;
}
async function record(db: PoolClient, a: Actor, id: string, sub: string, plan: string, event: string, key?: string, digest?: string) {
  if (key && digest) await db.query('insert into field.billing_requests(actor_user_id,key_hash,request_hash,result) values($1,$2,$3,$4::jsonb)',
    [a.user, key, digest, JSON.stringify({ authorizationId: id })]);
  await db.query('insert into field.billing_events(organization_id,subscription_id,plan_id,actor_user_id,event_type,payload) values($1,$2,$3,$4,$5,$6::jsonb)',
    [a.org, sub, plan, a.user, event, JSON.stringify({ authorizationId: id })]);
}
async function authorization(db: PoolClient, org: string, id: string, lock = false) {
  return (await db.query<Authorization & { plan_id: string }>(`select a.*,s.customer_key,s.created_by,s.plan_id
    from field.billing_authorizations a join field.paid_subscriptions s on s.id=a.subscription_id
    where a.id=$1 and s.organization_id=$2 ${lock ? 'for update of a,s' : ''}`, [id, org])).rows[0];
}
function view(a: Authorization, context?: BillingContext, includeSdk = false) {
  const open = a.state === 'awaiting' && a.expires_at.getTime() > Date.now();
  let sdk = null;
  if (includeSdk && open && context && a.callback_token_ciphertext) {
    const state = unsealBilling(a.callback_token_ciphertext, context.credentialKey, `callback:${a.id}`);
    const success = new URL('/billing/return', context.webOrigin); success.searchParams.set('state', state);
    const failure = new URL(success); failure.searchParams.set('failed', '1');
    sdk = { clientKey: context.provider.clientKey, customerKey: a.customer_key, successUrl: success.toString(), failUrl: failure.toString() };
  }
  return { authorizationId: a.id, subscriptionId: a.subscription_id, state: a.state, expiresAt: a.expires_at, sdk };
}

export function registerFieldBillingConsentRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.post('/v1/subscription/checkout', async (request, reply) => {
    const a = await ownerFor(request, reply, runtime); if (!a) return reply;
    const context = runtime.billing;
    if (!context) return reply.code(503).send({ error: 'paid_checkout_not_configured', state: 'blocked_integration' });
    const mode = ['mock','sandbox'].includes(process.env.FIELD_PROFILE ?? '') ? 'test' : 'live';
    if (context.provider.mode !== mode || process.env.NODE_ENV === 'production' && mode !== 'live')
      return reply.code(503).send({ error: 'billing_profile_mismatch', state: 'blocked_integration' });
    if (!a.session) return fail(reply, 401, 'current_session_required');
    const b = object(request.body), rawKey = request.headers['idempotency-key'];
    if (typeof rawKey !== 'string' || !uuid.test(rawKey) || !uuid.test(String(b.planId)) || b.termsAccepted !== true
      || b.autoRenew !== true || b.firstChargePolicy !== 'after_authorization'
      || !str(b.termsVersion,100) || !str(b.refundVersion,100) || b.currency !== 'KRW'
      || ['totalAmount','supplyAmount','vatAmount','includedAiUnits','graceDays'].some(k => !Number.isSafeInteger(b[k])))
      return fail(reply, 400, 'explicit_billing_consent_required');
    const key = hash(rawKey), digest = hash(JSON.stringify(['checkout', a.org, b.planId, b.termsVersion,b.refundVersion,
      b.totalAmount,b.supplyAmount,b.vatAmount,b.currency,b.includedAiUnits,b.graceDays,b.autoRenew,b.firstChargePolicy]));
    const db = await runtime.pool.connect();
    try {
      await db.query('begin'); if (!await lockOwner(db,a)) { await db.query('rollback'); return fail(reply,403,'owner_required'); }
      const old = await replay(db,a,key,digest);
      if (old) {
        if (old.conflict) { await db.query('rollback'); return fail(reply,409,'idempotency_conflict'); }
        const existing = await authorization(db,a.org,old.result.authorizationId);
        if (!existing || existing.session_id !== a.session || existing.created_by !== a.user) { await db.query('rollback'); return fail(reply,403,'authorization_session_mismatch'); }
        if (existing.provider_mode !== context.provider.mode || existing.provider_mid !== context.provider.mid) { await db.query('rollback'); return fail(reply,409,'billing_provider_changed'); }
        await db.query('commit'); return view(existing,context,true);
      }
      const plan = (await db.query<BillingPlan>('select * from field.billing_plans where id=$1 for share',[b.planId])).rows[0];
      if (!plan || !plan.approved_at || plan.retired_at || plan.mode !== mode || plan.terms_version !== b.termsVersion
        || plan.refund_version !== b.refundVersion || plan.total_amount !== b.totalAmount || plan.supply_amount !== b.supplyAmount
        || plan.vat_amount !== b.vatAmount || plan.included_ai_units !== b.includedAiUnits || plan.grace_days !== b.graceDays) {
        await db.query('rollback'); return fail(reply,409,'billing_plan_conditions_changed');
      }
      if ((await db.query('select 1 from field.paid_subscriptions where organization_id=$1 and terminated_at is null',[a.org])).rowCount) {
        await db.query('rollback'); return fail(reply,409,'open_subscription_exists');
      }
      const sub=randomUUID(), id=randomUUID(), customer=randomUUID(), state=`${id}.${randomBytes(32).toString('base64url')}`;
      await db.query('insert into field.paid_subscriptions(id,organization_id,plan_id,customer_key,created_by) values($1,$2,$3,$4,$5)',[sub,a.org,plan.id,customer,a.user]);
      await db.query(`insert into field.billing_consents(id,subscription_id,plan_id,accepted_by,terms_version,refund_version,total_amount,supply_amount,vat_amount,
        currency,included_ai_units,grace_days,auto_renew,first_charge_policy) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,'after_authorization')`,
      [randomUUID(),sub,plan.id,a.user,plan.terms_version,plan.refund_version,plan.total_amount,plan.supply_amount,plan.vat_amount,plan.currency,plan.included_ai_units,plan.grace_days]);
      await db.query(`insert into field.billing_authorizations(id,subscription_id,request_key,callback_token_hash,callback_token_ciphertext,expires_at,session_id,provider_mode,provider_mid)
        values($1,$2,$3,$4,$5,now()+interval '30 minutes',$6,$7,$8)`,[id,sub,randomUUID(),hash(state),sealBilling(state,context.credentialKey,`callback:${id}`),a.session,context.provider.mode,context.provider.mid]);
      await record(db,a,id,sub,plan.id,'consent_accepted',key,digest);
      const saved=(await authorization(db,a.org,id))!;
      await db.query('commit'); return reply.code(201).send(view(saved,context,true));
    } catch(e) { await db.query('rollback'); throw e; } finally { db.release(); }
  });
  app.get<{Params:{id:string}}>('/v1/subscription/authorizations/:id',async(request,reply)=>{
    const a=await ownerFor(request,reply,runtime); if(!a)return reply;
    if(!uuid.test(request.params.id))return fail(reply,404,'authorization_not_found');
    const db=await runtime.pool.connect();
    try { const row=await authorization(db,a.org,request.params.id); return row?view(row):fail(reply,404,'authorization_not_found'); } finally { db.release(); }
  });
  app.post<{Params:{id:string}}>('/v1/subscription/authorizations/:id/confirm',async(request,reply)=>{
    const a=await ownerFor(request,reply,runtime); if(!a)return reply;
    const context=runtime.billing;
    if(!context)return reply.code(503).send({error:'paid_checkout_not_configured',state:'blocked_integration'});
    const b=object(request.body),id=request.params.id;
    if(!uuid.test(id)||!str(b.state,160)||!str(b.authKey,300)||!str(b.customerKey,50)
      ||Object.keys(b).some(k=>!['state','authKey','customerKey'].includes(k)))return fail(reply,400,'invalid_billing_authorization');
    const db=await runtime.pool.connect();
    try {
      await db.query('begin'); if(!await lockOwner(db,a)){await db.query('rollback');return fail(reply,403,'owner_required');}
      const row=await authorization(db,a.org,id,true);
      if(!row){await db.query('rollback');return fail(reply,404,'authorization_not_found');}
      if(row.created_by!==a.user||!a.session||row.session_id!==a.session||row.callback_token_hash!==hash(b.state)||row.customer_key!==b.customerKey){
        await db.query('rollback');return fail(reply,403,'authorization_session_mismatch');}
      const mode = ['mock','sandbox'].includes(process.env.FIELD_PROFILE ?? '') ? 'test' : 'live';
      if(row.provider_mode !== context.provider.mode || row.provider_mid !== context.provider.mid || context.provider.mode !== mode
        || process.env.NODE_ENV === 'production' && mode !== 'live'){await db.query('rollback');return fail(reply,409,'billing_provider_changed');}
      if(row.state!=='awaiting'){
        const same=row.auth_key_hash===hash(b.authKey)&&['pending','processing','unknown','completed','blocked_integration'].includes(row.state);
        await db.query('commit');return same?reply.code(row.state==='completed'?200:202).send(view(row)):fail(reply,409,'authorization_state_changed');
      }
      if(row.expires_at.getTime()<=Date.now()){await db.query('rollback');return fail(reply,410,'authorization_expired');}
      await db.query("update field.billing_authorizations set auth_key_hash=$2,auth_key_ciphertext=$3,state='pending' where id=$1",
        [id,hash(b.authKey),sealBilling(b.authKey,context.credentialKey,`authorization:${id}`)]);
      await record(db,a,id,row.subscription_id,row.plan_id,'authorization_queued');
      await db.query('commit');return reply.code(202).send({...view(row),state:'pending'});
    } catch(e){await db.query('rollback');throw e;}finally{db.release();}
  });
  app.post<{Params:{id:string}}>('/v1/subscription/authorizations/:id/cancel',async(request,reply)=>{
    const a=await ownerFor(request,reply,runtime);if(!a)return reply;
    const id=request.params.id;if(!uuid.test(id))return fail(reply,404,'authorization_not_found');
    const db=await runtime.pool.connect();
    try{
      await db.query('begin');if(!await lockOwner(db,a)){await db.query('rollback');return fail(reply,403,'owner_required');}
      const row=await authorization(db,a.org,id,true);
      if(!row){await db.query('rollback');return fail(reply,404,'authorization_not_found');}
      if(!['awaiting','pending','failed','canceled','blocked_integration'].includes(row.state)){await db.query('rollback');return fail(reply,409,'authorization_result_unresolved');}
      if(row.state!=='canceled'){
        await db.query("update field.billing_authorizations set state='canceled',auth_key_ciphertext=null,callback_token_ciphertext=null where id=$1",[id]);
        await db.query("update field.paid_subscriptions set state='canceled',cancel_requested_at=now(),cancel_requested_by=$2,terminated_at=now() where id=$1",[row.subscription_id,a.user]);
        await record(db,a,id,row.subscription_id,row.plan_id,'authorization_canceled');
      }
      await db.query('commit');return {...view(row),state:'canceled'};
    }catch(e){await db.query('rollback');throw e;}finally{db.release();}
  });
}
