"use client";

import {useCallback,useEffect,useRef,useState} from 'react';
import {closeRouteKey,loadRouteKey,RouteKeyError,routeKeyReason,type RouteKeyContext,type RouteKeyStatus} from './route-key-client';

export function FieldRouteKey({organizationId,connectionId,connectionStatus}:{organizationId:string;connectionId:string;connectionStatus:string}){
  const [snapshot,setSnapshot]=useState<{context:RouteKeyContext;status:RouteKeyStatus}|null>(null);
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [confirmed,setConfirmed]=useState(false);
  const epoch=useRef(0);
  const refresh=useCallback(async()=>{
    const n=++epoch.current;setBusy(true);setConfirmed(false);setSnapshot(null);setMessage('연결 키 상태를 확인하고 있습니다.');
    try{const next=await loadRouteKey({organizationId,connectionId,origin:location.origin},fetch,()=>epoch.current===n);
      if(epoch.current===n){setSnapshot(next);setMessage('');}}
    catch(error){if(epoch.current===n)setMessage(routeKeyReason(error instanceof RouteKeyError?error.code:'route_key_result_unknown'));}
    finally{if(epoch.current===n)setBusy(false);}
  },[organizationId,connectionId]);
  useEffect(()=>{void refresh();return()=>{epoch.current++;};},[refresh,connectionStatus]);
  async function close(){
    if(!snapshot||busy||!confirmed)return;const n=++epoch.current;setBusy(true);setMessage('기존 업무 대조와 연결 키 종료를 요청하고 있습니다.');
    try{const status=await closeRouteKey(snapshot.context,connectionStatus,confirmed,localStorage,fetch,()=>epoch.current===n);
      if(epoch.current===n){setSnapshot({...snapshot,status});setMessage('');}}
    catch(error){if(epoch.current===n){setSnapshot(null);setMessage(routeKeyReason(error instanceof RouteKeyError?error.code:'route_key_result_unknown'));}}
    finally{if(epoch.current===n){setBusy(false);setConfirmed(false);}}
  }
  return <div className="state-message"><h3>연결 키 종료 (추가)</h3>
    <p>해제된 연결의 사건 확인 키를 종료합니다. 기존 예약·대화·고객 확인키와 구독은 유지됩니다.</p>
    {message&&<p role="status">{message}</p>}
    {snapshot&&<><p>키 상태: {snapshot.status.state==='closed'?'종료 완료':snapshot.status.state==='pending'?'종료 대기':snapshot.status.state==='cancelled'?'종료 요청 취소':'보관 중'} · {snapshot.status.keyRetained?'확인 키 보관':'확인 키 없음'}</p>
      <p>{routeKeyReason(snapshot.status.reason)}</p>
      {snapshot.status.closeId&&<p>종료 요청 번호: <code>{snapshot.status.closeId}</code></p>}
      {connectionStatus==='revoked'&&snapshot.status.state!=='closed'&&snapshot.status.keyRetained&&<><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/> 기존 업무와 AP 회수를 대조한 뒤 이 연결의 사건 확인 키를 종료하도록 요청합니다.</label>
        <button type="button" disabled={busy||!confirmed} onClick={()=>void close()}>연결 키 종료 요청</button></>}
      {connectionStatus!=='revoked'&&<p>연결을 해제한 뒤 키 종료를 요청할 수 있습니다.</p>}</>}
    <button type="button" disabled={busy} onClick={()=>void refresh()}>키 상태 다시 확인</button>
  </div>;
}
