import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
process.env.AP_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4311';
async function owner() {
  const email = `agent-test-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string) => auth.handler(new Request(`${base}/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password, name: 'Synthetic AI owner' }),
  }));
  assert.equal((await post('/sign-up/email')).status, 200);
  const signedIn = await post('/sign-in/email');
  assert.equal(signedIn.status, 200);
  return { email, cookie: signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('AP owner tests only approved knowledge with server-checked evidence and no customer side effects', async () => {
  const first = await owner();
  const other = await owner();
  const seen: { question: string; facts: { id: string; text: string }[] }[] = [];
  let output: { answer: string; evidenceIds: string[]; unknowns: string[]; handoffRecommended: boolean } = {
    answer: '등록된 상담 서비스를 안내합니다.', evidenceIds: ['service:0'], unknowns: [], handoffRecommended: false,
  };
  const modelProvider = {
    model: 'test-model',
    generate: async (request: { question: string; facts: { id: string; text: string }[] }) => {
      seen.push({ question: request.question, facts: request.facts });
      return { output, inputTokens: 100, outputTokens: 30, responseId: `synthetic-${seen.length}` };
    },
  };
  const runtime = {
    pool,
    resolveUserId: async (headers: IncomingHttpHeaders) =>
      (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
  };
  const app = createAgentApp(async () => undefined, auth.handler, base, undefined,
    { ...runtime, modelProvider, testDailyLimit: 3 });
  const disconnected = createAgentApp(async () => undefined, auth.handler, base, undefined, runtime);
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie: first.cookie },
      payload: { name: '검수 상호' } });
    assert.equal(created.statusCode, 201);
    const organizationId = (created.json() as { id: string }).id;
    const beforeRelease = await app.inject({ method: 'POST', url: '/v1/agents/test', headers: { cookie: first.cookie },
      payload: { question: '무엇을 하나요?' } });
    assert.equal(beforeRelease.statusCode, 409);
    const knowledge = { expectedRevision: 0, businessName: '검수 상호', introduction: '서울에서 상담합니다.',
      region: '서울 강남구·서초구', openingHours: '평일 09:00–18:00',
      services: [{ name: '상담 서비스', description: '상담 안내' }],
      faqs: [{ question: '문의 방법은?', answer: '직접 문의를 남겨 주세요.' }] };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: first.cookie }, payload: knowledge })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: first.cookie },
      payload: { expectedRevision: 1 } })).statusCode, 201);
    const draft = await app.inject({ url: '/v1/agents/draft', headers: { cookie: first.cookie } });
    assert.equal(draft.statusCode, 200);
    assert.equal((draft.json() as { revision: number }).revision, 0);
    const config = { expectedRevision: 0, name: '검수 AI', tone: 'warm', guideScope: '승인된 서비스와 문의 방법',
      handoffText: '확인되지 않은 사항은 담당자가 답변합니다.' };
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: { cookie: first.cookie }, payload: config })).statusCode, 200);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: { cookie: first.cookie }, payload: config })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: { cookie: other.cookie },
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } })).statusCode, 404);
    const released = await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: { cookie: first.cookie },
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } });
    assert.equal(released.statusCode, 201);
    assert.equal((released.json() as { knowledgeRevision: number }).knowledgeRevision, 1);
    const unavailable = await disconnected.inject({ method: 'POST', url: '/v1/agents/test', headers: { cookie: first.cookie },
      payload: { question: '무엇을 하나요?' } });
    assert.equal(unavailable.statusCode, 503);
    assert.equal((unavailable.json() as { error: string }).error, 'blocked_integration');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/agents/test', headers: { cookie: first.cookie },
      payload: { question: '010-1234-5678로 전화 주세요' } })).statusCode, 400);
    const answer = await app.inject({ method: 'POST', url: '/v1/agents/test', headers: { cookie: first.cookie },
      payload: { question: '어떤 서비스를 하나요?' } });
    assert.equal(answer.statusCode, 200);
    assert.equal((answer.json() as { answer: string }).answer, output.answer);
    assert.equal((answer.json() as { evidenceIds: string[] }).evidenceIds[0], 'service:0');
    assert.ok(seen[0]!.facts.some(fact => fact.id === 'service:0'));
    assert.ok(seen[0]!.facts.some(fact => fact.id === 'region' && fact.text === '활동 지역: 서울 강남구·서초구'));
    assert.ok(seen[0]!.facts.some(fact => fact.id === 'opening_hours' && fact.text === '영업시간: 평일 09:00–18:00'));
    assert.ok(!seen[0]!.facts.some(fact => fact.text.includes('미승인')));
    output = { answer: '승인되지 않은 사실입니다.', evidenceIds: ['faq:99'], unknowns: [], handoffRecommended: false };
    const forged = await app.inject({ method: 'POST', url: '/v1/agents/test', headers: { cookie: first.cookie },
      payload: { question: '자격이 있나요?' } });
    assert.equal(forged.statusCode, 422);
    assert.equal((forged.json() as { error: string }).error, 'unsupported_evidence');
    output = { answer: '가격은 29000원입니다.', evidenceIds: ['service:0'], unknowns: [], handoffRecommended: false };
    const inventedNumber = await app.inject({ method: 'POST', url: '/v1/agents/test', headers: { cookie: first.cookie },
      payload: { question: '가격은?' } });
    assert.equal(inventedNumber.statusCode, 422);
    assert.equal((inventedNumber.json() as { error: string }).error, 'unsupported_number');
    assert.equal(seen.length, 3);
    const budgeted = await app.inject({ method: 'POST', url: '/v1/agents/test', headers: { cookie: first.cookie },
      payload: { question: '추가 질문' } });
    assert.equal(budgeted.statusCode, 429);
    assert.equal(seen.length, 3);
    const counts = await pool.query<{ inquiry_count: string; run_count: string }>(
      `select (select count(*) from ap.inquiries where organization_id = $1) as inquiry_count,
              (select count(*) from ap.ai_runs where organization_id = $1) as run_count`, [organizationId]);
    assert.equal(Number(counts.rows[0]!.inquiry_count), 0);
    assert.equal(Number(counts.rows[0]!.run_count), 3);
    const changedKnowledge = await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: { cookie: first.cookie },
      payload: { ...knowledge, expectedRevision: 1, introduction: '새로 승인할 정보' } });
    assert.equal(changedKnowledge.statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: { cookie: first.cookie },
      payload: { expectedRevision: 2 } })).statusCode, 201);
    const staleTest = await app.inject({ method: 'POST', url: '/v1/agents/test', headers: { cookie: first.cookie },
      payload: { question: '새 정보는?' } });
    assert.equal(staleTest.statusCode, 409);
    assert.equal((staleTest.json() as { error: string }).error, 'knowledge_stale');
    const rebound = await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: { cookie: first.cookie },
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 2 } });
    assert.equal(rebound.statusCode, 201);
    assert.equal((rebound.json() as { revision: number }).revision, 2);
  } finally {
    await Promise.all([app.close(), disconnected.close()]);
    await pool.query('delete from ap.organizations where owner_user_id = (select id from "user" where email = $1)', [first.email]).catch(() => undefined);
    await authPool.query('delete from "user" where email = any($1::text[])', [[first.email, other.email]]);
  }
});
