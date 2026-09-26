import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { test } from 'node:test';
import { Pool } from 'pg';
import { apConnectorFromEnvironment } from '../../apps/field-api/dist/ap-connector.js';
import { deliverApEventOnce, reconcileApEventDeliveries } from '../../apps/field-api/dist/ap-event-delivery.js';
import { deliverApConnectionRevokeOnce } from '../../apps/field-api/dist/ap-connection-revoke.js';
import { copyExternalRequestAttachmentOnce } from '../../apps/field-api/dist/external-request-attachment-worker.js';
import { createFieldInquiryMediaStore } from '../../apps/field-api/dist/inquiry-media.js';
import { processFieldEventInboxOnce } from '../../apps/agent-api/dist/field-event-inbox.js';
import { deliverFieldConnectionRevokeOnce } from '../../apps/agent-api/dist/field-connection-revoke-worker.js';
import { fieldConnectorFromEnvironment } from '../../apps/agent-api/dist/field-connector.js';
import { reconcileFactsChangeDeliveries, deliverFactsChangeOnce } from '../../apps/field-api/dist/facts-change-delivery.js';
import { processFieldFactsEventOnce } from '../../apps/agent-api/dist/field-facts-events.js';
import { processFieldSourceRefreshOnce } from '../../apps/agent-api/dist/source-refresh-worker.js';

process.loadEnvFile(resolve('infra/agent/.env'));
process.loadEnvFile(resolve('infra/field/.env'));
process.env.AP_PROFILE = 'mock';
process.env.FIELD_PROFILE = 'mock';
const ap = 'http://127.0.0.1:4311';
const field = 'http://127.0.0.1:4321';
const fieldWebPort = 3002;
const apPool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
const fieldPool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
async function awaitAutomaticEvent(actionId, reservationId, revision) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const [fieldState, apState] = await Promise.all([
      fieldPool.query(`select d.state from field.ap_event_deliveries d
        join field.reservation_events e on e.id = d.event_id
        where e.reservation_id = $1 and e.revision = $2`, [reservationId, revision]),
      apPool.query(`select i.state from ap.field_event_inbox i
        where i.action_request_id = $1 and i.revision = $2`, [actionId, revision]),
    ]);
    if (fieldState.rows[0]?.state === 'acked' && apState.rows[0]?.state === 'processed') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`automatic Field event ${actionId} revision ${revision} was not processed`);
}
async function awaitAutomaticRevoke(connectionId) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const [fieldState, apState] = await Promise.all([
      fieldPool.query(`select state from field.ap_connection_revocations where connection_id = $1`,
        [connectionId]),
      apPool.query(`select status from ap.field_connections where id = $1`, [connectionId]),
    ]);
    if (fieldState.rows[0]?.state === 'acked' && apState.rows[0]?.status === 'revoked') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`Field connection ${connectionId} was not remotely revoked`);
}
async function awaitAutomaticApRevoke(connectionId) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const [apState, fieldState] = await Promise.all([
      apPool.query(`select state from ap.field_remote_revocations where connection_id = $1`, [connectionId]),
      fieldPool.query(`select status from field.ap_connections where id = $1`, [connectionId]),
    ]);
    if (apState.rows[0]?.state === 'acked' && fieldState.rows[0]?.status === 'revoked') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`AP connection ${connectionId} was not remotely revoked`);
}
async function waitForApiAvailability(base, name, ready) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    let available = false;
    let connected = false;
    try {
      const response = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(500) });
      connected = true;
      available = response.status === 200;
    } catch { /* API port is not serving requests. */ }
    if (ready ? available : !connected) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`${name} API did not become ${ready ? 'ready' : 'unavailable'}`);
}
async function awaitRevokeRetry(pool, table, connectionId, name) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const state = await pool.query(`select id,state,attempts from ${table}
      where connection_id = $1`, [connectionId]);
    if (state.rows[0]?.state === 'retry' && state.rows[0]?.attempts >= 1) return state.rows[0].id;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`${name} revoke ${connectionId} did not enter retry while remote API was down`);
}

