export type BrowserSubscription={endpoint:string;options:{applicationServerKey?:ArrayBuffer|null};toJSON():unknown;unsubscribe():Promise<boolean>};
type Worker={scriptURL:string;state:string};
type Registration={active:Worker|null;installing?:Worker|null;waiting?:Worker|null;pushManager:{getSubscription():Promise<BrowserSubscription|null>;subscribe(options:{userVisibleOnly:boolean;applicationServerKey:Uint8Array<ArrayBuffer>}):Promise<BrowserSubscription>}};
export type PushEnvironment={origin:string;secure:boolean;supported:boolean;installationRequired:boolean;permission():NotificationPermission;requestPermission():Promise<NotificationPermission>;getRegistration():Promise<Registration|undefined>;register():Promise<Registration>};
export type PushAvailability={state:"ready"|"unsupported"|"blocked_integration"|"permission_denied"|"worker_missing";reason:string};
export type PushChangeResult={outcome:"confirmed"|"unknown"|"rejected";cleanup?:"failed";error?:string};
const script="/field-notification-sw.js";
function supported(environment:PushEnvironment):PushAvailability|null{
 if(!environment.secure)return {state:"unsupported",reason:"웹 푸시는 보안 연결에서만 사용할 수 있습니다."};
 if(environment.installationRequired)return {state:"unsupported",reason:"iPhone·iPad는 홈 화면에 추가한 앱에서 웹 푸시를 사용합니다."};
 if(!environment.supported)return {state:"unsupported",reason:"이 브라우저는 웹 푸시를 지원하지 않습니다."};return null;
}
function competing(registration:Registration|undefined,environment:PushEnvironment){return !!registration&&[registration.active,registration.installing,registration.waiting].some(worker=>worker&&worker.scriptURL!==new URL(script,environment.origin).href);}
function own(registration:Registration|undefined,environment:PushEnvironment){return registration?.active?.state==="activated"&&registration.active.scriptURL===new URL(script,environment.origin).href;}
async function activated(registration:ServiceWorkerRegistration,origin:string){
 if(own(registration,{origin} as PushEnvironment))return registration;
 const worker=registration.installing??registration.waiting;if(!worker)throw Error("notification_worker_unavailable");
 await new Promise<void>((resolve,reject)=>{const finish=()=>{if(worker.state!=="activated"&&worker.state!=="redundant")return;clearTimeout(timer);worker.removeEventListener("statechange",finish);if(worker.state==="activated")resolve();else reject(Error("notification_worker_unavailable"));};const timer=setTimeout(()=>{worker.removeEventListener("statechange",finish);reject(Error("notification_worker_unavailable"));},10000);worker.addEventListener("statechange",finish);finish();});
 if(!own(registration,{origin} as PushEnvironment))throw Error("notification_worker_unavailable");return registration;
}
export function browserPushEnvironment():PushEnvironment{
 const has=typeof window!=="undefined"&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
 const ios=typeof navigator!=="undefined"&&(/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
 const standalone=typeof window!=="undefined"&&(window.matchMedia("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
 return {origin:typeof location!=="undefined"?location.origin:"",secure:typeof window!=="undefined"&&window.isSecureContext,supported:has,installationRequired:ios&&!standalone,
   permission:()=>has?Notification.permission:"denied",requestPermission:()=>Notification.requestPermission(),
   getRegistration:()=>navigator.serviceWorker.getRegistration("/"),async register(){return activated(await navigator.serviceWorker.register(script,{scope:"/",updateViaCache:"none"}),location.origin);}};
}
export async function prepareNotificationPush(environment:PushEnvironment=browserPushEnvironment()):Promise<PushAvailability>{
 const reason=supported(environment);if(reason)return reason;
 try{const registration=await environment.getRegistration();if(competing(registration,environment))return {state:"worker_missing",reason:"기존 서비스 워커가 있어 푸시 전용 워커로 임의 교체하지 않습니다."};
  return own(await environment.register(),environment)?{state:"ready",reason:""}:{state:"worker_missing",reason:"웹 푸시 서비스 워커 준비를 확인하지 못했습니다."};
 }catch{return {state:"worker_missing",reason:"웹 푸시 서비스 워커를 준비하지 못했습니다. 다시 확인해 주세요."};}
}
export async function inspectNotificationPush(config:{pushState:string;pushPublicKey:string|null},environment:PushEnvironment=browserPushEnvironment()):Promise<PushAvailability>{
 if(config.pushState!=="configured"||!config.pushPublicKey)return {state:"blocked_integration",reason:"웹 푸시 공급사·VAPID가 연결되지 않았습니다."};
 const reason=supported(environment);if(reason)return reason;if(environment.permission()==="denied")return {state:"permission_denied",reason:"브라우저가 알림 권한을 차단했습니다. 브라우저 설정에서 허용해 주세요."};
 try{const registration=await environment.getRegistration();return own(registration,environment)&&!competing(registration,environment)?{state:"ready",reason:""}:{state:"worker_missing",reason:"웹 푸시 준비 (추가)를 먼저 눌러 서비스 워커를 연결해 주세요."};}catch{return {state:"worker_missing",reason:"웹 푸시 서비스 워커를 확인하지 못했습니다."};}
}
function keyBytes(key:string){const raw=atob(key.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-key.length%4)%4)),bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));if(bytes.length!==65||bytes[0]!==4)throw Error("invalid_push_public_key");return bytes;}
export async function changeNotificationPush(config:{enabled:boolean;pushState:string;pushPublicKey:string|null},save:(body:{push:boolean;subscription?:unknown;consentVersion:"notification-v1"})=>Promise<PushChangeResult>,environment:PushEnvironment=browserPushEnvironment()):Promise<PushChangeResult>{
 if(!config.enabled){const result=await save({push:false,consentVersion:"notification-v1"});if(result.outcome!=="confirmed")return result;
  try{const registration=await environment.getRegistration();if(own(registration,environment)){const sub=await registration!.pushManager.getSubscription();if(sub&&!await sub.unsubscribe())return {...result,cleanup:"failed"};}}catch{return {...result,cleanup:"failed"};}return result;}
 if(config.pushState!=="configured"||!config.pushPublicKey)throw Error("push_provider_blocked");const reason=supported(environment);if(reason)throw Error("push_browser_unsupported");
 // Permission is requested directly from the user save action, before any asynchronous network or worker lookup.
 if(environment.permission()!=="granted"&&await environment.requestPermission()!=="granted")throw Error("push_permission_denied");
 const registration=await environment.getRegistration();if(!own(registration,environment)||competing(registration,environment))throw Error("notification_worker_unavailable");
 const key=keyBytes(config.pushPublicKey);let subscription=await registration!.pushManager.getSubscription(),created=false;
 if(subscription){const existing=subscription.options.applicationServerKey;if(!existing||new Uint8Array(existing).length!==key.length||new Uint8Array(existing).some((byte,index)=>byte!==key[index]))throw Error("push_key_mismatch");}
 else{subscription=await registration!.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});created=true;}
 let result:PushChangeResult;try{result=await save({push:true,subscription:subscription.toJSON(),consentVersion:"notification-v1"});}catch{result={outcome:"unknown"};}
 if(created&&result.outcome==="rejected"){try{if(!await subscription.unsubscribe())return {...result,cleanup:"failed"};}catch{return {...result,cleanup:"failed"};}}
 return result;
}
