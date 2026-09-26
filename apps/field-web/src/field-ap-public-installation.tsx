"use client";

import { useCallback, useEffect, useState } from "react";
import { requestJson } from "./field-api";

type Connection={id:string;organizationId:string;apAgentName:string;apOrganizationId:string;apAgentId:string;scopes:string[];status:string};
export function installationChoices(connections:Connection[],organizationId:string):Connection[] {
  return connections.filter(c=>c.organizationId===organizationId&&["pending_field_consent","review_required"].includes(c.status)
    &&["ap.connections.create","ap.deployments.manage"].every(scope=>c.scopes.includes(scope)));
}
type Action="connect"|"prepare"|"verify"|"activate"|"install"|"pause"|"refresh";
type Intent={id:string;connectionId:string;apOrganizationId:string;apAgentId:string;origin:string;mode:string;revision:number;state:string;available:boolean;fieldStatus:string|null;
  deployment:{publicId:string;state:string;revision:number;verifiedAt:string|null}|null;
  pendingOperation:{requestKey:string;action:Action;expectedRevision:number;state:string;error:string|null}|null};
type Approval={requestKey:string;connectionId:string;origin:string;mode:"inline"|"floating";approval:true};
const stages:Record<string,{action:Action;label:string;description:string}>={
  created:{action:"connect",label:"AP 설치 연결 만들기",description:"이 주소의 설치 전용 연결만 만듭니다."},
  connection_prepared:{action:"prepare",label:"위젯 배포 준비",description:"배포 초안이며 고객에게 표시되지 않습니다."},
  deployment_prepared:{action:"verify",label:"사이트 소유 확인",description:"이 주소에 증명값을 저장하고 AP의 소유 확인을 요청합니다."},
  verified:{action:"activate",label:"AP 배포 활성화 승인",description:"승인된 AP 안내로 이 주소의 상담 배포를 활성화합니다. Field 표시 승인은 다음 단계입니다."},
  ap_active:{action:"install",label:"Field 사이트 표시 승인",description:"공식 AP SDK를 선택한 주소에 표시합니다. 새 배포의 대화 열람은 AP에서 별도 선택·재동의해야 합니다."},
  installed:{action:"pause",label:"상담 위젯 중지",description:"Field 표시를 먼저 중지하고 AP 배포 중지를 요청합니다."},
  paused:{action:"refresh",label:"AP 배포 상태 확인",description:"중지 기록을 유지합니다. 다시 활성화하려면 AP 현재 상태와 승인을 확인합니다."},
};
const stateNames:Record<string,string>={created:"설치 준비 승인 저장",connection_prepared:"설치 전용 연결 준비",deployment_prepared:"배포 초안 · 소유 확인 필요",
  verified:"소유 확인 완료 · 활성 승인 필요",ap_active:"AP 배포 활성 · Field 표시 승인 필요",installed:"Field 위젯 표시 승인됨",paused:"위젯 중지됨"};
const errors:Record<string,string>={blocked_integration:"AP 연결 설정이 없어 현재 사용할 수 없습니다.",ap_installation_scope_required:"AP 설치 연결·배포 관리 권한을 별도로 승인해 주세요.",
  ap_grant_unavailable:"AP 접근 권한이 만료되거나 회수됐습니다. AP에서 다시 승인해 주세요.",ap_grant_refresh_unknown:"AP 접근 갱신 결과를 확인하지 못했습니다. 기존 요청은 보존됩니다.",
  installation_authority_changed:"선택한 계정·권한·주소가 변경됐습니다. 새 승인을 확인해 주세요.",domain_not_verified:"AP가 사이트 소유를 확인하지 못했습니다. 공개 주소와 증명 경로를 확인해 주세요.",
  revision_conflict:"AP 배포가 변경됐습니다. 현재 상태를 확인한 뒤 다시 승인해 주세요.",installation_revision_conflict:"설치 상태가 변경됐습니다. 저장된 상태를 다시 확인해 주세요.",
  local_visibility_changed:"다른 화면에서 위젯 표시를 중지했습니다. 저장된 상태를 확인하고 다시 표시하려면 새로 승인해 주세요.",
  installation_intent_exists:"이 연결·주소의 설치 요청이 이미 있습니다. 저장된 요청에서 계속해 주세요.",installation_result_pending:"기존 요청의 결과를 먼저 확인해 주세요.",
  ap_public_write_result_unknown:"AP 요청 결과가 미상입니다. 원래 요청으로 결과를 확인해 주세요.",authentication_required:"Field 사업자 로그인이 필요합니다."};

