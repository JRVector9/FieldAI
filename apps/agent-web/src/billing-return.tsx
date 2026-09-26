"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brand } from '@fieldai/ui';
import { BillingClientError, authorizationNotice, billingErrorNotice, billingProduct, consumeBillingReturn,
  confirmBillingReturn, currentBillingIdentity, getBillingAuthorization, restoreCheckoutReturnAttempt,
  type BillingReturn, type CheckoutAttempt } from './billing-client';

export function AgentBillingReturn() {
  const productName=({agent:'AP',field:'Field'})[billingProduct];
  const seen=useRef(false),callback=useRef<BillingReturn|null>(null),attempt=useRef<CheckoutAttempt|null>(null);
  const [busy,setBusy]=useState(true),[notice,setNotice]=useState('원래 로그인과 카드 인증 요청을 확인하는 중입니다.');
  const [canRetry,setCanRetry]=useState(false),[canRead,setCanRead]=useState(false);
  const refresh=useCallback(async(confirm=false)=>{
    setBusy(true);
    try {
      const saved=attempt.current;
      if(!saved)throw new Error('no_intent');
      const identity=await currentBillingIdentity();
      if(saved.product!==billingProduct||saved.actorUserId!==identity.userId||saved.sessionId!==identity.sessionId
        ||saved.origin!==window.location.origin)throw new BillingClientError('billing_return_binding_invalid');
      const result=confirm&&callback.current?.kind==='success'
        ?await confirmBillingReturn(callback.current,saved,identity,window.location.origin)
        :await getBillingAuthorization(saved);
      setNotice(authorizationNotice(result.state));setCanRead(true);
      if(result.state!=='awaiting'){callback.current=null;setCanRetry(false);}
    }catch(error){
      const saved=attempt.current;
      setNotice(saved?billingErrorNotice(error):'이 창에 원래 카드 인증 요청이 없습니다. 구독 화면에서 기존 요청 상태를 확인해 주세요.');
      setCanRead(Boolean(saved?.authorizationId));setCanRetry(callback.current?.kind==='success');
    }finally{setBusy(false);}
  },[]);
  useEffect(()=>{
    if(seen.current)return;seen.current=true;
    callback.current=consumeBillingReturn(window.location.href,path=>window.history.replaceState(null,'',path));
    void (async()=>{
      try{
        const identity=await currentBillingIdentity();
        attempt.current=restoreCheckoutReturnAttempt(callback.current?.authorizationId??null,identity,window.location.origin,window.sessionStorage);
        if(callback.current?.kind==='failure'){
          setNotice('카드 등록창을 완료하지 못했습니다. 기존 인증 요청의 실제 상태를 확인해 주세요.');
          setCanRead(Boolean(attempt.current?.authorizationId));setBusy(false);return;
        }
        await refresh(callback.current?.kind==='success');
      }catch(error){setNotice(billingErrorNotice(error));setBusy(false);}
    })();
  },[refresh]);
  return <div className="site-shell"><header className="site-header"><a href="/"><Brand product={({agent:'Agent Platform',field:'Field'} as const)[billingProduct]} /></a>
    <nav aria-label="구독 메뉴"><a href="/workspace/subscription">구독·청구</a><a href="/workspace">관리실</a></nav></header>
    <main className="feature-section"><div className="feature-heading"><h1>{productName} 카드 인증 결과 (추가)</h1>
      <p>카드 인증과 구독 결제 결과를 각각 확인합니다.</p></div><section className="special-panel">
      <p role="status">{notice}</p>
      {canRead&&<button type="button" disabled={busy} onClick={()=>void refresh()}>기존 인증 상태 다시 조회</button>}
      {canRetry&&<button type="button" disabled={busy} onClick={()=>void refresh(true)}>같은 인증 결과 다시 접수 (추가)</button>}
      <p><a href="/workspace/subscription">구독·결제 내역 확인</a></p>
      <p>카드 인증을 접수했거나 인증이 완료됐다는 안내만으로 구독료가 결제된 것은 아닙니다. 결제 내역에서 확인해 주세요.</p>
    </section></main></div>;
}
