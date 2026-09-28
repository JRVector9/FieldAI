import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));
if (!/^\/fieldai_agent_(?:test|target)_[a-f0-9]+$/.test(new URL(process.env.AP_DATABASE_URL ?? '').pathname))
  throw new Error('AP moderation test requires an isolated database for retained AI usage');
const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });

test('AP reports restrict only the reported deployment and require approved timed access for review and appeal', async () => {
  const previous = process.env.AP_PROFILE;
  process.env.AP_PROFILE = 'mock';
  const users = Array.from({ length: 5 }, () => randomUUID());
  const [owner, operator, approver, auditor, stranger] = users as [string, string, string, string, string];
  let unblock: (() => void) | undefined, entered: (() => void) | undefined;
  const modelGate = new Promise<void>(resolve => { unblock = resolve; });
  const modelEntered = new Promise<void>(resolve => { entered = resolve; });
  const app = createAgentApp(async () => undefined, undefined, undefined, undefined, {
    pool, verifyDomain: async () => true,
    resolveUserId: async headers => typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null,
    modelProvider: { model: 'synthetic-moderation', generate: async () => {
      entered?.(); await modelGate;
      return { output: { answer: '승인 소개입니다.', evidenceIds: ['business'], unknowns: [], handoffRecommended: false },
        inputTokens: 10, outputTokens: 5, responseId: randomUUID() };
    } },
  });
  const headers = (user: string, key?: string, access?: string) => ({ 'x-test-user': user,
    ...(key ? { 'idempotency-key': key } : {}), ...(access ? { 'x-support-access-id': access } : {}) });
  try {
    for (const user of users) await pool.query('insert into "user"(id,name,email,"emailVerified") values ($1,$2,$3,false)',
      [user, 'Synthetic AP moderation actor', `${user}@example.invalid`]);
    for (const [user, role] of [[operator, 'operator'], [approver, 'operator'], [auditor, 'auditor']])
      await pool.query('insert into ap.platform_admin_memberships(user_id,role) values ($1,$2)', [user, role]);
    const organization = (await app.inject({ method: 'POST', url: '/v1/organizations', headers: headers(owner),
      payload: { name: 'AP 신고 검수' } })).json().id;
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/knowledge/draft', headers: headers(owner), payload: {
      expectedRevision: 0, businessName: 'AP 신고 검수', introduction: '승인 소개입니다.', region: '서울', openingHours: '평일',
      services: [{ name: '승인 상담', description: '신고 당시 서비스' }], faqs: [{ question: '승인 질문', answer: '승인 답변' }],
    } })).statusCode, 200);
    await app.inject({ method: 'POST', url: '/v1/knowledge/releases', headers: headers(owner), payload: { expectedRevision: 1 } });
    await app.inject({ method: 'PUT', url: '/v1/agents/draft', headers: headers(owner), payload: {
      expectedRevision: 0, expectedKnowledgeRevision: 1, name: '사업 AI', tone: 'clear',
      guideScope: 'PRIVATE_AGENT_INSTRUCTION', handoffText: '담당자가 답변합니다.',
    } });
    await app.inject({ method: 'POST', url: '/v1/agents/releases', headers: headers(owner),
      payload: { expectedRevision: 1, expectedKnowledgeRevision: 1 } });
    const deployments = [];
    for (let index = 0; index < 2; index++) {
      const made = await app.inject({ method: 'POST', url: '/v1/deployments', headers: headers(owner), payload: { kind: 'link' } });
      assert.equal(made.statusCode, 201);
      deployments.push(made.json());
      assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${made.json().id}/activate`, headers: headers(owner) })).statusCode, 200);
    }
    const [deployment, other] = deployments;
    const publicPath = `/v1/public/deployments/${deployment.publicId}`;
    const intake = await app.inject({ method: 'POST', url: `/v1/public/organizations/${organization}/inquiries`,
      payload: { name: '기존 고객', phone: '010-3333-4444', message: 'PRIVATE_INQUIRY_ORIGINAL', consent: true } });
    assert.equal(intake.statusCode, 201);
    const reportBody = { category: 'inaccurate_information', description: 'PRIVATE_REPORT_AP', consent: true };
    const key = randomUUID();
    const submit = (payload: Record<string, unknown> = reportBody, submittedKey = key) => app.inject({ method: 'POST',
      url: `${publicPath}/reports`, headers: { 'idempotency-key': submittedKey }, payload });
    const submitted = await submit();
    assert.equal(submitted.statusCode, 201, submitted.body);
    const id = submitted.json().id, reportPath = `/v1/admin/reports/${id}`;
    assert.equal((await submit()).json().id, id);
    assert.equal((await submit({ ...reportBody, description: '다른 신고' })).statusCode, 409);
    assert.equal((await submit({ ...reportBody, category: ['other'] }, randomUUID())).statusCode, 400);
    assert.equal((await app.inject({ url: publicPath })).statusCode, 200);
    assert.equal((await app.inject({ url: '/v1/admin/reports' })).statusCode, 401);
    assert.equal((await app.inject({ url: '/v1/admin/reports', headers: headers(owner) })).statusCode, 403);
    const queue = await app.inject({ url: '/v1/admin/reports', headers: headers(auditor) });
    assert.equal(queue.statusCode, 200);
    assert.doesNotMatch(queue.body, /PRIVATE_REPORT|description|token|guideScope/);
    assert.equal((await app.inject({ url: reportPath, headers: headers(operator) })).statusCode, 403);
    const accessKey = randomUUID(), accessBody = { reason: 'AP 공개 안내 신고 확인', minutes: 15 };
    const access = (await app.inject({ method: 'POST', url: `${reportPath}/access`, headers: headers(operator, accessKey), payload: accessBody })).json().id;
    assert.ok(access);
    assert.equal((await app.inject({ method: 'POST', url: `${reportPath}/access`, headers: headers(operator, accessKey), payload: accessBody })).json().id, access);
    const approve = (user: string, grant = access) => app.inject({ method: 'POST', url: `/v1/admin/report-access/${grant}/approve`,
      headers: headers(user), payload: { reason: '신고 검토 업무 승인' } });
    assert.equal((await approve(operator)).statusCode, 403);
    assert.equal((await approve(auditor)).statusCode, 403);
    assert.equal((await approve(approver)).statusCode, 200);
    assert.equal((await app.inject({ url: reportPath, headers: headers(approver, undefined, access) })).statusCode, 403);
    const detail = await app.inject({ url: reportPath, headers: headers(operator, undefined, access) });
    assert.equal(detail.json().description, reportBody.description);
    assert.match(detail.body, /신고 당시 서비스/);
    assert.doesNotMatch(detail.body, /PRIVATE_AGENT_INSTRUCTION|PRIVATE_INQUIRY_ORIGINAL|guideScope|verification_proof/);
    const started = await app.inject({ method: 'POST', url: `${publicPath}/engagements` });
    assert.equal(started.statusCode, 201);
    const cookie = started.headers['set-cookie'] as string;
    const ai = app.inject({ method: 'POST', url: `/v1/engagements/${started.json().id}/messages`, headers: { cookie }, payload: { question: '사업 소개를 알려주세요' } });
    await modelEntered;
    const reviewKey = randomUUID(), reviewBody = { expectedRevision: 1, outcome: 'deployment_restricted', summary: '해당 상담 배포만 검토 제한', reason: '승인 안내 대조' };
    const review = () => app.inject({ method: 'POST', url: `${reportPath}/review`, headers: headers(operator, reviewKey, access), payload: reviewBody });
    assert.equal((await review()).statusCode, 200);
    assert.equal((await review()).json().revision, 2);
    unblock?.();
    assert.equal((await ai).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/engagements/${started.json().id}`, headers: { cookie } })).statusCode, 200);
    assert.equal((await pool.query("select count(*)::int n from ap.inquiry_messages where inquiry_id=$1 and actor='assistant'", [started.json().id])).rows[0].n, 0);
    const human = await app.inject({ method: 'POST', url: `/v1/conversations/${started.json().id}/submissions`, headers: { cookie },
      payload: { name: '기존 상담 고객', phone: '010-3333-4446', message: '기존 상담을 사람 문의로 이어갑니다.', consent: true } });
    assert.equal(human.statusCode, 201, human.body);
    assert.equal((await app.inject({ url: `/v1/inquiries/${started.json().id}`, headers: { authorization: `Bearer ${human.json().receiptKey}` } })).statusCode, 200);
    assert.equal((await app.inject({ url: publicPath })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `${publicPath}/engagements` })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/public/deployments/${other.publicId}` })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deployment.id}/activate`, headers: headers(owner) })).statusCode, 409);
    assert.equal((await app.inject({ url: `/v1/inquiries/${intake.json().id}`, headers: { authorization: `Bearer ${intake.json().receiptKey}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/public/organizations/${organization}/inquiries`,
      payload: { name: '신규 직접 고객', phone: '010-3333-4445', message: '직접 문의', consent: true } })).statusCode, 201);
    const secondId = (await submit(reportBody, randomUUID())).json().id;
    assert.equal((await app.inject({ url: `/v1/admin/reports/${secondId}`, headers: headers(operator, undefined, access) })).statusCode, 403);
    const secondAccess = (await app.inject({ method: 'POST', url: `/v1/admin/reports/${secondId}/access`,
      headers: headers(operator, randomUUID()), payload: accessBody })).json().id;
    assert.equal((await approve(approver, secondAccess)).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/admin/reports/${secondId}/review`,
      headers: headers(operator, randomUUID(), secondAccess), payload: reviewBody })).statusCode, 200);
    const notices = (await app.inject({ url: '/v1/owner/notifications', headers: headers(owner) })).json().notifications;
    assert.equal(notices.filter((notice: { eventType: string; reportId: string }) => notice.eventType === 'ap.moderation.review' && notice.reportId === id).length, 1);
    assert.equal(notices.find((notice: { eventType: string }) => notice.eventType === 'ap.moderation.review').targetKind, 'moderation_report');
    const owned = await app.inject({ url: '/v1/owner/moderation/reports', headers: headers(owner) });
    assert.equal(owned.json().reports[0].deploymentRestricted, true);
    assert.doesNotMatch(owned.body, /PRIVATE_REPORT|description|PRIVATE_AGENT/);
    assert.equal((await app.inject({ url: '/v1/owner/moderation/reports', headers: headers(stranger) })).statusCode, 404);
    const appealKey = randomUUID(), appealBody = { expectedRevision: 2, message: '사업 안내를 정정했습니다.' };
    const appeal = () => app.inject({ method: 'POST', url: `/v1/owner/moderation/reports/${id}/appeal`, headers: headers(owner, appealKey), payload: appealBody });
    assert.equal((await appeal()).statusCode, 200);
    assert.equal((await appeal()).json().revision, 3);
    await app.inject({ method: 'POST', url: `/v1/deployments/${deployment.id}/pause`, headers: headers(owner) });
    const decisionKey = randomUUID(), decisionBody = { expectedRevision: 3, decision: 'overturned', summary: '해당 배포 제한 해제', reason: '정정 안내 확인' };
    const decide = () => app.inject({ method: 'POST', url: `${reportPath}/appeal-decision`, headers: headers(operator, decisionKey, access), payload: decisionBody });
    assert.equal((await decide()).statusCode, 200);
    assert.equal((await decide()).json().revision, 4);
    assert.equal((await app.inject({ url: publicPath })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deployment.id}/activate`, headers: headers(owner) })).statusCode, 409);
    await app.inject({ method: 'POST', url: `/v1/owner/moderation/reports/${secondId}/appeal`, headers: headers(owner, randomUUID()), payload: appealBody });
    assert.equal((await app.inject({ method: 'POST', url: `/v1/admin/reports/${secondId}/appeal-decision`,
      headers: headers(operator, randomUUID(), secondAccess), payload: decisionBody })).statusCode, 200);
    assert.equal((await app.inject({ url: publicPath })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${deployment.id}/activate`, headers: headers(owner) })).statusCode, 200);
    assert.equal((await app.inject({ url: publicPath })).statusCode, 200);
    const embedded = (await app.inject({ method: 'POST', url: '/v1/deployments', headers: headers(owner),
      payload: { kind: 'owned_embed', origin: 'https://moderation.example.test' } })).json();
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${embedded.id}/verify`, headers: headers(owner) })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/deployments/${embedded.id}/activate`, headers: headers(owner) })).statusCode, 200);
    const embedSession = async () => {
      const frame = await app.inject({ url: `/embed/v1/${embedded.publicId}/frame`, headers: { referer: 'https://moderation.example.test/page' } });
      assert.equal(frame.statusCode, 200);
      const nonce = frame.body.match(/const handshakeNonce = "([^"]+)";/)?.[1];
      assert.ok(nonce);
      const made = await app.inject({ method: 'POST', url: '/v1/embed/sessions', payload: { nonce } });
      assert.equal(made.statusCode, 201);
      return { authorization: `Bearer ${made.json().token}` };
    };
    const established = await embedSession(), fresh = await embedSession();
    const existingEmbed = await app.inject({ method: 'POST', url: '/v1/embed/engagements', headers: established });
    assert.equal(existingEmbed.statusCode, 201);
    const embeddedReport = (await app.inject({ method: 'POST', url: `/v1/public/deployments/${embedded.publicId}/reports`,
      headers: { 'idempotency-key': randomUUID() }, payload: reportBody })).json().id;
    const embeddedAccess = (await app.inject({ method: 'POST', url: `/v1/admin/reports/${embeddedReport}/access`,
      headers: headers(operator, randomUUID()), payload: accessBody })).json().id;
    assert.equal((await approve(approver, embeddedAccess)).statusCode, 200);
    const blocker = await pool.connect();
    let racing: Promise<{ statusCode: number }> | undefined;
    try {
      await blocker.query('begin');
      await blocker.query('lock table ap.trial_subscriptions in access exclusive mode');
      racing = app.inject({ method: 'POST', url: '/v1/embed/engagements', headers: fresh });
      // inject의 실행을 시작하고 실제 PG17 대기 상태로 경합 지점을 확인한다.
      const pending = Promise.resolve(racing);
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        waiting = (await pool.query(`select 1 from pg_stat_activity where datname=current_database()
          and wait_event='relation' and query like 'select 1 from ap.trial_subscriptions%'`)).rowCount! > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(waiting, 'embed intake reached the actual PostgreSQL trial-check barrier');
      assert.equal((await app.inject({ method: 'POST', url: `/v1/admin/reports/${embeddedReport}/review`,
        headers: headers(operator, randomUUID(), embeddedAccess), payload: reviewBody })).statusCode, 200);
      await blocker.query('commit');
      assert.equal((await pending).statusCode, 409, 'a restriction committed before intake must reject the new conversation');
    } finally {
      await blocker.query('rollback'); blocker.release();
      if (racing) await racing;
    }
    assert.equal((await app.inject({ url: `/v1/engagements/${existingEmbed.json().id}`, headers: established })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/embed/handoffs', headers: fresh,
      payload: { question: '신규 상담은 제한합니다.' } })).statusCode, 401);
    const preservedHandoff = await app.inject({ method: 'POST', url: '/v1/embed/handoffs', headers: established,
      payload: { question: '기존 대화를 사람에게 문의합니다.' } });
    assert.equal(preservedHandoff.statusCode, 201);
    const transferred = await app.inject({ method: 'POST', url: '/v1/embed/continue', headers: { origin: 'http://localhost:3001' },
      payload: { ticket: preservedHandoff.json().ticket } });
    assert.equal(transferred.statusCode, 200);
    const transferredCookie = (transferred.headers['set-cookie'] as string[]).map(value => value.split(';')[0]).join('; ');
    const recoveredEmbed = await app.inject({ url: `/v1/public/deployments/${embedded.publicId}/engagements/current`, headers: { cookie: transferredCookie } });
    assert.equal(recoveredEmbed.json().engagement.id, existingEmbed.json().id);
    assert.equal(recoveredEmbed.json().organizationId, organization);
    assert.equal(recoveredEmbed.json().deploymentRestricted, true);
    assert.equal((await app.inject({ url: `/v1/public/deployments/${other.publicId}/engagements/current`, headers: { cookie: transferredCookie } })).json().engagement, null);
    await pool.query("update ap.moderation_access_requests set expires_at=now()-interval '1 second' where id=$1", [access]);
    assert.equal((await app.inject({ url: reportPath, headers: headers(operator, undefined, access) })).statusCode, 403);
    await pool.query('delete from ap.platform_admin_memberships where user_id=$1', [approver]);
    assert.equal((await app.inject({ url: `/v1/admin/reports/${secondId}`, headers: headers(operator, undefined, secondAccess) })).statusCode, 403);
    process.env.AP_PROFILE = 'sandbox';
    assert.equal((await app.inject({ url: '/v1/admin/reports', headers: headers(operator) })).json().error, 'blocked_integration');
  } finally {
    unblock?.(); process.env.AP_PROFILE = previous;
    await app.close();
    await pool.end();
  }
});
