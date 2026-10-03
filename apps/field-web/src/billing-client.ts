import { DELETION_SCHEDULED_OWNER_MESSAGE } from './deletion-scheduled-copy';
export const billingProduct = 'field' as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
const policyText = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
export type BillingIdentity = { userId: string; sessionId: string };
export type BillingPlan = { id: string; mode: string; state: string; name: string; currency: string;
  totalAmount: number; supplyAmount: number; vatAmount: number; taxFreeAmount: number | null;
  includedAiUnits: number; graceDays: number; termsVersion: string; termsText: string;
  refundVersion: string; refundText: string };
export type CheckoutAttempt = { version: 1; product: typeof billingProduct; organizationId: string; actorUserId: string;
  sessionId: string; requestKey: string; origin: string; plan: BillingPlan; authorizationId?: string;
  subscriptionId?: string; customerKey?: string; stateHash?: string; expiresAt?: string };
export type BillingSdk = { clientKey: string; customerKey: string; successUrl: string; failUrl: string };
export type BillingAuthorization = { authorizationId: string; subscriptionId: string; state: string; expiresAt: string; sdk: BillingSdk | null };
export type BillingReturn = { kind: 'success'; authorizationId: string; state: string; authKey: string; customerKey: string }
  | { kind: 'failure'; authorizationId: string; state: string };
const states = ['awaiting','pending','processing','unknown','completed','blocked_integration','failed','canceled','expired'];
export class BillingClientError extends Error {
  constructor(readonly code: string, readonly status = 0) { super(code); }
}
function ownOrigin(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try { const u = new URL(v); return u.origin === v && !u.username && !u.password
    && (u.protocol === 'https:' || u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)); }
  catch { return false; }
}
export function parseBillingPlan(value: unknown): BillingPlan | null {
  const p = object(value);
  if (!uuid.test(String(p.id)) || !['test','live'].includes(String(p.mode)) || !['pending','approved','retired'].includes(String(p.state))
    || !text(p.name,100) || p.currency !== 'KRW' || !text(p.termsVersion,100) || !policyText(p.termsText,8000)
    || !text(p.refundVersion,100) || !policyText(p.refundText,8000)
    || ['totalAmount','supplyAmount','vatAmount','includedAiUnits','graceDays'].some(k => !Number.isSafeInteger(p[k]) || Number(p[k]) < 0)
    || Number(p.totalAmount) < 1 || Number(p.includedAiUnits) < 1 || Number(p.graceDays) > 30
    || p.totalAmount !== Number(p.supplyAmount) + Number(p.vatAmount)
    || p.taxFreeAmount !== null && (!Number.isSafeInteger(p.taxFreeAmount) || Number(p.taxFreeAmount) < 0 || Number(p.taxFreeAmount) > Number(p.totalAmount))) return null;
  return { id:p.id as string, mode:p.mode as string, state:p.state as string, name:p.name as string, currency:'KRW',
    totalAmount:p.totalAmount as number, supplyAmount:p.supplyAmount as number, vatAmount:p.vatAmount as number,
    taxFreeAmount:p.taxFreeAmount as number|null, includedAiUnits:p.includedAiUnits as number, graceDays:p.graceDays as number,
    termsVersion:p.termsVersion as string, termsText:p.termsText as string, refundVersion:p.refundVersion as string, refundText:p.refundText as string };
}
export function createCheckoutAttempt(identity: BillingIdentity, organizationId: string, value: unknown, requestKey: string, origin: string): CheckoutAttempt {
  const plan = parseBillingPlan(value);
  if (!plan || plan.state !== 'approved' || plan.taxFreeAmount === null) throw new BillingClientError('billing_plan_invalid');
  if (!text(identity.userId,200) || !text(identity.sessionId,200) || !uuid.test(organizationId) || !uuid.test(requestKey) || !ownOrigin(origin))
    throw new BillingClientError('billing_return_binding_invalid');
  return { version:1, product:billingProduct, organizationId, actorUserId:identity.userId, sessionId:identity.sessionId, requestKey, origin, plan };
}
export function readCheckoutAttempt(raw: string|null): CheckoutAttempt|null {
  if (!raw || raw.length > 20000) return null;
  try {
    const v = object(JSON.parse(raw));
    if (v.version !== 1 || v.product !== billingProduct || Object.keys(v).some(k => !['version','product','organizationId','actorUserId','sessionId','requestKey','origin','plan','authorizationId','subscriptionId','customerKey','stateHash','expiresAt'].includes(k))) return null;
    const base = createCheckoutAttempt({userId:v.actorUserId as string,sessionId:v.sessionId as string},v.organizationId as string,v.plan,v.requestKey as string,v.origin as string);
    const bound = ['authorizationId','subscriptionId','customerKey','stateHash','expiresAt'];
    if (bound.every(k => v[k] === undefined)) return base;
    if (!uuid.test(String(v.authorizationId)) || !uuid.test(String(v.subscriptionId))
      || typeof v.expiresAt !== 'string' || !Number.isFinite(Date.parse(v.expiresAt))) return null;
    const receipt={...base,authorizationId:v.authorizationId as string,subscriptionId:v.subscriptionId as string,expiresAt:v.expiresAt};
    if(v.customerKey===undefined&&v.stateHash===undefined)return receipt;
    if(!text(v.customerKey,50)||typeof v.stateHash!=='string'||!/^[0-9a-f]{64}$/.test(v.stateHash))return null;
    return {...receipt,customerKey:v.customerKey as string,stateHash:v.stateHash};
  } catch { return null; }
}
const callbackState = (v: string|null): v is string => !!v && uuid.test(v.slice(0,36)) && /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/i.test(v);
export function parseBillingReturn(raw: string): BillingReturn|null {
  try {
    const u = new URL(raw), q = u.searchParams;
    if (u.pathname !== '/billing/return' || ['state','authKey','customerKey','failed'].some(k => q.getAll(k).length > 1)) return null;
    const state=q.get('state'); if(!callbackState(state)) return null;
    const authorizationId=state.slice(0,36), failed=q.get('failed');
    if(failed!==null) return failed==='1'&&!q.has('authKey')&&!q.has('customerKey')?{kind:'failure',authorizationId,state}:null;
    const authKey=q.get('authKey'),customerKey=q.get('customerKey');
    return text(authKey,300)&&text(customerKey,50)?{kind:'success',authorizationId,state,authKey:authKey!,customerKey:customerKey!}:null;
  } catch { return null; }
}
export function consumeBillingReturn(raw: string, replace: (path:string)=>void): BillingReturn|null {
  const callback=parseBillingReturn(raw);
  replace('/billing/return'); // Clear provider parameters before awaiting identity or any network request.
  return callback;
}
const digest = async (s:string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))
  .map(v=>v.toString(16).padStart(2,'0')).join('');
