import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { RETENTION_TABLES, type RetentionKind } from './work-retention.js';
import { retainReadGuardThroughResponse } from './retention-read-guard.js';

const pattern = /^\/(?:v1\/(owner\/|admin\/support\/)?|integrations\/v1\/)(inquiries|engagements|conversations)\/([0-9a-f-]{36})(?:\/|$)/i;
export function registerAgentRetentionConsumers(app: FastifyInstance, runtime: BusinessRuntime) {
  async function retainedWork(request: FastifyRequest, currentId?:string) {
    const path = request.url.split('?', 1)[0]!, match = pattern.exec(path);
    if (!match&&!currentId) return null;
    const kind: RetentionKind = 'inquiry';
    const id = currentId??match![3]!;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
    const row = (await runtime.pool.query<{ organization_id: string; visitor_key_hash?: string;consult_session_hash:string|null;consult_session_expires_at:Date|null;
      retention_work_purged_at: Date | null; retention_photos_purged_at: Date | null }>(
      `select organization_id,retention_work_purged_at,retention_photos_purged_at,visitor_key_hash,consult_session_hash,consult_session_expires_at
        from ${RETENTION_TABLES[kind]} where id=$1`, [id])).rows[0];
    if (!row || !row.retention_work_purged_at && !row.retention_photos_purged_at) return null;
    if (match?.[1]) {
      if (request.headers['x-organization-id'] !== undefined && request.headers['x-organization-id'] !== row.organization_id) return null;
      const user = await runtime.resolveUserId(request.headers);
      if (!user || !(await runtime.pool.query("select 1 from ap.memberships where organization_id=$1 and user_id=$2 and role in ('owner','editor')", [row.organization_id, user])).rowCount) return null;
    } else {
      const key = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : null;
      const cookie=/(?:^|;\s*)ap_consult_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(request.headers.cookie??'')?.[1];
      const allowedReceipt=match?.[2]==='inquiries'&&key&&/^[A-Za-z0-9_-]{43}$/.test(key)&&createHash('sha256').update(key).digest('hex')===row.visitor_key_hash;
      const allowedSession=match?.[2]!=='inquiries'&&cookie&&row.consult_session_expires_at&&row.consult_session_expires_at>new Date()
        &&createHash('sha256').update(cookie).digest('hex')===row.consult_session_hash;
      if(!allowedReceipt&&!allowedSession) return null;
    }
    return { workPurgedAt: row.retention_work_purged_at?.toISOString() ?? null, photosPurgedAt: row.retention_photos_purged_at?.toISOString() ?? null };
  }
  app.addHook('preHandler', async (request, reply) => {
    if (['GET','HEAD','OPTIONS'].includes(request.method) || request.url.split('?', 1)[0]?.endsWith('/receipt-key/rotate')) return;
    if ((await retainedWork(request))?.workPurgedAt) return reply.header('Cache-Control', 'private, no-store').code(410).send({ error: 'retention_work_ended' });
  });
  function endedPayload(payload: object, retention: {workPurgedAt:string|null;photosPurgedAt:string|null},readyPhotos?:Set<string>) {
    const result:Record<string,unknown>={...payload,retention};
    if (Array.isArray(result.attachments)) result.attachments=retention.workPurgedAt ? [] : readyPhotos
      ? result.attachments.filter(item=>item&&typeof item==='object'&&readyPhotos.has((item as {id:string}).id)) : result.attachments;
    if(result.inquiry&&typeof result.inquiry==='object') result.inquiry=endedPayload(result.inquiry as object,retention,readyPhotos);
    if (!retention.workPurgedAt) return result;
    if ('state' in result) result.state='closed';
    if ('customerName' in result) result.customerName=result.customerName===null?null:'[보존 기간 종료]';
    if ('customerPhone' in result) result.customerPhone=result.customerPhone===null?null:'';
    if ('customer_name' in result) result.customer_name=result.customer_name===null?null:'[보존 기간 종료]';
    if ('customer_phone' in result) result.customer_phone=result.customer_phone===null?null:'';
    if ('service_snapshot' in result) result.service_snapshot=null;
    if ('service' in result) result.service=null;
    if ('serviceSnapshot' in result) result.serviceSnapshot=null;
    if (Array.isArray(result.messages)) result.messages=result.messages.map(message=>({...message,body:'[보존 기간 종료]'}));
    if ('attachments' in result) result.attachments=[];
    if (result.contact && typeof result.contact==='object') result.contact=endedPayload(result.contact,retention);
    if (result.inquiry && typeof result.inquiry==='object') result.inquiry=endedPayload(result.inquiry,retention);
    return result;
  }
  app.addHook('preSerialization', async (request, reply, payload) => {
    if (!['GET','HEAD'].includes(request.method) || reply.statusCode !== 200 || !payload || typeof payload !== 'object'
      || Buffer.isBuffer(payload) || Array.isArray(payload)) return payload;
    const path=request.url.split('?',1)[0]!, match=pattern.exec(path);
    const value=payload as Record<string,unknown>;
    const current=path.endsWith('/engagements/current')&&value.engagement&&typeof value.engagement==='object'
      ? value.engagement as {id?:unknown}:null;
    const list=path==='/v1/owner/inquiries'&&Array.isArray(value.inquiries)
      ? value.inquiries as {id:string}[]:null;
    const id=match?.[3]??(typeof current?.id==='string'?current.id:null);
    const ids=list?list.map(row=>row.id):id?[id]:[];
    if (!ids.length) return payload;
    // The route has already authenticated this 200 read. Lock before inspecting its
    // current tombstones, and keep those locks through the final response handoff.
    const db=await runtime.pool.connect();let retained=false;
    try {
      await db.query('begin');
      const rows=(await db.query<{id:string;retention_work_purged_at:Date|null;retention_photos_purged_at:Date|null}>(
        'select id,retention_work_purged_at,retention_photos_purged_at from ap.inquiries where id=any($1::uuid[]) order by id for share',[ids])).rows;
      const metadata=new Map(rows.map(row=>[row.id,{workPurgedAt:row.retention_work_purged_at?.toISOString()??null,
        photosPurgedAt:row.retention_photos_purged_at?.toISOString()??null}]));
      const readyPhotos=rows.some(row=>row.retention_photos_purged_at) ? new Set((await db.query<{id:string}>(
        "select id from ap.inquiry_attachments where inquiry_id=any($1::uuid[]) and state='ready'",[ids])).rows.map(row=>row.id)) : undefined;
      retainReadGuardThroughResponse(reply,db);retained=true;
      if(list) return {...value,inquiries:list.map(row=>metadata.has(row.id)?endedPayload(row,metadata.get(row.id)!,readyPhotos):row)};
      const retention=id?metadata.get(id):null;
      if(!retention||!retention.workPurgedAt&&!retention.photosPurgedAt) return payload;
      if(current) return {...value,engagement:endedPayload(current,retention,readyPhotos)};
      if(retention.workPurgedAt&&match&&path!==match[0].replace(/\/$/,'')&&!path.endsWith('/export')) {
        reply.code(410);return {error:'retention_work_ended'};
      }
      return endedPayload(payload,retention,readyPhotos);
    } finally {if(!retained){try{await db.query('rollback');}finally{db.release();}}}
  });
  app.setErrorHandler((error, _request, reply) => {
    if ((error as { code?: string }).code === 'PAP01') return reply.header('Cache-Control', 'private, no-store').code(410).send({ error: 'retention_work_ended' });
    return reply.send(error);
  });
}
