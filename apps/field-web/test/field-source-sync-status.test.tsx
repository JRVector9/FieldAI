import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const id='00000000-0000-4000-8000-000000000001';
const dto={connectionId:id,sourceRevision:3,approvedSourceRevision:2,state:'pending_review',syncedAt:'2026-08-20T03:04:05.123Z'};
async function consumer(){const m=await import('../src/field-source-sync-status.js').catch(()=>null);assert.ok(m,'readonly source status consumer is not implemented');return m;}
test('nullable receipt timestamp and preview.9 absence remain honest without a generated clock',async()=>{
 const m=await consumer();assert.equal(m.parseSourceStatus(dto,id)?.syncedAt,dto.syncedAt);
 const legacy={connectionId:id,sourceRevision:3,approvedSourceRevision:2,state:'pending_review'};assert.equal(m.parseSourceStatus(legacy,id)?.syncedAt,null);
 assert.equal(m.parseSourceStatus({...dto,syncedAt:null},id)?.syncedAt,null);
 for(const bad of ['now','2026-02-30T03:04:05Z','2026-08-20',123,{}])assert.equal(m.parseSourceStatus({...dto,syncedAt:bad},id),null);
 assert.equal(m.parseSourceStatus({...dto,connectionId:'other'},id),null);
 assert.equal(m.parseSourceStatus({...dto,state:'published'},id),null);
});
test('readonly added status shows actual source state and unmodified receipt clock without implying AI release',async()=>{
 const m=await consumer();
 for(const [state,label] of [['stale','정보가 오래되었습니다'],['pending_review','AP 검토 대기'],['current','AP 출처 승인 완료']] as const){
   const expected=label;
   const parsed=m.parseSourceStatus({...dto,state},id);assert.ok(parsed);
   const html=renderToStaticMarkup(<m.FieldSourceSyncStatus source={parsed}/>);
   assert.match(html,/AP 출처 상태 \(추가\)/);assert.ok(html.includes(expected));
   assert.match(html,/현재 AP 저장 버전 수신 시각/);assert.ok(html.includes(`dateTime="${dto.syncedAt}"`));
   assert.doesNotMatch(html,/<button|AI 공개 완료|방금/);
 }
 const html=renderToStaticMarkup(<m.FieldSourceSyncStatus source={m.parseSourceStatus({...dto,syncedAt:null},id)!}/>);assert.match(html,/수신 시각 기록 없음/);
});
