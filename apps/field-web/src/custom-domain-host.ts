const hostnamePattern=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/;
const slugPattern=/^field-[0-9a-f]{12}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type CustomHostMapping={slug:string;organizationId:string;origin:string};
// Host 헤더는 대소문자를 구분하지 않으므로 모든 비교 전에 소문자로 맞춘다.
export function platformHost(rawHost:string):boolean{
  const host=rawHost.toLowerCase();
  if(process.env.APP_PROFILE!=='live'&&['localhost:3002','127.0.0.1:3002'].includes(host))return true;
  const origin=process.env.FIELD_PUBLIC_WEB_ORIGIN??process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN;
  if(!origin)return false;
  try{return new URL(origin).host===host;}catch{return false;}
}
export async function customHostMapping(rawHost:string):Promise<CustomHostMapping|null>{
  const host=rawHost.toLowerCase();
  if(!hostnamePattern.test(host))return null;
  const api=process.env.FIELD_API_BASE_URL??'http://127.0.0.1:4321';
  const response=await fetch(new URL(`/v1/public/site-hosts/${encodeURIComponent(host)}`,api),{cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(response.status===404)return null;
  if(!response.ok)throw new Error('Field custom host resolution unavailable');
  const result=await response.json() as Partial<CustomHostMapping>;
  if(typeof result.slug!=='string'||!slugPattern.test(result.slug)||typeof result.organizationId!=='string'||!uuidPattern.test(result.organizationId)
    ||result.origin!==`https://${host}`)return null;
  return result as CustomHostMapping;
}
export async function customHostResource(rawHost:string,kind:'inquiries'|'reservations'|'site-assets',id:string):Promise<boolean>{
  const host=rawHost.toLowerCase();
  if(!uuidPattern.test(id))return false;
  const api=process.env.FIELD_API_BASE_URL??'http://127.0.0.1:4321';
  const response=await fetch(new URL(`/v1/public/site-hosts/${encodeURIComponent(host)}/resources/${kind}/${id}`,api),{cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(response.status===404)return false;
  if(!response.ok)throw new Error('Field custom host resource resolution unavailable');
  return (await response.json() as {allowed?:unknown}).allowed===true;
}
