export type CustomerNotificationTarget = { kind: "inquiry"; id: string; receiptKey: string };
export type CustomerNotificationConsent = { kakao: boolean; sms: boolean; state: "consented" | "withdrawn";
  phoneVerified: false; storageState: "configured" | "blocked_integration"; providerState: "configured" | "blocked_integration" };
export type ConsentChangeResult = { outcome: "confirmed" | "unknown" | "rejected"; settings?: CustomerNotificationConsent; error?: string };
function path(target: CustomerNotificationTarget) {
  if (target.kind!=="inquiry" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target.id)
    || !/^[A-Za-z0-9_-]{43}$/.test(target.receiptKey)) throw Error("current_receipt_required");
  return `/v1/customer/notification-consents/${target.kind}/${target.id}`;
}
function consent(value: unknown): CustomerNotificationConsent {
  const v=value as Partial<CustomerNotificationConsent>|null;
  if(!v||typeof v.kakao!=="boolean"||typeof v.sms!=="boolean"||v.sms&&!v.kakao||v.phoneVerified!==false
    || !["consented","withdrawn"].includes(v.state??"")||!["configured","blocked_integration"].includes(v.storageState??"")
    || !["configured","blocked_integration"].includes(v.providerState??"")) throw Error("notification_status_unavailable");
  return {kakao:v.kakao,sms:v.sms,state:v.state!,phoneVerified:false,storageState:v.storageState!,providerState:v.providerState!};
}
function headers(target:CustomerNotificationTarget){return {authorization:`Bearer ${target.receiptKey}`};}
export async function readCustomerNotificationConsent(target: CustomerNotificationTarget, transport: typeof fetch=fetch) {
  const response=await transport(path(target),{credentials:"same-origin",cache:"no-store",headers:headers(target)});
  if(!response.ok)throw Error(response.status===404?"current_receipt_required":response.status===429?"receipt_rate_limited":"notification_status_unavailable");
  return consent(await response.json());
}
export async function updateCustomerNotificationConsent(target:CustomerNotificationTarget, channels:{kakao:boolean;sms:boolean},transport:typeof fetch=fetch):Promise<ConsentChangeResult>{
  const url=path(target);if(channels.sms&&!channels.kakao)throw Error("invalid_notification_channels");
  try{
    const response=await transport(url,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{...headers(target),"content-type":"application/json"},
      body:JSON.stringify({kakao:channels.kakao,sms:channels.sms,consentVersion:"notification-v1"})});
    if([400,401,403,404,429,503].includes(response.status)){
      // 400 중 휴대전화 형식 오류는 API 코드(notification_phone_invalid)를 그대로 전달해 화면이 번호 확인을 안내한다
      const body=response.status===400?await response.json().catch(()=>null):null;
      const phoneInvalid=typeof body==='object'&&body!==null&&(body as {error?:unknown}).error==='notification_phone_invalid';
      return {outcome:"rejected",error:response.status===404?"current_receipt_required":response.status===429?"receipt_rate_limited":response.status===503?"blocked_integration":phoneInvalid?"notification_phone_invalid":"notification_consent_rejected"};
    }
    // Non-2xx and network failures may already have stored the requested state. Read once; never repeat POST.
  }catch{/* Read the existing receipt-bound state without inventing a save result. */}
  try{const settings=await readCustomerNotificationConsent(target,transport);
    return {outcome:settings.kakao===channels.kakao&&settings.sms===channels.sms?"confirmed":"unknown",settings};
  }catch{return {outcome:"unknown",error:"notification_status_unavailable"};}
}