function parseAuthorization(value:unknown): BillingAuthorization {
  const a=object(value);
  if(!uuid.test(String(a.authorizationId))||!uuid.test(String(a.subscriptionId))||!states.includes(String(a.state))
    ||typeof a.expiresAt!=='string'||!Number.isFinite(Date.parse(a.expiresAt))) throw new BillingClientError('billing_result_unknown');
  const s=object(a.sdk);
  const sdk=a.sdk===null||a.sdk===undefined?null:
    text(s.clientKey,200)&&text(s.customerKey,50)&&text(s.successUrl,1000)&&text(s.failUrl,1000)?
      {clientKey:s.clientKey as string,customerKey:s.customerKey as string,successUrl:s.successUrl as string,failUrl:s.failUrl as string}:null;
  if(a.sdk!==null&&a.sdk!==undefined&&!sdk)throw new BillingClientError('billing_result_unknown');
  return {authorizationId:a.authorizationId as string,subscriptionId:a.subscriptionId as string,state:a.state as string,expiresAt:a.expiresAt,sdk};
}
export async function bindCheckoutAuthorization(attempt:CheckoutAttempt,value:unknown,origin:string):Promise<CheckoutAttempt> {
  const a=parseAuthorization(value);
  if(!a.sdk||a.state!=='awaiting'||attempt.origin!==origin||!ownOrigin(origin)
    ||attempt.authorizationId&&attempt.authorizationId!==a.authorizationId||attempt.subscriptionId&&attempt.subscriptionId!==a.subscriptionId)
    throw new BillingClientError('billing_sdk_binding_invalid');
  try {
    const success=new URL(a.sdk.successUrl),failure=new URL(a.sdk.failUrl),state=success.searchParams.get('state');
    if(success.origin!==origin||failure.origin!==origin||success.pathname!=='/billing/return'||failure.pathname!=='/billing/return'
      ||success.username||success.password||failure.username||failure.password||success.hash||failure.hash
      ||!callbackState(state)||state.slice(0,36)!==a.authorizationId||failure.searchParams.get('state')!==state
      ||success.searchParams.size!==1||failure.searchParams.size!==2||failure.searchParams.get('failed')!=='1')throw new Error('bad_sdk');
    return {...attempt,authorizationId:a.authorizationId,subscriptionId:a.subscriptionId,customerKey:a.sdk.customerKey,
      stateHash:await digest(state),expiresAt:a.expiresAt};
  }catch{throw new BillingClientError('billing_sdk_binding_invalid');}
}
async function api(path:string,options:RequestInit,fetcher:typeof fetch):Promise<unknown> {
  let response:Response;
  try {response=await fetcher(path,{...options,credentials:'same-origin',cache:'no-store'});}catch{throw new BillingClientError('billing_result_unknown');}
  let body:unknown;try{body=await response.json();}catch{throw new BillingClientError('billing_result_unknown',response.status);}
  if(!response.ok){const code=object(body).error;throw new BillingClientError(typeof code==='string'&&/^[a-z0-9_]{1,100}$/.test(code)?code:'billing_request_refused',response.status);}
  return body;
}
export async function currentBillingIdentity(fetcher:typeof fetch=fetch):Promise<BillingIdentity> {
  const value=object(await api('/api/auth/get-session',{},fetcher)),user=object(value.user),session=object(value.session);
  if(!text(user.id,200)||!text(session.id,200)||session.userId!==user.id)throw new BillingClientError('current_session_required',401);
  return {userId:user.id as string,sessionId:session.id as string};
}
export async function submitCheckout(attempt:CheckoutAttempt,fetcher:typeof fetch=fetch):Promise<BillingAuthorization> {
  const p=attempt.plan;
  return parseAuthorization(await api('/v1/subscription/checkout',{method:'POST',headers:{'content-type':'application/json',
    'x-organization-id':attempt.organizationId,'idempotency-key':attempt.requestKey},body:JSON.stringify({planId:p.id,termsAccepted:true,
    termsVersion:p.termsVersion,refundVersion:p.refundVersion,totalAmount:p.totalAmount,supplyAmount:p.supplyAmount,vatAmount:p.vatAmount,
    taxFreeAmount:p.taxFreeAmount,currency:p.currency,includedAiUnits:p.includedAiUnits,graceDays:p.graceDays,autoRenew:true,firstChargePolicy:'after_authorization'})},fetcher));
}
export async function confirmBillingReturn(callback:BillingReturn,attempt:CheckoutAttempt,identity:BillingIdentity,origin:string,fetcher:typeof fetch=fetch):Promise<BillingAuthorization> {
  if(callback.kind!=='success'||attempt.product!==billingProduct||attempt.actorUserId!==identity.userId||attempt.sessionId!==identity.sessionId
    ||attempt.origin!==origin||!ownOrigin(origin)||attempt.authorizationId!==callback.authorizationId||attempt.customerKey!==callback.customerKey
    ||!attempt.stateHash||await digest(callback.state)!==attempt.stateHash)throw new BillingClientError('billing_return_binding_invalid');
  const a=parseAuthorization(await api(`/v1/subscription/authorizations/${callback.authorizationId}/confirm`,{method:'POST',
    headers:{'content-type':'application/json','x-organization-id':attempt.organizationId},
    body:JSON.stringify({state:callback.state,authKey:callback.authKey,customerKey:callback.customerKey})},fetcher));
  if(a.authorizationId!==attempt.authorizationId||a.subscriptionId!==attempt.subscriptionId)throw new BillingClientError('billing_result_unknown');
  return a;
}
export async function getBillingAuthorization(attempt:CheckoutAttempt,fetcher:typeof fetch=fetch):Promise<BillingAuthorization> {
  if(!attempt.authorizationId)throw new BillingClientError('billing_result_unknown');
  const a=parseAuthorization(await api(`/v1/subscription/authorizations/${attempt.authorizationId}`,{headers:{'x-organization-id':attempt.organizationId}},fetcher));
  if(a.authorizationId!==attempt.authorizationId||a.subscriptionId!==attempt.subscriptionId)throw new BillingClientError('billing_result_unknown');
  return a;
}
export function authorizationNotice(state:string):string {
  return ({awaiting:'카드 인증을 아직 접수하지 않았습니다.',pending:'카드 인증 결과를 접수했습니다. 서버 처리 대기 중입니다.',
    processing:'카드 인증 결과를 확인하는 중입니다.',unknown:'카드 인증 결과를 확인하지 못했습니다. 같은 인증의 상태를 다시 조회해 주세요.',
    completed:'카드 인증이 완료됐습니다. 구독 결제 결과는 별도로 확인해 주세요.',blocked_integration:'카드 인증 공급사 설정을 확인해야 합니다.',
    failed:'카드 인증이 거절됐습니다.',canceled:'카드 인증 요청이 취소됐습니다.',expired:'카드 인증 요청의 유효 시간이 지났습니다.'} as Record<string,string>)[state]??'카드 인증 상태를 확인해 주세요.';
}
export function billingErrorNotice(error:unknown):string {
  const code=error instanceof BillingClientError?error.code:'';
  return ({paid_checkout_not_configured:'결제 공급사 설정이 연결되지 않았습니다. 카드 등록과 청구는 시작되지 않았습니다.',
    billing_plan_invalid:'승인된 가격과 면세 조건을 먼저 확인해 주세요.',billing_plan_conditions_changed:'가격이나 약관이 변경됐습니다. 조건을 다시 불러와 확인해 주세요.',
    owner_required:'구독 변경은 조직 owner만 할 수 있습니다.',current_session_required:'현재 제품에 다시 로그인해 주세요.',authentication_required:'현재 제품에 로그인해 주세요.',
    billing_profile_mismatch:'현재 환경과 결제 상점 설정이 일치하지 않습니다.',billing_provider_changed:'원래 결제 상점 설정을 확인해야 합니다.',
    open_subscription_exists:'기존 구독이나 결과를 확인하지 못한 요청이 있습니다. 기존 상태를 먼저 확인해 주세요.',
    billing_return_binding_invalid:'원래 계정·로그인·조직의 카드 인증 요청과 일치하지 않습니다. 해당 제품의 원래 창에서 상태를 확인해 주세요.',
    billing_sdk_binding_invalid:'카드 인증 화면의 주소나 요청 정보를 확인하지 못해 열지 않았습니다.',authorization_expired:'카드 인증 요청의 유효 시간이 지났습니다.',
    authorization_session_mismatch:'카드 인증을 시작한 원래 로그인 창에서 진행해 주세요.',authorization_state_changed:'카드 인증 상태가 변경됐습니다. 기존 상태를 다시 확인해 주세요.',
    billing_mutation_input_invalid:'결제 기간·정수 금액·사유를 확인해 주세요. 카드번호와 인증 비밀값은 입력하지 않습니다.',
    billing_mutation_binding_invalid:'원래 계정·로그인·조직에서 기존 요청 결과를 확인해 주세요.',
    billing_mutation_metadata_invalid:'저장된 원래 요청을 확인하지 못했습니다. 새 요청을 만들지 말고 기존 내역을 확인해 주세요.',
    billing_mutation_in_progress:'같은 요청을 처리하고 있습니다. 잠시 뒤 결과를 확인해 주세요.',
    billing_retry_storage_unavailable:'이 창에 재시도 정보를 저장하지 못해 요청을 시작하지 않았습니다. 브라우저 저장 설정을 확인해 주세요.',
    billing_sdk_unavailable:'카드 등록창을 불러오지 못했습니다. 기존 인증 상태를 확인한 뒤 같은 요청으로 다시 열어 주세요.',
    owner_membership_required:'현재 조직 owner만 요청할 수 있습니다.',refund_amount_exceeded:'결제 금액과 진행 중인 환불을 확인해 주세요.',
    refund_in_progress:'결과를 확인 중인 환불이 있습니다. 기존 결과가 확정된 뒤 다시 요청해 주세요.',blocked_integration:'공급사 또는 보안 설정이 연결되지 않았습니다. 기존 기록은 유지됩니다.',
    idempotency_conflict:'원래 요청과 내용이 다릅니다. 기존 요청 상태를 확인해 주세요.',deletion_scheduled:DELETION_SCHEDULED_OWNER_MESSAGE} as Record<string,string>)[code]
    ??'요청 결과를 확인하지 못했습니다. 새 요청을 만들지 않고 기존 상태를 다시 확인해 주세요.';
}
export const checkoutStorageKey = 'field:billing-checkout-attempt:v1';

