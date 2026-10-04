import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { createContractVerifier, assertSourceRoutes, assertCoverage, successResponseKeys, observeContractResponses, sourceRoutes } from './integrator-contract.mjs';

const document = JSON.parse(readFileSync(new URL('../../contracts/agent-integrator-v1.openapi.json', import.meta.url), 'utf8'));

test('QA158 AP success schemas reject forged boolean receipts and malformed nullable timestamps', () => {
  const verifier = createContractVerifier('agent');
  assert.throws(() => verifier.assertResponse('/integrations/v1/field-events', 'post', 202,
    { received: 'true' }), /boolean/);
  assert.throws(() => verifier.assertResponse('/integrations/v1/field-events', 'post', 202,
    { received: true, customerPhone: '010-0000-0000' }), /additional properties/);
  const source = { connectionId: '00000000-0000-4000-8000-000000000001', sourceRevision: 1,
    approvedSourceRevision: null, state: 'pending_review', syncedAt: 'invalid-date' };
  assert.throws(() => verifier.assertResponse('/integrations/v1/connections/{id}/source', 'get', 200,
    source), /date-time/);
  verifier.assertResponse('/integrations/v1/connections/{id}/source', 'get', 200,
    { ...source, syncedAt: null });
});

test('QA158 AP route methods and paths match actual source registrations', () => {
  assertSourceRoutes('agent');
});

test('QA158 the response observer preserves actual Fastify 404s', async () => {
  const require = createRequire(new URL('../../apps/agent-api/package.json', import.meta.url));
  const app = require('fastify')();
  for (const route of sourceRoutes('agent')) app.route({ url: route.path, method: route.method,
    handler: (_request, reply) => reply.code(501).send({ error: 'test_handler_unused' }) });
  observeContractResponses(app, 'agent');
  try {
    for (const url of ['/not-a-route', '/integrations/v1/unknown', '/integrations/v1/me']) {
      const response = await app.inject({ method: 'POST', url });
      assert.equal(response.statusCode, 404, response.body);
    }
  } finally { await app.close(); }
});

test('QA158 object and all-method route registrations cannot add undocumented public operations', () => {
  for (const source of [
    `app.route({ method: 'POST', url: '/integrations/v1/me', handler });`,
    `app.route({ method: ['POST', 'PATCH'], url: '/integrations/v1/me', handler });`,
    `app.all('/integrations/v1/me', handler);`,
  ]) assert.throws(() => assertSourceRoutes('agent', undefined, [source]), /registered public route declarations|duplicate public route/);
});

test('QA149/QA158 the current notification closure receipt permits its required closedAt field', () => {
  const uuid = '00000000-0000-4000-8000-000000000001';
  const receipt = { transferId: uuid, connectionId: uuid, actionRequestId: uuid, reservationId: uuid,
    latestRevision: 1, latestEventId: uuid, routeGeneration: 2, closedAt: '2026-10-04T00:00:00.000Z' };
  const verifier = createContractVerifier('agent');
  verifier.assertResponse('/integrations/v1/notification-routes/close', 'post', 200, receipt);
  assert.throws(() => verifier.assertResponse('/integrations/v1/notification-routes/close', 'post', 200,
    { ...receipt, customerPhone: '010-0000-0000' }), /additional properties/);
});

test('QA158 coverage gate fails when an accepted source-refresh response was never verified', () => {
  const expected = successResponseKeys('agent');
  const missing = expected.filter(key => !key.includes('POST /integrations/v1/connections/{id}/source-refreshes 202'));
  assert.throws(() => assertCoverage([{ verified: missing }], ['agent']), /source-refreshes 202/);
  assert.throws(() => assertCoverage([{ verified: expected, failures: ['invalid response'] }], ['agent']), /actual OpenAPI response mismatches/);
  assert.equal(assertCoverage([{ verified: expected }], ['agent']), expected.length);
});

