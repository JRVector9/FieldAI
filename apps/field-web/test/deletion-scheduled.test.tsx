import assert from "node:assert/strict";
import test from "node:test";
import { DELETION_SCHEDULED_OWNER_MESSAGE, isDeletionScheduledAccess, isDeletionScheduledError } from "../src/deletion-scheduled-copy";
import { BillingClientError, billingErrorNotice } from "../src/billing-client";
import { previewLinksVisible } from "../src/preview-visibility";
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// A-06 / QA43, QA46, QA119: 승인/제작/수동 예약의 삭제 거절은 기존 처리 오류보다 먼저 안내한다.
test('Field owner mutation notices prioritize deletion and preserve other failure guidance', async () => {
  const copy = await import('../src/deletion-scheduled-copy.js');
  assert.equal(typeof copy.ownerFailureNotice, 'function');
  for (const status of [403,409]) assert.equal(copy.ownerFailureNotice(status, { error: 'deletion_scheduled' }, '초안이 바뀌었습니다'), DELETION_SCHEDULED_OWNER_MESSAGE);
  assert.equal(copy.ownerFailureNotice(409, { error: 'revision_conflict' }, '초안이 바뀌었습니다'), '초안이 바뀌었습니다');
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /AI 생성/);
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /기존 기록/);
});

test('Field shared owner deletion banner explains retained work and links to cancellation', async () => {
  const feature = await import('../src/FieldOwnerDeletionNotice.js').catch(() => null);
  assert.ok(feature, 'shared owner deletion notice must exist');
  const shown = renderToStaticMarkup(<feature.FieldOwnerDeletionMessage scheduled />);
  assert.match(shown, /삭제 예정입니다/);
  assert.match(shown, /기존 기록/);
  assert.match(shown, /href="\/workspace\/account"/);
  assert.equal(renderToStaticMarkup(<feature.FieldOwnerDeletionMessage scheduled={false} />), '');
});

// 조직 삭제 유예 중(deletion_scheduled) 사업자 화면 공통 문구(추가)
test("Field deletion_scheduled refusals (403 access gate or 409 start refusal) map to the shared owner copy", () => {
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /삭제 예정입니다/);
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /새 체험·결제·연결을 시작할 수 없습니다/);
  assert.match(DELETION_SCHEDULED_OWNER_MESSAGE, /계정·조직 삭제 화면/);
  assert.equal(isDeletionScheduledError(403, { error: "deletion_scheduled", accessMode: "cleanup_only" }), true);
  assert.equal(isDeletionScheduledError(409, { error: "deletion_scheduled" }), true);
  assert.equal(isDeletionScheduledError(403, { error: "trial_ended" }), false);
  assert.equal(isDeletionScheduledError(500, { error: "deletion_scheduled" }), false);
  assert.equal(isDeletionScheduledError(409, null), false);
  assert.equal(billingErrorNotice(new BillingClientError("deletion_scheduled", 409)), DELETION_SCHEDULED_OWNER_MESSAGE);
});

test("Field subscription access with reason deletion_scheduled hides new trial/checkout starts", () => {
  assert.equal(isDeletionScheduledAccess({ mode: "cleanup_only", canStartNew: false, reason: "deletion_scheduled" }), true);
  assert.equal(isDeletionScheduledAccess({ mode: "cleanup_only", canStartNew: false, reason: "trial_ended" }), false);
  assert.equal(isDeletionScheduledAccess({ mode: "trial", canStartNew: true }), false);
  assert.equal(isDeletionScheduledAccess(undefined), false);
});

// 클라이언트 컴포넌트의 /preview 링크는 빌드 시 넣은 NEXT_PUBLIC_APP_PROFILE로 live에서 숨긴다
test("Field preview links are hidden only for the live profile", () => {
  assert.equal(previewLinksVisible("live"), false);
  assert.equal(previewLinksVisible("mock"), true);
  assert.equal(previewLinksVisible(""), true);
  assert.equal(previewLinksVisible(undefined), true);
});

test('Field owner notice refreshes after in-place login and discards stale account status after logout',async()=>{
  const feature=await import('../src/FieldOwnerDeletionNotice.js') as typeof import('../src/FieldOwnerDeletionNotice.js') & {
    observeOwnerDeletionStatus?:(target:EventTarget,load:()=>Promise<{status:number;access?:unknown}>,set:(value:boolean)=>void)=>()=>void;
  };
  assert.equal(typeof feature.observeOwnerDeletionStatus,'function');
  const target=new EventTarget(),states:boolean[]=[],pending:((value:{status:number;access?:unknown})=>void)[]=[];
  const stop=feature.observeOwnerDeletionStatus!(target,()=>new Promise(done=>pending.push(done)),value=>states.push(value));
  const settle=async()=>{await Promise.resolve();await Promise.resolve();};
  pending.shift()!({status:401});await settle();assert.equal(states.at(-1),false);
  target.dispatchEvent(new Event('field-owner-session-changed'));
  pending.shift()!({status:200,access:{reason:'deletion_scheduled'}});await settle();assert.equal(states.at(-1),true);
  target.dispatchEvent(new Event('focus'));const old=pending.shift()!;
  target.dispatchEvent(new Event('field-owner-session-changed'));assert.equal(states.at(-1),false);
  pending.shift()!({status:401});await settle();old({status:200,access:{reason:'deletion_scheduled'}});await settle();assert.equal(states.at(-1),false);
  stop();target.dispatchEvent(new Event('field-owner-session-changed'));assert.equal(pending.length,0);
});

test('Field requestJson announces successful authentication mutations to the owner layout',async()=>{
  const savedWindow=globalThis.window,savedFetch=globalThis.fetch;
  const target=new EventTarget();let count=0;target.addEventListener('field-owner-session-changed',()=>count++);
  Object.defineProperty(globalThis,'window',{value:target,writable:true,configurable:true});
  const {requestJson}=await import('../src/field-api.js');
  try {
    globalThis.fetch=async()=>Response.json({ok:true});
    await requestJson('/api/auth/sign-in/email','POST',{});assert.equal(count,1);
    await requestJson('/api/auth/sign-out','POST',{});assert.equal(count,2);
    await requestJson('/v1/business/draft','GET');assert.equal(count,2);
    globalThis.fetch=async()=>Response.json({error:'invalid_password'},{status:401});
    await requestJson('/api/auth/sign-in/email','POST',{});assert.equal(count,2);
  }finally{globalThis.fetch=savedFetch;Object.defineProperty(globalThis,'window',{value:savedWindow,writable:true,configurable:true});}
});