async function json(url, method = 'GET', body, cookie, redirect = 'follow', extraHeaders = {}) {
  const response = await fetch(url, { method, redirect, headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(cookie ? { cookie } : {}),
    ...(method === 'GET' ? { accept: 'text/html', 'sec-fetch-mode': 'navigate' }
      : { origin: new URL(url).origin }),
    ...extraHeaders,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.clone().json().catch(() => ({}));
  return { response, value };
}
async function customerJson(url, receiptKey, method = 'GET', body, idempotencyKey) {
  const response = await fetch(url, { method, headers: {
    authorization: `Bearer ${receiptKey}`,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, value: await response.clone().json().catch(() => ({})) };
}
async function account(base, name) {
  const email = `field-http-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  const signup = await json(`${base}/api/auth/sign-up/email`, 'POST', { email, password, name });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.value));
  const login = await json(`${base}/api/auth/sign-in/email`, 'POST', { email, password });
  assert.equal(login.response.status, 200, JSON.stringify(login.value));
  const cookie = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.match(cookie, /session_token/);
  return { email, password, cookie };
}

test('local AP OAuth code crosses HTTP into Field encrypted pending connection', async () => {
  assert.ok(process.env.FIELD_AP_CLIENT_ID, 'run pnpm setup:mock:ap-connector first');
  const outageSide = process.env.FIELD_REVOKE_OUTAGE;
  const routeRestart = process.env.FIELD_ROUTE_RESTART === '1';
  assert.ok(!outageSide || outageSide === 'ap' || outageSide === 'field');
  assert.ok(!routeRestart || !outageSide, 'run route restart separately from revoke outage');
  if (outageSide) {
    assert.equal(process.env.FIELD_EVENT_WORKERS_RUNNING, '1');
    const isAp = outageSide === 'ap';
    assert.equal(new URL(isAp ? process.env.AP_DATABASE_URL : process.env.FIELD_DATABASE_URL).hostname,
      '127.0.0.1');
    const pidVariable = isAp ? 'FIELD_TEST_AP_SERVER_PID' : 'FIELD_TEST_FIELD_SERVER_PID';
    const pid = Number(process.env[pidVariable]);
    assert.ok(Number.isSafeInteger(pid) && pid > 0, `${pidVariable} is required`);
    const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
    assert.match(command, isAp
      ? /(?:^|\/)node --env-file=infra\/agent\/\.env apps\/agent-api\/dist\/server\.js$/
      : /(?:^|\/)node --env-file=infra\/field\/\.env apps\/field-api\/dist\/server\.js$/);
  }
  if (routeRestart) {
    assert.equal(process.env.FIELD_EVENT_WORKERS_RUNNING, '1');
    for (const [name, database, pidVariable, commandPattern] of [
      ['AP', process.env.AP_DATABASE_URL, 'FIELD_TEST_AP_SERVER_PID',
        /(?:^|\/)node --env-file=infra\/agent\/\.env apps\/agent-api\/dist\/server\.js$/],
      ['Field', process.env.FIELD_DATABASE_URL, 'FIELD_TEST_FIELD_SERVER_PID',
        /(?:^|\/)node --env-file=infra\/field\/\.env apps\/field-api\/dist\/server\.js$/],
    ]) {
      assert.equal(new URL(database).hostname, '127.0.0.1', `${name} must use local DB`);
      const pid = Number(process.env[pidVariable]);
      assert.ok(Number.isSafeInteger(pid) && pid > 0, `${pidVariable} is required`);
      const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
      assert.match(command, commandPattern);
    }
  }
  const apOwner = await account(ap, 'AP HTTP owner');
  const fieldOwner = await account(field, 'Field HTTP owner');
  const distributionE2e = process.env.FIELD_DISTRIBUTION_E2E === '1';
  const mediaOwner = distributionE2e ? await account(ap, 'AP HTTP publisher') : null;
  let apOrganizationId = '';
  let fieldOrganizationId = '';
  let publisherId = '';
  let placementId = '';
  let placementPublicId = '';
  let placementDeploymentId = '';
  let publisherOrigin = '';
  let apStopped = false;
  let apRestored = false;
  let fieldStopped = false;
  let fieldRestored = false;
  async function restoreAp() {
    if (!apStopped || apRestored) return;
    const server = spawn(process.execPath,
      ['--env-file=infra/agent/.env', 'apps/agent-api/dist/server.js'], {
        cwd: resolve('.'), detached: true, stdio: 'ignore',
        env: { ...process.env, AP_PROFILE: 'mock' },
      });
    server.unref();
    await waitForApiAvailability(ap, 'AP', true);
    apRestored = true;
  }
  async function restoreField() {
    if (!fieldStopped || fieldRestored) return;
    const server = spawn(process.execPath,
      ['--env-file=infra/field/.env', 'apps/field-api/dist/server.js'], {
        cwd: resolve('.'), detached: true, stdio: 'ignore',
        env: { ...process.env, FIELD_PROFILE: 'mock' },
      });
    server.unref();
    await waitForApiAvailability(field, 'Field', true);
    fieldRestored = true;
  }
  const fieldServiceId = randomUUID();
  try {
    const apOrg = await json(`${ap}/v1/organizations`, 'POST', { name: 'HTTP AP 조직' }, apOwner.cookie);
    assert.equal(apOrg.response.status, 201, JSON.stringify(apOrg.value));
    apOrganizationId = apOrg.value.id;
    const knowledge = await json(`${ap}/v1/knowledge/draft`, 'PUT', {
      expectedRevision: 0, businessName: 'HTTP AP 조직', introduction: '승인된 소개',
      services: [{ name: '상담', description: '상담 서비스' }], faqs: [],
    }, apOwner.cookie);
    assert.equal(knowledge.response.status, 200, JSON.stringify(knowledge.value));
    const knowledgeRelease = await json(`${ap}/v1/knowledge/releases`, 'POST',
      { expectedRevision: 1 }, apOwner.cookie);
    assert.equal(knowledgeRelease.response.status, 201, JSON.stringify(knowledgeRelease.value));
    const draft = await json(`${ap}/v1/agents/draft`, 'PUT', { expectedRevision: 0,
      name: 'HTTP AP AI', tone: 'clear', guideScope: '승인 안내', handoffText: '담당자가 응대합니다.' }, apOwner.cookie);
    assert.equal(draft.response.status, 200, JSON.stringify(draft.value));
    const aiRelease = await json(`${ap}/v1/agents/releases`, 'POST',
      { expectedRevision: 1, expectedKnowledgeRevision: 1 }, apOwner.cookie);
    assert.equal(aiRelease.response.status, 201, JSON.stringify(aiRelease.value));

    if (distributionE2e) {
      const campaign = await json(`${ap}/v1/campaigns`, 'POST', {
        name: 'Field 예약 성과 검수 카드', knowledgeReleaseId: knowledgeRelease.value.releaseId,
        serviceIndex: 0 }, apOwner.cookie);
      assert.equal(campaign.response.status, 201, JSON.stringify(campaign.value));
      const release = await json(`${ap}/v1/campaigns/${campaign.value.id}/releases`, 'POST', {
        expectedRevision: 1, idempotencyKey: randomUUID(), confirmApprovedFacts: true,
      }, apOwner.cookie);
      assert.equal(release.response.status, 201, JSON.stringify(release.value));
      const publisher = await json(`${ap}/v1/publishers`, 'POST',
        { name: 'Field 예약 성과 검수 매체' }, mediaOwner.cookie);
      assert.equal(publisher.response.status, 201, JSON.stringify(publisher.value));
      publisherId = publisher.value.id;
      const origin = `https://distribution-${randomUUID().slice(0, 12)}.example.test`;
      publisherOrigin = origin;
      const domain = await json(`${ap}/v1/publishers/${publisherId}/domains`, 'POST',
        { origin }, mediaOwner.cookie);
      assert.equal(domain.response.status, 201, JSON.stringify(domain.value));
      const verifyUrl = `${ap}/v1/publishers/${publisherId}/domains/${domain.value.id}/verify`;
      assert.equal((await json(verifyUrl, 'POST', undefined, mediaOwner.cookie)).response.status, 409);
      await apPool.query(`update ap.publisher_domains
        set verified_at = now(), verified_until = now() + interval '7 days'
        where id = $1 and publisher_id = $2`, [domain.value.id, publisherId]);
      const slot = await json(`${ap}/v1/publishers/${publisherId}/slots`, 'POST',
        { domainId: domain.value.id, name: '기사 중간', format: 'article' }, mediaOwner.cookie);
      assert.equal(slot.response.status, 201, JSON.stringify(slot.value));
      assert.equal((await json(`${ap}/v1/publishers/${publisherId}/slots/${slot.value.id}/activate`,
        'POST', undefined, mediaOwner.cookie)).response.status, 200);
      const placement = await json(`${ap}/v1/placements`, 'POST', {
        campaignId: campaign.value.id, releaseId: release.value.releaseId,
        slotId: slot.value.id, idempotencyKey: randomUUID(),
      }, apOwner.cookie);
      assert.equal(placement.response.status, 201, JSON.stringify(placement.value));
      placementId = placement.value.id;
      const queue = await json(`${ap}/v1/publishers/${publisherId}/placements`,
        'GET', undefined, mediaOwner.cookie);
      assert.equal(queue.response.status, 200, JSON.stringify(queue.value));
      const requested = queue.value.placements.find(item => item.id === placementId);
      assert.ok(requested);
      const approved = await json(`${ap}/v1/publishers/${publisherId}/placements/${placementId}/approve`,
        'POST', { expectedReleaseId: release.value.releaseId,
          expectedContentHash: requested.contentHash }, mediaOwner.cookie);
      assert.equal(approved.response.status, 200, JSON.stringify(approved.value));
      const installed = await json(`${ap}/v1/publishers/${publisherId}/placements/${placementId}/install`,
        'POST', undefined, mediaOwner.cookie);
      assert.equal(installed.response.status, 201, JSON.stringify(installed.value));
      placementPublicId = installed.value.publicId;
      const deployment = await apPool.query(`select id from ap.deployments
        where placement_id = $1 and public_id = $2`, [placementId, placementPublicId]);
      assert.equal(deployment.rows.length, 1);
      placementDeploymentId = deployment.rows[0].id;
    }

    const fieldOrg = await json(`${field}/v1/organizations`, 'POST', { name: 'HTTP Field 조직' }, fieldOwner.cookie);
    assert.equal(fieldOrg.response.status, 201, JSON.stringify(fieldOrg.value));
    fieldOrganizationId = fieldOrg.value.id;
    const fieldDraft = await json(`${field}/v1/business/draft`, 'PUT', {
      expectedRevision: 0, businessName: 'HTTP Field 조직', introduction: 'Field 승인 소개',
      region: '서울', openingHours: '평일', contactPhone: '010-1111-2222',
      defaultBookingMode: 'request', services: [{ id: fieldServiceId, name: 'Field 상담',
        description: '방문 상담', bookingMode: 'request', durationMinutes: 30,
        priceAmount: 50000 }],
    }, fieldOwner.cookie);
    assert.equal(fieldDraft.response.status, 200, JSON.stringify(fieldDraft.value));
    const fieldRelease = await json(`${field}/v1/catalog/releases`, 'POST',
      { expectedRevision: 1 }, fieldOwner.cookie);
    assert.equal(fieldRelease.response.status, 201, JSON.stringify(fieldRelease.value));
    const fieldPolicy = await json(`${field}/v1/booking-policy`, 'PUT', {
      expectedRevision: 0, timezone: 'Asia/Seoul',
      weekly: { mon: { open: '09:00', close: '18:00' } },
      closedDates: [], specialDates: {}, beforeMinutes: 0,
      afterMinutes: 0, minLeadMinutes: 0, horizonDays: 30,
    }, fieldOwner.cookie);
    assert.equal(fieldPolicy.response.status, 200, JSON.stringify(fieldPolicy.value));
    const site = await json(`${field}/v1/sites`, 'POST', undefined, fieldOwner.cookie);
    assert.equal(site.response.status, 201, JSON.stringify(site.value));
    const siteContent = await json(`${field}/v1/sites/draft`, 'PUT', { expectedRevision: 0,
      template: 'essential', palette: '#264653', pages: [{ id: randomUUID(), slug: 'home',
        title: '홈', sections: [{ id: randomUUID(), kind: 'hero', heading: 'HTTP Field 조직', body: '직접 문의와 예약' }] }],
    }, fieldOwner.cookie);
    assert.equal(siteContent.response.status, 200, JSON.stringify(siteContent.value));
    const siteRelease = await json(`${field}/v1/sites/releases`, 'POST', { expectedRevision: 1 }, fieldOwner.cookie);
    assert.equal(siteRelease.response.status, 201, JSON.stringify(siteRelease.value));
    const siteOrigin = `http://${site.value.slug}.localhost:${fieldWebPort}`;
    const apDeployment = await json(`${ap}/v1/deployments`, 'POST',
      { kind: 'owned_embed', origin: siteOrigin }, apOwner.cookie);
    assert.equal(apDeployment.response.status, 201, JSON.stringify(apDeployment.value));
    assert.equal((await json(`${ap}/v1/deployments/${apDeployment.value.id}/verify`, 'POST', undefined,
      apOwner.cookie)).response.status, 409);
    const siteProof = await json(`${field}/v1/sites/verification`, 'POST',
      { proof: apDeployment.value.verificationProof }, fieldOwner.cookie);
    assert.equal(siteProof.response.status, 201, JSON.stringify(siteProof.value));
    const wellKnown = await fetch(`${siteOrigin}/.well-known/ap-site-verification`);
    assert.equal(wellKnown.status, 200);
    assert.equal(await wellKnown.text(), `ap-site-verification=${apDeployment.value.verificationProof}`);
    assert.equal((await fetch(`http://field-000000000000.localhost:${fieldWebPort}/.well-known/ap-site-verification`)).status, 404);
    assert.equal((await json(`${ap}/v1/deployments/${apDeployment.value.id}/verify`, 'POST', undefined,
      apOwner.cookie)).response.status, 200);
    assert.equal((await json(`${ap}/v1/deployments/${apDeployment.value.id}/activate`, 'POST', undefined,
      apOwner.cookie)).response.status, 200);
    const apLink = await json(`${ap}/v1/deployments`, 'POST', { kind: 'link' }, apOwner.cookie);
    assert.equal(apLink.response.status, 201, JSON.stringify(apLink.value));
    assert.equal((await json(`${ap}/v1/deployments/${apLink.value.id}/activate`, 'POST', undefined,
      apOwner.cookie)).response.status, 200);
    if (process.env.FIELD_SAME_PAGE_BROWSER_PYTHON) {
      const unconnected = execFileSync(process.env.FIELD_SAME_PAGE_BROWSER_PYTHON,
        ['tools/spikes/agent-field-same-page-browser.py', apLink.value.publicId, 'unconnected'], {
          cwd: resolve('.'), encoding: 'utf8', timeout: 60000, env: process.env,
        });
      assert.deepEqual(JSON.parse(unconnected.trim()), { mode: 'unconnected', humanInquiry: true });
      const humanOnly = await apPool.query(`select mode, customer_phone from ap.inquiries
        where organization_id = $1 and customer_phone = $2`, [apOrganizationId, '010-3333-0003']);
      assert.deepEqual(humanOnly.rows, [{ mode: 'human', customer_phone: '010-3333-0003' }]);
    }
    const started = await json(`${field}/v1/connections/ap/start`, 'POST',
      { organizationId: fieldOrganizationId }, fieldOwner.cookie);
    assert.equal(started.response.status, 201, JSON.stringify(started.value));
    const authorizationUrl = new URL(started.value.authorizationUrl);
    const selection = await json(`${ap}/integrations/v1/authorization/selections`, 'POST', {
      clientId: process.env.FIELD_AP_CLIENT_ID, organizationId: apOrganizationId,
      agentId: draft.value.agentId, deploymentIds: [apDeployment.value.id, apLink.value.id,
        ...(distributionE2e ? [placementDeploymentId] : [])],
      scopes: ['ap.agent.read', 'ap.conversations.read', 'ap.conversations.reply', 'ap.sources.refresh'],
    }, apOwner.cookie);
    assert.equal(selection.response.status, 201, JSON.stringify(selection.value));
    const authorize = await json(authorizationUrl.toString(), 'GET', undefined, apOwner.cookie, 'manual');
    assert.ok([200, 302].includes(authorize.response.status), JSON.stringify(authorize.value));
    const consentUrl = new URL(authorize.response.status === 302
      ? authorize.response.headers.get('location') : authorize.value.url, ap);
    assert.equal(consentUrl.pathname, '/consent');
    const consent = await json(`${ap}/api/auth/oauth2/consent`, 'POST', {
      accept: true, oauth_query: consentUrl.searchParams.toString(),
    }, apOwner.cookie);
    assert.equal(consent.response.status, 200, JSON.stringify(consent.value));
    const callbackUrl = new URL(consent.value.url);
    assert.equal(callbackUrl.origin, field);
    assert.equal(callbackUrl.searchParams.get('state'), authorizationUrl.searchParams.get('state'));
    const callback = await json(callbackUrl.toString(), 'GET', undefined, undefined, 'manual');
    assert.equal(callback.response.status, 303, JSON.stringify(callback.value));
    const web = new URL(callback.response.headers.get('location'));
    assert.equal(web.searchParams.get('result'), 'pending_field_consent');
    const connections = await json(`${field}/v1/connections/ap`, 'GET', undefined, fieldOwner.cookie);
    assert.equal(connections.response.status, 200);
    assert.equal(connections.value.connections[0].apOrganizationId, apOrganizationId);
    assert.equal(connections.value.connections[0].apAgentId, draft.value.agentId);
    assert.equal(connections.value.connections[0].status, 'pending_field_consent');
    assert.equal(connections.value.connections[0].id, web.searchParams.get('connectionId'));
    assert.equal(connections.value.connections[0].apGrantId, selection.value.id);
    const beforeRefresh = await fieldPool.query(
      'select access_token_cipher from field.ap_connections where id = $1',
      [connections.value.connections[0].id]);
    await fieldPool.query("update field.ap_connections set access_expires_at = now() - interval '1 second' where id = $1",
      [connections.value.connections[0].id]);
    const replay = await json(callbackUrl.toString(), 'GET', undefined, undefined, 'manual');
    assert.equal(replay.response.status, 303);
    assert.equal(replay.response.headers.get('location'), callback.response.headers.get('location'));

    const reverse = await json(`${ap}/v1/connections/field/start`, 'POST', {
      fieldConnectionId: connections.value.connections[0].id,
      apGrantId: connections.value.connections[0].apGrantId,
    }, apOwner.cookie);
    assert.equal(reverse.response.status, 201, JSON.stringify(reverse.value));
    const reverseUrl = new URL(reverse.value.authorizationUrl);
    assert.equal(reverseUrl.origin, field);
    const fieldSelection = await json(`${field}/integrations/v1/authorization/selections`, 'POST', {
      clientId: process.env.AP_FIELD_CLIENT_ID, organizationId: fieldOrganizationId,
      scopes: ['field.facts.read', 'field.availability.read',
        'field.requests.create', 'field.requests.read', 'field.customer_access.create'],
    }, fieldOwner.cookie);
    assert.equal(fieldSelection.response.status, 201, JSON.stringify(fieldSelection.value));
    const fieldAuthorize = await json(reverseUrl.toString(), 'GET', undefined, fieldOwner.cookie, 'manual');
    assert.ok([200, 302].includes(fieldAuthorize.response.status), JSON.stringify(fieldAuthorize.value));
    const fieldConsentUrl = new URL(fieldAuthorize.response.status === 302
      ? fieldAuthorize.response.headers.get('location') : fieldAuthorize.value.url, field);
    assert.equal(fieldConsentUrl.pathname, '/consent');
    const fieldConsent = await json(`${field}/api/auth/oauth2/consent`, 'POST', {
      accept: true, oauth_query: fieldConsentUrl.searchParams.toString(),
    }, fieldOwner.cookie);
    assert.equal(fieldConsent.response.status, 200, JSON.stringify(fieldConsent.value));
    const apCallbackUrl = new URL(fieldConsent.value.url);
    assert.equal(apCallbackUrl.origin, ap);
    const apCallback = await json(apCallbackUrl.toString(), 'GET', undefined, undefined, 'manual');
    assert.equal(apCallback.response.status, 303, JSON.stringify(apCallback.value));
    const apWeb = new URL(apCallback.response.headers.get('location'));
    assert.equal(apWeb.searchParams.get('result'), 'review_required');
    assert.equal(apWeb.searchParams.get('connectionId'), connections.value.connections[0].id);
    const apConnections = await json(`${ap}/v1/connections/field`, 'GET', undefined, apOwner.cookie);
    assert.equal(apConnections.response.status, 200);
    assert.equal(apConnections.value.connections[0].fieldOrganizationId, fieldOrganizationId);
    assert.equal(apConnections.value.connections[0].status, 'review_required');
    const fieldDeploymentList = await json(`${field}/v1/connections/ap/${connections.value.connections[0].id}/deployments`,
      'GET', undefined, fieldOwner.cookie);
    assert.equal(fieldDeploymentList.response.status, 200, JSON.stringify(fieldDeploymentList.value));
    const fieldSiteDeployment = fieldDeploymentList.value.deployments.find(item => item.id === apDeployment.value.id);
    assert.equal(fieldSiteDeployment?.kind, 'owned_embed');
    assert.equal(fieldSiteDeployment.origin, siteOrigin);
    if (distributionE2e)
      assert.equal(fieldDeploymentList.value.deployments.find(item => item.id === placementDeploymentId)?.kind,
        'placement_embed');
    const installation = await json(`${field}/v1/sites/ap-installation`, 'POST',
      { connectionId: connections.value.connections[0].id, deploymentId: apDeployment.value.id,
        mode: 'floating' }, fieldOwner.cookie);
    assert.equal(installation.response.status, 201, JSON.stringify(installation.value));
    const visibleSite = await json(`${field}/v1/public/sites/${site.value.slug}`);
    assert.equal(visibleSite.response.status, 200);
    assert.equal(visibleSite.value.apWidget.publicId, apDeployment.value.publicId);
    if (process.env.FIELD_SAME_PAGE_BROWSER_PYTHON) {
      assert.equal(Boolean(process.env.AP_OPENAI_API_KEY), false,
        'same-page fallback browser test must not call a configured live model');
      const lostAiAck = execFileSync(process.env.FIELD_SAME_PAGE_BROWSER_PYTHON,
        ['tools/spikes/agent-field-same-page-browser.py', apLink.value.publicId, 'ai_post_ack_lost'], {
          cwd: resolve('.'), encoding: 'utf8', timeout: 60000, env: process.env,
        });
      assert.deepEqual(JSON.parse(lostAiAck.trim()),
        { mode: 'ai_post_ack_lost', recoveredAfterReload: true });
      const recovered = execFileSync(process.env.FIELD_SAME_PAGE_BROWSER_PYTHON,
        ['tools/spikes/agent-field-same-page-browser.py', apLink.value.publicId,
          'ai_answer_refresh_lost'], {
          cwd: resolve('.'), encoding: 'utf8', timeout: 60000, env: process.env,
        });
      assert.deepEqual(JSON.parse(recovered.trim()),
        { mode: 'ai_answer_refresh_lost', transcriptRecovered: true });
      for (const mode of ['ai_start_failure', 'ai_rejected', 'ai_network', 'ai_server_error']) {
        const output = execFileSync(process.env.FIELD_SAME_PAGE_BROWSER_PYTHON,
          ['tools/spikes/agent-field-same-page-browser.py', apLink.value.publicId, mode], {
            cwd: resolve('.'), encoding: 'utf8', timeout: 60000, env: process.env,
          });
        assert.deepEqual(JSON.parse(output.trim()), { mode, draftPreserved: true });
      }
      const fullDraft = execFileSync(process.env.FIELD_SAME_PAGE_BROWSER_PYTHON,
        ['tools/spikes/agent-field-same-page-browser.py', apLink.value.publicId, 'ai_draft_full'], {
          cwd: resolve('.'), encoding: 'utf8', timeout: 60000, env: process.env,
        });
      assert.deepEqual(JSON.parse(fullDraft.trim()), { mode: 'ai_draft_full', draftRecovered: true });
      for (const mode of ['field_down', 'no_services', 'rate_limited']) {
        const output = execFileSync(process.env.FIELD_SAME_PAGE_BROWSER_PYTHON,
          ['tools/spikes/agent-field-same-page-browser.py', apLink.value.publicId, mode], {
            cwd: resolve('.'), encoding: 'utf8', timeout: 60000, env: process.env,
          });
        assert.deepEqual(JSON.parse(output.trim()), { mode, precontactOnly: true });
      }
      for (const mode of ['ai_fallback', 'direct', 'concurrent', 'photo', 'external', 'external_photo',
        'external_recover_photo', 'external_lost_photo']) {
        const output = execFileSync(process.env.FIELD_SAME_PAGE_BROWSER_PYTHON,
          ['tools/spikes/agent-field-same-page-browser.py', apLink.value.publicId, mode], {
            cwd: resolve('.'), encoding: 'utf8', timeout: 60000, env: process.env,
          });
        const created = JSON.parse(output.trim());
        assert.equal(created.mode, mode);
        const original = await apPool.query(`select id, deployment_id, mode, consent_at
          from ap.inquiries where id = $1 and organization_id = $2`,
        [created.inquiryId, apOrganizationId]);
        assert.equal(original.rows[0]?.deployment_id, apLink.value.id);
        assert.equal(original.rows[0]?.mode, mode.startsWith('external') ? 'external' : 'human');
        assert.ok(original.rows[0]?.consent_at);
        if (mode === 'external_lost_photo') {
          const onePreparation = await apPool.query(`select count(*)::text as count from ap.inquiries
            where organization_id = $1 and customer_phone = $2 and mode = 'external'`,
          [apOrganizationId, '010-3333-0002']);
          assert.equal(onePreparation.rows[0]?.count, '1');
        }
        if (mode.startsWith('external')) {
          const ownerEvents = await apPool.query(`select count(*)::text as count from ap.outbox
            where aggregate_id = $1 and event_type like 'ap.inquiry.%'`, [created.inquiryId]);
          assert.equal(ownerEvents.rows[0]?.count, '0');
        }
        const external = await fieldPool.query(`select id,kind, action_request_id, origin_conversation_id,
          summary from field.external_work_requests where action_request_id = $1`,
        [created.actionRequestId]);
        assert.equal(external.rows[0]?.kind, 'inquiry');
        assert.equal(external.rows[0]?.origin_conversation_id, created.inquiryId);
        assert.match(external.rows[0]?.summary ?? '', /같은 AP 상담 화면/);
        if (['photo', 'external_photo', 'external_recover_photo', 'external_lost_photo'].includes(mode)) {
          const copied = await fieldPool.query(`select p.id,p.state,p.source_attachment_id
            from field.external_request_attachments p
            join field.external_work_requests w on w.id = p.external_request_id
            where w.action_request_id = $1`, [created.actionRequestId]);
          assert.equal(copied.rows.length, 1);
          assert.equal(copied.rows[0].source_attachment_id, created.attachmentId);
          if (process.env.FIELD_EVENT_WORKERS_RUNNING !== '1') {
            const config = apConnectorFromEnvironment();
            assert.ok(config);
            assert.equal(await copyExternalRequestAttachmentOnce(fieldPool, config,
              createFieldInquiryMediaStore()), 'copied');
          } else {
            const until = Date.now() + 10_000;
            while (Date.now() < until) {
              const state = await fieldPool.query(`select state from field.external_request_attachments
                where id = $1`, [copied.rows[0].id]);
              if (state.rows[0]?.state === 'copied') break;
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          const copyState = await fieldPool.query(`select state,error_code,attempt_count
            from field.external_request_attachments where id = $1`, [copied.rows[0].id]);
          assert.equal(copyState.rows[0]?.state, 'copied', JSON.stringify(copyState.rows[0]));
          const photoPath = `${field}/v1/owner/external-requests/${external.rows[0].id}`
            + `/attachments/${copied.rows[0].id}`;
          const photo = await fetch(photoPath, { headers: { cookie: fieldOwner.cookie } });
          assert.equal(photo.status, 200, await photo.clone().text());
          assert.equal(photo.headers.get('content-type'), 'image/webp');
          assert.ok((await photo.arrayBuffer()).byteLength > 0);
          const consent = await apPool.query(`select field_request_body from ap.field_action_requests
            where id = $1`, [created.actionRequestId]);
          assert.deepEqual(consent.rows[0]?.field_request_body.attachmentRefs, [created.attachmentId]);
          assert.ok(consent.rows[0]?.field_request_body.consent.items.includes('attachments'));
          if (process.env.FIELD_SAME_PAGE_BROWSER_PYTHON)
            execFileSync(process.env.FIELD_SAME_PAGE_BROWSER_PYTHON,
              ['tools/spikes/field-external-photo-browser.py', external.rows[0].id], {
                cwd: resolve('.'), stdio: 'inherit', timeout: 30000,
                env: { ...process.env, FIELD_TEST_OWNER_EMAIL: fieldOwner.email,
                  FIELD_TEST_OWNER_PASSWORD: fieldOwner.password },
              });
        }
      }
    }
    assert.equal(visibleSite.value.apWidget.mode, 'floating');
    const siteHtml = await fetch(`${siteOrigin}/site/${site.value.slug}`);
    assert.equal(siteHtml.status, 200);
    const frame = await fetch(`${ap}/embed/v1/${apDeployment.value.publicId}/frame`,
      { headers: { referer: `${siteOrigin}/site/${site.value.slug}` } });
    assert.equal(frame.status, 200);
    assert.equal((await fetch(`${ap}/embed/v1/${apDeployment.value.publicId}/frame`,
      { headers: { referer: `http://field-000000000000.localhost:${fieldWebPort}/` } })).status, 403);
    if (process.env.FIELD_BROWSER_PYTHON) execFileSync(process.env.FIELD_BROWSER_PYTHON,
      ['tools/spikes/field-ap-widget-browser.py', siteOrigin, site.value.slug, apDeployment.value.publicId],
      { stdio: 'inherit', timeout: 30000 });
    const capabilities = await json(`${ap}/v1/connections/field/${connections.value.connections[0].id}/capabilities`,
      'GET', undefined, apOwner.cookie);
    assert.equal(capabilities.response.status, 200, JSON.stringify(capabilities.value));
    assert.equal(capabilities.value.organizationId, fieldOrganizationId);
    assert.equal(capabilities.value.schemaVersion, '1.0');
    assert.deepEqual(capabilities.value.capabilities, { 'facts.read': true,
      'availability.read': true, 'request.create': true,
      'customer_access.create': true, 'proposal.respond': false });
    const inquiryId = randomUUID();
    const customerReceipt = randomBytes(32).toString('base64url');
    const { createHash } = await import('node:crypto');
    await apPool.query(`insert into ap.inquiries
      (id,organization_id,knowledge_release_id,knowledge_revision,deployment_id,agent_release_id,
       customer_name,customer_phone,visitor_key_hash,state,mode,automation_paused,consent_at)
      values ($1,$2,$3,1,$4,$5,'HTTP 전달 고객','010-3333-4444',$6,'needs_owner','human',true,now())`,
    [inquiryId, apOrganizationId, knowledgeRelease.value.releaseId,
      apDeployment.value.id, aiRelease.value.releaseId,
      createHash('sha256').update(customerReceipt).digest('hex')]);
    const customerMessage = await customerJson(`${ap}/v1/inquiries/${inquiryId}/messages`,
      customerReceipt, 'POST', { body: '방문 상담을 받고 싶습니다.' }, randomBytes(32).toString('base64url'));
    assert.equal(customerMessage.response.status, 201, JSON.stringify(customerMessage.value));
    const listedFieldServices = await customerJson(`${ap}/v1/inquiries/${inquiryId}/field-services`, customerReceipt);
    assert.equal(listedFieldServices.response.status, 200, JSON.stringify(listedFieldServices.value));
    assert.equal(listedFieldServices.value.connections[0].services[0].id, fieldServiceId);
    const details = { mode: 'preferred', preferredTimeText: '다음 주 월요일 오전', timezone: 'Asia/Seoul' };
    const preview = await customerJson(`${ap}/v1/inquiries/${inquiryId}/field-availability`,
      customerReceipt, 'POST', { connectionId: connections.value.connections[0].id,
        serviceId: fieldServiceId, request: details });
    assert.equal(preview.response.status, 200, JSON.stringify(preview.value));
    assert.equal(preview.value.service.priceAmount, 50000);
    const externalBody = { connectionId: connections.value.connections[0].id,
      serviceId: fieldServiceId, kind: 'reservation_request', request: details,
      summary: '실제 HTTP로 전달하는 예약 요청', expectedServiceRevision: preview.value.catalogRevision,
      expectedPolicyRevision: preview.value.policyRevision,
      conditionsHash: preview.value.conditionsHash, consent: true };
    const submittedField = await customerJson(`${ap}/v1/inquiries/${inquiryId}/field-actions`,
      customerReceipt, 'POST', externalBody, randomBytes(32).toString('base64url'));
    assert.equal(submittedField.response.status, 201, JSON.stringify(submittedField.value));
    assert.equal(submittedField.value.state, 'accepted_external');
    const externalRecord = await fieldPool.query(
      `select e.id,e.reservation_id,r.state,r.source from field.external_work_requests e
       join field.reservations r on r.id = e.reservation_id where e.action_request_id = $1`,
      [submittedField.value.actionRequestId]);
    assert.equal(externalRecord.rows[0]?.id, submittedField.value.externalRequestId);
    assert.equal(externalRecord.rows[0]?.source, 'external_ap');
    assert.equal(externalRecord.rows[0]?.state, 'requested');
    const handoff = await customerJson(`${ap}/v1/inquiries/${inquiryId}/field-actions/${submittedField.value.actionRequestId}/handoff`,
      customerReceipt, 'POST');
    assert.equal(handoff.response.status, 201, JSON.stringify(handoff.value));
    assert.equal(handoff.value.reservationId, submittedField.value.reservationId);
    assert.equal(new URL(handoff.value.handoffUrl).pathname, '/handoff');
    const fieldExchange = await json(`${field}/v1/customer-handoffs/exchange`, 'POST',
      { code: handoff.value.code });
    assert.equal(fieldExchange.response.status, 200, JSON.stringify(fieldExchange.value));
    assert.equal(fieldExchange.value.reservationId, submittedField.value.reservationId);
    const fieldReservation = await fetch(`${field}/v1/reservations/${fieldExchange.value.reservationId}`, {
      headers: { authorization: `Bearer ${fieldExchange.value.receiptKey}` } });
    assert.equal(fieldReservation.status, 200);
    assert.equal((await fieldReservation.json()).source, 'external_ap');
    assert.equal((await json(`${field}/v1/customer-handoffs/exchange`, 'POST',
      { code: handoff.value.code })).response.status, 409);
    const syncUrl = `${ap}/v1/inquiries/${inquiryId}/field-actions/${submittedField.value.actionRequestId}/sync-events`;
    const eventConnector = apConnectorFromEnvironment();
    assert.ok(eventConnector);
    if (process.env.FIELD_EVENT_WORKERS_RUNNING === '1') {
      await awaitAutomaticEvent(submittedField.value.actionRequestId, submittedField.value.reservationId, 0);
    } else {
      assert.ok(await reconcileApEventDeliveries(fieldPool) >= 1);
      assert.equal(await deliverApEventOnce(fieldPool, eventConnector), 'acked');
      assert.equal(await processFieldEventInboxOnce(apPool), 'processed');
    }
    const initialEvents = await customerJson(syncUrl, customerReceipt, 'POST');
    assert.equal(initialEvents.response.status, 200, JSON.stringify(initialEvents.value));
    assert.equal(initialEvents.value.revision, 0);
    const nextMonday = new Date(Date.now() + 2 * 86_400_000);
    while (nextMonday.getUTCDay() !== 1) nextMonday.setUTCDate(nextMonday.getUTCDate() + 1);
    const startAt = `${nextMonday.toISOString().slice(0, 10)}T00:00:00.000Z`;
    const confirmed = await json(`${field}/v1/owner/reservations/${submittedField.value.reservationId}/confirm`,
      'POST', { expectedRevision: 0, expectedCatalogRevision: 1, startAt }, fieldOwner.cookie);
    assert.equal(confirmed.response.status, 201, JSON.stringify(confirmed.value));
    assert.equal(confirmed.value.delivery, 'handled_by_ap');
    if (process.env.FIELD_EVENT_WORKERS_RUNNING === '1') {
      await awaitAutomaticEvent(submittedField.value.actionRequestId, submittedField.value.reservationId, 1);
    } else {
      assert.ok(await reconcileApEventDeliveries(fieldPool) >= 1);
      assert.equal(await deliverApEventOnce(fieldPool, eventConnector), 'acked');
      assert.equal(await processFieldEventInboxOnce(apPool), 'processed');
    }
    const synchronized = await customerJson(syncUrl, customerReceipt, 'POST');
    assert.equal(synchronized.response.status, 200, JSON.stringify(synchronized.value));
    assert.equal(synchronized.value.state, 'confirmed');
    assert.equal(synchronized.value.events[1].notificationState, 'blocked_integration');
    const repeatedSync = await customerJson(syncUrl, customerReceipt, 'POST');
    assert.equal(repeatedSync.response.status, 200, JSON.stringify(repeatedSync.value));
    const ownerDelivery = await json(`${field}/v1/owner/reservations/${submittedField.value.reservationId}/event-deliveries`,
      'GET', undefined, fieldOwner.cookie);
    assert.equal(ownerDelivery.response.status, 200, JSON.stringify(ownerDelivery.value));
    assert.equal(ownerDelivery.value.reservationId, submittedField.value.reservationId);
    assert.deepEqual(ownerDelivery.value.events.map(event => event.revision), [0, 1]);
    assert.deepEqual(ownerDelivery.value.events.map(event => event.deliveryState), ['acked', 'acked']);
    assert.deepEqual(ownerDelivery.value.events.map(event => event.apState), ['processed', 'processed']);
    assert.deepEqual(ownerDelivery.value.events.map(event => event.customerNotificationState),
      ['not_applicable', 'blocked_integration']);
    assert.deepEqual(ownerDelivery.value.events.map(event => event.customerReadState),
      ['not_recorded', 'not_recorded']);
    if (process.env.FIELD_BROWSER_PYTHON) execFileSync(process.env.FIELD_BROWSER_PYTHON,
      ['tools/spikes/field-event-delivery-browser.py'], {
        stdio: 'inherit', timeout: 30000,
        env: { ...process.env, FIELD_TEST_OWNER_EMAIL: fieldOwner.email,
          FIELD_TEST_OWNER_PASSWORD: fieldOwner.password },
      });
    const apCustomerNotices = await apPool.query(
      `select count(*)::text as count from ap.notification_events n
       join ap.field_reservation_events e on e.id = n.field_reservation_event_id
       where e.action_request_id = $1 and n.audience = 'customer'`,
      [submittedField.value.actionRequestId]);
    assert.equal(apCustomerNotices.rows[0]?.count, '1');
    const fieldCustomerNotices = await fieldPool.query(
      `select count(*)::text as count from field.notification_events
       where target_id = $1 and audience = 'customer'`, [submittedField.value.reservationId]);
    assert.equal(fieldCustomerNotices.rows[0]?.count, '0');
    if (distributionE2e) {
      assert.equal(process.env.FIELD_EVENT_WORKERS_RUNNING, '1',
        'distribution E2E requires the running signed Field/AP event workers');
      const actionIds = [];
      for (let index = 0; index < 5; index++) {
        const frameResponse = await fetch(`${ap}/embed/v1/${placementPublicId}/frame`,
          { headers: { referer: `${publisherOrigin}/article` } });
        assert.equal(frameResponse.status, 200);
        const nonce = (await frameResponse.text()).match(/const handshakeNonce = "([^"]+)";/)?.[1];
        assert.ok(nonce);
        const session = await json(`${ap}/v1/embed/sessions`, 'POST', { nonce });
        assert.equal(session.response.status, 201, JSON.stringify(session.value));
        const handoffResponse = await fetch(`${ap}/v1/embed/handoffs`, { method: 'POST', headers: {
          authorization: `Bearer ${session.value.token}`, 'content-type': 'application/json',
        }, body: JSON.stringify({ question: `Field 예약 전환 검수 ${index + 1}`,
          conditions: '방문 상담 희망' }) });
        assert.equal(handoffResponse.status, 201, await handoffResponse.clone().text());
        const ticket = (await handoffResponse.json()).ticket;
        const continued = await fetch(`${ap}/v1/embed/continue`, { method: 'POST', headers: {
          origin: 'http://localhost:3001', 'content-type': 'application/json',
        }, body: JSON.stringify({ ticket }) });
        assert.equal(continued.status, 200, await continued.clone().text());
        const cookies = continued.headers.getSetCookie();
        const contextCookie = cookies.find(value => value.startsWith('ap_embed_context='))?.split(';')[0];
        const consultCookie = cookies.find(value => value.startsWith('ap_consult_session='))?.split(';')[0];
        assert.ok(contextCookie && consultCookie);
        const context = await json(`${ap}/v1/embed/context`, 'GET', undefined, contextCookie);
        assert.equal(context.response.status, 200, JSON.stringify(context.value));
        assert.equal(context.value.placementId, placementId);
        const conversationId = context.value.conversationId;
        const submission = await fetch(`${ap}/v1/conversations/${conversationId}/submissions`, {
          method: 'POST', headers: { cookie: consultCookie, origin: 'http://localhost:3001',
            'content-type': 'application/json' },
          body: JSON.stringify({ name: `배포 예약 고객 ${index + 1}`,
            phone: `010-7777-${String(index + 1).padStart(4, '0')}`, consent: true,
            serviceName: '상담', message: 'Field 방문 예약을 요청합니다.' }),
        });
        assert.equal(submission.status, 201, await submission.clone().text());
        const receiptKey = (await submission.json()).receiptKey;
        assert.ok(receiptKey);
        const attributed = await apPool.query(`select placement_id,distribution_traffic_class
          from ap.inquiries where id = $1`, [conversationId]);
        assert.equal(attributed.rows[0]?.placement_id, placementId);
        assert.equal(attributed.rows[0]?.distribution_traffic_class, 'live');
        const availability = await customerJson(`${ap}/v1/inquiries/${conversationId}/field-availability`,
          receiptKey, 'POST', { connectionId: connections.value.connections[0].id,
            serviceId: fieldServiceId, request: details });
        assert.equal(availability.response.status, 200, JSON.stringify(availability.value));
        const forwarded = await customerJson(`${ap}/v1/inquiries/${conversationId}/field-actions`,
          receiptKey, 'POST', { connectionId: connections.value.connections[0].id,
            serviceId: fieldServiceId, kind: 'reservation_request', request: details,
            summary: '매체 유입 예약 요청',
            expectedServiceRevision: availability.value.catalogRevision,
            expectedPolicyRevision: availability.value.policyRevision,
            conditionsHash: availability.value.conditionsHash, consent: true },
          randomBytes(32).toString('base64url'));
        assert.equal(forwarded.response.status, 201, JSON.stringify(forwarded.value));
        assert.equal(forwarded.value.state, 'accepted_external');
        await awaitAutomaticEvent(forwarded.value.actionRequestId, forwarded.value.reservationId, 0);
        const appointment = new Date(nextMonday);
        appointment.setUTCHours(1 + index, 0, 0, 0);
        const confirmedBooking = await json(`${field}/v1/owner/reservations/${forwarded.value.reservationId}/confirm`,
          'POST', { expectedRevision: 0, expectedCatalogRevision: 1,
            startAt: appointment.toISOString() }, fieldOwner.cookie);
        assert.equal(confirmedBooking.response.status, 201, JSON.stringify(confirmedBooking.value));
        assert.equal(confirmedBooking.value.delivery, 'handled_by_ap');
        await awaitAutomaticEvent(forwarded.value.actionRequestId, forwarded.value.reservationId, 1);
        actionIds.push(forwarded.value.actionRequestId);
      }
      const mirrored = await apPool.query(`select action_request_id,field_event_id
        from ap.field_reservation_events where action_request_id = any($1::uuid[])
          and event_type = 'field.reservation.confirmed' and state = 'confirmed'`, [actionIds]);
      assert.equal(mirrored.rows.length, 5);
      const currentMonday = new Date();
      currentMonday.setUTCHours(0, 0, 0, 0);
      currentMonday.setUTCDate(currentMonday.getUTCDate() - ((currentMonday.getUTCDay() + 6) % 7));
      const priorThursday = new Date(currentMonday.getTime() - 4 * 86400000);
      const priorMonday = new Date(currentMonday.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      await apPool.query(`update ap.field_reservation_events set occurred_at = $2
        where action_request_id = any($1::uuid[]) and event_type = 'field.reservation.confirmed'`,
      [actionIds, priorThursday.toISOString()]);
      const businessMetrics = await json(`${ap}/v1/distribution/metrics`, 'GET', undefined, apOwner.cookie);
      const mediaMetrics = await json(`${ap}/v1/publishers/${publisherId}/metrics`,
        'GET', undefined, mediaOwner.cookie);
      assert.equal(businessMetrics.response.status, 200, JSON.stringify(businessMetrics.value));
      assert.equal(mediaMetrics.response.status, 200, JSON.stringify(mediaMetrics.value));
      for (const result of [businessMetrics.value, mediaMetrics.value]) {
        assert.equal(result.bookingConfirmed, 'available');
        assert.equal(result.revenue, 'not_measured');
        assert.equal(result.periods.find(period => period.weekStart === priorMonday)?.bookings, '5-9');
      }
      assert.equal((await json(`${ap}/v1/publishers/${publisherId}/metrics`,
        'GET', undefined, apOwner.cookie)).response.status, 404);
      const exportResponse = await fetch(`${ap}/v1/publishers/${publisherId}/metrics.csv`,
        { headers: { cookie: mediaOwner.cookie } });
      assert.equal(exportResponse.status, 200);
      const csv = await exportResponse.text();
      assert.match(csv, new RegExp(`${priorMonday},[0-9-]+,[^,]+,[^,]+,5-9,not_measured`));
      assert.doesNotMatch(JSON.stringify(mediaMetrics.value) + csv,
        /010-|배포 예약 고객|Field 방문 예약|reservationId|inquiryId|placementId|fieldEventId/);
      if (process.env.FIELD_DISTRIBUTION_BROWSER_PYTHON)
        execFileSync(process.env.FIELD_DISTRIBUTION_BROWSER_PYTHON,
          ['tools/spikes/distribution-metrics-browser.py', priorMonday], {
            cwd: resolve('.'), stdio: 'inherit', timeout: 30000,
            env: { ...process.env, FIELD_TEST_PUBLISHER_EMAIL: mediaOwner.email,
              FIELD_TEST_PUBLISHER_PASSWORD: mediaOwner.password },
          });
    }
    const inquiryRequest = { mode: 'inquiry', timezone: 'Asia/Seoul' };
    const inquiryPreview = await customerJson(`${ap}/v1/inquiries/${inquiryId}/field-availability`,
      customerReceipt, 'POST', { connectionId: connections.value.connections[0].id,
        serviceId: fieldServiceId, request: inquiryRequest });
    assert.equal(inquiryPreview.response.status, 200, JSON.stringify(inquiryPreview.value));
    const submittedInquiry = await customerJson(`${ap}/v1/inquiries/${inquiryId}/field-actions`,
      customerReceipt, 'POST', { connectionId: connections.value.connections[0].id,
        serviceId: fieldServiceId, kind: 'inquiry', request: inquiryRequest,
        summary: '실제 HTTP로 전달하는 서비스 문의',
        expectedServiceRevision: inquiryPreview.value.catalogRevision,
        expectedPolicyRevision: inquiryPreview.value.policyRevision,
        conditionsHash: inquiryPreview.value.conditionsHash, consent: true },
      randomBytes(32).toString('base64url'));
    assert.equal(submittedInquiry.response.status, 201, JSON.stringify(submittedInquiry.value));
    assert.equal(submittedInquiry.value.state, 'accepted_external');
    const fieldOwnerInquiries = await fetch(`${field}/v1/owner/external-requests`, { headers: {
      cookie: fieldOwner.cookie, 'x-organization-id': fieldOrganizationId } });
    assert.equal(fieldOwnerInquiries.status, 200);
    const ownerInquiries = (await fieldOwnerInquiries.json()).inquiries;
    assert.ok(ownerInquiries.some(item => item.id === submittedInquiry.value.externalRequestId
      && item.summary === '실제 HTTP로 전달하는 서비스 문의'));
    const delegatedUrl = `${field}/v1/owner/external-requests/${submittedInquiry.value.externalRequestId}`;
    const delegatedHeaders = { cookie: fieldOwner.cookie, 'x-organization-id': fieldOrganizationId };
    const apConversation = await fetch(`${delegatedUrl}/conversation`, { headers: delegatedHeaders });
    assert.equal(apConversation.status, 200, await apConversation.clone().text());
    const delegated = await apConversation.json();
    assert.equal(delegated.conversation.id, inquiryId);
    assert.ok(delegated.messages.some(message => message.actor === 'customer'));
    const replyKey = randomBytes(32).toString('base64url');
    const delegatedReply = await fetch(`${delegatedUrl}/replies`, { method: 'POST', headers: {
      ...delegatedHeaders, 'content-type': 'application/json', 'idempotency-key': replyKey,
    }, body: JSON.stringify({ body: 'Field에서 AP 원본으로 답변했습니다.',
      expectedRevision: delegated.conversation.revision }) });
    assert.equal(delegatedReply.status, 201, await delegatedReply.clone().text());
    const savedReply = await delegatedReply.json();
    assert.equal(savedReply.delivery, 'blocked_integration');
    const replayReply = await fetch(`${delegatedUrl}/replies`, { method: 'POST', headers: {
      ...delegatedHeaders, 'content-type': 'application/json', 'idempotency-key': replyKey,
    }, body: JSON.stringify({ body: 'Field에서 AP 원본으로 답변했습니다.',
      expectedRevision: delegated.conversation.revision }) });
    assert.equal(replayReply.status, 200, await replayReply.clone().text());
    assert.equal((await replayReply.json()).messageId, savedReply.messageId);
    const apMessage = await apPool.query(
      `select id,actor,body from ap.inquiry_messages where id = $1 and inquiry_id = $2`,
      [savedReply.messageId, inquiryId]);
    assert.equal(apMessage.rows[0]?.actor, 'owner');
    assert.equal(apMessage.rows[0]?.body, 'Field에서 AP 원본으로 답변했습니다.');
    const replyNotifications = await apPool.query(
      `select count(*)::integer as count from ap.notification_events n
       join ap.outbox o on o.id = n.outbox_id
       where n.inquiry_id = $1 and n.source_message_id = $2
         and o.event_type = 'ap.inquiry.owner_reply'`, [inquiryId, savedReply.messageId]);
    assert.equal(replyNotifications.rows[0]?.count, 1);
    const delegatedAfter = await fetch(`${delegatedUrl}/conversation`, { headers: delegatedHeaders });
    assert.equal(delegatedAfter.status, 200);
    assert.ok((await delegatedAfter.json()).messages.some(message => message.id === savedReply.messageId));
    if (process.env.FIELD_BROWSER_PYTHON) execFileSync(process.env.FIELD_BROWSER_PYTHON,
      ['tools/spikes/field-action-browser.py', inquiryId], {
        stdio: 'inherit', timeout: 60000,
        env: { ...process.env, FIELD_ACTION_TEST_RECEIPT: customerReceipt },
      });
    if (process.env.FIELD_BROWSER_PYTHON) {
      const browserReply = stage => execFileSync(process.env.FIELD_BROWSER_PYTHON,
        ['tools/spikes/field-external-inquiry-browser.py'], {
          stdio: 'inherit', timeout: 30000,
          env: { ...process.env, FIELD_TEST_OWNER_EMAIL: fieldOwner.email,
            FIELD_TEST_OWNER_PASSWORD: fieldOwner.password, FIELD_AP_REPLY_BROWSER_STAGE: stage },
        });
      const connectionId = connections.value.connections[0].id;
      await fieldPool.query(`update field.ap_connections
        set scopes = array_remove(scopes,'ap.conversations.reply') where id = $1`, [connectionId]);
      try { browserReply('denied'); }
      finally {
        await fieldPool.query(`update field.ap_connections
          set scopes = array_append(scopes,'ap.conversations.reply') where id = $1
          and not scopes @> array['ap.conversations.reply']::text[]`, [connectionId]);
      }
      browserReply('retry');
    }
    const apStoredBefore = await apPool.query('select refresh_token_cipher from ap.field_connections where id = $1',
      [connections.value.connections[0].id]);
    await apPool.query("update ap.field_connections set access_expires_at = now() - interval '1 second' where id = $1",
      [connections.value.connections[0].id]);
    const facts = await json(`${ap}/v1/connections/field/${connections.value.connections[0].id}/facts`,
      'GET', undefined, apOwner.cookie);
    assert.equal(facts.response.status, 200, JSON.stringify(facts.value));
    assert.equal(facts.value.state, 'pending_review');
    assert.equal(facts.value.facts.organizationId, fieldOrganizationId);
    assert.equal(facts.value.facts.businessName, 'HTTP Field 조직');
    assert.equal(facts.value.facts.services[0].name, 'Field 상담');
    assert.doesNotMatch(JSON.stringify(facts.value), /contactPhone/);
    const synced = await json(`${ap}/v1/connections/field/${connections.value.connections[0].id}/sync`,
      'POST', undefined, apOwner.cookie);
    assert.equal(synced.response.status, 201, JSON.stringify(synced.value));
    assert.equal(synced.value.state, 'pending_review');
    const savedSource = await json(`${ap}/v1/connections/field/${connections.value.connections[0].id}/source`,
      'GET', undefined, apOwner.cookie);
    assert.equal(savedSource.response.status, 200, JSON.stringify(savedSource.value));
    assert.equal(savedSource.value.sourceRevision, 1);
    assert.equal(savedSource.value.facts.businessName, 'HTTP Field 조직');
    assert.equal(savedSource.value.facts.services[0].priceAmount, 50000);
    const refreshPath = `${field}/v1/connections/ap/${connections.value.connections[0].id}/source-refresh`;
    const currentSource = await json(refreshPath, 'GET', undefined, fieldOwner.cookie);
    assert.equal(currentSource.response.status, 200, JSON.stringify(currentSource.value));
    assert.equal(currentSource.value.sourceRevision, 1);
    const refreshKey = randomBytes(32).toString('base64url');
    const requestedSource = await json(refreshPath, 'POST', { expectedSourceRevision: 1 },
      fieldOwner.cookie, 'follow', { 'idempotency-key': refreshKey });
    assert.equal(requestedSource.response.status, 202, JSON.stringify(requestedSource.value));
    const replayedSource = await json(refreshPath, 'POST', { expectedSourceRevision: 1 },
      fieldOwner.cookie, 'follow', { 'idempotency-key': refreshKey });
    assert.equal(replayedSource.response.status, 202, JSON.stringify(replayedSource.value));
    assert.equal(replayedSource.value.operationId, requestedSource.value.operationId);
    let sourceJob;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const checked = await json(`${refreshPath}/${requestedSource.value.operationId}`,
        'GET', undefined, fieldOwner.cookie);
      assert.equal(checked.response.status, 200, JSON.stringify(checked.value));
      sourceJob = checked.value;
      if (sourceJob.state === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(sourceJob?.state, 'completed', JSON.stringify(sourceJob));
    assert.equal(sourceJob.sourceRevision, 1);
    assert.equal((await json(`${ap}/v1/connections/field/${connections.value.connections[0].id}/source`,
      'GET', undefined, apOwner.cookie)).value.state, 'pending_review');
    const sourceApproval = await json(`${ap}/v1/connections/field/${connections.value.connections[0].id}/source/approve`,
      'POST', { expectedSourceRevision: savedSource.value.sourceRevision,
        expectedContentHash: savedSource.value.contentHash }, apOwner.cookie);
    assert.equal(sourceApproval.response.status, 201, JSON.stringify(sourceApproval.value));
    assert.equal(sourceApproval.value.state, 'current');
    assert.equal(sourceApproval.value.knowledgeReleaseReady, false);
    const approvedSource = await json(`${ap}/v1/connections/field/${connections.value.connections[0].id}/source`,
      'GET', undefined, apOwner.cookie);
    assert.equal(approvedSource.value.approvedSourceRevision, 1);
    assert.equal(approvedSource.value.state, 'current');
    assert.equal((await apPool.query('select 1 from ap.knowledge_releases where organization_id = $1',
      [apOrganizationId])).rowCount, 1);
    const published = await json(`${ap}/v1/connections/field/${connections.value.connections[0].id}/source/publish`,
      'POST', { expectedSourceRevision: 1, expectedContentHash: savedSource.value.contentHash,
        includeBusinessIntroduction: true, includedServiceIds: [fieldServiceId] }, apOwner.cookie);
    assert.equal(published.response.status, 201, JSON.stringify(published.value));
    assert.equal(published.value.knowledgeRevision, 2);
    const publishedRelease = await apPool.query(
      'select source_kind, content from ap.knowledge_releases where id = $1', [published.value.releaseId]);
    assert.equal(publishedRelease.rows[0].source_kind, 'connector');
    assert.equal(publishedRelease.rows[0].content.sourceFacts.length, 2);
    assert.doesNotMatch(JSON.stringify(publishedRelease.rows[0].content), /50000|contactPhone|openingHours/);
    const staleAi = await json(`${ap}/v1/agents/test`, 'POST', { question: '상담은?' }, apOwner.cookie);
    assert.equal(staleAi.response.status, 409, JSON.stringify(staleAi.value));
    assert.equal(staleAi.value.error, 'knowledge_stale');
    const reboundAi = await json(`${ap}/v1/agents/releases`, 'POST',
      { expectedRevision: 1, expectedKnowledgeRevision: 2 }, apOwner.cookie);
    assert.equal(reboundAi.response.status, 201, JSON.stringify(reboundAi.value));
    const revisedField = await json(`${field}/v1/business/draft`, 'PUT', {
      expectedRevision: 1, businessName: 'HTTP Field 조직', introduction: 'Field 변경 승인 소개',
      region: '서울', openingHours: '평일', contactPhone: '010-1111-2222',
      defaultBookingMode: 'request', services: [{ id: fieldServiceId, name: 'Field 상담',
        description: '방문 상담', bookingMode: 'request', durationMinutes: 30,
        priceAmount: 50000 }],
    }, fieldOwner.cookie);
    assert.equal(revisedField.response.status, 200, JSON.stringify(revisedField.value));
    const revisedRelease = await json(`${field}/v1/catalog/releases`, 'POST',
      { expectedRevision: 2 }, fieldOwner.cookie);
    assert.equal(revisedRelease.response.status, 201, JSON.stringify(revisedRelease.value));
    let factsDelivery;
    let revisedSource;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (process.env.FIELD_EVENT_WORKERS_RUNNING !== '1') {
        await reconcileFactsChangeDeliveries(fieldPool);
        await deliverFactsChangeOnce(fieldPool, eventConnector);
        await processFieldFactsEventOnce(apPool);
        await processFieldSourceRefreshOnce({ pool: apPool,
          resolveUserId: async () => null, fieldConnector: fieldConnectorFromEnvironment() });
      }
      factsDelivery = (await fieldPool.query(`select d.state from field.facts_change_deliveries d
        where d.connection_id = $1 and d.catalog_release_id = $2`,
      [connections.value.connections[0].id, revisedRelease.value.releaseId])).rows[0];
      revisedSource = (await apPool.query(`select source_revision,approved_source_revision,state
        from ap.knowledge_sources where connection_id = $1`,
      [connections.value.connections[0].id])).rows[0];
      if (factsDelivery?.state === 'acked' && revisedSource?.source_revision === 2) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(factsDelivery?.state, 'acked', JSON.stringify(factsDelivery));
    assert.equal(revisedSource?.source_revision, 2, JSON.stringify(revisedSource));
    assert.equal(revisedSource?.approved_source_revision, 1);
    assert.equal(revisedSource?.state, 'pending_review');
    const apStoredAfter = await apPool.query(
      'select refresh_token_cipher, access_expires_at from ap.field_connections where id = $1',
      [connections.value.connections[0].id]);
    assert.notDeepEqual(apStoredAfter.rows[0].refresh_token_cipher, apStoredBefore.rows[0].refresh_token_cipher);
    assert.ok(apStoredAfter.rows[0].access_expires_at.getTime() > Date.now());
    const fieldConnections = await json(`${field}/v1/connections/ap`, 'GET', undefined, fieldOwner.cookie);
    assert.equal(fieldConnections.value.connections[0].status, 'review_required');
    const afterRefresh = await fieldPool.query(
      'select access_token_cipher, access_expires_at from field.ap_connections where id = $1',
      [connections.value.connections[0].id]);
    assert.notDeepEqual(afterRefresh.rows[0].access_token_cipher, beforeRefresh.rows[0].access_token_cipher);
    assert.ok(afterRefresh.rows[0].access_expires_at.getTime() > Date.now());
    const connectionId = connections.value.connections[0].id;
    const apInitiated = process.env.FIELD_REVOKE_ORIGIN === 'ap';
    if (outageSide === 'ap') {
      assert.equal(apInitiated, false, 'AP outage mode only exercises Field-initiated revoke');
      process.kill(Number(process.env.FIELD_TEST_AP_SERVER_PID), 'SIGTERM');
      apStopped = true;
      await waitForApiAvailability(ap, 'AP', false);
    } else if (outageSide === 'field') {
      assert.equal(apInitiated, true, 'Field outage mode only exercises AP-initiated revoke');
      process.kill(Number(process.env.FIELD_TEST_FIELD_SERVER_PID), 'SIGTERM');
      fieldStopped = true;
      await waitForApiAvailability(field, 'Field', false);
    }
    if (process.env.FIELD_BROWSER_PYTHON) execFileSync(process.env.FIELD_BROWSER_PYTHON,
      [apInitiated ? 'tools/spikes/agent-field-connection-revoke-browser.py'
        : 'tools/spikes/field-connection-revoke-browser.py'], {
        stdio: 'inherit', timeout: 45000,
        env: { ...process.env,
          [apInitiated ? 'AP_TEST_OWNER_EMAIL' : 'FIELD_TEST_OWNER_EMAIL']:
            apInitiated ? apOwner.email : fieldOwner.email,
          [apInitiated ? 'AP_TEST_OWNER_PASSWORD' : 'FIELD_TEST_OWNER_PASSWORD']:
            apInitiated ? apOwner.password : fieldOwner.password,
          FIELD_TEST_CONNECTION_ID: connectionId },
      });
    else if (apInitiated) {
      const revoked = await json(`${ap}/v1/connections/field/${connectionId}/revoke`,
        'POST', {}, apOwner.cookie);
      assert.equal(revoked.response.status, 200, JSON.stringify(revoked.value));
      assert.equal(revoked.value.localStatus, 'revoked');
    } else {
      const revoked = await json(`${field}/v1/connections/ap/${connectionId}/revoke`,
        'POST', {}, fieldOwner.cookie);
      assert.equal(revoked.response.status, 200, JSON.stringify(revoked.value));
      assert.equal(revoked.value.localStatus, 'revoked');
    }
    if (apInitiated) {
      const localRevoke = await apPool.query(`select state from ap.field_remote_revocations
        where connection_id = $1`, [connectionId]);
      assert.ok(localRevoke.rows[0]);
      if (outageSide === 'field') {
        const originalRevocationId = await awaitRevokeRetry(apPool,
          'ap.field_remote_revocations', connectionId, 'AP');
        const localPending = await json(`${ap}/v1/connections/field`, 'GET', undefined, apOwner.cookie);
        assert.equal(localPending.response.status, 200);
        assert.equal(localPending.value.connections.find(item => item.id === connectionId)?.remoteRevokeState,
          'retry');
        assert.equal((await fieldPool.query(`select status from field.ap_connections where id = $1`,
          [connectionId])).rows[0]?.status, 'review_required');
        assert.equal((await json(`${ap}/health/ready`)).response.status, 200);
        assert.equal((await customerJson(`${ap}/v1/inquiries/${inquiryId}`,
          customerReceipt)).response.status, 200);
        await restoreField();
        const afterRestart = await apPool.query(`select id from ap.field_remote_revocations
          where connection_id = $1`, [connectionId]);
        assert.equal(afterRestart.rows[0]?.id, originalRevocationId);
      }
      if (process.env.FIELD_EVENT_WORKERS_RUNNING === '1') await awaitAutomaticApRevoke(connectionId);
      else assert.equal(await deliverFieldConnectionRevokeOnce(apPool,
        fieldConnectorFromEnvironment()), 'acked');
      if (outageSide === 'field' && process.env.FIELD_BROWSER_PYTHON) execFileSync(
        process.env.FIELD_BROWSER_PYTHON,
        ['tools/spikes/agent-field-connection-revoke-status-browser.py'], {
          stdio: 'inherit', timeout: 45000,
          env: { ...process.env, AP_TEST_OWNER_EMAIL: apOwner.email,
            AP_TEST_OWNER_PASSWORD: apOwner.password },
        });
    } else {
      const localRevoke = await fieldPool.query(`select state from field.ap_connection_revocations
        where connection_id = $1`, [connectionId]);
      assert.ok(localRevoke.rows[0]);
      if (outageSide === 'ap') {
        const originalRevocationId = await awaitRevokeRetry(fieldPool,
          'field.ap_connection_revocations', connectionId, 'Field');
        const localPending = await json(`${field}/v1/connections/ap`, 'GET', undefined, fieldOwner.cookie);
        assert.equal(localPending.response.status, 200);
        assert.equal(localPending.value.connections.find(item => item.id === connectionId)?.remoteRevokeState, 'retry');
        assert.equal((await apPool.query(`select status from ap.field_connections where id = $1`,
          [connectionId])).rows[0]?.status, 'review_required');
        assert.equal((await json(`${field}/health/ready`)).response.status, 200);
        assert.equal((await fetch(`${field}/v1/reservations/${fieldExchange.value.reservationId}`, {
          headers: { authorization: `Bearer ${fieldExchange.value.receiptKey}` },
        })).status, 200);
        assert.equal((await fetch(`${siteOrigin}/site/${site.value.slug}`)).status, 200);
        const offlineStatus = await json(`${field}/v1/owner/reservations/${submittedField.value.reservationId}/event-deliveries`,
          'GET', undefined, fieldOwner.cookie);
        assert.equal(offlineStatus.response.status, 200);
        assert.deepEqual(offlineStatus.value.events.map(event => event.deliveryState), ['acked', 'acked']);
        assert.deepEqual(offlineStatus.value.events.map(event => event.apState), ['unavailable', 'unavailable']);
        await restoreAp();
        const afterRestart = await fieldPool.query(`select id from field.ap_connection_revocations
          where connection_id = $1`, [connectionId]);
        assert.equal(afterRestart.rows[0]?.id, originalRevocationId);
      }
      if (process.env.FIELD_EVENT_WORKERS_RUNNING === '1') await awaitAutomaticRevoke(connectionId);
      else assert.equal(await deliverApConnectionRevokeOnce(fieldPool, eventConnector), 'acked');
      if (outageSide === 'ap' && process.env.FIELD_BROWSER_PYTHON) execFileSync(process.env.FIELD_BROWSER_PYTHON,
        ['tools/spikes/field-connection-revoke-status-browser.py'], {
          stdio: 'inherit', timeout: 45000,
          env: { ...process.env, FIELD_TEST_OWNER_EMAIL: fieldOwner.email,
            FIELD_TEST_OWNER_PASSWORD: fieldOwner.password },
        });
    }
    const remote = await apPool.query(`select status from ap.field_connections where id = $1`, [connectionId]);
    assert.equal(remote.rows[0]?.status, 'revoked');
    const sourceAfterRevoke = await apPool.query(`select state from ap.knowledge_sources
      where connection_id = $1`, [connectionId]);
    assert.equal(sourceAfterRevoke.rows[0]?.state, 'revoked');
    const installAfterRevoke = await fieldPool.query(`select status from field.site_ap_installations
      where connection_id = $1`, [connectionId]);
    assert.equal(installAfterRevoke.rows[0]?.status, 'paused');
    const revokedFieldGrant = await fieldPool.query(`select s.revoked_at, t.revoked
      from field.ap_connections c join field.oauth_selections s on s.id::text = c.field_grant_id
      join "oauthAccessToken" t on t."referenceId" = s.id::text
      where c.id = $1 order by t."createdAt" desc limit 1`, [connectionId]);
    assert.ok(revokedFieldGrant.rows[0]?.revoked_at);
    assert.ok(revokedFieldGrant.rows[0]?.revoked);
    const existingReservation = await fetch(`${field}/v1/reservations/${fieldExchange.value.reservationId}`, {
      headers: { authorization: `Bearer ${fieldExchange.value.receiptKey}` },
    });
    assert.equal(existingReservation.status, 200);
    assert.equal((await existingReservation.json()).id, submittedField.value.reservationId);
    assert.equal((await customerJson(`${ap}/v1/inquiries/${inquiryId}`, customerReceipt)).response.status, 200);
    const recoveredEvents = await json(`${field}/v1/owner/reservations/${submittedField.value.reservationId}/event-deliveries`,
      'GET', undefined, fieldOwner.cookie);
    assert.equal(recoveredEvents.response.status, 200, JSON.stringify(recoveredEvents.value));
    assert.deepEqual(recoveredEvents.value.events.map(event => event.deliveryState), ['acked', 'acked']);
    assert.deepEqual(recoveredEvents.value.events.map(event => event.apState), ['processed', 'processed']);
    assert.deepEqual(recoveredEvents.value.events.map(event => event.customerNotificationState),
      ['not_applicable', 'blocked_integration']);
    assert.equal((await json(`${field}/v1/public/sites/${site.value.slug}`)).value.apWidget, null);
    assert.equal((await fetch(`${siteOrigin}/site/${site.value.slug}`)).status, 200);
    const apNoticeBeforeManual = await apPool.query(`select count(*)::integer as count
      from ap.notification_events where inquiry_id = $1`, [inquiryId]);
    if (process.env.FIELD_BROWSER_PYTHON) execFileSync(process.env.FIELD_BROWSER_PYTHON,
      ['tools/spikes/field-manual-contact-browser.py'], {
        stdio: 'inherit', timeout: 40000,
        env: { ...process.env, FIELD_TEST_OWNER_EMAIL: fieldOwner.email,
          FIELD_TEST_OWNER_PASSWORD: fieldOwner.password,
          FIELD_TEST_RESERVATION_ID: submittedField.value.reservationId },
      });
    else {
      const lastEvent = await fieldPool.query(`select id from field.reservation_events
        where reservation_id = $1 order by revision desc limit 1`, [submittedField.value.reservationId]);
      const recorded = await json(`${field}/v1/owner/reservations/${submittedField.value.reservationId}/manual-contacts`,
        'POST', { contactAttemptId: randomUUID(), eventId: lastEvent.rows[0].id,
          method: 'phone', outcome: 'attempted' }, fieldOwner.cookie);
      assert.equal(recorded.response.status, 201, JSON.stringify(recorded.value));
    }
    const contactLedger = await fieldPool.query(`select event_id,method,outcome
      from field.external_reservation_manual_contacts where reservation_id = $1`,
    [submittedField.value.reservationId]);
    assert.equal(contactLedger.rows.length, 1);
    assert.equal(contactLedger.rows[0].method, 'phone');
    assert.equal(contactLedger.rows[0].outcome, 'attempted');
    const fieldCustomerNotice = await fieldPool.query(`select count(*)::integer as count
      from field.notification_events where target_id = $1 and audience = 'customer'`,
    [submittedField.value.reservationId]);
    assert.equal(fieldCustomerNotice.rows[0]?.count, 0);
    const apNoticeAfterManual = await apPool.query(`select count(*)::integer as count
      from ap.notification_events where inquiry_id = $1`, [inquiryId]);
    assert.equal(apNoticeAfterManual.rows[0]?.count, apNoticeBeforeManual.rows[0]?.count);
    const routeUrl = `${field}/v1/reservations/${submittedField.value.reservationId}/notification-route`;
    const customerRouteBefore = await customerJson(routeUrl, fieldExchange.value.receiptKey);
    assert.equal(customerRouteBefore.response.status, 200, JSON.stringify(customerRouteBefore.value));
    assert.equal(customerRouteBefore.value.state, 'awaiting_consent');
    if (routeRestart) {
      const consent = await customerJson(`${routeUrl}/consent`, fieldExchange.value.receiptKey,
        'POST', { consentId: randomUUID(), consent: true });
      assert.equal(consent.response.status, 201, JSON.stringify(consent.value));
      process.kill(Number(process.env.FIELD_TEST_AP_SERVER_PID), 'SIGTERM');
      apStopped = true;
      await waitForApiAvailability(ap, 'AP', false);
      const requestedTransferId = randomUUID();
      const firstAttempt = await json(`${field}/v1/owner/reservations/${submittedField.value.reservationId}`
        + '/notification-route/activate', 'POST', { transferId: requestedTransferId }, fieldOwner.cookie);
      assert.equal(firstAttempt.response.status, 503, JSON.stringify(firstAttempt.value));
      const pendingBeforeRestart = await json(`${field}/v1/owner/reservations/${submittedField.value.reservationId}`
        + '/notification-route', 'GET', undefined, fieldOwner.cookie);
      assert.equal(pendingBeforeRestart.value.pendingTransferId, requestedTransferId);
      process.kill(Number(process.env.FIELD_TEST_FIELD_SERVER_PID), 'SIGTERM');
      fieldStopped = true;
      await waitForApiAvailability(field, 'Field', false);
      await restoreField();
      const pendingAfterRestart = await json(`${field}/v1/owner/reservations/${submittedField.value.reservationId}`
        + '/notification-route', 'GET', undefined, fieldOwner.cookie);
      assert.equal(pendingAfterRestart.value.pendingTransferId, requestedTransferId);
      await restoreAp();
    }
    if (process.env.FIELD_BROWSER_PYTHON) execFileSync(process.env.FIELD_BROWSER_PYTHON,
      ['tools/spikes/field-notification-route-browser.py'], {
        stdio: 'inherit', timeout: 60000,
        env: { ...process.env, FIELD_TEST_OWNER_EMAIL: fieldOwner.email,
          FIELD_TEST_OWNER_PASSWORD: fieldOwner.password,
          FIELD_TEST_RESERVATION_ID: submittedField.value.reservationId,
          FIELD_TEST_RESERVATION_RECEIPT: fieldExchange.value.receiptKey,
          FIELD_ROUTE_CONSENT_READY: routeRestart ? '1' : '0' },
      });
    else {
      if (!routeRestart) {
        const consent = await customerJson(`${routeUrl}/consent`, fieldExchange.value.receiptKey,
          'POST', { consentId: randomUUID(), consent: true });
        assert.equal(consent.response.status, 201, JSON.stringify(consent.value));
      }
      const activated = await json(`${field}/v1/owner/reservations/${submittedField.value.reservationId}`
        + '/notification-route/activate', 'POST', { transferId: randomUUID() }, fieldOwner.cookie);
      assert.equal(activated.response.status, 200, JSON.stringify(activated.value));
    }
    const activeRoute = await customerJson(routeUrl, fieldExchange.value.receiptKey);
    assert.equal(activeRoute.value.state, 'active');
    assert.equal(activeRoute.value.routeGeneration, 2);
    const apClosure = await apPool.query(`select latest_revision,latest_event_id
      from ap.field_notification_route_closures where reservation_id = $1`,
    [submittedField.value.reservationId]);
    assert.equal(apClosure.rows[0]?.latest_revision, 1);
    const fieldRoute = await fieldPool.query(`select ap_closed_revision,ap_closed_event_id
      from field.external_reservation_notification_routes where reservation_id = $1`,
    [submittedField.value.reservationId]);
    assert.equal(fieldRoute.rows[0]?.ap_closed_revision, 1);
    assert.equal(fieldRoute.rows[0]?.ap_closed_event_id, apClosure.rows[0]?.latest_event_id);
    const canceledAfterTransfer = await json(
      `${field}/v1/owner/reservations/${submittedField.value.reservationId}/cancel`,
      'POST', { expectedRevision: 1, reason: '연결 해제 뒤 일정 취소' }, fieldOwner.cookie);
    assert.equal(canceledAfterTransfer.response.status, 200, JSON.stringify(canceledAfterTransfer.value));
    assert.equal(canceledAfterTransfer.value.delivery, 'pending');
    const routedEvent = await fieldPool.query(`select e.notification_owner_product,e.route_generation,
      d.event_id as ap_delivery_id,n.state as notification_state
      from field.reservation_events e
      left join field.ap_event_deliveries d on d.event_id = e.id
      left join field.outbox o on o.aggregate_id = e.reservation_id::text
        and o.event_type = e.event_type and o.payload ->> 'revision' = e.revision::text
      left join field.notification_events n on n.outbox_id = o.id and n.audience = 'customer'
      where e.reservation_id = $1 and e.revision = 2`, [submittedField.value.reservationId]);
    assert.equal(routedEvent.rows[0]?.notification_owner_product, 'field');
    assert.equal(routedEvent.rows[0]?.route_generation, 2);
    assert.equal(routedEvent.rows[0]?.notification_state, 'blocked_integration');
    assert.equal(await reconcileApEventDeliveries(fieldPool), 0);
    assert.equal(routedEvent.rows[0]?.ap_delivery_id, null);
    assert.equal((await apPool.query(`select count(*)::integer as count from ap.field_reservation_events
      where action_request_id = $1`, [submittedField.value.actionRequestId])).rows[0]?.count, 2);
  } finally {
    try {
      if (apStopped && !apRestored) await restoreAp();
      if (fieldStopped && !fieldRestored) await restoreField();
    }
    finally {
      if (fieldOrganizationId) await fieldPool.query('delete from field.sites where organization_id = $1', [fieldOrganizationId]);
      if (fieldOrganizationId) await fieldPool.query('delete from field.organizations where id = $1', [fieldOrganizationId]);
      if (apOrganizationId) await apPool.query(`delete from ap.field_notification_route_closures
        where connection_id in (select id from ap.field_connections where ap_organization_id = $1)`,
      [apOrganizationId]);
      if (apOrganizationId) await apPool.query('delete from ap.organizations where id = $1', [apOrganizationId]);
      if (publisherId) await apPool.query('delete from ap.publishers where id = $1', [publisherId]);
      await fieldPool.query('delete from "user" where email = $1', [fieldOwner.email]);
      await apPool.query('delete from "user" where email = $1', [apOwner.email]);
      if (mediaOwner) await apPool.query('delete from "user" where email = $1', [mediaOwner.email]);
      await Promise.all([apPool.end(), fieldPool.end()]);
    }
  }
});
