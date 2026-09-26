import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const document = JSON.parse(readFileSync(new URL('../../contracts/field-integrator-v1.openapi.json', import.meta.url), 'utf8'));

test('Field public integrator preview declares implemented bearer reads and explicit binding', () => {
  assert.equal(document.openapi, '3.1.0');
  assert.match(document.info.version, /^1\./);
  const declaredScopes = document.components.securitySchemes.fieldOAuth.flows.authorizationCode.scopes;
  assert.deepEqual(Object.keys(declaredScopes), ['field.facts.read', 'field.availability.read',
    'field.requests.create', 'field.requests.read', 'field.customer_access.create']);
  assert.deepEqual(Object.keys(document.paths).sort(),
    ['/integrations/v1/availability', '/integrations/v1/capabilities',
      '/integrations/v1/connections/{id}/bind',
      '/integrations/v1/connections/{id}/revoke',
      '/integrations/v1/customer-handoffs',
      '/integrations/v1/external-requests',
      '/integrations/v1/external-requests/by-source/{actionId}',
      '/integrations/v1/external-requests/by-source/{actionId}/events',
      '/integrations/v1/facts', '/integrations/v1/me', '/v1/customer-handoffs/exchange']);
  const operations = Object.values(document.paths).flatMap(path => Object.values(path));
  assert.equal(new Set(operations.map(operation => operation.operationId)).size, operations.length);
  for (const operation of operations) {
    assert.ok(operation.operationId);
    assert.ok(operation.responses['200'] || operation.responses['201']);
    if (operation.operationId === 'exchangeFieldCustomerHandoff') {
      assert.equal(operation.security, undefined);
    } else if (operation.operationId === 'receiveSignedApConnectionRevoke') {
      assert.deepEqual(operation.security, [{ apRevokeHmac: [] }]);
      assert.ok(operation.responses['401'] && operation.responses['409']);
    } else {
      assert.ok(operation.responses['401']);
      assert.ok(operation.security?.length === 1);
      for (const scope of operation.security[0].fieldOAuth) assert.ok(declaredScopes[scope], scope);
    }
  }
  assert.deepEqual(document.paths['/integrations/v1/facts'].get.security,
    [{ fieldOAuth: ['field.facts.read'] }]);
  assert.ok(document.components.schemas.Facts.required.includes('faqs'));
  assert.equal(document.components.schemas.Facts.properties.faqs.items.$ref,
    '#/components/schemas/FaqFact');
  assert.deepEqual(document.paths['/integrations/v1/availability'].get.security,
    [{ fieldOAuth: ['field.availability.read'] }]);
  assert.deepEqual(document.paths['/integrations/v1/capabilities'].get.security,
    [{ fieldOAuth: [] }]);
  const bind = document.paths['/integrations/v1/connections/{id}/bind'].post;
  assert.deepEqual(bind.security, [{ fieldOAuth: ['field.facts.read'] }]);
  assert.ok(bind.requestBody?.content?.['application/json']?.schema);
  const bindBody = document.components.schemas.BindRequest;
  assert.deepEqual(bindBody.required, ['apGrantId', 'apOrganizationId', 'apAgentId',
    'fieldGrantId', 'eventKeyId', 'eventSecret', 'routeGeneration']);
  assert.equal(bindBody.properties.eventSecret.pattern, '^[A-Za-z0-9_-]{43}$');
  assert.equal('eventSecret' in document.components.schemas.BindResult.properties, false);
  assert.ok(bind.responses['409'] && bind.responses['503']);
  const createRequest = document.paths['/integrations/v1/external-requests'].post;
  assert.deepEqual(createRequest.security, [{ fieldOAuth: ['field.requests.create'] }]);
  assert.ok(createRequest.requestBody?.content?.['application/json']?.schema);
  assert.ok(createRequest.parameters?.some(parameter => parameter.name === 'x-body-sha256'));
  assert.ok(createRequest.responses['201'] && createRequest.responses['409']);
  assert.equal(document.components.schemas.ExternalRequest.properties.attachmentRefs.maxItems, 5);
  assert.equal(document.components.schemas.ExternalRequest.properties.attachmentRefs.uniqueItems, true);
  assert.ok(document.components.schemas.ExternalRequest.properties.consent.properties.items.items.enum.includes('attachments'));
  assert.match(createRequest.responses['403'].description, /trial_ended/);
  assert.match(createRequest.description, /original receipt.*trial/i);
  const bySource = document.paths['/integrations/v1/external-requests/by-source/{actionId}'].get;
  assert.deepEqual(bySource.security, [{ fieldOAuth: ['field.requests.read'] }]);
  assert.ok(bySource.responses['200'] && bySource.responses['404']);
  const events = document.paths['/integrations/v1/external-requests/by-source/{actionId}/events'].get;
  assert.deepEqual(events.security, [{ fieldOAuth: ['field.requests.read'] }]);
  assert.ok(events.responses['200'] && events.responses['404']);
  assert.doesNotMatch(JSON.stringify(events.responses['200']), /customerPhone|customerName|reason|summary|detail/);
  const issue = document.paths['/integrations/v1/customer-handoffs'].post;
  assert.deepEqual(issue.security, [{ fieldOAuth: ['field.customer_access.create'] }]);
  assert.ok(issue.responses['201'] && issue.responses['429']);
  const exchange = document.paths['/v1/customer-handoffs/exchange'].post;
  assert.ok(exchange.responses['200'] && exchange.responses['409']);
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
  assert.doesNotMatch(JSON.stringify(document.paths['/integrations/v1/facts']),
    /contactPhone|customerPhone|receiptKey|internalNote|draft/);
});
