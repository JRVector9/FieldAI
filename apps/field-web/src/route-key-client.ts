type Identity={userId:string;sessionId:string};
export type RouteKeyContext=Identity&{organizationId:string;connectionId:string;origin:string};
export type RouteKeyStatus={closeId:string|null;state:'retained'|'pending'|'cancelled'|'closed';reason:string;keyRetained:boolean;requestedByCurrentActor:boolean};
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export class RouteKeyError extends Error {constructor(readonly code:string){super(code);}}
const sameIdentity=(a:Identity,b:Identity)=>a.userId===b.userId&&a.sessionId===b.sessionId;
function validContext(c:RouteKeyContext){
  let origin=false;try{const u=new URL(c.origin);origin=u.origin===c.origin&&!u.username&&!u.password&&(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname));}catch{/* invalid origin */}
  if(!origin||!uuid.test(c.organizationId)||!uuid.test(c.connectionId)||![c.userId,c.sessionId].every(v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\u0000-\u001f]/.test(v)))throw new RouteKeyError('route_key_session_changed');
}
async function request(path:string,options:RequestInit,fetcher:typeof fetch){
  let r:Response;try{r=await fetcher(path,{...options,credentials:'same-origin',cache:'no-store'});}catch{throw new RouteKeyError('route_key_result_unknown');}
  let body:unknown;try{body=await r.json();}catch{throw new RouteKeyError('route_key_result_unknown');}
  if(!r.ok){const e=object(body).error;throw new RouteKeyError(typeof e==='string'&&/^[a-z0-9_]{1,100}$/.test(e)?e:'route_key_result_unknown');}
  return body;
}
async function identity(fetcher:typeof fetch):Promise<Identity>{
  const value=object(await request('/api/auth/get-session',{},fetcher)),user=object(value.user),session=object(value.session);
  if(typeof user.id!=='string'||typeof session.id!=='string'||!user.id||!session.id||session.userId!==user.id)throw new RouteKeyError('route_key_session_changed');
  return {userId:user.id,sessionId:session.id};
}
function headers(c:RouteKeyContext){return {'x-field-route-key-actor-id':c.userId,'x-field-route-key-session-id':c.sessionId};}
function parseStatus(v:unknown):RouteKeyStatus{
  const s=object(v);if(Object.keys(s).some(k=>!['closeId','state','reason','keyRetained','requestedByCurrentActor'].includes(k))
    ||s.closeId!==null&&!uuid.test(String(s.closeId))||!['retained','pending','cancelled','closed'].includes(String(s.state))
    ||typeof s.reason!=='string'||!/^[a-z0-9_]{1,100}$/.test(s.reason)||typeof s.keyRetained!=='boolean'
    ||s.requestedByCurrentActor!==undefined&&typeof s.requestedByCurrentActor!=='boolean'
    ||s.state==='closed'&&s.keyRetained||s.state==='pending'&&s.closeId===null)throw new RouteKeyError('route_key_result_unknown');
  return {closeId:s.closeId as string|null,state:s.state as RouteKeyStatus['state'],reason:s.reason,keyRetained:s.keyRetained,requestedByCurrentActor:s.requestedByCurrentActor===true};
}
const storageKey=(c:RouteKeyContext)=>`field:route-key-close:v1:${encodeURIComponent(JSON.stringify([c.userId,c.sessionId,c.organizationId,c.connectionId,c.origin]))}`;
function readAttempt(c:RouteKeyContext,storage:StorageLike):{closeId:string;terminal?:'cancelled'}|null{
  let raw:string|null;try{raw=storage.getItem(storageKey(c));}catch{throw new RouteKeyError('route_key_storage_unavailable');}
  if(raw===null)return null;
  try{const v=object(JSON.parse(raw));if(Object.keys(v).every(k=>['version','closeId','terminal'].includes(k))&&v.version===1&&uuid.test(String(v.closeId))&&(v.terminal===undefined||v.terminal==='cancelled'))return {closeId:v.closeId as string,...(v.terminal==='cancelled'?{terminal:'cancelled' as const}:{})};}catch{/* retain invalid metadata without submitting */}
  throw new RouteKeyError('route_key_metadata_invalid');
}
export async function loadRouteKey(base:Pick<RouteKeyContext,'organizationId'|'connectionId'|'origin'>,fetcher:typeof fetch=fetch,current:()=>boolean=()=>true):Promise<{context:RouteKeyContext;status:RouteKeyStatus}>{
  const context={...base,...await identity(fetcher)};validContext(context);
  if(!current())throw new RouteKeyError('route_key_view_changed');
  const status=parseStatus(await request(`/v1/connections/ap/${context.connectionId}/route-key`,{headers:headers(context)},fetcher));
  const latest=await identity(fetcher);
  if(!current()||!sameIdentity(context,latest))throw new RouteKeyError('route_key_session_changed');
  return {context,status};
}
export async function closeRouteKey(context:RouteKeyContext,connectionStatus:string,confirmed:boolean,storage:StorageLike,fetcher:typeof fetch=fetch,current:()=>boolean=()=>true):Promise<RouteKeyStatus>{
  validContext(context);if(!confirmed||connectionStatus!=='revoked')throw new RouteKeyError('route_key_confirmation_required');
  const snapshot=await loadRouteKey(context,fetcher,current);
  if(!sameIdentity(snapshot.context,context)||!current())throw new RouteKeyError('route_key_session_changed');
  if(snapshot.status.state==='closed')return snapshot.status;
  const attempt=readAttempt(context,storage);
  let closeId=attempt?.terminal==='cancelled'?null:attempt?.closeId??null;
  if(snapshot.status.state==='pending'&&snapshot.status.requestedByCurrentActor){
    // Current server receipt survives session renewal and competing tab caches.
    closeId=snapshot.status.closeId;
    try{storage.setItem(storageKey(context),JSON.stringify({version:1,closeId}));}catch{throw new RouteKeyError('route_key_storage_unavailable');}
  }else if(snapshot.status.state==='pending'&&snapshot.status.closeId===closeId){
    throw new RouteKeyError('route_key_close_in_progress');
  }
  if(!closeId||snapshot.status.state==='cancelled'&&snapshot.status.closeId===closeId){
    closeId=crypto.randomUUID();
    try{storage.setItem(storageKey(context),JSON.stringify({version:1,closeId}));}catch{throw new RouteKeyError('route_key_storage_unavailable');}
  }
  if(!current())throw new RouteKeyError('route_key_view_changed');
  let failure:unknown,cancelled=false;
  try{
    const result=object(await request(`/v1/connections/ap/${context.connectionId}/route-key/close`,{method:'POST',headers:{...headers(context),'content-type':'application/json'},body:JSON.stringify({closeId,confirm:true})},fetcher));
    cancelled=result.closeId===closeId&&result.state==='cancelled'&&typeof result.reason==='string'&&/^[a-z0-9_]{1,100}$/.test(result.reason)&&Object.keys(result).every(k=>['closeId','state','reason'].includes(k));
  }catch(error){failure=error;}
  // The server receipt is authoritative even if the POST response was lost.
  const next=await loadRouteKey(context,fetcher,current);
  if(!sameIdentity(context,next.context))throw new RouteKeyError('route_key_session_changed');
  if(cancelled){
    try{storage.setItem(storageKey(context),JSON.stringify({version:1,closeId,terminal:'cancelled'}));}catch{throw new RouteKeyError('route_key_storage_unavailable');}
    throw new RouteKeyError('route_key_request_cancelled');
  }
  if(next.status.closeId===closeId&&['pending','closed','cancelled'].includes(next.status.state))return next.status;
  if(failure)throw failure;
  throw new RouteKeyError('route_key_result_unknown');
}
export function routeKeyReason(reason:string){return ({not_requested:'종료 요청 없음',reconciled:'원래 업무와 전달 기록 대조 완료',
  remote_revoke_unacknowledged:'AP 원격 회수 확인 대기',delivery_reconciliation_pending:'미확정 전달 기록 대조 대기',original_routes_unreconciled:'기존 예약의 고객 알림 경로 전환 대기',
  owner_permission_changed:'요청자의 사업장 owner 권한 변경',connection_snapshot_changed:'연결 정보 변경',
  route_key_result_unknown:'결과를 확인하지 못했습니다. 기존 요청을 유지하고 상태를 다시 확인해 주세요.',
  route_key_session_changed:'로그인이 변경됐습니다. 이 화면을 다시 열고 확인해 주세요.',route_key_view_changed:'연결 화면이 변경됐습니다. 현재 연결을 다시 확인해 주세요.',
  route_key_close_in_progress:'이미 종료 요청이 있습니다. 상태를 조회해 주세요.',route_key_close_not_ready:'연결 해제와 원격 회수를 먼저 확인해 주세요.',
  route_key_request_cancelled:'이전 종료 요청의 취소를 확인했습니다. 상태를 새로 확인하고 새 종료 요청에 동의해 주세요.',
  route_key_storage_unavailable:'요청 번호를 저장할 수 없습니다. 브라우저 저장 설정을 확인해 주세요.',route_key_metadata_invalid:'저장된 요청 기록을 확인할 수 없습니다. 관리자에게 확인해 주세요.',
  authentication_required:'Field 사업자 로그인이 필요합니다.',connection_not_found:'현재 계정에 이 연결의 owner 권한이 없습니다.',route_key_confirmation_required:'연결 해제 후 종료 내용을 확인해 주세요.'} as Record<string,string>)[reason]??'상태 확인이 필요합니다. 기존 예약과 종료 요청 기록은 유지됩니다.';}