export function FieldApPublicInstallation({organizationId,siteOrigin,published,onInstalled}:{organizationId:string|null;siteOrigin:string|null;published:boolean;onInstalled?:()=>void}) {
  const [connections,setConnections]=useState<Connection[]>([]),[intents,setIntents]=useState<Intent[]>([]);
  const [connectionId,setConnectionId]=useState(""),[mode,setMode]=useState<"inline"|"floating">("floating");
  const [approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  const [message,setMessage]=useState(""),[failed,setFailed]=useState(false),[pendingApproval,setPendingApproval]=useState<Approval|null>(null);
  const storageKey=organizationId?`field-ap-installation-approval:${organizationId}`:null;
  const headers=organizationId?{"x-organization-id":organizationId}:undefined;
  const load=useCallback(async()=>{
    if(!organizationId)return;
    try {
      const [a,b]=await Promise.all([requestJson("/v1/connections/ap","GET",undefined,undefined,{"x-organization-id":organizationId}),
        requestJson("/v1/sites/ap-public-installations","GET",undefined,undefined,{"x-organization-id":organizationId})]);
      if(a.status!==200||b.status!==200)throw new Error("load_failed");
      const available=installationChoices((a.data as {connections:Connection[]}).connections,organizationId);
      setConnections(available);setConnectionId(old=>available.some(c=>c.id===old)?old:available[0]?.id??"");
      setIntents((b.data as {intents:Intent[]}).intents);setLoaded(true);setFailed(false);
    }catch{setLoaded(false);setFailed(true);setMessage("설치 요청 상태를 확인하지 못했습니다. 기존 승인은 보존하며 새 요청을 만들지 않습니다.");}
  },[organizationId]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    setPendingApproval(null);
    if(!storageKey)return;
    // Browser receipt is only a resend cache; the Field DB owns approvals and results.
    try{const raw=sessionStorage.getItem(storageKey);if(raw)setPendingApproval(JSON.parse(raw) as Approval);}catch{setMessage("이 브라우저의 재시도 요청을 읽지 못했습니다. 저장된 설치 요청을 확인해 주세요.");}
  },[storageKey]);
  const report=(data:unknown)=>{const code=(data as {error?:string}).error;setMessage(code?errors[code]??"요청을 완료하지 못했습니다. 저장된 상태를 확인해 주세요.":"요청을 저장했습니다.");};
  async function start() {
    if(!organizationId||busy)return;setBusy(true);
    try{const result=await requestJson("/v1/connections/ap/start","POST",{organizationId,purpose:"installation"},undefined,headers);
      if(result.status===201)location.assign((result.data as {authorizationUrl:string}).authorizationUrl);else report(result.data);
    }catch{setMessage("AP 승인 시작 상태를 확인하지 못했습니다. 다시 확인해 주세요.");}finally{setBusy(false);}
  }
  async function approve() {
    if(!organizationId||!siteOrigin||!connectionId||busy)return;
    const snapshot=pendingApproval??{requestKey:crypto.randomUUID(),connectionId,origin:siteOrigin,mode,approval:true as const};
    if(!pendingApproval&&!approved)return;
    setPendingApproval(snapshot);if(storageKey)try{sessionStorage.setItem(storageKey,JSON.stringify(snapshot));}catch{/* Server remains the durable ledger. */}
    setBusy(true);
    try{const result=await requestJson("/v1/sites/ap-public-installations","POST",snapshot,undefined,headers);
      report(result.data);
      if(result.status===201 || result.status>=400&&result.status<500){setPendingApproval(null);if(storageKey)sessionStorage.removeItem(storageKey);setApproved(false);}
      await load();
    }catch{setMessage("설치 준비 응답을 확인하지 못했습니다. 선택값을 바꾸지 않고 원래 요청으로 확인해 주세요.");}finally{setBusy(false);}
  }
  async function act(intent:Intent,action:Action) {
    if(busy)return;setBusy(true);
    const operation=intent.pendingOperation??{requestKey:crypto.randomUUID(),action,expectedRevision:intent.revision};
    try{const result=await requestJson(`/v1/sites/ap-public-installations/${intent.id}/actions`,"POST",{
      requestKey:operation.requestKey,action:operation.action,expectedRevision:operation.expectedRevision},undefined,headers);
      report(result.data);await load();if(result.status===200&&["install","pause"].includes(operation.action))onInstalled?.();
    }catch{setMessage("응답을 확인하지 못했습니다. 원래 요청을 서버에 저장했으므로 상태를 다시 확인해 주세요.");await load();}finally{setBusy(false);}
  }
  async function pauseLocal() {
    if(busy)return;setBusy(true);
    try{const result=await requestJson("/v1/sites/ap-installation/pause","POST",{},undefined,headers);
      if(result.status===200){setMessage("Field 사이트의 위젯 표시를 중지했습니다. AP 배포 상태와 기존 미상 요청은 별도로 유지됩니다.");onInstalled?.();}else report(result.data);
      await load();
    }catch{setMessage("Field 중지 결과를 확인하지 못했습니다. 설치 상태를 다시 확인해 주세요.");}finally{setBusy(false);}
  }
  const current=intents,selected=connections.find(c=>c.id===connectionId);
  return <div className="field-ap-public-installation">
    <h3>이 화면에서 상담 설치 준비 (추가)</h3>
    <p>설치 연결·배포 관리 권한을 AP에서 별도로 승인합니다. 연결만으로 Field 정보·예약 권한이나 구독 결제가 시작되지 않습니다.</p>
    <button type="button" disabled={!organizationId||busy||Boolean(pendingApproval)} onClick={()=>void start()}>AP 설치 권한 승인 (추가)</button>
    {!organizationId&&<p>Field 사업장을 확인한 뒤 사용할 수 있습니다.</p>}
    {(!published||!siteOrigin)&&<p>사이트를 공개하고 정확한 주소를 확인한 뒤 설치할 수 있습니다. 직접 문의·예약은 AP 없이 사용할 수 있습니다.</p>}
    {message&&<p role={failed?"alert":"status"} className="state-message">{message}</p>}
    <button type="button" disabled={!organizationId||busy} onClick={()=>void load()}>저장된 설치 요청 확인</button>
    {intents.some(i=>i.state==="installed"||i.pendingOperation?.action==="pause")&&<button type="button" disabled={busy} onClick={()=>void pauseLocal()}>Field 위젯 표시만 중지 (추가)</button>}
    {loaded&&published&&siteOrigin&&<>
      {connections.length===0?<p>설치 권한이 승인된 AP 연결이 없습니다. 위에서 AP 조직과 AI를 선택하고 설치 권한을 승인해 주세요.</p>:<>
        <label>설치할 AP AI<select value={connectionId} disabled={busy||Boolean(pendingApproval)} onChange={e=>{setConnectionId(e.target.value);setApproved(false);}}>
          {connections.map(c=><option key={c.id} value={c.id}>{c.apAgentName} · {c.apOrganizationId}</option>)}</select></label>
        <p>AP 조직 {selected?.apOrganizationId} · AI {selected?.apAgentId}<br/>Field 조직 {organizationId}<br/>설치 주소 <code>{siteOrigin}</code></p>
        <label>표시 방식<select value={mode} disabled={busy||Boolean(pendingApproval)} onChange={e=>{setMode(e.target.value as "inline"|"floating");setApproved(false);}}><option value="floating">화면 구석 버튼</option><option value="inline">본문에 표시</option></select></label>
        <label className="checkline"><input type="checkbox" checked={approved} disabled={busy||Boolean(pendingApproval)} onChange={e=>setApproved(e.target.checked)}/>선택한 조직·AI·주소의 설치 준비를 승인합니다.</label>
        <button type="button" disabled={busy||!pendingApproval&&(!approved||!connectionId)} onClick={()=>void approve()}>{pendingApproval?"원래 설치 준비 요청 확인":"설치 준비 승인 저장 (추가)"}</button>
      </>}
      {current.map(intent=>{const stage=stages[intent.state==="installed"&&intent.fieldStatus!=="active"?"ap_active":intent.state];return <div className="state-message" key={intent.id}>
        <strong>{stateNames[intent.state]??"설치 상태 확인 필요"}</strong><p>AP 조직 {intent.apOrganizationId} · AI {intent.apAgentId}<br/>{intent.origin} · {intent.mode==="inline"?"본문에 표시":"화면 구석 버튼"}</p>
        {intent.deployment&&<p>배포 {intent.deployment.publicId} · 마지막 확인한 AP 상태 {intent.deployment.state}</p>}
        <p>Field 표시: {intent.fieldStatus==="active"?"표시 활성 · AP 상태는 별도":intent.fieldStatus==="paused"?"Field에서 중지됨":"아직 설치되지 않음"}</p>
        {!intent.available?<p role="alert">현재 이 요청의 계정·권한·주소를 사용할 수 없습니다. 직접 문의와 예약은 유지됩니다.</p>:
          intent.pendingOperation?<><p>원래 {intent.pendingOperation.action} 요청 결과 {intent.pendingOperation.state==="unknown"?"미상":"확인 중"}. 선택값을 바꾸거나 새 요청을 만들지 않습니다.</p><button type="button" disabled={busy} onClick={()=>void act(intent,intent.pendingOperation!.action)}>원래 요청 결과 확인</button></>:
            stage&&<><p>{stage.description}</p><button type="button" disabled={busy} onClick={()=>void act(intent,stage.action)}>{stage.label} (추가)</button>
              {intent.deployment&&stage.action!=="refresh"&&<button type="button" disabled={busy} onClick={()=>void act(intent,"refresh")}>AP 현재 상태 확인</button>}
              {intent.deployment&&stage.action!=="pause"&&<button type="button" disabled={busy} onClick={()=>void act(intent,"pause")}>위젯 중지</button>}</>}
      </div>;})}
    </>}
  </div>;
}
