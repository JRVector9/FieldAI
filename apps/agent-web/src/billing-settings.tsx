"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {BillingClientError,authorizationNotice,billingErrorNotice,continueCheckout,billingProduct,forgetCheckoutAttempt,restoreCheckoutAttempt,
  createCheckoutAttempt,currentBillingIdentity,getBillingAuthorization,openBillingSdk,parseBillingPlan,
  type BillingPlan,type CheckoutAttempt} from './billing-client';
import {prepareBillingMutation,restoreBillingMutation,submitBillingMutation,type BillingMutationAttempt,
  type BillingMutationContext} from './billing-mutation-client';
import './billing-settings.css';

type Period={id:string;subscriptionId:string;billingPeriod:number;startsAt:string|null;endsAt:string|null;totalAmount:number;
  supplyAmount:number;vatAmount:number;taxFreeAmount:number|null;state:string;paidAt:string|null;refundedAmount:number};
type Snapshot={currentPlan:BillingPlan|null;product:string;organizationId:string;canManage:boolean;access:{mode:string;canStartNew:boolean;periodId?:string|null;endsAt:string|null;graceEndsAt:string|null};
  subscription:{id:string;planId:string;state:string;anchorAt:string|null;cancelRequestedAt:string|null;terminatedAt:string|null}|null;
  periods:Period[];transactions:Array<{id:string;periodId:string;orderId:string;state:string;mode:string;errorCode:string|null}>};
type Refund={id:string;periodId:string;amount:number;state:string;reason:string;createdAt:string};
type Usage={product:string;organizationId:string;period:{start:string;end:string};ai:Record<string,number>};
const date=(s:string|null)=>s?new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'확인 중';
const money=(n:number)=>Number.isSafeInteger(n)?`${n.toLocaleString('ko-KR')}원`:'확인 중';
const stateLabel=(s:string)=>({paid:'결제 완료',completed:'처리 완료',pending:'처리 대기',processing:'처리 중',unknown:'결과 확인 필요',
  failed:'거절',canceled:'취소',refunded:'환불 반영',blocked_integration:'연결 확인 필요',requested:'검토 요청',reviewed:'검토 완료',
  succeeded:'환불 완료',rejected:'반려',awaiting:'인증 대기'} as Record<string,string>)[s]??'상태 확인 필요';
