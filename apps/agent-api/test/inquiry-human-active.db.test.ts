import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';

// PRD 2.7 사람 응대 상태: 직접 응대 시작 → human_active, 고객 추가 메시지 유지, 답변·종료, 생성 중 AI 폐기를 검사한다.
test('AP owner take-over keeps human_active on customer follow-up without AI and releases back to the queue', async () => {
  const email = `ap-human-active-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const authPost = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic owner' }),
  }));
  assert.equal((await authPost('/sign-up/email')).status, 200);
  const owner = { cookie: (await authPost('/sign-in/email')).headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
  let gate: Promise<void> | null = null;
  let entered: (() => void) | null = null;
  let calls = 0;
  const modelProvider = {
    model: 'synthetic-human-active-model',
    generate: async () => {
      calls += 1;
      entered?.();
      if (gate) await gate;
      return { output: { answer: '상담 서비스를 안내합니다.', evidenceIds: ['service:0'], unknowns: [],
        handoffRecommended: false }, inputTokens: 10, outputTokens: 5, responseId: `synthetic-human-${calls}` };
    },
  };
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined, { pool, modelProvider, customerDailyLimit: 50,
    resolveUserId: async (headers: IncomingHttpHeaders) => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null });
  const state = async (id: string) => (await pool.query<{ state: string; mode: string; automation_paused: boolean; revision: number }>(
    'select state, mode, automation_paused, revision from ap.inquiries where id = $1', [id])).rows[0]!;
  const count = async (sql: string, id: string) => Number((await pool.query<{ count: string }>(sql, [id])).rows[0]!.count);
  const aiRuns = (id: string) => count("select count(*)::text as count from ap.ai_runs where inquiry_id = $1 and kind = 'customer_message'", id);
  const assistantMessages = (id: string) => count("select count(*)::text as count from ap.inquiry_messages where inquiry_id = $1 and actor = 'assistant'", id);
  const handling = (id: string, action: 'take-over' | 'release', expectedRevision: number) =>
    app.inject({ method: 'POST', url: `/v1/owner/inquiries/${id}/${action}`, headers: owner, payload: { expectedRevision } });
  // 직접 응대 시작·종료 행위자 기록(추가): 사건 종류·revision·행위자를 revision 순으로 읽는다.
  const humanEvents = async (id: string) => (await pool.query<{ event_type: string; revision: number; actor_user_id: string | null }>(
    `select event_type, revision, actor_user_id from ap.inquiry_resolution_events
     where inquiry_id = $1 and event_type in ('human_takeover', 'human_release') order by revision`, [id])).rows;
  const reply = (id: string, body: string) => app.inject({ method: 'POST', url: `/v1/owner/inquiries/${id}/replies`, headers: owner, payload: { body } });
  try {
    const organization = await app.inject({ method: 'POST', url: '/v1/organizations', headers: owner, payload: { name: '직접 응대 검수' } });
    assert.equal(organization.statusCode, 201);
    const organizationId = organization.json().id as string;
    const ownerUserId = (await pool.query<{ id: string }>('select id from "user" where email = $1', [email])).rows[0]!.id;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: owner, payload: {
      expectedRevision: 0, businessName: '직접 응대 검수', introduction: '', services: [{ name: '상담 서비스', description: '방문' }], faqs: [],
    } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: owner, payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: owner, payload: {
      expectedRevision: 0, name: '상담 AI', tone: 'clear', guideScope: '', handoffText: '담당자가 답변합니다.' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: owner,
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 201);
    const link = await app.inject({ method: 'POST', url: '/v1/deployments', headers: owner, payload: { kind: 'link' } });
    assert.equal(link.statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${link.json().id}/activate`, headers: owner })).statusCode, 200);
    const engage = async () => {
      const started = await app.inject({ method: 'POST', url: `/v1/public/deployments/${link.json().publicId}/engagements` });
      assert.equal(started.statusCode, 201);
      const id = started.json().id as string;
      const cookie = started.headers['set-cookie']?.toString().split(';')[0];
      return { id, cookie, ask: () => app.inject({ method: 'POST', url: `/v1/engagements/${id}/messages`, headers: { cookie },
        payload: { question: '어떤 서비스를 제공하나요?' } }),
      submit: () => app.inject({ method: 'POST', url: `/v1/conversations/${id}/submissions`, headers: { cookie },
        payload: { name: '고객', phone: '010-2222-3333', message: '사람 상담을 원합니다.', consent: true } }) };
    };
    const first = await engage();
    const id = first.id;
    assert.equal((await first.ask()).statusCode, 200);
    const submitted = await first.submit();
    assert.equal(submitted.statusCode, 201, submitted.body);
    const receipt = { authorization: `Bearer ${submitted.json().receiptKey as string}` };
    const followUp = (body: string) => app.inject({ method: 'POST', url: `/v1/inquiries/${id}/messages`, headers: receipt, payload: { body } });

    // 직접 응대 시작: needs_owner → human_active, 같은 요청 재전송은 같은 결과, 오래된 revision은 거절
    const before = await state(id);
    assert.equal(before.state, 'needs_owner');
    assert.equal((await handling(id, 'take-over', before.revision - 1)).statusCode, 409);
    const tookOver = await handling(id, 'take-over', before.revision);
    assert.equal(tookOver.statusCode, 200, tookOver.body);
    assert.deepEqual(tookOver.json(), { id, state: 'human_active', revision: before.revision + 1 });
    assert.deepEqual((await handling(id, 'take-over', before.revision)).json(), tookOver.json());
    // 시작 사건은 상태 변경과 함께 정확히 1건, 재전송·409 거절은 사건을 남기지 않는다.
    assert.deepEqual(await humanEvents(id),
      [{ event_type: 'human_takeover', revision: before.revision + 1, actor_user_id: ownerUserId }]);
    assert.deepEqual(await state(id), { state: 'human_active', mode: 'human', automation_paused: true, revision: before.revision + 1 });
    assert.equal((await app.inject({ url: `/v1/owner/inquiries/${id}`, headers: owner })).json().state, 'human_active');

    // human_active 중 고객 메시지: AI 실행 없음, 상태 유지, 사업자 알림 1건만 읽지 않음으로 추가
    const runsBefore = await aiRuns(id);
    assert.equal((await first.ask()).statusCode, 401);
    assert.equal(await aiRuns(id), runsBefore);
    const notificationsBefore = (await app.inject({ url: '/v1/owner/notifications', headers: owner })).json();
    const customerMessage = await followUp('직접 응대 중 추가 질문입니다.');
    assert.equal(customerMessage.statusCode, 201, customerMessage.body);
    assert.equal(customerMessage.json().state, 'human_active');
    assert.equal((await state(id)).state, 'human_active');
    assert.equal(await aiRuns(id), runsBefore);
    const notificationsAfter = (await app.inject({ url: '/v1/owner/notifications', headers: owner })).json();
    assert.equal(notificationsAfter.unreadCount, notificationsBefore.unreadCount + 1);
    assert.equal(notificationsAfter.notifications.filter((item: { inquiryId: string; eventType: string; readAt: string | null }) =>
      item.inquiryId === id && item.eventType === 'ap.inquiry.customer_message' && item.readAt === null).length, 1);
    // 같은 Idempotency-Key 재전송은 고정값(needs_owner)이 아니라 현재 상태(human_active)를 돌려준다.
    const replayHeaders = { ...receipt, 'idempotency-key': randomBytes(32).toString('base64url') };
    const keyed = await app.inject({ method: 'POST', url: `/v1/inquiries/${id}/messages`, headers: replayHeaders, payload: { body: '재전송 확인 질문입니다.' } });
    assert.equal(keyed.statusCode, 201, keyed.body);
    assert.equal(keyed.json().state, 'human_active');
    const replayed = await app.inject({ method: 'POST', url: `/v1/inquiries/${id}/messages`, headers: replayHeaders, payload: { body: '재전송 확인 질문입니다.' } });
    assert.equal(replayed.statusCode, 200, replayed.body);
    assert.deepEqual(replayed.json(), { messageId: keyed.json().messageId, state: 'human_active', delivery: 'blocked_integration' });

    // 직접 응대 종료: 마지막 고객 메시지가 미답이면 needs_owner, 재전송은 같은 결과, human_active가 아니면 거절
    const releasing = (await state(id)).revision;
    const released = await handling(id, 'release', releasing);
    assert.equal(released.statusCode, 200, released.body);
    assert.deepEqual(released.json(), { id, state: 'needs_owner', revision: releasing + 1 });
    assert.deepEqual((await handling(id, 'release', releasing)).json(), released.json());
    assert.equal((await handling(id, 'release', releasing + 1)).statusCode, 409);
    assert.deepEqual(await humanEvents(id), [
      { event_type: 'human_takeover', revision: before.revision + 1, actor_user_id: ownerUserId },
      { event_type: 'human_release', revision: releasing + 1, actor_user_id: ownerUserId },
    ]);

    // 직접 응대 없이 답변하는 기존 흐름: needs_owner → waiting_customer, 고객 후속 질문은 다시 needs_owner
    const plainReply = await reply(id, '직접 응대 없이 답변합니다.');
    assert.equal(plainReply.statusCode, 201, plainReply.body);
    assert.equal(plainReply.json().state, 'waiting_customer');
    assert.equal((await followUp('답변 감사합니다. 하나 더 묻겠습니다.')).json().state, 'needs_owner');

    // human_active에서 답변하면 waiting_customer, 답변 뒤 다시 직접 응대 후 종료하면 고객 답변 대기로 돌아간다
    assert.equal((await handling(id, 'take-over', (await state(id)).revision)).json().state, 'human_active');
    assert.equal((await reply(id, '직접 응대로 답변합니다.')).json().state, 'waiting_customer');
    const fromWaiting = await handling(id, 'take-over', (await state(id)).revision);
    assert.equal(fromWaiting.json().state, 'human_active');
    assert.equal((await handling(id, 'release', fromWaiting.json().revision)).json().state, 'waiting_customer');

    // 생성 중인 AI는 사람 접수·직접 응대 시작 뒤 마지막 전송 전 재검사로 폐기된다
    const racing = await engage();
    let release!: () => void;
    gate = new Promise(resolveGate => { release = resolveGate; });
    const modelStarted = new Promise<void>(resolveEntered => { entered = resolveEntered; });
    const inFlight = racing.ask();
    await modelStarted;
    const raceSubmitted = await racing.submit();
    assert.equal(raceSubmitted.statusCode, 201, raceSubmitted.body);
    const raced = await handling(racing.id, 'take-over', (await state(racing.id)).revision);
    assert.equal(raced.statusCode, 200, raced.body);
    assert.equal(raced.json().state, 'human_active');
    release(); gate = null; entered = null;
    const discarded = await inFlight;
    assert.equal(discarded.statusCode, 409, discarded.body);
    assert.equal(discarded.json().error, 'automation_paused_or_source_changed');
    assert.equal((await pool.query<{ status: string }>('select status from ap.ai_runs where id = $1',
      [discarded.json().runId])).rows[0]?.status, 'rejected');
    assert.equal(await assistantMessages(racing.id), 0);
    assert.deepEqual({ ...(await state(racing.id)), revision: 0 }, { state: 'human_active', mode: 'human', automation_paused: true, revision: 0 });

    // 직접 문의의 스팸·처리 완료·보존 종료 경로는 직접 응대와 함께 그대로 동작한다
    const direct = await app.inject({ method: 'POST', url: `/v1/public/organizations/${organizationId}/inquiries`,
      payload: { name: '직접 고객', phone: '010-4444-5555', message: '직접 문의입니다.', consent: true } });
    assert.equal(direct.statusCode, 201, direct.body);
    const directId = direct.json().id as string;
    const directReceipt = { authorization: `Bearer ${direct.json().receiptKey as string}` };
    const directTake = await handling(directId, 'take-over', (await state(directId)).revision);
    assert.equal(directTake.json().state, 'human_active');
    const spam = await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${directId}/spam`, headers: owner,
      payload: { spam: true, expectedRevision: directTake.json().revision } });
    assert.equal(spam.json().state, 'spam');
    assert.equal((await handling(directId, 'take-over', spam.json().revision)).statusCode, 409);
    assert.equal((await handling(directId, 'release', spam.json().revision)).statusCode, 409);
    const spamFollowUp = await app.inject({ method: 'POST', url: `/v1/inquiries/${directId}/messages`, headers: directReceipt,
      payload: { body: '스팸 중 메시지' } });
    assert.equal(spamFollowUp.json().state, 'spam');
    const unspam = await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${directId}/spam`, headers: owner,
      payload: { spam: false, expectedRevision: (await state(directId)).revision } });
    assert.equal(unspam.json().state, 'needs_owner');
    const active = await handling(directId, 'take-over', (await state(directId)).revision);
    const closed = await app.inject({ method: 'POST', url: `/v1/owner/inquiries/${directId}/close`, headers: owner,
      payload: { expectedRevision: active.json().revision } });
    assert.equal(closed.json().state, 'closed');
    assert.equal((await handling(directId, 'take-over', closed.json().revision)).statusCode, 409);
    await pool.query('update ap.inquiries set retention_work_purged_at = now() where id = $1', [directId]);
    const purged = await handling(directId, 'take-over', closed.json().revision);
    assert.equal(purged.statusCode, 410, purged.body);
    assert.equal(purged.json().error, 'retention_work_ended');
  } finally { await app.close(); }
});
