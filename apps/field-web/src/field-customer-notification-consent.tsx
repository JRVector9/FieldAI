"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { readCustomerNotificationConsent, updateCustomerNotificationConsent, type CustomerNotificationConsent, type CustomerNotificationTarget } from "./field-customer-notification-model";
import "./field-customer-notification-consent.css";

export function FieldCustomerNotificationConsent({ kind, id, receiptKey }: CustomerNotificationTarget) {
  const [data,setData]=useState<CustomerNotificationConsent|null>(null);
  const [kakao,setKakao]=useState(false),[sms,setSms]=useState(false);
  const [busy,setBusy]=useState(true),[notice,setNotice]=useState("");
  const [unknown,setUnknown]=useState(false),[failed,setFailed]=useState(false);
  const generation=useRef(0);
  const read=useCallback(async()=>{
    const current=generation.current;setBusy(true);setFailed(false);
    try{const loaded=await readCustomerNotificationConsent({kind,id,receiptKey});if(current!==generation.current)return false;
      setData(loaded);setKakao(loaded.kakao);setSms(loaded.sms);setUnknown(false);return true;
    }catch(error){if(current===generation.current){setData(null);setFailed(true);setNotice(error instanceof Error&&error.message==='current_receipt_required'?"현재 접수 확인키로 다시 열어 주세요. 전화번호만으로 설정을 바꿀 수 없습니다.":error instanceof Error&&error.message==='receipt_rate_limited'?"확인키 확인 시도가 일시 제한됐습니다. 잠시 뒤 다시 확인해 주세요.":"알림 동의 상태를 확인하지 못했습니다. 다시 확인해 주세요.");}return false;
    }finally{if(current===generation.current)setBusy(false);}
  },[kind,id,receiptKey]);
  useEffect(()=>{generation.current++;setData(null);setNotice("");setUnknown(false);void read();return()=>{generation.current++;};},[read]);
  async function save(event:FormEvent){event.preventDefault();if(busy||unknown||!data)return;const current=generation.current;setBusy(true);setNotice("");
    try{const result=await updateCustomerNotificationConsent({kind,id,receiptKey},{kakao,sms});if(current!==generation.current)return;
      if(result.settings){setData(result.settings);setKakao(result.settings.kakao);setSms(result.settings.sms);}
      if(result.outcome==='confirmed'){setUnknown(false);setNotice(kakao?"서비스 알림 동의가 저장된 것을 확인했습니다. 실제 발송·열람은 별도이며 공급사 연결 전에는 발송되지 않습니다.":"서비스 알림 동의 철회를 확인했습니다. 기존 문의·예약과 확인키는 유지됩니다.");}
      else if(result.outcome==='unknown'){setUnknown(true);setNotice("저장 결과를 아직 확인하지 못했습니다. 새 동의를 보내기 전에 현재 상태를 다시 확인해 주세요.");}
      else{setNotice(result.error==='current_receipt_required'?"현재 접수 확인키로 다시 열어 주세요.":result.error==='blocked_integration'?"알림 동의 저장 환경이 연결되지 않았습니다. 철회는 현재 확인키로 할 수 있습니다.":"동의를 저장하지 못했습니다. 현재 확인키와 설정을 다시 확인해 주세요.");}
    }catch{if(current===generation.current){setUnknown(true);setNotice("저장 결과를 확인하지 못했습니다. 현재 상태를 다시 확인해 주세요.");}}
    finally{if(current===generation.current)setBusy(false);}
  }
  const canEnable=data?.storageState==='configured';
  return <section className="field-customer-notification-consent"><h3>서비스 알림 수신 설정 (추가)</h3><p className="intro">이 접수의 답변·예약 상태 안내를 선택합니다. 홍보·광고 수신 동의는 포함하지 않습니다.</p>
    {notice&&<p className="notice" role={failed?'alert':'status'}>{notice}</p>}
    <form onSubmit={event=>void save(event)}><label className="v3-check"><input type="checkbox" checked={kakao} disabled={busy||unknown||!data||!canEnable&&!data.kakao} onChange={event=>{setKakao(event.target.checked);if(!event.target.checked)setSms(false);}}/>카카오톡 서비스 알림</label>
      <label className="v3-check"><input type="checkbox" checked={sms} disabled={busy||unknown||!data||!kakao||!canEnable&&!data.sms} onChange={event=>setSms(event.target.checked)}/>카카오톡 확정 실패 시 문자 대체에 동의</label>
      <div className="v3-soft"><p>{busy&&!data?'동의 상태 확인 중':data?.providerState==='configured'?'발송 공급사 설정됨 · 발송 결과는 별도 확인':data?'공급사 연결 전 · 외부 발송 차단':'발송 환경 현재 확인 불가'}</p><p>읽지 않았거나 발송 결과가 미상이면 문자로 중복 발송하지 않습니다.</p><p>알림 동의는 선택입니다. 철회해도 접수 기록과 확인키로 답변을 확인할 수 있습니다. 번호는 인증되지 않았습니다.</p></div>
      <div className="actions"><button className="btn btn-primary" type="submit" disabled={busy||unknown||!data}>알림 동의 저장 (추가)</button><button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>{setNotice("");void read();}}>현재 상태 다시 확인</button></div>
    </form>
  </section>;
}
