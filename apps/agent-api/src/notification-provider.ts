import { createHash, createHmac, randomBytes } from 'node:crypto';
export type NotificationSend={deliveryId:string;channel:'kakao'|'sms'|'web_push';audience:'owner'|'customer';recipient:string;startedAt:string;providerId?:string};
export type NotificationResult={deliveryId:string;providerId:string;accountId:string;recipient:string;channel:NotificationSend['channel'];state:'accepted'|'sent'|'failed';code:string;allowFallback:boolean};
export type NotificationProvider={name:string;accountId:string;keyFingerprint:string;send(input:NotificationSend):Promise<NotificationResult>;lookup(input:NotificationSend):Promise<NotificationResult|null>};
type SolapiConfig={accountId:string;apiKey:string;apiSecret:string;from:string;pfId:string;ownerTemplateId:string;customerTemplateId:string};
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
function state(code:unknown,status?:unknown):NotificationResult['state']|null {
  if(code==='4000')return 'sent';
  if(code==='2000'||code==='3000')return 'accepted';
  // Unknown/server/timeout/unspecified outcomes are never authority for SMS fallback.
  if(status==='COMPLETE'&&typeof code==='string'&&/^[123]\d{3}$/.test(code)&&!['1021','1022','1024','2024','3012','3014','3024','3040','3048'].includes(code))return 'failed';
  return null;
}
export function createSolapiNotificationProvider(config:SolapiConfig,fetcher:typeof fetch=fetch):NotificationProvider {
  const keyFingerprint=createHash('sha256').update(config.apiKey).digest('hex');
  async function api(path:string,body?:object){
    const date=new Date().toISOString(),salt=randomBytes(16).toString('hex'),signature=createHmac('sha256',config.apiSecret).update(date+salt).digest('hex');
    const response=await fetcher(`https://api.solapi.com${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(65000),headers:{Authorization:`HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new Error('notification_result_unknown');
    const value=object(await response.json());if(!value)throw new Error('notification_result_unknown');return value;
  }
  function normalize(row:Record<string,unknown>,input:NotificationSend,registered=false):NotificationResult {
    const fields=object(row.customFields);
    if(typeof row.messageId!=='string'||!row.messageId||fields?.deliveryId!==input.deliveryId
      ||row.to!==undefined&&row.to!==input.recipient||row.from!==undefined&&row.from!==config.from
      ||row.type!==undefined&&row.type!==(input.channel==='kakao'?'ATA':'SMS')
      ||row.accountId!==undefined&&row.accountId!==config.accountId||row.replacement===true)throw new Error('notification_result_unknown');
    // POST acknowledgement is not an authoritative delivery result. Only GET can confirm terminal outcomes.
    if(registered)return {deliveryId:input.deliveryId,providerId:row.messageId,accountId:config.accountId,recipient:input.recipient,channel:input.channel,state:'accepted',code:'provider_acknowledged',allowFallback:false};
    const result=state(row.statusCode,row.status);
    if(row.accountId!==config.accountId||row.to!==input.recipient||row.from!==config.from||row.type!==(input.channel==='kakao'?'ATA':'SMS')||row.replacement!==false||!result)throw new Error('notification_result_unknown');
    return {deliveryId:input.deliveryId,providerId:row.messageId,accountId:config.accountId,recipient:input.recipient,channel:input.channel,state:result,code:String(row.statusCode),allowFallback:input.channel==='kakao'&&result==='failed'&&row.statusCode==='3104'};
  }

  return {name:'solapi',accountId:config.accountId,keyFingerprint,
    async send(input){
      if(input.channel==='web_push')throw new Error('notification_channel_unavailable');
      const message={to:input.recipient,from:config.from,type:input.channel==='kakao'?'ATA':'SMS',autoTypeDetect:false,country:'82',customFields:{deliveryId:input.deliveryId},
        ...(input.channel==='kakao'?{kakaoOptions:{pfId:config.pfId,templateId:input.audience==='owner'?config.ownerTemplateId:config.customerTemplateId,disableSms:true}}
          :{text:'새 답변 또는 처리 상태가 있습니다. 접수한 서비스에서 확인해 주세요.'})};
      const data=await api('/messages/v4/send-many/detail',{messages:[message],allowDuplicates:false});
      if(object(data.groupInfo)?.accountId!==config.accountId)throw new Error('notification_result_unknown');
      const registered=Array.isArray(data.messageList)?data.messageList:[],failed=Array.isArray(data.failedMessageList)?data.failedMessageList:[];
      const rows=[...registered,...failed].map(object).filter((v):v is Record<string,unknown>=>!!v&&object(v.customFields)?.deliveryId===input.deliveryId);
      if(rows.length!==1)throw new Error('notification_result_unknown');
      return normalize(rows[0]!,input,true);
    },
    async lookup(input){
      const params=new URLSearchParams({limit:'500',to:input.recipient,from:config.from,type:input.channel==='kakao'?'ATA':'SMS',startDate:new Date(new Date(input.startedAt).getTime()-60000).toISOString()});
      if(input.providerId){params.set('criteria','messageId');params.set('cond','eq');params.set('value',input.providerId);}
      let found:Record<string,unknown>|undefined;
      for(let page=0;page<100;page++){
        const data=await api(`/messages/v4/list?${params}`),list=object(data.messageList);if(!list)throw new Error('notification_result_unknown');
        for(const row of Object.values(list)){const value=object(row);if(object(value?.customFields)?.deliveryId===input.deliveryId){if(found)throw new Error('notification_result_unknown');found=value!;}}
        if(!data.nextKey)return found?normalize(found,input):null;
        if(typeof data.nextKey!=='string'||params.get('startKey')===data.nextKey)throw new Error('notification_result_unknown');params.set('startKey',data.nextKey);
      }
      throw new Error('notification_result_unknown');
    }};
}