test('QA158 synthetic schema assertions cannot satisfy actual HTTP response coverage', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'fieldai-synthetic-contract-'));
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { createContractVerifier } from ${JSON.stringify(new URL('./integrator-contract.mjs', import.meta.url).href)};
      createContractVerifier('agent').assertResponse('/integrations/v1/field-events', 'post', 202, { received: true });
    `], { encoding: 'utf8', env: { ...process.env, INTEGRATOR_CONTRACT_COVERAGE_DIRECTORY: directory } });
    assert.equal(result.status, 0, result.stderr);
    const receipts = readdirSync(directory).map(file => JSON.parse(readFileSync(resolve(directory, file), 'utf8')));
    assert.deepEqual(receipts, [{ verified: [], failures: [] }]);
  } finally { rmSync(directory, { recursive: true }); }
});

test('AP public integrator preview contract has resolvable schemas and explicit scopes', () => {
  assert.equal(document.openapi, '3.1.0');
  assert.match(document.info.version, /^1\./);
  const declaredScopes = document.components.securitySchemes.apOAuth.flows.authorizationCode.scopes;
  assert.deepEqual(Object.keys(declaredScopes).sort(),
    ['ap.agent.read', 'ap.connections.create', 'ap.conversations.read', 'ap.conversations.reply', 'ap.deployments.manage', 'ap.sources.refresh']);
  const paths = document.paths;
  assert.deepEqual(document.components.schemas.Deployment.properties.kind.enum,
    ['link', 'owned_embed', 'placement_embed']);
  assert.deepEqual(Object.keys(paths).sort(), [
    '/integrations/v1/action-requests/{actionId}/attachments/{attachmentId}',
    '/integrations/v1/agent', '/integrations/v1/connections', '/integrations/v1/connections/{id}',
    '/integrations/v1/connections/{id}/revoke',
    '/integrations/v1/connections/{id}/source',
    '/integrations/v1/connections/{id}/source-refreshes',
    '/integrations/v1/connections/{id}/source-refreshes/{operationId}',
    '/integrations/v1/conversations',
    '/integrations/v1/conversations/{id}', '/integrations/v1/conversations/{id}/messages',
    '/integrations/v1/conversations/{id}/replies', '/integrations/v1/deployments',
    '/integrations/v1/deployments/{id}', '/integrations/v1/deployments/{id}/activate',
    '/integrations/v1/deployments/{id}/pause', '/integrations/v1/deployments/{id}/verify',
    '/integrations/v1/events/{id}/delivery', '/integrations/v1/events/{id}/recovery-status',
    '/integrations/v1/field-events', '/integrations/v1/me',
    '/integrations/v1/notification-routes/close',
  ]);
  const operations = Object.values(paths).flatMap(path => Object.values(path));
  const ids = operations.map(operation => operation.operationId);
  assert.equal(new Set(ids).size, ids.length);
  for (const operation of operations) {
    assert.ok(operation.operationId);
    assert.ok(operation.security?.length === 1);
    if (operation.operationId === 'receiveSignedFieldEvent'
      || operation.operationId === 'receiveSignedFieldConnectionRevoke'
      || operation.operationId === 'getSignedFieldEventRecoveryStatus'
      || operation.operationId === 'closeSignedFieldReservationNotificationRoute') {
      const scheme = operation.operationId === 'receiveSignedFieldEvent' ? 'fieldEventHmac'
        : operation.operationId === 'receiveSignedFieldConnectionRevoke'
          ? 'fieldRevokeHmac' : operation.operationId === 'getSignedFieldEventRecoveryStatus'
            ? 'fieldRecoveryHmac' : 'fieldRouteCloseHmac';
      assert.deepEqual(operation.security, [{ [scheme]: [] }]);
      if (operation.operationId === 'receiveSignedFieldEvent') {
        assert.ok(operation.responses['202']);
        assert.ok(operation.requestBody.content['application/vnd.field-event+json']);
      } else assert.ok(operation.responses['200']);
    } else {
      for (const scope of operation.security[0].apOAuth) assert.ok(declaredScopes[scope], scope);
      assert.ok(operation.responses['200'] || operation.responses['201'] || operation.responses['202']);
    }
    assert.ok(operation.responses['401']);
  }
  assert.deepEqual(paths['/integrations/v1/conversations/{id}/replies'].post.security,
    [{ apOAuth: ['ap.conversations.reply'] }]);
  const actionAttachment = paths['/integrations/v1/action-requests/{actionId}/attachments/{attachmentId}'].get;
  assert.deepEqual(actionAttachment.security, [{ apOAuth: ['ap.conversations.read'] }]);
  assert.ok(actionAttachment.responses['200']?.content?.['image/webp']);
  assert.ok(actionAttachment.responses['404'] && actionAttachment.responses['503']);
  assert.ok(paths['/integrations/v1/conversations/{id}/replies'].post.parameters
    .some(parameter => parameter.name === 'Idempotency-Key' && parameter.required));
  for (const [path, scope, schema] of [
    ['/integrations/v1/connections', 'ap.connections.create', 'PublicConnectionCreate'],
    ['/integrations/v1/deployments', 'ap.deployments.manage', 'PublicDeploymentCreate'],
  ]) {
    const post = paths[path].post;
    assert.deepEqual(post.security, [{ apOAuth: [scope] }]);
    assert.equal(post.requestBody.content['application/json'].schema.$ref, `#/components/schemas/${schema}`);
    assert.equal(post.parameters.find(p => p.name === 'Idempotency-Key').schema.format, 'uuid');
    assert.ok(post.responses['201'] && post.responses['409'] && post.responses['403']);
  }
  for (const action of ['verify', 'activate', 'pause']) {
    const post = paths[`/integrations/v1/deployments/{id}/${action}`].post;
    assert.deepEqual(post.security, [{ apOAuth: ['ap.deployments.manage'] }]);
    assert.ok(post.parameters.some(p => p.name === 'If-Match' && p.required));
    assert.ok(post.responses['428'] && post.responses['409']);
  }
  assert.equal(document.components.schemas.PublicInstallationConnection.properties.state.const, 'installation_only');
  assert.equal(document.components.schemas.PublicDeploymentCreate.properties.kind.const, 'owned_embed');
  const refresh = paths['/integrations/v1/connections/{id}/source-refreshes'].post;
  assert.deepEqual(paths['/integrations/v1/connections/{id}/source'].get.security,
    [{ apOAuth: ['ap.sources.refresh'] }]);
  assert.deepEqual(refresh.security, [{ apOAuth: ['ap.sources.refresh'] }]);
  assert.ok(refresh.parameters.some(parameter => parameter.name === 'Idempotency-Key' && parameter.required));
  assert.ok(refresh.responses['202'] && refresh.responses['409']);
  const eventDelivery = paths['/integrations/v1/events/{id}/delivery'].get;
  assert.deepEqual(eventDelivery.security, [{ apOAuth: ['ap.conversations.read'] }]);
  assert.ok(eventDelivery.responses['200'] && eventDelivery.responses['404']);
  const recovery = paths['/integrations/v1/events/{id}/recovery-status'].get;
  assert.deepEqual(recovery.security, [{ fieldRecoveryHmac: [] }]);
  assert.ok(recovery.responses['200'] && recovery.responses['404']);
  const close = paths['/integrations/v1/notification-routes/close'].post;
  assert.deepEqual(close.security, [{ fieldRouteCloseHmac: [] }]);
  assert.ok(close.responses['200'] && close.responses['409']);
  assert.equal(close.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/FieldNotificationRouteClose');
  assert.deepEqual(document.components.schemas.FieldEventDelivery.required,
    ['eventId', 'connectionId', 'actionRequestId', 'reservationId', 'revision',
      'receiptState', 'processingState', 'receivedAt', 'processedAt',
      'processingError', 'customerNotificationState', 'customerReadState']);
  assert.equal(document.components.schemas.FieldFactsChangedEnvelope.properties.event_type.const,
    'field.facts.changed');
  assert.deepEqual(paths['/integrations/v1/field-events'].post.requestBody
    .content['application/vnd.field-event+json'].schema.oneOf,
  [{ $ref: '#/components/schemas/FieldEventEnvelope' },
    { $ref: '#/components/schemas/FieldFactsChangedEnvelope' }]);
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.match(value.$ref, /^#\/components\/(schemas|responses)\/[A-Za-z][A-Za-z0-9]*$/);
      const [, , kind, name] = value.$ref.split('/');
      assert.ok(document.components[kind]?.[name], value.$ref);
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(document);
  const exposed = JSON.stringify(paths);
  assert.doesNotMatch(exposed, /customerPhone|receiptKey|visitorKey|internalNote/);
});


