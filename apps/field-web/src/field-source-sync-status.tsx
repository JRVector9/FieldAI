import React from "react";

const sourceLabels={not_synced:"아직 수신되지 않음",pending_review:"AP 검토 대기",current:"AP 출처 승인 완료",
  stale:"정보가 오래되었습니다",unavailable:"출처 조회 불가",integrity_conflict:"정보 무결성 확인 필요",revoked:"출처 사용 중단"} as const;
export type SourceStatus={connectionId:string;sourceRevision:number;approvedSourceRevision:number|null;
  state:keyof typeof sourceLabels;syncedAt:string|null};
function receiptTimestamp(value:unknown):value is string {
  if(typeof value!=='string'||value.length>64)return false;
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if(!match||!Number.isFinite(Date.parse(value)))return false;
  const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number);
  const calendar=new Date(0);calendar.setUTCFullYear(year!,month!-1,day!);
  return calendar.getUTCFullYear()===year&&calendar.getUTCMonth()===month!-1&&calendar.getUTCDate()===day
    && hour!<24&&minute!<60&&second!<60&&(!match[7]||(Number(match[8])<24&&Number(match[9])<60));
}

export function parseSourceStatus(value:unknown,connectionId:string):SourceStatus|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const source=value as Record<string,unknown>;
  if(source.connectionId!==connectionId||typeof source.sourceRevision!=='number'||!Number.isSafeInteger(source.sourceRevision)||source.sourceRevision<0
    ||(source.approvedSourceRevision!==null&&(typeof source.approvedSourceRevision!=='number'||!Number.isSafeInteger(source.approvedSourceRevision)||source.approvedSourceRevision<1))
    ||typeof source.state!=='string'||!Object.hasOwn(sourceLabels,source.state)
    ||(source.syncedAt!==undefined&&source.syncedAt!==null&&!receiptTimestamp(source.syncedAt)))return null;
  return {connectionId,sourceRevision:source.sourceRevision,approvedSourceRevision:source.approvedSourceRevision as number|null,
    state:source.state as SourceStatus['state'],syncedAt:source.syncedAt as string|null|undefined??null};
}
export function FieldSourceSyncStatus({source}:{source:SourceStatus}) {
  return <div><p>AP 출처 상태 (추가): {sourceLabels[source.state]}</p>
    <p>현재 AP 저장 버전 수신 시각 (추가): {source.syncedAt
      ? <time dateTime={source.syncedAt}>{new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"medium"}).format(new Date(source.syncedAt))} (한국 시간)</time>
      : "수신 시각 기록 없음"}</p></div>;
}