export type TossSdkFactory = (clientKey:string)=>{payment:(options:{customerKey:string})=>{
  requestBillingAuth:(options:{method:'CARD';successUrl:string;failUrl:string;windowTarget:'self'})=>Promise<void>}};
let sdkLoading:Promise<TossSdkFactory>|null=null;
export function loadBillingSdk():Promise<TossSdkFactory> {
  const host=window as Window&{TossPayments?:TossSdkFactory};
  if(host.TossPayments)return Promise.resolve(host.TossPayments);
  if(sdkLoading)return sdkLoading;
  sdkLoading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://js.tosspayments.com/v2/standard';script.async=true;script.referrerPolicy='no-referrer';
    const timer=setTimeout(()=>fail(),20000);
    const fail=()=>{clearTimeout(timer);script.remove();sdkLoading=null;reject(new BillingClientError('billing_sdk_unavailable'));};
    script.onerror=fail;script.onload=()=>{clearTimeout(timer);if(!host.TossPayments){fail();return;}resolve(host.TossPayments);};
    document.head.append(script);
  });
  return sdkLoading;
}
export async function openBillingSdk(attempt:CheckoutAttempt,authorization:BillingAuthorization,identity:BillingIdentity,
  origin:string,loader:()=>Promise<TossSdkFactory>=loadBillingSdk,current:()=>boolean=()=>true):Promise<void> {
  if(!current())throw new BillingClientError('billing_checkout_view_changed');
  if(attempt.actorUserId!==identity.userId||attempt.sessionId!==identity.sessionId)throw new BillingClientError('billing_return_binding_invalid');
  const bound=await bindCheckoutAuthorization(attempt,authorization,origin);
  if(bound.stateHash!==attempt.stateHash||bound.customerKey!==attempt.customerKey||!bound.expiresAt
    ||Date.parse(bound.expiresAt)<=Date.now())throw new BillingClientError('billing_sdk_binding_invalid');
  if(!current())throw new BillingClientError('billing_checkout_view_changed');
  const sdk=authorization.sdk!;
  const toss=await loader();
  if(!current())throw new BillingClientError('billing_checkout_view_changed');
  await toss(sdk.clientKey).payment({customerKey:sdk.customerKey}).requestBillingAuth({method:'CARD',
    successUrl:sdk.successUrl,failUrl:sdk.failUrl,windowTarget:'self'});
}

