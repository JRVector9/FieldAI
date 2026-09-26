import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const document = JSON.parse(readFileSync(new URL('../../contracts/agent-integrator-v1.openapi.json', import.meta.url), 'utf8'));

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