async function request(path:string,organizationId:string,method='GET',body?:unknown,key?:string){
  let response:Response;
  try{response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'x-organization-id':organizationId,
    ...(body===undefined?{}:{'content-type':'application/json'}),...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
  catch{throw new BillingClientError('billing_result_unknown');}
  let value:unknown;try{value=await response.json();}catch{throw new BillingClientError('billing_result_unknown',response.status);}
  if(!response.ok){const code=(value as {error?:unknown})?.error;
    throw new BillingClientError(typeof code==='string'&&/^[a-z_]{1,100}$/.test(code)?code:'billing_request_refused',response.status);}
  return value;
}
export function AgentBillingSettings({organizationId,canManage}:{organizationId:string;canManage:boolean}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[plans,setPlans]=useState<BillingPlan[]>([]),[usage,setUsage]=useState<Usage|null>(null);
  const [selected,setSelected]=useState(''),[agreed,setAgreed]=useState(false),[autoRenew,setAutoRenew]=useState(false),[busy,setBusy]=useState(false);
  const [notice,setNotice]=useState(''),[stale,setStale]=useState(true),[attempt,setAttempt]=useState<CheckoutAttempt|null>(null);
  const [refunds,setRefunds]=useState<Refund[]|null>(null),[refundPeriod,setRefundPeriod]=useState(''),[refundAmount,setRefundAmount]=useState(''),[refundReason,setRefundReason]=useState('');
  const [pendingRefund,setPendingRefund]=useState<BillingMutationAttempt|null>(null),[pendingCancel,setPendingCancel]=useState<BillingMutationAttempt|null>(null);
  const currentOrg=useRef(organizationId),loadGeneration=useRef(0),viewEpoch=useRef(0);currentOrg.current=organizationId;
  function currentView(){const epoch=viewEpoch.current;return()=>currentOrg.current===organizationId&&viewEpoch.current===epoch;}
  const load=useCallback(async()=>{
    if(currentOrg.current!==organizationId)return;
    const generation=++loadGeneration.current;
    const current=()=>currentOrg.current===organizationId&&loadGeneration.current===generation;
    setBusy(true);setStale(true);
    try{
      const [raw,price]=await Promise.all([request('/v1/subscription/billing',organizationId),request('/v1/subscription/plans',organizationId)]);
      const value=raw as Snapshot,p=price as {product:string;plans:unknown[]};
      if(value.product!==billingProduct||value.organizationId!==organizationId||typeof value.canManage!=='boolean'
        ||!value.access||!Array.isArray(value.periods)||!Array.isArray(value.transactions)||p.product!==billingProduct||!Array.isArray(p.plans))throw new BillingClientError('billing_result_unknown');
      const subscribedPlan=value.currentPlan===null?null:parseBillingPlan(value.currentPlan);
      if(value.subscription&&(!subscribedPlan||subscribedPlan.id!==value.subscription.planId))throw new BillingClientError('billing_result_unknown');
      value.currentPlan=subscribedPlan;
      const list=p.plans.map(parseBillingPlan);if(list.some(v=>!v))throw new BillingClientError('billing_result_unknown');
      if(!current())return;
      setSnapshot(value);setPlans(list as BillingPlan[]);setSelected(old=>list.some(v=>v!.id===old)?old:list[0]?.id??'');setStale(false);
    }catch(error){if(current())setNotice(billingErrorNotice(error));}
    finally{if(current())setBusy(false);}
    try{const u=await request('/v1/usage/summary',organizationId) as Usage;
      if(current())setUsage(u.product===billingProduct&&u.organizationId===organizationId&&u.ai&&u.period?u:null);}catch{if(current())setUsage(null);}
    try{const r=await request('/v1/subscription/refunds',organizationId) as {product:string;organizationId:string;refunds:Refund[]};
      if(current())setRefunds(r.product===billingProduct&&r.organizationId===organizationId&&Array.isArray(r.refunds)?r.refunds:null);}catch{if(current())setRefunds(null);}
  },[organizationId]);
  useEffect(()=>{
    setSnapshot(null);setUsage(null);setRefunds(null);setPlans([]);setStale(true);setAgreed(false);setAutoRenew(false);setPendingRefund(null);setPendingCancel(null);setRefundPeriod('');setRefundAmount('');setRefundReason('');
    setAttempt(null);
    void load();
    let active=true;
    void currentBillingIdentity().then(identity=>{
      if(!active)return;
      setAttempt(restoreCheckoutAttempt(identity,organizationId,location.origin,sessionStorage));
      const context={...identity,organizationId,origin:location.origin};
      const refund=restoreBillingMutation('refund',context,sessionStorage);
      setPendingRefund(refund);setPendingCancel(restoreBillingMutation('cancel-renewal',context,sessionStorage));
      if(refund&&'periodId' in refund.body){setRefundPeriod(refund.body.periodId);setRefundAmount(String(refund.body.amount));setRefundReason(refund.body.reason);}
    }).catch(error=>{if(active)setNotice(billingErrorNotice(error));});
    return()=>{active=false;loadGeneration.current++;viewEpoch.current++;};
  },[load]);
  const plan=attempt?.organizationId===organizationId?attempt.plan:plans.find(p=>p.id===selected)??null;
  const allowed=canManage&&snapshot?.organizationId===organizationId&&snapshot.canManage&&!stale;
  const existing=snapshot?.subscription;
  async function checkout(){
    if(!allowed||!plan||!agreed||!autoRenew||busy)return;
    const current=currentView();setBusy(true);setNotice('');
    try{
      const identity=await currentBillingIdentity();if(!current())return;
      if(attempt&&(attempt.organizationId!==organizationId||attempt.actorUserId!==identity.userId||attempt.sessionId!==identity.sessionId||attempt.plan.id!==plan.id))
        throw new BillingClientError('billing_return_binding_invalid');
      const original=attempt??createCheckoutAttempt(identity,organizationId,plan,crypto.randomUUID(),location.origin);
      setAttempt(original);
      const result=await continueCheckout(original,identity,location.origin,sessionStorage,current);
      if(!result||!current())return;
      setAttempt(result.attempt);setNotice(authorizationNotice(result.authorization.state));
      if(result.authorization.sdk&&result.authorization.state==='awaiting')
        await openBillingSdk(result.attempt,result.authorization,identity,location.origin,undefined,current);
    }catch(error){if(current())setNotice(billingErrorNotice(error));}finally{if(current())setBusy(false);}
  }
  async function readAuthorization(){
    if(!attempt?.authorizationId||busy)return;const current=currentView();setBusy(true);
    try{const identity=await currentBillingIdentity();if(!current())return;
      if(attempt.organizationId!==organizationId||attempt.actorUserId!==identity.userId||attempt.sessionId!==identity.sessionId)throw new BillingClientError('billing_return_binding_invalid');
      const result=await getBillingAuthorization(attempt);if(current())setNotice(authorizationNotice(result.state));}
    catch(error){if(current())setNotice(billingErrorNotice(error));}finally{if(current())setBusy(false);}
  }
  async function mutationContext():Promise<BillingMutationContext>{
    const identity=await currentBillingIdentity();
    if(currentOrg.current!==organizationId)throw new BillingClientError('billing_return_binding_invalid');
    return {...identity,organizationId,origin:location.origin};
  }
  async function cancelRenewal(){
    if(!allowed||!existing||busy)return;const current=currentView();setBusy(true);
    try{
      const context=await mutationContext();if(!current())return;
      const attempt=prepareBillingMutation('cancel-renewal',{subscriptionId:existing.id},context,sessionStorage);
      setPendingCancel(attempt);await submitBillingMutation(attempt,context,sessionStorage);if(!current())return;setPendingCancel(null);
      setNotice('다음 갱신 중지를 기록했습니다. 남은 유료 기간과 기존 업무는 유지됩니다. 환불은 별도로 요청합니다.');await load();
    }catch(error){if(current())setNotice(billingErrorNotice(error));}finally{if(current())setBusy(false);}
  }
  async function requestRefund(){
    const amount=Number(refundAmount);if(!allowed||busy||!refundPeriod||!Number.isSafeInteger(amount)||amount<1||refundReason.trim().length<10)return;
    const current=currentView();setBusy(true);let context:BillingMutationContext|null=null;
    try{
      context=await mutationContext();if(!current())return;
      const attempt=prepareBillingMutation('refund',{periodId:refundPeriod,amount,reason:refundReason.trim()},context,sessionStorage);
      setPendingRefund(attempt);await submitBillingMutation(attempt,context,sessionStorage);if(!current())return;setPendingRefund(null);
      setNotice('환불 검토 요청을 접수했습니다. 실제 환불 완료가 아닙니다.');setRefundReason('');setRefundAmount('');await load();
    }catch(error){
      if(!current())return;setNotice(billingErrorNotice(error));
      if(context)try{setPendingRefund(restoreBillingMutation('refund',context,sessionStorage));}catch{/* Preserve pending identity until verified. */}
    }finally{if(current())setBusy(false);}
  }
  function newSubscription(){
    if(!attempt?.authorizationId||!existing?.terminatedAt||attempt.subscriptionId!==existing.id)return;
    try{forgetCheckoutAttempt(attempt,sessionStorage);setAttempt(null);setAgreed(false);setAutoRenew(false);setNotice('새 구독 조건에 다시 동의해 주세요.');}
    catch(error){setNotice(billingErrorNotice(error));}
  }
  const currentPeriod=snapshot?.periods.find(p=>snapshot.access.mode==='paid'&&p.id===snapshot.access.periodId);
  const title=({agent:'AP',field:'Field'})[billingProduct];
  const usageEntries=usage?Object.entries(usage.ai).filter(([name])=>['customerAnswers','ownerTests','completedProposals','recordedCalls'].includes(name)):[];
  const usageLabel:Record<string,string>={customerAnswers:'AI 고객 안내',ownerTests:'AI 답변 테스트',completedProposals:'AI 사이트 수정',recordedCalls:'기록된 모델 응답'};
  return <section className="agent-billing-settings" aria-label={`${title} 유료 구독`}>
    <div className="row-between"><h2>구독·청구</h2><button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void load()}>상태 새로고침</button></div>
    {notice&&<p className="notice mt24" role="status">{notice}</p>}{stale&&<p className="field-note mt16">현재 상태를 확인하지 못했습니다. 마지막 표시값으로 구독을 변경할 수 없습니다.</p>}
    <div className="billing-layout mt24"><section className="card price-card"><div className="row-between"><h2>{plan?.name??'승인된 플랜'}</h2>
      <span className="badge">{snapshot?.access.mode==='paid'?'현재 유료 이용 중':snapshot?.access.mode==='grace'?'결제 유예 중':existing?.cancelRequestedAt?'갱신 중지':'유료 미구독'}</span></div>
      <p className="small muted mt8">신청할 승인 플랜 · {title} 구독을 별도로 관리합니다.</p>
      {plans.length>1&&!attempt&&<label className="field-note mt16">가격 버전 선택 (추가)<select className="input" value={selected} disabled={busy||Boolean(attempt)} onChange={e=>{setSelected(e.target.value);setAgreed(false);setAutoRenew(false);}}>{plans.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.totalAmount)}</option>)}</select></label>}
      {plan?<><div className="plan-price">{plan.supplyAmount.toLocaleString('ko-KR')}<span>원 / 월</span></div><p className="small muted">부가세 포함 {money(plan.totalAmount)}{plan.mode==='test'?' · 테스트 가격':''}</p>
        <ul className="features-list"><li>✓ {title} 자체 구독</li><li>✓ 승인된 AI 제공량 {plan.includedAiUnits.toLocaleString('ko-KR')}회</li><li>✓ 월 갱신 · Asia/Seoul 기준일 유지</li><li>✓ 승인된 결제 유예 {plan.graceDays}일</li></ul>
        <details><summary>구독 조건·환불 조건 확인</summary><p className="field-note mt8">{plan.termsText}</p><p className="field-note mt8">{plan.refundText}</p></details>
        <label className="checkline mt16"><input type="checkbox" checked={agreed} disabled={busy||!allowed} onChange={e=>setAgreed(e.target.checked)}/><span>금액·세금·제공량·구독 및 환불 조건에 동의합니다.</span></label>
        <label className="checkline mt8"><input type="checkbox" checked={autoRenew} disabled={busy||!allowed} onChange={e=>setAutoRenew(e.target.checked)}/><span>카드 인증 후 최초 청구와 같은 조건의 월 자동 갱신에 동의합니다.</span></label>
        <button className="btn btn-primary btn-lg wfull mt16" type="button" disabled={busy||!allowed||!agreed||!autoRenew||plan.taxFreeAmount===null||Boolean(existing&&!existing.terminatedAt&&attempt?.subscriptionId!==existing.id)} onClick={()=>void checkout()}>{attempt?'기존 구독 신청 이어가기':'플랜 선택·카드 등록'}</button>
        {plan.taxFreeAmount===null&&<p className="field-note mt8">면세 조건이 승인되지 않아 신청할 수 없습니다.</p>}</>:<p className="field-note mt24">신청할 수 있는 승인된 독립 가격이 없습니다. 승인 전에는 카드 등록과 청구를 시작하지 않습니다.</p>}
      {existing&&<p className="field-note mt16">기존 구독: {snapshot?.currentPlan?.name} · 부가세 포함 {money(snapshot?.currentPlan?.totalAmount??NaN)} · AI 제공량 {snapshot?.currentPlan?.includedAiUnits.toLocaleString('ko-KR')}회. 새 플랜을 선택해도 기존 구독 조건은 변경되지 않습니다.</p>}
      {existing&&!existing.terminatedAt&&attempt?.subscriptionId!==existing.id&&<p className="field-note mt8">기존 구독이 있어 새 카드 등록은 제한됩니다. 기존 구독의 갱신·내역을 확인해 주세요.</p>}
      {!canManage&&<p className="field-note mt16">조직 owner만 구독을 변경할 수 있습니다.</p>}
      <p className="field-note mt16">체험 종료만으로 결제되지 않습니다. 구독 신청과 결제 동의가 필요합니다.</p>
      {attempt?.authorizationId&&<button className="btn btn-secondary mt16" type="button" disabled={busy} onClick={()=>void readAuthorization()}>기존 카드 인증 상태 확인 (추가)</button>}
      {existing&&(!existing.cancelRequestedAt&&!existing.terminatedAt||Boolean(pendingCancel))&&<button className="btn btn-secondary mt16" type="button" disabled={busy||!allowed} onClick={()=>void cancelRenewal()}>{pendingCancel?'같은 갱신 중지 결과 확인':'다음 갱신 중지'}</button>}
      {existing?.terminatedAt&&attempt?.subscriptionId===existing.id&&<button className="btn btn-secondary mt16" type="button" disabled={busy} onClick={newSubscription}>새 구독 신청 (추가)</button>}
    </section><section className="card card-pad"><h2>이번 기간 사용량</h2>{usage?<p className="small muted mt8">{date(usage.period.start)}–{date(usage.period.end)} 집계</p>:<p className="field-note mt8">현재 사용량을 확인하지 못했습니다.</p>}
      {usageEntries.map(([name,value])=><div key={name} className="usage-row"><div className="row-between"><strong>{usageLabel[name]}</strong><span className="muted">{value.toLocaleString('ko-KR')}회</span></div></div>)}
      {currentPeriod&&<p className="field-note mt16">현재 결제 기간: {date(currentPeriod.startsAt)}–{date(currentPeriod.endsAt)} · 실제 결제 {money(currentPeriod.totalAmount)}</p>}
      {snapshot?.access.mode==='grace'&&<p className="field-note mt16">유예 종료: {date(snapshot.access.graceEndsAt)}</p>}
      {snapshot?.access.mode==='cleanup_only'&&<p className="field-note mt16">새 업무는 제한됩니다. 기존 문의·예약 처리와 기록 내보내기는 유지됩니다.</p>}
      <p className="notice mt24">사용량을 초과해도 동의 없이 추가 결제하지 않습니다.</p><p className="field-note mt16">위 사용량 집계와 결제 기간은 각각의 날짜 범위를 기준으로 합니다.</p>
    </section></div>
    <section className="card setting-section mt24"><h2>결제 내역</h2>{!snapshot?<p className="field-note mt16">결제 내역을 확인하지 못했습니다.</p>:snapshot.periods.length===0?<div className="empty"><p>아직 결제 내역이 없습니다.</p></div>:<div className="payment-list">{snapshot.periods.map(p=><article className="setting-row" key={p.id}><div><strong>{money(p.totalAmount)} · {stateLabel(p.state)}</strong><p>{date(p.startsAt)}–{date(p.endsAt)}</p><p>공급가액 {money(p.supplyAmount)} · 부가세 {money(p.vatAmount)} · 환불 반영 {money(p.refundedAmount)}</p>
      {snapshot.transactions.filter(t=>t.periodId===p.id).map(t=><p key={t.id}>{t.mode==='test'?'테스트 거래':'결제 거래'} · {stateLabel(t.state)} · 주문 {t.orderId}</p>)}</div><button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void load()}>결과 조회</button></article>)}</div>}
    </section>
    <section className="card setting-section mt24"><h2>구독 환불 요청 (추가)</h2><p className="field-note mt8">해지와 환불은 별도입니다. 고객 서비스 대금의 환불은 이 화면에서 처리하지 않습니다.</p>
      {refunds===null?<p className="field-note mt16">환불 상태를 확인하지 못했습니다.</p>:<>{refunds.length===0?<p className="field-note mt16">환불 요청 내역이 없습니다.</p>:refunds.map(r=><div className="setting-row" key={r.id}><strong>{money(r.amount)} · {stateLabel(r.state)}</strong><span className="small muted">{date(r.createdAt)}</span></div>)}
      {canManage&&<form className="refund-form mt24" onSubmit={e=>{e.preventDefault();void requestRefund();}}><label>결제 기간<select className="input" required value={refundPeriod} disabled={busy||Boolean(pendingRefund)} onChange={e=>setRefundPeriod(e.target.value)}><option value="">선택해 주세요</option>{snapshot?.periods.filter(p=>p.paidAt&&p.refundedAmount<p.totalAmount).map(p=><option value={p.id} key={p.id}>{date(p.startsAt)} · {money(p.totalAmount-p.refundedAmount)}</option>)}</select></label>
        <label>요청 금액<input className="input" type="number" min="1" step="1" required value={refundAmount} disabled={busy||Boolean(pendingRefund)} onChange={e=>setRefundAmount(e.target.value)}/></label>
        <label>요청 사유<textarea className="input" required minLength={10} maxLength={500} value={refundReason} disabled={busy||Boolean(pendingRefund)} onChange={e=>setRefundReason(e.target.value)}/></label>
        <button className="btn btn-secondary" type="submit" disabled={busy||!allowed||!refundPeriod||refundReason.trim().length<10}>{pendingRefund?'같은 환불 요청 다시 접수':'환불 검토 요청'}</button></form>}
      </>}
    </section>
  </section>;
}
