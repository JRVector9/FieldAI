"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DELETION_SCHEDULED_OWNER_MESSAGE, isDeletionScheduledAccess } from './deletion-scheduled-copy';

export function FieldOwnerDeletionMessage({ scheduled }: { scheduled: boolean }) {
  return scheduled ? <p className="state-message" role="status">{DELETION_SCHEDULED_OWNER_MESSAGE} <a href="/workspace/account">계정·조직 삭제 (추가)</a></p> : null;
}
export function observeOwnerDeletionStatus(target:EventTarget,loadStatus:()=>Promise<{status:number;access?:unknown}>,set:(scheduled:boolean)=>void) {
  let active=true,sequence=0;
  const load=async()=>{
    const request=++sequence;
    try{const response=await loadStatus();if(active&&request===sequence)set(response.status===200&&isDeletionScheduledAccess(response.access));}
    catch{/* Existing page errors report temporary network failures. */}
  };
  const sessionChanged=()=>{set(false);void load();};
  void load();target.addEventListener('focus',load);target.addEventListener('field-owner-session-changed',sessionChanged);
  return()=>{active=false;sequence++;target.removeEventListener('focus',load);target.removeEventListener('field-owner-session-changed',sessionChanged);};
}

// A-06: 모든 사업자 경로에 같은 실제 이용 상태를 안내한다. 구독·삭제 화면은 자체 상태 안내를 유지한다.
export function FieldOwnerDeletionNotice() {
  const pathname = usePathname();
  const [scheduled, setScheduled] = useState(false);
  useEffect(() => {
    setScheduled(false);
    if (pathname === '/workspace/subscription' || pathname === '/workspace/account') return;
    return observeOwnerDeletionStatus(window,async()=>{
        const response = await fetch('/v1/subscription', { credentials: 'same-origin', cache: 'no-store' });
        const result = await response.json() as { access?: unknown };
        return {status:response.status,access:result.access};
    },setScheduled);
  }, [pathname]);
  return <FieldOwnerDeletionMessage scheduled={scheduled} />;
}
