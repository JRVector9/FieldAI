import type { BetterAuthPlugin, DBAdapter } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { Pool } from 'pg';
import { assertLifecycleServing, familyKey, fingerprint, recordLifecycle, type LifecycleIntent, type LifecycleJournal } from './oauth-lifecycle-journal.js';
import { applyLifecycleEntry } from './oauth-lifecycle-restore.js';

type TokenRow = {id:string;token:string;clientId:string;userId?:string|null;referenceId?:string|null;authorizationCodeId?:string|null};
export function tokenIntent(row:TokenRow,type:'access'|'refresh'):LifecycleIntent {
  const value=fingerprint(row.token);
  return {kind:'token',targetKey:fingerprint(`${type}:${value}`),clientId:row.clientId,userId:row.userId??null,
    referenceId:row.referenceId??null,codeId:row.authorizationCodeId?fingerprint(row.authorizationCodeId):null,
    tokenId:row.id,tokenType:type,tokenFingerprint:value,connectionId:null,organizationId:null,keyId:null};
}
export function familyIntent(row:TokenRow):LifecycleIntent {
  const codeId=row.authorizationCodeId?fingerprint(row.authorizationCodeId):null;
  return {kind:'family',targetKey:familyKey({...row,authorizationCodeId:codeId}),clientId:row.clientId,userId:row.userId??null,
    referenceId:row.referenceId??null,codeId,tokenId:null,tokenType:null,tokenFingerprint:null,connectionId:null,organizationId:null,keyId:null};
}
async function rowsFor(adapter:DBAdapter,opts:Parameters<DBAdapter['deleteMany']>[0]) {
  const rows:TokenRow[]=[];
  for(let offset=0;;offset+=1000){const page=await adapter.findMany<TokenRow>({model:opts.model,where:opts.where,limit:1000,offset});
    rows.push(...page);if(page.length<1000)return rows;}
}
async function record(pool:Pool,journal:LifecycleJournal|undefined,intents:LifecycleIntent[],apply=true) {
  if(!intents.length)return;
  const entries=await recordLifecycle(pool,journal,intents);
  if(apply){const db=await pool.connect();try{await db.query('begin');for(const e of entries)await applyLifecycleEntry(db,e);await db.query('commit');}
    catch(error){await db.query('rollback');throw error;}finally{db.release();}}
}
export function oauthLifecycleProvider(pool:Pool,journal:LifecycleJournal|undefined):BetterAuthPlugin {
  return {id:'agent-oauth-lifecycle',hooks:{before:[{
    matcher:ctx=>['/oauth2/token','/oauth2/introspect','/oauth2/userinfo'].includes(ctx.path??''),
    handler:createAuthMiddleware(async()=>{try{await assertLifecycleServing(pool,journal);}catch{throw new APIError('SERVICE_UNAVAILABLE',{message:'OAuth lifecycle proof unavailable',error:'temporarily_unavailable'});}}),
  }]},init:async context=>{
    if(journal)await journal.initialize(pool);
    const adapter=context.adapter;
    const wrapped:DBAdapter={...adapter,
      create:async <T extends Record<string,unknown>,R=T>(opts:{model:string;data:Omit<T,'id'>;select?:string[];forceAllowId?:boolean})=>{
        if(opts.model==='oauthAccessToken'||opts.model==='oauthRefreshToken'){
          const db=await pool.connect();try{
            await db.query('begin');
            // Hold approval and current owner through provider persistence. Native
            // guards keep late SQL rows revoked; the provider must also reject issuance.
            const selection=(await db.query('select client_id,actor_user_id,organization_id,revoked_at from ap.oauth_selections where id::text=$1 for share',[opts.data.referenceId])).rows[0];
            if(selection){
              const owner=(await db.query("select 1 from ap.memberships where organization_id=$1 and user_id=$2 and role='owner' for share",[selection.organization_id,selection.actor_user_id])).rowCount;
              if(selection.revoked_at||!owner||selection.client_id!==opts.data.clientId||selection.actor_user_id!==opts.data.userId)
                throw new APIError('BAD_REQUEST',{error:'invalid_grant',message:'OAuth approval is no longer current'});
            }
            const cutover=(await db.query("select max((payload->>'cutoffAt')::timestamptz) as cutoff from ap.oauth_lifecycle_tombstones where kind='legacy-baseline'")).rows[0]?.cutoff as Date|null;
            const result=await adapter.create<T,R>({...opts,data:{...opts.data,createdAt:new Date(Math.max(Date.now(),cutover?cutover.getTime()+1:0))}});
            await db.query('commit');return result;
          }catch(error){await db.query('rollback');throw error;}finally{db.release();}
        }
        return adapter.create<T,R>(opts);
      },
      findOne:async <T>(opts:Parameters<DBAdapter['findOne']>[0])=>{
        const result=await adapter.findOne<T>(opts);
        if(opts.model==='oauthRefreshToken'&&result){
          const row=result as unknown as TokenRow;
          const authority=(await pool.query(`select s.client_id,s.actor_user_id,s.revoked_at,m.user_id as owner_id from ap.oauth_selections s
            left join ap.memberships m on m.organization_id=s.organization_id and m.user_id=s.actor_user_id and m.role='owner'
            where s.id::text=$1`,[row.referenceId])).rows[0];
          if(authority&&(authority.revoked_at||!authority.owner_id||authority.client_id!==row.clientId||authority.actor_user_id!==row.userId))return null;
        }
        return result;
      },
      delete:async opts=>{
        if(opts.model==='oauthAccessToken'||opts.model==='oauthRefreshToken') {
          const rows=await rowsFor(adapter,opts);
          await record(pool,journal,rows.map(row=>opts.model==='oauthRefreshToken'?familyIntent(row):tokenIntent(row,'access')));
          if(!rows.length)return;
          return adapter.delete({...opts,where:[{field:'id',operator:'in',value:rows.map(r=>r.id)}]});
        }
        return adapter.delete(opts);
      },
      deleteMany:async opts=>{
        if(opts.model==='oauthAccessToken'||opts.model==='oauthRefreshToken') {
          const rows=await rowsFor(adapter,opts);
          await record(pool,journal,rows.map(row=>opts.model==='oauthRefreshToken'?familyIntent(row):tokenIntent(row,'access')));
          if(!rows.length)return 0;
          return adapter.deleteMany({...opts,where:[{field:'id',operator:'in',value:rows.map(r=>r.id)}]});
        }
        return adapter.deleteMany(opts);
      },
      incrementOne:async <T>(opts:Parameters<DBAdapter['incrementOne']>[0])=>{
        const explicit=opts.model==='oauthRefreshToken'&&opts.set?.revoked!=null&&opts.set?.rotatedAt==null;
        const rows=explicit?await rowsFor(adapter,opts):[];
        // Preserve provider CAS semantics: save the fence before mutation, revoke the family after CAS.
        await record(pool,journal,rows.map(familyIntent),false);
        const result=await adapter.incrementOne<T>(opts);
        if(explicit)await record(pool,journal,rows.map(familyIntent));
        return result;
      },
    };
    return {context:{adapter:wrapped}};
  }};
}
