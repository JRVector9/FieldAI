import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CustomDomainContext, SiteDomain } from './custom-domains.js';

// 일시적 DNS·edge 오류나 TXT 1회 미검출은 마지막 확정 점검(checked_at) 뒤 이 시간 안이면 판정을 미룬다.
// 그동안 기존 상태·valid_until을 유지하고 오류만 기록한 뒤 짧게 재점검한다(유효기간은 그대로 만료될 수 있다).
// TLS 확인 유예(추가)도 같은 값을 쓴다: tls_pending에서 처음 실패한 시각을 checked_at, 표시를 last_error='domain_tls_unconfirmed'로
// DB에 남겨 여러 작업자·재시작이 같은 유예 시작 시각을 본다(프로세스 메모리에 두지 않는다).
const INCONCLUSIVE_GRACE='15 minutes', INCONCLUSIVE_RETRY='1 minute';

export async function runCustomDomainOnce({ pool, context }: { pool: Pool; context: CustomDomainContext }): Promise<string> {
  const db=await pool.connect();let row: (SiteDomain & { recently_checked: boolean }) | undefined;let claimedState='';
  try {
    await db.query('begin');
    const candidate=await db.query<SiteDomain & { recently_checked: boolean }>(`select *,
      coalesce(checked_at>now()-interval '${INCONCLUSIVE_GRACE}',false) as recently_checked from field.site_domains where state<>'disconnected'
      and next_check_at<=now() and (lease_expires_at is null or lease_expires_at<=now())
      order by next_check_at,id for update skip locked limit 1`);
    row=candidate.rows[0];
    if(!row){await db.query('commit');return 'empty';}
    row.claim_token=randomUUID();
    // TLS 실패(error/domain_tls_failed)도 점검 중 상태를 유지해 ask·상태 경로가 열린 채 재확인할 수 있게 한다.
    claimedState=(await db.query<{state:string}>(`update field.site_domains set claim_token=$2,lease_expires_at=now()+interval '90 seconds',
      state=case when desired_state='active' then case when state in ('connected','tls_pending') or (state='error' and last_error='domain_tls_failed')
        then state else 'verifying' end else 'release_pending' end,updated_at=now()
      where id=$1 returning state`,[row.id,row.claim_token])).rows[0]!.state;
    await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  async function claimHostname():Promise<'claimed'|'taken'|'superseded'>{
    const reserve=await pool.connect();
    try{
      await reserve.query('begin');
      const current=await reserve.query<SiteDomain>('select * from field.site_domains where id=$1 for update',[row!.id]);
      if(current.rows[0]?.claim_token!==row!.claim_token||current.rows[0]?.generation!==row!.generation||current.rows[0]?.desired_state!=='active'){
        await reserve.query('commit');return 'superseded';
      }
      await reserve.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`field.site.domain:${row!.hostname}`]);
      const other=await reserve.query('select 1 from field.site_domains where hostname=$1 and hostname_claimed and id<>$2',[row!.hostname,row!.id]);
      if(other.rowCount){await reserve.query('commit');return 'taken';}
      await reserve.query('update field.site_domains set hostname_claimed=true where id=$1',[row!.id]);
      await reserve.query('commit');return 'claimed';
    }catch(failure){await reserve.query('rollback');throw failure;}finally{reserve.release();}
  }
  async function beginOwnershipRelease():Promise<boolean>{
    const release=await pool.connect();
    try{
      await release.query('begin');
      const current=await release.query<SiteDomain>('select * from field.site_domains where id=$1 for update',[row!.id]);
      if(current.rows[0]?.claim_token!==row!.claim_token||current.rows[0]?.generation!==row!.generation){await release.query('commit');return false;}
      if(current.rows[0].ownership_release_generation===null){
        const changed=await release.query<SiteDomain>(`update field.site_domains set generation=generation+1,ownership_release_generation=generation+1,
          state='ownership_pending',ownership_state='pending',valid_until=null,updated_at=now() where id=$1 returning *`,[row!.id]);
        row!.generation=changed.rows[0]!.generation;row!.ownership_release_generation=changed.rows[0]!.ownership_release_generation;
        await release.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
          values($1,$2,'field.site.domain.status',$3,$4::jsonb)`,[randomUUID(),row!.organization_id,row!.id,
          JSON.stringify({domainId:row!.id,siteId:row!.site_id,state:'ownership_pending',reason:'ownership_txt_missing'})]);
      }
      await release.query('commit');return true;
    }catch(failure){await release.query('rollback');throw failure;}finally{release.release();}
  }
  let state='blocked_integration', ownership='pending', dns='pending', tls='unavailable', binding='unavailable';
  let releaseCompleted=false, inconclusive=false;
  let error: string|null='domain_authority_not_configured', certificate: Date|null=null, validUntil: Date|null=null;
  try {
    if(row.desired_state==='disconnected'){
      if(!row.hostname_claimed){state='disconnected';binding='removed';error=null;}
      else if(context.edge){
        const removed=await context.edge.removeBinding({hostname:row.hostname,siteId:row.site_id,domainId:row.id,requestKey:`${row.id}:${row.generation}:remove`,generation:row.generation});
        state=removed?'disconnected':'release_pending';binding=removed?'removed':'pending';error=removed?null:'domain_release_pending';
      }
    }else if(context.dns){
      const evidence=await context.dns.inspect(row.hostname,row.ownership_token);
      ownership=evidence.ownership?'verified':'pending';dns=evidence.routing?'verified':'pending';
      // 해제는 되돌릴 수 없으므로 TXT 미검출이 유예 시간 넘게 이어질 때만 시작한다.
      if(row.ownership_release_generation===null&&!evidence.ownership&&row.hostname_claimed&&row.recently_checked){
        inconclusive=true;error='ownership_txt_unconfirmed';
      }else if(row.ownership_release_generation!==null||!evidence.ownership&&row.hostname_claimed){
        if(!await beginOwnershipRelease())return 'superseded';
        ownership='pending';tls='pending';binding='pending';state='ownership_pending';error='ownership_release_pending';
        if(context.edge){
          releaseCompleted=await context.edge.removeBinding({hostname:row.hostname,siteId:row.site_id,domainId:row.id,
            requestKey:`${row.id}:${row.ownership_release_generation}:ownership-remove`,generation:row.ownership_release_generation!});
          binding=releaseCompleted?'removed':'pending';error=releaseCompleted?'ownership_txt_missing':'ownership_release_pending';
        }else{state='blocked_integration';error='ownership_release_authority_not_configured';binding='unavailable';}
      }else {
      const claim=evidence.ownership?await claimHostname():'claimed';
      if(claim==='superseded')return 'superseded';
      if(claim==='taken'){state='error';tls='pending';binding='error';error='domain_claimed_by_other_site';}
      else if(!evidence.ownership){state='ownership_pending';tls='pending';binding='pending';error='ownership_txt_missing';}
      else if(!evidence.routing){state='dns_pending';tls='pending';binding='pending';error='routing_dns_mismatch';}
      else if(context.edge){
        const result=await context.edge.ensureBinding({hostname:row.hostname,siteId:row.site_id,organizationId:row.organization_id,domainId:row.id,requestKey:`${row.id}:${row.generation}:bind`,generation:row.generation});
        if(result.hostname!==row.hostname||result.siteId!==row.site_id||result.generation!==row.generation){state='error';tls='error';binding='error';error='domain_binding_mismatch';}
        // 연결된 도메인의 TLS 확인 실패는 일시 오류와 같이 마지막 확정 점검 뒤 유예 시간 안에서는 판정을 미룬다.
        else if(result.state!=='ready'&&row.state==='connected'&&row.ownership_release_generation===null&&row.recently_checked){inconclusive=true;error='domain_tls_unconfirmed';}
        // 어댑터가 확정 실패(failed)를 보고했거나, 이미 TLS 실패로 기록된 도메인이 아직 확인되지 않으면 error를 유지한다(왕복 방지).
        else if(result.state==='failed'||result.state==='pending'&&row.state==='error'&&row.last_error==='domain_tls_failed'){state='error';tls='error';binding='pending';error='domain_tls_failed';}
        // tls_pending에서 이미 유예를 시작했으면 유예 안에서는 checked_at(유예 시작)을 그대로 두고, 넘으면 error로 기록한다.
        else if(result.state==='pending'&&row.state==='tls_pending'&&row.last_error==='domain_tls_unconfirmed'){
          if(row.recently_checked){inconclusive=true;error='domain_tls_unconfirmed';}
          else {state='error';tls='error';binding='pending';error='domain_tls_failed';}
        }
        // tls_pending(또는 유예가 지난 connected)에서의 첫 실패부터 유예를 센다. verifying 등에서 막 넘어온 첫 확인은
        // ask·상태 경로가 아직 닫혀 있어 반드시 실패하므로 유예에 넣지 않는다.
        else if(result.state==='pending'&&(row.state==='tls_pending'||row.state==='connected')){state='tls_pending';tls='pending';binding='pending';error='domain_tls_unconfirmed';}
        else if(result.state==='pending'){state='tls_pending';tls='pending';binding='pending';error='domain_tls_pending';}
        else {
          certificate=result.certificateExpiresAt?new Date(result.certificateExpiresAt):null;
          if(!certificate||!Number.isFinite(certificate.getTime())||certificate.getTime()<=Date.now()+60_000){state='error';tls='error';binding='ready';error='domain_certificate_invalid';certificate=null;}
          else {state='connected';tls='ready';binding='ready';error=null;validUntil=new Date(Math.min(Date.now()+10*60_000,certificate.getTime()-60_000));}
        }
      }
      }
    }
  }catch{
    // 연결된 도메인의 일시 오류 한 번으로 유효기간을 지우지 않는다.
    if(row.state==='connected'&&row.ownership_release_generation===null&&row.recently_checked){inconclusive=true;error='domain_verification_unknown';}
    else {state='unknown';error='domain_verification_unknown';tls='error';binding='error';}
  }
  const finish=await pool.connect();
  try{
    await finish.query('begin');
    const current=await finish.query<SiteDomain>('select * from field.site_domains where id=$1 for update',[row.id]);
    if(current.rows[0]?.claim_token!==row.claim_token||current.rows[0]?.generation!==row.generation){await finish.query('commit');return 'superseded';}
    if(inconclusive){
      // 점검 전 상태로 되돌리고 checked_at은 그대로 두어 유예 시간이 마지막 확정 점검 기준으로 흐르게 한다.
      await finish.query(`update field.site_domains set state=$2,last_error=$3,claim_token=null,lease_expires_at=null,
        next_check_at=now()+interval '${INCONCLUSIVE_RETRY}',updated_at=now() where id=$1`,[row.id,row.state,error]);
      await finish.query('commit');return row.state;
    }
    await finish.query(`update field.site_domains set state=$2,ownership_state=$3,dns_state=$4,tls_state=$5,binding_state=$6,
      hostname_claimed=case when ($2='disconnected' and $6='removed') or $10 then false else hostname_claimed end,
      ownership_release_generation=case when $10 or ($2='disconnected' and $6='removed') then null else ownership_release_generation end,
      generation=generation+case when $10 then 1 else 0 end,
      checked_at=now(),valid_until=$7,certificate_expires_at=$8,last_error=$9,claim_token=null,lease_expires_at=null,
      next_check_at=now()+interval '5 minutes',updated_at=now() where id=$1`,
      [row.id,state,ownership,dns,tls,binding,validUntil,certificate,error,releaseCompleted]);
    // 점검 중 임시 상태(verifying 등)가 아닌 점검 전 상태와 비교해 실제로 바뀐 때만 사건을 남긴다.
    // 점검 중 다른 단계(소유권 해제 시작)가 상태를 바꿨다면 그 상태와 비교한다.
    const previous=current.rows[0]?.state===claimedState?row.state:current.rows[0]?.state;
    if(previous!==state)await finish.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
      values($1,$2,'field.site.domain.status',$3,$4::jsonb)`,[randomUUID(),row.organization_id,row.id,JSON.stringify({domainId:row.id,siteId:row.site_id,state})]);
    await finish.query('commit');return state;
  }catch(failure){await finish.query('rollback');throw failure;}finally{finish.release();}
}