test('preview.10 pins nullable current snapshot receipt metadata without changing the preview.9 write subset',()=>{
  // preview.11은 서명 원문만 바꾸므로 preview.10 출처 수신 메타데이터 고정은 그대로 유지한다.
  assert.equal(document.info.version,'1.0.0-preview.11');
  const source=document.components.schemas.SourceRevision;
  assert.ok(source.required.includes('syncedAt'));
  assert.deepEqual(source.properties.syncedAt.type,['string','null']);
  assert.equal(source.properties.syncedAt.format,'date-time');
  assert.equal(source.properties.syncedAt.readOnly,true);
  assert.equal(source.additionalProperties,false);
  assert.match(source.properties.syncedAt.description,/matching the current source revision/);
  assert.equal(document.paths['/integrations/v1/connections'].post.parameters.find(p=>p.name==='Idempotency-Key').schema.format,'uuid');
  assert.equal(document.components.schemas.PublicInstallationConnection.properties.state.const,'installation_only');
});

test('preview.11 binds Field event and revoke signatures to the field->ap direction', () => {
  assert.equal(document.info.version, '1.0.0-preview.11');
  const schemes = document.components.securitySchemes;
  assert.match(schemes.fieldEventHmac.description, /v2:field->ap\.timestamp\.event_id\.raw_body_bytes/);
  assert.match(schemes.fieldRevokeHmac.description, /v2:field->ap\.timestamp\.revocation_id\.connection_id\.revoke/);
  for (const name of ['fieldEventHmac', 'fieldRevokeHmac']) {
    assert.match(schemes[name].description, /X-Signature-Version: 2/);
    assert.match(schemes[name].description, /AP_EVENT_SIGNATURE_ACCEPT_V1/);
    assert.match(schemes[name].description, /default true in mock\/sandbox, false in live/);
    assert.match(schemes[name].description, /ap->field direction is rejected/);
  }
  for (const path of ['/integrations/v1/field-events', '/integrations/v1/connections/{id}/revoke']) {
    const version = document.paths[path].post.parameters.find(parameter => parameter.name === 'X-Signature-Version');
    assert.equal(version.in, 'header');
    assert.equal(version.required, false);
    assert.deepEqual(version.schema.enum, ['2']);
  }
  // 단방향 전용 서명(복구 조회·알림 경로 종료)은 이번 버전에서 바뀌지 않는다.
  assert.doesNotMatch(schemes.fieldRecoveryHmac.description, /v2:/);
  assert.doesNotMatch(schemes.fieldRouteCloseHmac.description, /v2:/);
});