export function rememberBillingAuthorization(attempt:CheckoutAttempt,value:unknown):CheckoutAttempt {
  const a=parseAuthorization(value);
  if(attempt.authorizationId&&attempt.authorizationId!==a.authorizationId||attempt.subscriptionId&&attempt.subscriptionId!==a.subscriptionId)
    throw new BillingClientError('billing_result_unknown');
  return {...attempt,authorizationId:a.authorizationId,subscriptionId:a.subscriptionId,expiresAt:a.expiresAt};
}


// 원래 요청은 보존하고 새 계정·조직의 독립 요청은 별도 키로 저장한다.
type CheckoutStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const checkoutContextKey=(identity:BillingIdentity,origin:string)=>`${billingProduct}:billing-checkout-context:v2:${encodeURIComponent(identity.userId)}:${encodeURIComponent(identity.sessionId)}:${encodeURIComponent(origin)}`;
const checkoutOwnKey=(identity:BillingIdentity,organizationId:string,origin:string)=>`${checkoutContextKey(identity,origin)}:${organizationId}`;
const checkoutAuthorizationKey=(identity:BillingIdentity,origin:string,id:string)=>`${checkoutContextKey(identity,origin)}:authorization:${id}`;
function sameCheckoutIdentity(attempt:CheckoutAttempt,identity:BillingIdentity,origin:string){
 return attempt.actorUserId===identity.userId&&attempt.sessionId===identity.sessionId&&attempt.origin===origin;
}
function checkedCheckoutIdentity(identity:BillingIdentity,origin:string){
 if(!text(identity.userId,200)||!text(identity.sessionId,200)||!ownOrigin(origin))throw new BillingClientError('billing_return_binding_invalid');
}
function storedCheckout(storage:CheckoutStorage,key:string){
 let raw:string|null;try{raw=storage.getItem(key);}catch{throw new BillingClientError('billing_retry_storage_unavailable');}
 if(raw===null)return null;const attempt=readCheckoutAttempt(raw);
 if(!attempt)throw new BillingClientError('billing_mutation_metadata_invalid');return attempt;
}
export function storeCheckoutAttempt(attempt:CheckoutAttempt,storage:CheckoutStorage){
 const saved=readCheckoutAttempt(JSON.stringify(attempt));if(!saved)throw new BillingClientError('billing_return_binding_invalid');
 const identity={userId:saved.actorUserId,sessionId:saved.sessionId},key=checkoutOwnKey(identity,saved.organizationId,saved.origin);
 const put=(name:string,value:string)=>{storage.setItem(name,value);if(storage.getItem(name)!==value)throw new Error('unverified_storage');};
 try{const raw=JSON.stringify(saved);put(key,raw);
  if(saved.authorizationId)put(checkoutAuthorizationKey(identity,saved.origin,saved.authorizationId),raw);
  put(checkoutContextKey(identity,saved.origin),key);
 }catch{throw new BillingClientError('billing_retry_storage_unavailable');}
}
export function restoreCheckoutAttempt(identity:BillingIdentity,organizationId:string,origin:string,storage:CheckoutStorage){
 checkedCheckoutIdentity(identity,origin);if(!uuid.test(organizationId))throw new BillingClientError('billing_return_binding_invalid');
 const scoped=storedCheckout(storage,checkoutOwnKey(identity,organizationId,origin));
 if(scoped){if(!sameCheckoutIdentity(scoped,identity,origin)||scoped.organizationId!==organizationId)throw new BillingClientError('billing_return_binding_invalid');return scoped;}
 // v1 값은 원래 context에서만 소비한다. 다른 context에서는 그대로 보존한다.
 const legacy=storedCheckout(storage,checkoutStorageKey);
 if(legacy&&sameCheckoutIdentity(legacy,identity,origin)&&legacy.organizationId===organizationId){storeCheckoutAttempt(legacy,storage);return legacy;}
 return null;
}
export function restoreCheckoutReturnAttempt(id:string|null,identity:BillingIdentity,origin:string,storage:CheckoutStorage){
 checkedCheckoutIdentity(identity,origin);if(id!==null&&!uuid.test(id))return null;
 let attempt=id?storedCheckout(storage,checkoutAuthorizationKey(identity,origin,id)):null;
 if(!attempt){let pointer:string|null;try{pointer=storage.getItem(checkoutContextKey(identity,origin));}catch{throw new BillingClientError('billing_retry_storage_unavailable');}
  if(pointer?.startsWith(checkoutContextKey(identity,origin)+':'))attempt=storedCheckout(storage,pointer);
 }
 if(attempt&&sameCheckoutIdentity(attempt,identity,origin)&&(!id||attempt.authorizationId===id))return attempt;
 const legacy=storedCheckout(storage,checkoutStorageKey);
 return legacy&&sameCheckoutIdentity(legacy,identity,origin)&&(!id||legacy.authorizationId===id)?legacy:null;
}
export function forgetCheckoutAttempt(attempt:CheckoutAttempt,storage:CheckoutStorage){
 const identity={userId:attempt.actorUserId,sessionId:attempt.sessionId},key=checkoutOwnKey(identity,attempt.organizationId,attempt.origin);
 const saved=storedCheckout(storage,key);if(saved&&saved.requestKey!==attempt.requestKey)throw new BillingClientError('billing_mutation_metadata_invalid');
 try{storage.removeItem(key);if(attempt.authorizationId)storage.removeItem(checkoutAuthorizationKey(identity,attempt.origin,attempt.authorizationId));
  const contextKey=checkoutContextKey(identity,attempt.origin);if(storage.getItem(contextKey)===key)storage.removeItem(contextKey);
  const legacy=readCheckoutAttempt(storage.getItem(checkoutStorageKey));if(legacy?.requestKey===attempt.requestKey&&sameCheckoutIdentity(legacy,identity,attempt.origin))storage.removeItem(checkoutStorageKey);
 }catch{throw new BillingClientError('billing_retry_storage_unavailable');}
}


export async function continueCheckout(attempt:CheckoutAttempt,identity:BillingIdentity,origin:string,storage:CheckoutStorage,
 current:()=>boolean,fetcher:typeof fetch=fetch){
 if(!current())return null;
 if(!sameCheckoutIdentity(attempt,identity,origin))throw new BillingClientError('billing_return_binding_invalid');
 storeCheckoutAttempt(attempt,storage);
 const authorization=await submitCheckout(attempt,fetcher);
 let saved=rememberBillingAuthorization(attempt,authorization);storeCheckoutAttempt(saved,storage);
 // 원래 receipt는 저장하되 종료·전환된 화면에는 결과를 반영하지 않는다.
 if(!current())return null;
 if(authorization.sdk&&authorization.state==='awaiting'){
  saved=await bindCheckoutAuthorization(saved,authorization,origin);storeCheckoutAttempt(saved,storage);
  if(!current())return null;
 }
 return {attempt:saved,authorization};
}
