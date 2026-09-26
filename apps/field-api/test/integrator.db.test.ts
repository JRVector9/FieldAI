import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { fromNodeHeaders } from 'better-auth/node';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createFieldApp } from '../src/app.js';
import { deliverApEventOnce, reconcileApEventDeliveries } from '../src/ap-event-delivery.js';
import { copyExternalRequestAttachmentOnce } from '../src/external-request-attachment-worker.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
process.env.FIELD_PROFILE = 'mock';
const { auth, authPool } = await import('../src/auth.js');
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
after(async () => { await Promise.all([pool.end(), authPool.end()]); });
const base = 'http://127.0.0.1:4321';
const authBase = `${base}/api/auth`;
type ResponseSchema = { $ref?: string; type?: string | string[]; required?: string[];
  properties?: Record<string, ResponseSchema>; additionalProperties?: boolean;
  items?: ResponseSchema; pattern?: string; format?: string; enum?: unknown[] };
type ContractDocument = { paths: Record<string, Record<string, { responses: Record<string,
  { content?: { 'application/json'?: { schema?: ResponseSchema } } }> }>>;
  components: { schemas: Record<string, ResponseSchema> } };
const contract = JSON.parse(readFileSync(resolve('../../contracts/field-integrator-v1.openapi.json'),
  'utf8')) as ContractDocument;
const canonical = (value: unknown): string => JSON.stringify(value,
  (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

function assertContract(path: string, actual: unknown) {
  const declared = contract.paths[path]?.get?.responses?.['200']?.content?.['application/json']?.schema;
  assert.ok(declared, `OpenAPI GET ${path} 200`);
  function check(schema: ResponseSchema, value: unknown, location: string): void {
    if (schema.$ref) {
      const name = schema.$ref.split('/').at(-1);
      assert.ok(name);
      const referenced = contract.components.schemas[name];
      assert.ok(referenced);
      check(referenced, value, location);
      return;
    }
    if (schema.type === 'object') {
      assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), location);
      const item = value as Record<string, unknown>;
      for (const key of schema.required ?? []) assert.ok(key in item, `${location}.${key}`);
      if (schema.additionalProperties === false)
        for (const key of Object.keys(item)) assert.ok(key in (schema.properties ?? {}), `${location}.${key}`);
      for (const [key, entry] of Object.entries(schema.properties ?? {}))
        if (key in item) check(entry, item[key], `${location}.${key}`);
      return;
    }
    if (schema.type === 'array') {
      assert.ok(Array.isArray(value), location);
      const element = schema.items;
      assert.ok(element);
      value.forEach((part, index) => check(element, part, `${location}[${index}]`));
      return;
    }
    if (Array.isArray(schema.type) && value === null && schema.type.includes('null')) return;
    if (schema.type === 'integer' || (Array.isArray(schema.type) && schema.type.includes('integer')))
      assert.ok(Number.isInteger(value), location);
    else if (schema.type === 'boolean') assert.equal(typeof value, 'boolean', location);
    else if (schema.type === 'string') {
      assert.equal(typeof value, 'string', location);
      if (schema.pattern) assert.match(value as string, new RegExp(schema.pattern), location);
      if (schema.format === 'uuid') assert.match(value as string, /^[0-9a-f-]{36}$/i, location);
      if (schema.format === 'date-time') assert.ok(!Number.isNaN(Date.parse(value as string)), location);
    }
    if (schema.enum) assert.ok(schema.enum.includes(value), location);
  }
  check(declared, actual, `GET ${path}`);
}

async function actor() {
  const email = `field-integrator-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(16).toString('base64url')}A1!`;
  const post = (path: string, body: object) => auth.handler(new Request(`${authBase}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify(body),
  }));
  assert.equal((await post('/sign-up/email', { email, password, name: 'Field owner' })).status, 200);
  const signed = await post('/sign-in/email', { email, password });
  assert.equal(signed.status, 200);
  return { email, cookie: signed.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('Field owner delegates only approved catalog facts to a selected OAuth client', async () => {
  const owner = await actor();
  const outsider = await actor();
  const privatePhotos = new Map<string, Buffer>();
  const inquiryMedia = { put: async (key: string, data: Buffer) => { privatePhotos.set(key, data); },
    get: async (key: string) => privatePhotos.get(key) ?? null,
    delete: async (key: string) => { privatePhotos.delete(key); } };
  const app = createFieldApp(async () => undefined, auth.handler, base, {
    pool,
    inquiryMedia,
    resolveUserId: async headers => (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
    resolveSession: async headers => {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      return session ? { id: session.session.id, userId: session.user.id } : null;
    },
  });
  let organizationId = '';
  try {
    const created = await app.inject({ method: 'POST', url: '/v1/organizations',
      headers: { cookie: owner.cookie }, payload: { name: 'Field 위임 사업장' } });
    assert.equal(created.statusCode, 201);
    organizationId = created.json().id as string;
    const serviceId = randomUUID();
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 0,
        businessName: 'Field 위임 사업장', introduction: '공개 소개', region: '서울',
        openingHours: '평일', contactPhone: '010-1111-2222', defaultBookingMode: 'request',
        services: [{ id: serviceId, name: '공개 서비스', description: '서비스 설명',
          bookingMode: 'request', durationMinutes: 30, priceAmount: 10000 }],
        faqs: [{ question: '공개 질문', answer: '공개 답변' }] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 1 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/booking-policy',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 0, timezone: 'Asia/Seoul',
        weekly: { mon: { open: '09:00', close: '18:00' } }, closedDates: [], specialDates: {},
        beforeMinutes: 0, afterMinutes: 0, minLeadMinutes: 0, horizonDays: 30 } })).statusCode, 200);
    const registration = await auth.handler(new Request(`${authBase}/oauth2/create-client`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: owner.cookie },
      body: JSON.stringify({ client_name: 'AP external client',
        redirect_uris: ['https://client.example.test/callback'], application_type: 'web',
        token_endpoint_auth_method: 'client_secret_basic', grant_types: ['authorization_code'],
        response_types: ['code'], scope: 'openid field.facts.read field.availability.read field.requests.create field.requests.read field.customer_access.create' }),
    }));
    assert.equal(registration.status, 201, await registration.clone().text());
    const registered = await registration.json() as { client_id: string; client_secret: string };
    const clientId = registered.client_id;
    const localRegistration = await auth.handler(new Request(`${authBase}/oauth2/create-client`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: owner.cookie },
      body: JSON.stringify({ client_name: 'AP local BFF',
        redirect_uris: ['http://127.0.0.1:4311/v1/connections/field/callback'],
        application_type: 'native', token_endpoint_auth_method: 'client_secret_basic',
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        scope: 'openid offline_access field.facts.read' }),
    }));
    assert.equal(localRegistration.status, 201, await localRegistration.clone().text());
    const localClientId = (await localRegistration.json() as { client_id: string }).client_id;
    assert.equal((await app.inject({ url: `/integrations/v1/authorization/options?clientId=${localClientId}`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    const optionsUrl = `/integrations/v1/authorization/options?clientId=${clientId}`;
    const outsiderOptions = await app.inject({ url: optionsUrl, headers: { cookie: outsider.cookie } });
    assert.equal(outsiderOptions.statusCode, 200);
    assert.equal(outsiderOptions.json().organizations.length, 0);
    const options = await app.inject({ url: optionsUrl, headers: { cookie: owner.cookie } });
    assert.equal(options.statusCode, 200);
    assert.equal(options.json().organizations[0].id, organizationId);
    assert.deepEqual(options.json().client.scopes,
      ['field.facts.read', 'field.availability.read', 'field.requests.create', 'field.requests.read',
        'field.customer_access.create']);
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections',
      headers: { cookie: outsider.cookie }, payload: { clientId, organizationId,
        scopes: ['field.facts.read'] } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections',
      headers: { cookie: owner.cookie }, payload: { clientId, organizationId,
        scopes: ['field.unknown.scope'] } })).statusCode, 400);
    const selection = await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections',
      headers: { cookie: owner.cookie }, payload: { clientId, organizationId,
        scopes: ['field.facts.read'] } });
    assert.equal(selection.statusCode, 201, selection.body);
    const selectionId = selection.json().id as string;
    assert.equal((await app.inject({ url: `/integrations/v1/authorization/current?clientId=${clientId}`,
      headers: { cookie: outsider.cookie } })).statusCode, 404);

    const verifier = randomBytes(32).toString('base64url');
    const authorizationUrl = new URL(`${authBase}/oauth2/authorize`);
    for (const [key, value] of Object.entries({ response_type: 'code', client_id: clientId,
      redirect_uri: 'https://client.example.test/callback', scope: 'openid field.facts.read',
      state: randomUUID(), code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256', resource: `${base}/integrations/v1` }))
      authorizationUrl.searchParams.set(key, value);
    const authorization = await auth.handler(new Request(authorizationUrl, { headers: { cookie: owner.cookie } }));
    assert.equal(authorization.status, 302);
    const consentUrl = new URL(authorization.headers.get('location') ?? '/', authBase);
    assert.equal(consentUrl.pathname, '/consent');
    const denied = await auth.handler(new Request(`${authBase}/oauth2/consent`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: owner.cookie },
      body: JSON.stringify({ accept: false, oauth_query: consentUrl.searchParams.toString() }),
    }));
    assert.equal(denied.status, 200, await denied.clone().text());
    const deniedCallback = new URL((await denied.json() as { url: string }).url);
    assert.equal(deniedCallback.searchParams.get('error'), 'access_denied');
    assert.equal(deniedCallback.searchParams.has('code'), false);
    authorizationUrl.searchParams.set('state', randomUUID());
    const retried = await auth.handler(new Request(authorizationUrl, { headers: { cookie: owner.cookie } }));
    assert.equal(retried.status, 302);
    const retryConsentUrl = new URL(retried.headers.get('location') ?? '/', authBase);
    assert.equal(retryConsentUrl.pathname, '/consent');
    const consent = await auth.handler(new Request(`${authBase}/oauth2/consent`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: owner.cookie },
      body: JSON.stringify({ accept: true, oauth_query: retryConsentUrl.searchParams.toString() }),
    }));
    assert.equal(consent.status, 200, await consent.clone().text());
    const code = new URL((await consent.json() as { url: string }).url).searchParams.get('code');
    assert.ok(code);
    const token = await auth.handler(new Request(`${authBase}/oauth2/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${clientId}:${registered.client_secret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
        redirect_uri: 'https://client.example.test/callback', code, code_verifier: verifier }),
    }));
    assert.equal(token.status, 200, await token.clone().text());
    const accessToken = (await token.json() as { access_token: string }).access_token;
    const bearer = { authorization: `Bearer ${accessToken}` };
    assert.equal((await app.inject({ url: '/integrations/v1/me' })).statusCode, 401);
    const me = await app.inject({ url: '/integrations/v1/me', headers: bearer });
    assert.equal(me.statusCode, 200);
    assertContract('/integrations/v1/me', me.json());
    assert.equal(me.json().organizationId, organizationId);
    assert.deepEqual(me.json().scopes, ['field.facts.read']);
    assert.equal((await app.inject({ url: '/integrations/v1/capabilities' })).statusCode, 401);
    const capabilities = await app.inject({ url: '/integrations/v1/capabilities', headers: bearer });
    assert.equal(capabilities.statusCode, 200, capabilities.body);
    assertContract('/integrations/v1/capabilities', capabilities.json());
    assert.equal(capabilities.json().organizationId, organizationId);
    assert.deepEqual(capabilities.json().capabilities, {
      'facts.read': true, 'availability.read': false,
      'request.create': false, 'customer_access.create': false, 'proposal.respond': false,
    });
    const facts = await app.inject({ url: '/integrations/v1/facts', headers: bearer });
    assert.equal(facts.statusCode, 200);
    assertContract('/integrations/v1/facts', facts.json());
    assert.equal(facts.json().organizationId, organizationId);
    assert.equal(facts.json().services[0].id, serviceId);
    assert.deepEqual(facts.json().faqs, [{ question: '공개 질문', answer: '공개 답변' }]);
    assert.doesNotMatch(facts.body, /010-1111-2222|ownerUserId|contactPhone|catalog_drafts/);
    assert.equal((await app.inject({ url: `/integrations/v1/availability?serviceId=${serviceId}`,
      headers: bearer })).statusCode, 403);
    const bookingSelection = await app.inject({ method: 'POST', url: '/integrations/v1/authorization/selections',
      headers: { cookie: owner.cookie }, payload: { clientId, organizationId,
        scopes: ['field.facts.read', 'field.availability.read', 'field.requests.create', 'field.requests.read',
          'field.customer_access.create'] } });
    assert.equal(bookingSelection.statusCode, 201, bookingSelection.body);
    const bookingVerifier = randomBytes(32).toString('base64url');
    const bookingAuthorization = new URL(`${authBase}/oauth2/authorize`);
    for (const [key, value] of Object.entries({ response_type: 'code', client_id: clientId,
      redirect_uri: 'https://client.example.test/callback',
      scope: 'openid field.facts.read field.availability.read field.requests.create field.requests.read field.customer_access.create', state: randomUUID(),
      code_challenge: createHash('sha256').update(bookingVerifier).digest('base64url'),
      code_challenge_method: 'S256', resource: `${base}/integrations/v1` }))
      bookingAuthorization.searchParams.set(key, value);
    const bookingRedirect = await auth.handler(new Request(bookingAuthorization, { headers: { cookie: owner.cookie } }));
    assert.equal(bookingRedirect.status, 302);
    const bookingConsent = await auth.handler(new Request(`${authBase}/oauth2/consent`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: owner.cookie },
      body: JSON.stringify({ accept: true, oauth_query: new URL(bookingRedirect.headers.get('location')!, authBase).searchParams.toString() }),
    }));
    assert.equal(bookingConsent.status, 200, await bookingConsent.clone().text());
    const bookingCode = new URL((await bookingConsent.json() as { url: string }).url).searchParams.get('code');
    assert.ok(bookingCode);
    const bookingToken = await auth.handler(new Request(`${authBase}/oauth2/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${clientId}:${registered.client_secret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
        redirect_uri: 'https://client.example.test/callback', code: bookingCode, code_verifier: bookingVerifier }),
    }));
    assert.equal(bookingToken.status, 200, await bookingToken.clone().text());
    const bookingBearer = { authorization: `Bearer ${(await bookingToken.json() as { access_token: string }).access_token}` };
    const bookingMe = await app.inject({ url: '/integrations/v1/me', headers: bookingBearer });
    assert.equal(bookingMe.statusCode, 200, bookingMe.body);
    assert.ok(bookingMe.json().scopes.includes('field.customer_access.create'), bookingMe.body);
    const availability = await app.inject({ url: `/integrations/v1/availability?serviceId=${serviceId}`,
      headers: bookingBearer });
    assert.equal(availability.statusCode, 200, availability.body);
    assertContract('/integrations/v1/availability', availability.json());
    assert.equal(availability.json().service.priceAmount, 10000);
    assert.equal(availability.json().catalogRevision, 1);
    assert.equal(availability.json().timezone, 'Asia/Seoul');
    const bookingCapabilities = await app.inject({ url: '/integrations/v1/capabilities', headers: bookingBearer });
    assert.equal(bookingCapabilities.json().capabilities['availability.read'], true);
    assert.equal(bookingCapabilities.json().capabilities['customer_access.create'], true);
    assert.equal((await app.inject({ url: `/integrations/v1/availability?serviceId=${randomUUID()}`,
      headers: bookingBearer })).statusCode, 404);
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 1,
        businessName: 'Field 위임 사업장', introduction: '공개 소개', region: '서울',
        openingHours: '평일', contactPhone: '010-1111-2222', defaultBookingMode: 'request',
        services: [{ id: serviceId, name: '공개 서비스', description: '서비스 설명',
          bookingMode: 'slot', durationMinutes: 30, priceAmount: 20000 }] } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/catalog/releases',
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 2 } })).statusCode, 201);
    assert.equal((await app.inject({ url: `/integrations/v1/availability?serviceId=${serviceId}`,
      headers: bookingBearer })).statusCode, 400);
    const nextMonday = new Date(Date.now() + 8 * 86_400_000);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + (8 - nextMonday.getUTCDay()) % 7);
    const day = nextMonday.toISOString().slice(0, 10);
    const changedAvailability = await app.inject({ url: `/integrations/v1/availability?serviceId=${serviceId}&date=${day}`,
      headers: bookingBearer });
    assert.equal(changedAvailability.statusCode, 200, changedAvailability.body);
    assert.equal(changedAvailability.json().catalogRevision, 2);
    assert.equal(changedAvailability.json().service.priceAmount, 20000);
    assert.equal(changedAvailability.json().service.bookingMode, 'slot');
    assert.ok(changedAvailability.json().slots.length > 0);
    const ownerUserId = (await auth.api.getSession({ headers: fromNodeHeaders({ cookie: owner.cookie }) }))!.user.id;
    const connectionId = randomUUID();
    const apDeploymentId = randomUUID();
    await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,
      ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,
      ap_agent_revision,allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,
      access_expires_at,status,field_grant_id,field_actor_user_id,field_client_id)
      values ($1,$2,$3,'http://127.0.0.1:4311/api/auth','test-ap',$4,$5,$6,'Test AI',1,
        $7,$8,$9,$10,now() + interval '1 hour','review_required',$11,$3,$12)`,
    [connectionId, organizationId, ownerUserId, randomUUID(), randomUUID(), randomUUID(),
      [apDeploymentId], ['ap.agent.read'], randomBytes(32), randomBytes(32),
      bookingSelection.json().id, clientId]);
    const eventKeyId = randomUUID();
    const eventSecret = randomBytes(32);
    const connectorKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm',
      createHash('sha256').update(connectorKey).update('field-ap-event-route-v1').digest(), iv);
    const eventSecretCipher = Buffer.concat([iv,
      cipher.update(eventSecret.toString('base64url'), 'utf8'), cipher.final(), cipher.getAuthTag()]);
    await pool.query(`update field.ap_connections set event_key_id = $2,
      event_secret_cipher = $3,route_generation = 1 where id = $1`,
    [connectionId, eventKeyId, eventSecretCipher]);
    const slot = changedAvailability.json().slots[0] as { startAt: string };
    const requestDetails = { mode: 'slot', startAt: slot.startAt, timezone: 'Asia/Seoul' };
    const conditionsHash = digest({ organizationId, catalogRevision: 2, policyRevision: 1,
      service: changedAvailability.json().service, timezone: 'Asia/Seoul', request: requestDetails });
    const externalBody = { actionRequestId: randomUUID(), connectionId, kind: 'reservation_request',
      originConversationId: randomUUID(), externalServiceId: serviceId,
      expectedServiceRevision: 2, expectedPolicyRevision: 1,
      customer: { name: '전달 고객', phone: '010-2222-3333', verified: false },
      request: requestDetails, summary: '방문 예약 요청', attachmentRefs: [],
      consent: { version: 'transfer-v1', recordId: randomUUID(),
        confirmedAt: new Date().toISOString(), recipientProduct: 'field',
        recipientOrganizationId: organizationId,
        items: ['name', 'phone', 'service', 'requested_time'], conditionsHash },
      source: { provider: 'agent-platform', deploymentId: apDeploymentId, isTest: true } };
    const externalHeaders = { ...bookingBearer, 'x-body-sha256': digest(externalBody) };
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/external-requests',
      payload: externalBody, headers: { 'x-body-sha256': digest(externalBody) } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/external-requests',
      payload: externalBody, headers: { ...bearer, 'x-body-sha256': digest(externalBody) } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/external-requests',
      payload: externalBody, headers: { ...bookingBearer, 'x-body-sha256': '0'.repeat(64) } })).statusCode, 400);
    const submitVariant = (changed: object) => app.inject({ method: 'POST',
      url: '/integrations/v1/external-requests', payload: changed,
      headers: { ...bookingBearer, 'x-body-sha256': digest(changed) } });
    assert.equal((await submitVariant({ ...externalBody, actionRequestId: randomUUID(),
      consent: { ...externalBody.consent, recipientOrganizationId: randomUUID() } })).statusCode, 400);
    assert.equal((await submitVariant({ ...externalBody, actionRequestId: randomUUID(),
      consent: { ...externalBody.consent, confirmedAt: new Date(Date.now() - 25 * 60 * 60_000).toISOString() } })).statusCode, 409);
    assert.equal((await submitVariant({ ...externalBody, actionRequestId: randomUUID(),
      expectedServiceRevision: 1 })).statusCode, 409);
    assert.equal((await submitVariant({ ...externalBody, actionRequestId: randomUUID(),
      source: { ...externalBody.source, deploymentId: randomUUID() } })).statusCode, 404);
    const accepted = await app.inject({ method: 'POST', url: '/integrations/v1/external-requests',
      payload: externalBody, headers: externalHeaders });
    assert.equal(accepted.statusCode, 201, accepted.body);
    const requestCapabilities = await app.inject({ url: '/integrations/v1/capabilities', headers: bookingBearer });
    assert.equal(requestCapabilities.json().capabilities['request.create'], true);
    assert.equal(accepted.json().status, 'requested');
    assert.ok(accepted.json().reservationId);
    const exportedReservation = await app.inject({
      url: `/v1/owner/reservations/${accepted.json().reservationId}/export`,
      headers: { cookie: owner.cookie },
    });
    assert.equal(exportedReservation.statusCode, 200, exportedReservation.body);
    assert.equal(exportedReservation.json().reservation.source, 'external_ap');
    assert.equal(exportedReservation.json().externalSource.actionRequestId, externalBody.actionRequestId);
    assert.equal(exportedReservation.json().externalSource.connectionId, connectionId);
    assert.doesNotMatch(exportedReservation.body, /clientSecret|eventSecret|accessToken|originConversationId/);
    const saved = await pool.query<{ source: string; state: string; visitor_key_hash: string | null }>(
      'select source,state,visitor_key_hash from field.reservations where id = $1',
      [accepted.json().reservationId]);
    assert.equal(saved.rows[0]?.source, 'external_ap');
    assert.equal(saved.rows[0]?.state, 'requested');
    assert.equal(saved.rows[0]?.visitor_key_hash, null);
    const manualContactsPath = `/v1/owner/reservations/${accepted.json().reservationId}/manual-contacts`;
    const activeContacts = await app.inject({ url: manualContactsPath,
      headers: { cookie: owner.cookie } });
    assert.equal(activeContacts.statusCode, 200, activeContacts.body);
    assert.equal(activeContacts.json().connectionStatus, 'review_required');
    assert.deepEqual(activeContacts.json().contacts, []);
    const notice = await pool.query<{ payload: { notification?: string } }>(
      `select payload from field.outbox where organization_id = $1
       and aggregate_id = $2 and event_type = 'field.reservation.requested'`,
      [organizationId, accepted.json().reservationId]);
    assert.equal(notice.rows[0]?.payload.notification, 'handled_by_ap');
    const eventPath = `/integrations/v1/external-requests/by-source/${externalBody.actionRequestId}/events`;
    assert.equal((await app.inject({ url: eventPath })).statusCode, 401);
    assert.equal((await app.inject({ url: eventPath, headers: bearer })).statusCode, 403);
    const firstEvents = await app.inject({ url: eventPath, headers: bookingBearer });
    assert.equal(firstEvents.statusCode, 200, firstEvents.body);
    assertContract('/integrations/v1/external-requests/by-source/{actionId}/events', firstEvents.json());
    assert.equal(firstEvents.json().connectionId, connectionId);
    assert.equal(firstEvents.json().reservationId, accepted.json().reservationId);
    assert.equal(firstEvents.json().revision, 0);
    assert.deepEqual(firstEvents.json().events.map((event: { revision: number }) => event.revision), [0]);
    assert.doesNotMatch(firstEvents.body, /010-2222-3333|전달 고객|방문 예약 요청/);
    const handoffBody = { connectionId, actionRequestId: externalBody.actionRequestId,
      externalRequestId: accepted.json().externalRequestId,
      reservationId: accepted.json().reservationId };
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/customer-handoffs',
      payload: handoffBody })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/customer-handoffs',
      headers: bearer, payload: handoffBody })).statusCode, 403);
    const wrongHandoff = await app.inject({ method: 'POST', url: '/integrations/v1/customer-handoffs',
      headers: bookingBearer, payload: { ...handoffBody, reservationId: randomUUID() } });
    assert.equal(wrongHandoff.statusCode, 404, wrongHandoff.body);
    const handoff = await app.inject({ method: 'POST', url: '/integrations/v1/customer-handoffs',
      headers: bookingBearer, payload: handoffBody });
    assert.equal(handoff.statusCode, 201, handoff.body);
    assert.match(handoff.json().code, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(new URL(handoff.json().handoffUrl).pathname, '/handoff');
    assert.equal((await app.inject({ url: `/v1/reservations/${accepted.json().reservationId}`,
      headers: { authorization: `Bearer ${handoff.json().code}` } })).statusCode, 404);
    const exchanged = await app.inject({ method: 'POST', url: '/v1/customer-handoffs/exchange',
      payload: { code: handoff.json().code } });
    assert.equal(exchanged.statusCode, 200, exchanged.body);
    assert.equal(exchanged.json().reservationId, accepted.json().reservationId);
    assert.match(exchanged.json().receiptKey, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await app.inject({ url: `/v1/reservations/${accepted.json().reservationId}`,
      headers: { authorization: `Bearer ${exchanged.json().receiptKey}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/customer-handoffs/exchange',
      payload: { code: handoff.json().code } })).statusCode, 409);
    const secondHandoff = await app.inject({ method: 'POST', url: '/integrations/v1/customer-handoffs',
      headers: bookingBearer, payload: handoffBody });
    assert.equal(secondHandoff.statusCode, 201, secondHandoff.body);
    const secondExchange = await app.inject({ method: 'POST', url: '/v1/customer-handoffs/exchange',
      payload: { code: secondHandoff.json().code } });
    assert.equal(secondExchange.statusCode, 200, secondExchange.body);
    assert.equal((await app.inject({ url: `/v1/reservations/${accepted.json().reservationId}`,
      headers: { authorization: `Bearer ${exchanged.json().receiptKey}` } })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/reservations/${accepted.json().reservationId}`,
      headers: { authorization: `Bearer ${secondExchange.json().receiptKey}` } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/customer-handoffs/exchange',
      payload: { code: randomBytes(32).toString('base64url') } })).statusCode, 404);
    const concurrentHandoff = await app.inject({ method: 'POST', url: '/integrations/v1/customer-handoffs',
      headers: bookingBearer, payload: handoffBody });
    assert.equal(concurrentHandoff.statusCode, 201, concurrentHandoff.body);
    const concurrentResults = await Promise.all([0, 1].map(() => app.inject({ method: 'POST',
      url: '/v1/customer-handoffs/exchange', payload: { code: concurrentHandoff.json().code } })));
    assert.deepEqual(concurrentResults.map(result => result.statusCode).sort(), [200, 409]);
    const activeReceiptKey = concurrentResults.find(result => result.statusCode === 200)!.json().receiptKey as string;
    const notificationRoutePath = `/v1/reservations/${accepted.json().reservationId}/notification-route`;
    assert.equal((await app.inject({ url: notificationRoutePath })).statusCode, 401);
    assert.equal((await app.inject({ url: notificationRoutePath,
      headers: { authorization: `Bearer ${activeReceiptKey}` } })).json().state, 'awaiting_consent');
    assert.equal((await app.inject({ method: 'POST', url: `${notificationRoutePath}/consent`,
      headers: { authorization: `Bearer ${activeReceiptKey}` },
      payload: { consentId: randomUUID(), consent: true } })).statusCode, 409);
    const expiredHandoff = await app.inject({ method: 'POST', url: '/integrations/v1/customer-handoffs',
      headers: bookingBearer, payload: handoffBody });
    assert.equal(expiredHandoff.statusCode, 201, expiredHandoff.body);
    await pool.query(`update field.customer_handoff_codes
      set issued_at = now() - interval '10 minutes', expires_at = now() - interval '5 minutes'
      where code_hash = $1`, [createHash('sha256').update(expiredHandoff.json().code).digest('hex')]);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/customer-handoffs/exchange',
      payload: { code: expiredHandoff.json().code } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/customer-handoffs',
      headers: bookingBearer, payload: handoffBody })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/customer-handoffs',
      headers: bookingBearer, payload: handoffBody })).statusCode, 429);
    const handoffLog = await pool.query<{ count: string }>(
      `select count(*)::text as count from field.outbox
       where organization_id = $1 and event_type = 'field.customer_access.granted'`, [organizationId]);
    assert.equal(handoffLog.rows[0]?.count, '3');
    const confirmed = await app.inject({ method: 'POST',
      url: `/v1/owner/reservations/${accepted.json().reservationId}/confirm`,
      headers: { cookie: owner.cookie },
      payload: { expectedRevision: 0, expectedCatalogRevision: 2 } });
    assert.equal(confirmed.statusCode, 201, confirmed.body);
    const confirmedEvents = await app.inject({ url: eventPath, headers: bookingBearer });
    assert.equal(confirmedEvents.statusCode, 200, confirmedEvents.body);
    assertContract('/integrations/v1/external-requests/by-source/{actionId}/events', confirmedEvents.json());
    assert.equal(confirmedEvents.json().state, 'confirmed');
    assert.equal(confirmedEvents.json().revision, 1);
    assert.deepEqual(confirmedEvents.json().events.map((event: { revision: number }) => event.revision), [0, 1]);
    assert.equal(confirmedEvents.json().events[1].eventType, 'field.reservation.confirmed');
    assert.equal(confirmedEvents.json().events[1].customerNotificationOwnerProduct, 'ap');
    assert.equal(confirmedEvents.json().events[1].routeGeneration, 1);
    assert.doesNotMatch(confirmedEvents.body, /010-2222-3333|전달 고객|방문 예약 요청/);
    const canceled = await app.inject({ method: 'POST',
      url: `/v1/owner/reservations/${accepted.json().reservationId}/cancel`,
      headers: { cookie: owner.cookie }, payload: { expectedRevision: 1, reason: '일정 취소' } });
    assert.equal(canceled.statusCode, 200, canceled.body);
    assert.equal(canceled.json().delivery, 'handled_by_ap');
    const canceledEvents = await app.inject({ url: eventPath, headers: bookingBearer });
    assert.equal(canceledEvents.statusCode, 200, canceledEvents.body);
    assert.equal(canceledEvents.json().revision, 2);
    assert.equal(canceledEvents.json().events[2].eventType, 'field.reservation.canceled');
    assert.doesNotMatch(canceledEvents.body, /일정 취소|010-2222-3333|전달 고객/);
    const customerNotices = await pool.query<{ count: string }>(
      `select count(*)::text as count from field.notification_events
       where organization_id = $1 and target_id = $2 and audience = 'customer'`,
      [organizationId, accepted.json().reservationId]);
    assert.equal(customerNotices.rows[0]?.count, '0');
    const ownDeliveryCount = async () => {
      const result = await pool.query<{ count: string }>(
        `select count(*)::text as count from field.ap_event_deliveries
         where connection_id = $1`, [connectionId]);
      return Number(result.rows[0]?.count ?? '0');
    };
    await reconcileApEventDeliveries(pool);
    assert.equal(await ownDeliveryCount(), 3);
    const deliveredIds: string[] = [];
    let loseAck = true;
    const eventConnector = { issuer: 'http://127.0.0.1:4311/api/auth', clientId: 'test-ap',
      clientSecret: 'synthetic', tokenKey: connectorKey,
      redirectUri: 'http://127.0.0.1:4321/v1/connections/ap/callback',
      webOrigin: 'http://127.0.0.1:3002', fetcher: async (input: RequestInfo | URL,
        init?: RequestInit) => {
        assert.equal(new URL(String(input)).pathname, '/integrations/v1/field-events');
        const body = Buffer.from(init?.body as Buffer);
        const event = JSON.parse(body.toString('utf8')) as { event_id: string;
          aggregate_version: number; data: { resource_id: string } };
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('x-event-id'), event.event_id);
        assert.equal(headers.get('x-key-id'), eventKeyId);
        assert.equal(headers.get('x-signature'), createHmac('sha256', eventSecret)
          .update(Buffer.concat([Buffer.from(`${headers.get('x-timestamp')}.${event.event_id}.`), body]))
          .digest('hex'));
        assert.equal(event.data.resource_id, accepted.json().reservationId);
        assert.doesNotMatch(body.toString('utf8'), /010-2222-3333|전달 고객|일정 취소/);
        deliveredIds.push(event.event_id);
        if (loseAck) { loseAck = false; throw new Error('ack_lost'); }
        return Response.json({ received: true }, { status: 202 });
      } };
    assert.equal(await deliverApEventOnce(pool, eventConnector), 'retry');
    assert.equal(await deliverApEventOnce(pool, eventConnector), 'acked');
    assert.equal(await deliverApEventOnce(pool, eventConnector), 'acked');
    await pool.query(`update field.ap_event_deliveries set next_attempt_at = now()
      where event_id = $1`, [deliveredIds[0]]);
    assert.equal(await deliverApEventOnce(pool, eventConnector), 'acked');
    assert.equal(deliveredIds[0], deliveredIds[3]);
    assert.equal(await deliverApEventOnce(pool, eventConnector), 'empty');
    await reconcileApEventDeliveries(pool);
    assert.equal(await ownDeliveryCount(), 3);
    const deliveryStates = await pool.query<{ state: string; attempts: number }>(
      `select state,attempts from field.ap_event_deliveries
       where connection_id = $1 order by attempts desc`, [connectionId]);
    assert.deepEqual(deliveryStates.rows.map(row => row.state), ['acked', 'acked', 'acked']);
    assert.deepEqual(deliveryStates.rows.map(row => row.attempts), [2, 1, 1]);
    const deliveryPath = `/v1/owner/reservations/${accepted.json().reservationId}/event-deliveries`;
    assert.equal((await app.inject({ url: deliveryPath })).statusCode, 401);
    assert.equal((await app.inject({ url: `/v1/owner/reservations/${randomUUID()}/event-deliveries`,
      headers: { cookie: owner.cookie } })).statusCode, 404);
    const localDelivery = await app.inject({ url: deliveryPath, headers: { cookie: owner.cookie } });
    assert.equal(localDelivery.statusCode, 200, localDelivery.body);
    assert.deepEqual(localDelivery.json().events.map((event: { revision: number }) => event.revision), [0, 1, 2]);
    assert.deepEqual(localDelivery.json().events.map((event: { deliveryState: string }) => event.deliveryState),
      ['acked', 'acked', 'acked']);
    assert.deepEqual(localDelivery.json().events.map((event: { apState: string }) => event.apState),
      ['unavailable', 'unavailable', 'unavailable']);
    const syntheticAccess = (value: string) => {
      const nonce = randomBytes(12);
      const box = createCipheriv('aes-256-gcm', connectorKey, nonce);
      return Buffer.concat([nonce, box.update(value, 'utf8'), box.final(), box.getAuthTag()]);
    };
    await pool.query(`update field.ap_connections set scopes = array['ap.agent.read','ap.conversations.read'],
      access_token_cipher = $2,refresh_token_cipher = $3 where id = $1`,
    [connectionId, syntheticAccess('synthetic-ap-access'), syntheticAccess('synthetic-ap-refresh')]);
    const linked = await pool.query<{ ap_grant_id: string; ap_organization_id: string; ap_agent_id: string }>(
      `select ap_grant_id,ap_organization_id,ap_agent_id from field.ap_connections where id = $1`,
      [connectionId]);
    const apGrant = linked.rows[0]!;
    let apUnavailable = false;
    const apStatusApp = createFieldApp(async () => undefined, auth.handler, base, {
      pool, resolveUserId: async headers =>
        (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
      apConnector: { ...eventConnector, fetcher: async (input, init) => {
        const url = new URL(String(input));
        if (apUnavailable) return Response.json({ error: 'ap_unavailable' }, { status: 503 });
        if (url.pathname === '/integrations/v1/me') return Response.json({
          grantId: apGrant.ap_grant_id, organizationId: apGrant.ap_organization_id,
          agentId: apGrant.ap_agent_id, deploymentIds: [apDeploymentId],
          scopes: ['ap.agent.read', 'ap.conversations.read'], state: 'active' });
        const event = canceledEvents.json().events.find((item: { eventId: string }) =>
          url.pathname === `/integrations/v1/events/${item.eventId}/delivery`);
        assert.ok(event, url.pathname);
        assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-ap-access');
        return Response.json({ eventId: event.eventId, connectionId,
          actionRequestId: externalBody.actionRequestId, reservationId: accepted.json().reservationId,
          revision: event.revision, receiptState: 'received', processingState: 'processed',
          receivedAt: event.occurredAt, processedAt: event.occurredAt, processingError: null,
          customerNotificationState: event.revision === 0 ? 'not_applicable' : 'blocked_integration',
          customerReadState: 'not_recorded' });
      } },
    });
    try {
      assert.equal((await apStatusApp.inject({ url: deliveryPath,
        headers: { cookie: outsider.cookie } })).statusCode, 404);
      const remoteDelivery = await apStatusApp.inject({ url: deliveryPath,
        headers: { cookie: owner.cookie } });
      assert.equal(remoteDelivery.statusCode, 200, remoteDelivery.body);
      assert.deepEqual(remoteDelivery.json().events.map((event: { apState: string }) => event.apState),
        ['processed', 'processed', 'processed']);
      assert.deepEqual(remoteDelivery.json().events.map(
        (event: { customerNotificationState: string }) => event.customerNotificationState),
      ['not_applicable', 'blocked_integration', 'blocked_integration']);
      apUnavailable = true;
      const unavailable = await apStatusApp.inject({ url: deliveryPath,
        headers: { cookie: owner.cookie } });
      assert.equal(unavailable.statusCode, 200, unavailable.body);
      assert.deepEqual(unavailable.json().events.map((event: { apState: string }) => event.apState),
        ['unavailable', 'unavailable', 'unavailable']);
      assert.deepEqual(unavailable.json().events.map((event: { deliveryState: string }) => event.deliveryState),
        ['acked', 'acked', 'acked']);
    } finally { await apStatusApp.close(); }
    const replayed = await app.inject({ method: 'POST', url: '/integrations/v1/external-requests',
      payload: externalBody, headers: externalHeaders });
    assert.equal(replayed.statusCode, 200, replayed.body);
    assert.equal(replayed.json().reservationId, accepted.json().reservationId);
    const realNow = Date.now;
    Date.now = () => realNow() + 25 * 60 * 60_000;
    try {
      const lateReplay = await app.inject({ method: 'POST', url: '/integrations/v1/external-requests',
        payload: externalBody, headers: externalHeaders });
      assert.equal(lateReplay.statusCode, 200, lateReplay.body);
      assert.equal(lateReplay.json().externalRequestId, accepted.json().externalRequestId);
    } finally { Date.now = realNow; }
    const changedBody = { ...externalBody, summary: '다른 내용' };
    assert.equal((await app.inject({ method: 'POST', url: '/integrations/v1/external-requests',
      payload: changedBody, headers: { ...bookingBearer, 'x-body-sha256': digest(changedBody) } })).statusCode, 409);
    const bySource = await app.inject({ url: `/integrations/v1/external-requests/by-source/${externalBody.actionRequestId}`,
      headers: bookingBearer });
    assert.equal(bySource.statusCode, 200, bySource.body);
    assert.equal(bySource.json().reservationId, accepted.json().reservationId);
    assert.equal((await app.inject({ url: `/integrations/v1/external-requests/by-source/${externalBody.actionRequestId}`,
      headers: bearer })).statusCode, 403);
    const inquiryDetails = { mode: 'inquiry', timezone: 'Asia/Seoul' };
    const inquiryBody = { ...externalBody, actionRequestId: randomUUID(), kind: 'inquiry',
      request: inquiryDetails, summary: 'AP 상담에서 전달한 문의',
      consent: { ...externalBody.consent, recordId: randomUUID(),
        items: ['name', 'phone', 'service', 'summary'],
        conditionsHash: digest({ organizationId, catalogRevision: 2, policyRevision: 1,
          service: changedAvailability.json().service, timezone: 'Asia/Seoul', request: inquiryDetails }) } };
    const inquiryAccepted = await submitVariant(inquiryBody);
    assert.equal(inquiryAccepted.statusCode, 201, inquiryAccepted.body);
    assert.equal(inquiryAccepted.json().reservationId, null);
    const sourcePhotoId = randomUUID();
    const photoBody = { ...inquiryBody, actionRequestId: randomUUID(),
      attachmentRefs: [sourcePhotoId],
      consent: { ...inquiryBody.consent, recordId: randomUUID(),
        items: [...inquiryBody.consent.items, 'attachments'] } };
    assert.equal((await submitVariant({ ...photoBody, attachmentRefs: [sourcePhotoId, sourcePhotoId] })).statusCode, 400);
    assert.equal((await submitVariant({ ...photoBody, consent: inquiryBody.consent })).statusCode, 400);
    const photoAccepted = await submitVariant(photoBody);
    assert.equal(photoAccepted.statusCode, 201, photoAccepted.body);
    assert.equal((await submitVariant(photoBody)).statusCode, 200);
    const photoRequestId = photoAccepted.json().externalRequestId as string;
    const photoRows = await pool.query<{ id: string; state: string }>(
      `select id,state from field.external_request_attachments where external_request_id = $1`,
      [photoRequestId]);
    assert.equal(photoRows.rows.length, 1);
    assert.equal(photoRows.rows[0]?.state, 'pending');
    const ownerPhotoList = await app.inject({ url: `/v1/owner/external-requests/${photoRequestId}/attachments`,
      headers: { cookie: owner.cookie } });
    assert.equal(ownerPhotoList.statusCode, 200, ownerPhotoList.body);
    assert.equal(ownerPhotoList.json().attachments[0].sourceAttachmentId, sourcePhotoId);
    assert.equal((await app.inject({ url: `/v1/owner/external-requests/${photoRequestId}/attachments`,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: `/v1/owner/external-requests/${photoRequestId}`
      + `/attachments/${photoRows.rows[0]!.id}`, headers: { cookie: owner.cookie } })).statusCode, 404);
    const photoAccessToken = randomBytes(32).toString('base64url');
    const tokenKey = randomBytes(32);
    const tokenIv = randomBytes(12);
    const tokenCipher = createCipheriv('aes-256-gcm', tokenKey, tokenIv);
    const accessCipher = Buffer.concat([tokenIv, tokenCipher.update(photoAccessToken, 'utf8'),
      tokenCipher.final(), tokenCipher.getAuthTag()]);
    await pool.query(`update field.ap_connections set access_token_cipher = $2,
      scopes = array_append(scopes,'ap.conversations.read') where id = $1`,
    [connectionId, accessCipher]);
    const photoApGrant = (await pool.query<{ ap_grant_id: string; ap_organization_id: string;
      ap_agent_id: string }>(`select ap_grant_id,ap_organization_id,ap_agent_id
      from field.ap_connections where id = $1`, [connectionId])).rows[0]!;
    const sourceBytes = await sharp({ create: { width: 2, height: 2, channels: 3,
      background: '#3388cc' } }).webp().toBuffer();
    let photoAttempts = 0;
    const photoConnector = { issuer: 'http://127.0.0.1:4311/api/auth', clientId: 'test-ap',
      clientSecret: 'synthetic', tokenKey,
      redirectUri: 'http://127.0.0.1:4321/v1/connections/ap/callback',
      webOrigin: 'http://127.0.0.1:3002',
      fetcher: async (input: RequestInfo | URL, init?: RequestInit) => {
        assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${photoAccessToken}`);
        const path = new URL(String(input)).pathname;
        if (path === '/integrations/v1/me') return Response.json({ grantId: photoApGrant.ap_grant_id,
          organizationId: photoApGrant.ap_organization_id, agentId: photoApGrant.ap_agent_id,
          state: 'active', scopes: ['ap.agent.read', 'ap.conversations.read'],
          deploymentIds: [apDeploymentId] });
        assert.equal(path, `/integrations/v1/action-requests/${photoBody.actionRequestId}`
          + `/attachments/${sourcePhotoId}`);
        photoAttempts++;
        return photoAttempts === 1 ? new Response(null, { status: 503 })
          : new Response(new Uint8Array(sourceBytes), { headers: { 'content-type': 'image/webp' } });
      } };
    assert.equal(await copyExternalRequestAttachmentOnce(pool, photoConnector, inquiryMedia), 'retry');
    const failed = await pool.query<{ state: string; error_code: string }>(
      `select state,error_code from field.external_request_attachments where id = $1`,
      [photoRows.rows[0]!.id]);
    assert.equal(failed.rows[0]?.state, 'copy_failed');
    assert.equal(failed.rows[0]?.error_code, 'ap_media_unavailable');
    await pool.query(`update field.external_request_attachments set next_attempt_at = now()
      where id = $1`, [photoRows.rows[0]!.id]);
    assert.equal(await copyExternalRequestAttachmentOnce(pool, photoConnector, inquiryMedia), 'copied');
    const copied = await app.inject({ url: `/v1/owner/external-requests/${photoRequestId}`
      + `/attachments/${photoRows.rows[0]!.id}`, headers: { cookie: owner.cookie } });
    assert.equal(copied.statusCode, 200, copied.body);
    assert.equal(copied.headers['content-type'], 'image/webp');
    assert.ok(copied.rawPayload.length > 0);
    assert.equal((await app.inject({ url: `/v1/owner/external-requests/${photoRequestId}`
      + `/attachments/${photoRows.rows[0]!.id}`, headers: { cookie: outsider.cookie } })).statusCode, 404);
    const ownerExternal = await app.inject({ url: '/v1/owner/external-requests',
      headers: { cookie: owner.cookie, 'x-organization-id': organizationId } });
    assert.equal(ownerExternal.statusCode, 200, ownerExternal.body);
    const externalInquiries = ownerExternal.json().inquiries as Array<Record<string, unknown>>;
    const inquiry = externalInquiries.find(item => item.id === inquiryAccepted.json().externalRequestId);
    assert.equal(inquiry?.customerName, '전달 고객');
    assert.equal(inquiry?.customerPhone, '010-2222-3333');
    assert.equal(inquiry?.summary, 'AP 상담에서 전달한 문의');
    assert.equal((inquiry?.service as { name?: string })?.name, '공개 서비스');
    assert.equal(externalInquiries.some(item => item.id === accepted.json().externalRequestId), false);
    const olderInquiryIds = Array.from({ length: 103 }, () => randomUUID());
    await pool.query(
      `insert into field.external_work_requests
       (id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,
        body_hash,origin_conversation_id,source_deployment_id,kind,service_id,catalog_revision,
        policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,consent_record_id,
        consent_confirmed_at,conditions_hash,is_test,status,received_at)
       select synthetic.id,e.organization_id,e.provider,e.connection_id,e.client_id,e.field_grant_id,
         synthetic.id,e.body_hash,e.origin_conversation_id,e.source_deployment_id,e.kind,e.service_id,
         e.catalog_revision,e.policy_revision,e.service_snapshot,e.customer_snapshot,e.request_snapshot,
         e.summary,e.consent_record_id,e.consent_confirmed_at,e.conditions_hash,e.is_test,e.status,
         '2026-09-26T00:00:00.123456Z'::timestamptz
       from field.external_work_requests e cross join unnest($2::uuid[]) as synthetic(id)
       where e.id=$1`, [inquiryAccepted.json().externalRequestId, olderInquiryIds],
    );
    const externalFirst = await app.inject({ url: '/v1/owner/external-requests',
      headers: { cookie: owner.cookie } });
    assert.equal(externalFirst.statusCode, 200);
    const externalFirstData = externalFirst.json() as { inquiries: { id: string }[]; nextCursor: string | null };
    assert.equal(externalFirstData.inquiries.length, 100);
    assert.ok(externalFirstData.nextCursor);
    const externalSecond = await app.inject({
      url: `/v1/owner/external-requests?cursor=${encodeURIComponent(externalFirstData.nextCursor!)}`,
      headers: { cookie: owner.cookie } });
    assert.equal(externalSecond.statusCode, 200);
    const externalSecondData = externalSecond.json() as typeof externalFirstData;
    assert.equal(externalSecondData.inquiries.length, 3 + externalInquiries.length);
    assert.equal(externalSecondData.nextCursor, null);
    const actualExternalIds = [...externalFirstData.inquiries, ...externalSecondData.inquiries].map(item => item.id);
    const orderedExternal = await pool.query<{ id: string }>(
      `select id from field.external_work_requests where organization_id=$1 and kind='inquiry'
       order by received_at desc,id desc`, [organizationId]);
    assert.deepEqual(actualExternalIds, orderedExternal.rows.map(item => item.id));
    assert.equal(new Set(actualExternalIds).size, olderInquiryIds.length + externalInquiries.length);
    assert.equal((await app.inject({ url: '/v1/owner/external-requests?cursor=bad',
      headers: { cookie: owner.cookie } })).statusCode, 400);
    assert.equal((await app.inject({ url: '/v1/owner/external-requests',
      headers: { cookie: outsider.cookie, 'x-organization-id': organizationId } })).statusCode, 404);
    assert.equal((await app.inject({ url: '/v1/owner/external-requests' })).statusCode, 401);
    const notificationsBeforeReplay = await app.inject({ url: '/v1/owner/notifications',
      headers: { cookie: owner.cookie } });
    assert.equal(notificationsBeforeReplay.statusCode, 200);
    const inquiryNotices = (notificationsBeforeReplay.json().notifications as Array<Record<string, unknown>>)
      .filter(item => item.targetId === inquiryAccepted.json().externalRequestId);
    assert.equal(inquiryNotices.length, 1);
    assert.equal(inquiryNotices[0]?.targetKind, 'external_request');
    assert.equal(inquiryNotices[0]?.eventType, 'field.external_request.accepted');
    assert.equal((await submitVariant(inquiryBody)).statusCode, 200);
    const noticesAfterReplay = await pool.query<{ count: string }>(
      `select count(*)::text as count from field.notification_events
       where organization_id = $1 and target_id = $2 and audience = 'owner'`,
      [organizationId, inquiryAccepted.json().externalRequestId]);
    assert.equal(noticesAfterReplay.rows[0]?.count, '1');
    assert.equal((await app.inject({ method: 'POST',
      url: `/integrations/v1/authorization/selections/${selectionId}/revoke`,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST',
      url: `/integrations/v1/authorization/selections/${selectionId}/revoke`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/integrations/v1/me', headers: bearer })).statusCode, 401);
    assert.equal((await app.inject({ url: '/integrations/v1/capabilities', headers: bearer })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST',
      url: `/integrations/v1/authorization/selections/${bookingSelection.json().id}/revoke`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/integrations/v1/me', headers: bookingBearer })).statusCode, 401);
    await pool.query(`update field.ap_event_deliveries set state = 'retry',next_attempt_at = now()
      where event_id = $1`, [deliveredIds[0]]);
    assert.equal(await deliverApEventOnce(pool, eventConnector), 'blocked');
    const latestEventId = canceledEvents.json().events[2].eventId as string;
    const contactBody = { contactAttemptId: randomUUID(), eventId: latestEventId,
      method: 'phone', outcome: 'attempted' };
    assert.equal((await app.inject({ method: 'POST', url: manualContactsPath,
      headers: { cookie: owner.cookie }, payload: contactBody })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/connections/ap/${connectionId}/revoke`,
      headers: { cookie: owner.cookie } })).statusCode, 200);
    const consentBody = { consentId: randomUUID(), consent: true };
    assert.equal((await app.inject({ method: 'POST', url: `${notificationRoutePath}/consent`,
      payload: consentBody })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: `${notificationRoutePath}/consent`,
      headers: { authorization: `Bearer ${secondExchange.json().receiptKey}` },
      payload: consentBody })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `${notificationRoutePath}/consent`,
      headers: { authorization: `Bearer ${activeReceiptKey}` },
      payload: { ...consentBody, consent: false } })).statusCode, 400);
    const consented = await app.inject({ method: 'POST', url: `${notificationRoutePath}/consent`,
      headers: { authorization: `Bearer ${activeReceiptKey}` }, payload: consentBody });
    assert.equal(consented.statusCode, 201, consented.body);
    assert.equal(consented.json().state, 'consented');
    assert.equal(consented.json().routeGeneration, 1);
    assert.equal((await app.inject({ method: 'POST', url: `${notificationRoutePath}/consent`,
      headers: { authorization: `Bearer ${activeReceiptKey}` }, payload: consentBody })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `${notificationRoutePath}/consent`,
      headers: { authorization: `Bearer ${activeReceiptKey}` },
      payload: { consentId: randomUUID(), consent: true } })).statusCode, 409);
    const consentStatus = await app.inject({ url: notificationRoutePath,
      headers: { authorization: `Bearer ${activeReceiptKey}` } });
    assert.equal(consentStatus.statusCode, 200);
    assert.equal(consentStatus.json().state, 'consented');
    assert.equal((await pool.query<{ count: string }>(`select count(*)::text as count from field.outbox
      where organization_id = $1 and aggregate_id = $2
        and event_type = 'field.reservation.notification_route_consented'`,
    [organizationId, accepted.json().reservationId])).rows[0]?.count, '1');
    const withdrawalBody = { withdrawalId: randomUUID(), confirm: true };
    assert.equal((await app.inject({ method: 'POST', url: `${notificationRoutePath}/withdraw`,
      headers: { authorization: `Bearer ${activeReceiptKey}` },
      payload: withdrawalBody })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `${notificationRoutePath}/withdraw`,
      headers: { authorization: `Bearer ${activeReceiptKey}` },
      payload: withdrawalBody })).statusCode, 200);
    assert.equal((await app.inject({ url: notificationRoutePath,
      headers: { authorization: `Bearer ${activeReceiptKey}` } })).json().state, 'withdrawn');
    const reconsent = await app.inject({ method: 'POST', url: `${notificationRoutePath}/consent`,
      headers: { authorization: `Bearer ${activeReceiptKey}` },
      payload: { consentId: randomUUID(), consent: true } });
    assert.equal(reconsent.statusCode, 201, reconsent.body);
    assert.equal(reconsent.json().state, 'consented');
    assert.equal((await pool.query<{ count: string }>(`select count(*)::text as count from field.outbox
      where organization_id = $1 and aggregate_id = $2
        and event_type = 'field.reservation.notification_route_consented'`,
    [organizationId, accepted.json().reservationId])).rows[0]?.count, '2');
    const preTransferGapId = randomUUID();
    await pool.query(`update field.reservations set revision = 3 where id = $1`,
      [accepted.json().reservationId]);
    await pool.query(`insert into field.reservation_events
      (id,reservation_id,organization_id,revision,actor_type,actor_user_id,
       event_type,previous_state,next_state,detail)
      values ($1,$2,$3,3,'owner',$4,'field.reservation.manual_review','canceled','canceled','{}')`,
    [preTransferGapId, accepted.json().reservationId, organizationId, ownerUserId]);
    await pool.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
      values ($1,$2,'field.reservation.manual_review',$3,$4::jsonb)`,
    [randomUUID(), organizationId, accepted.json().reservationId,
      JSON.stringify({ reservationId: accepted.json().reservationId, revision: 3,
        notification: 'manual_contact_required' })]);
    assert.equal((await pool.query<{ notification_owner_product: string }>(
      `select notification_owner_product from field.reservation_events where id = $1`,
      [preTransferGapId])).rows[0]?.notification_owner_product, 'ap');
    await pool.query(`update field.ap_event_deliveries set state = 'acked'
      where event_id = $1`, [deliveredIds[0]]);
    const activationPath = `/v1/owner/reservations/${accepted.json().reservationId}/notification-route/activate`;
    const ownerRoutePath = `/v1/owner/reservations/${accepted.json().reservationId}/notification-route`;
    assert.equal((await app.inject({ url: ownerRoutePath,
      headers: { cookie: outsider.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: ownerRoutePath,
      headers: { cookie: owner.cookie } })).json().state, 'consented');
    const activationBody = { transferId: randomUUID() };
    assert.equal((await app.inject({ method: 'POST', url: activationPath,
      headers: { cookie: owner.cookie }, payload: activationBody })).statusCode, 409);
    await pool.query(`update field.ap_connection_revocations set state = 'acked',acknowledged_at = now()
      where connection_id = $1`, [connectionId]);
    assert.equal((await app.inject({ url: ownerRoutePath,
      headers: { cookie: owner.cookie } })).json().revocationAcknowledged, true);
    let closeUnavailable = true;
    let closeCalls = 0;
    const closeBodies: Array<{ transferId: string; latestRevision: number; latestEventId: string }> = [];
    const transferApp = createFieldApp(async () => undefined, auth.handler, base, {
      pool, resolveUserId: async headers =>
        (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
      apConnector: { ...eventConnector, fetcher: async (input, init) => {
        assert.equal(new URL(String(input)).pathname, '/integrations/v1/notification-routes/close');
        const body = JSON.parse(String(init?.body)) as { transferId: string; connectionId: string;
          actionRequestId: string; reservationId: string; latestRevision: number;
          latestEventId: string; routeGeneration: number };
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('x-key-id'), eventKeyId);
        assert.equal(headers.get('x-signature'), createHmac('sha256', eventSecret)
          .update(`${headers.get('x-timestamp')}.${body.transferId}.${body.connectionId}`
            + `.${body.actionRequestId}.${body.reservationId}.${body.latestRevision}`
            + `.${body.latestEventId}.route-close`).digest('hex'));
        assert.equal(body.connectionId, connectionId);
        assert.equal(body.actionRequestId, externalBody.actionRequestId);
        assert.equal(body.reservationId, accepted.json().reservationId);
        assert.equal(body.latestRevision, 2);
        assert.equal(body.latestEventId, latestEventId);
        assert.equal(body.routeGeneration, 2);
        closeBodies.push(body);
        closeCalls++;
        if (closeUnavailable) throw new Error('AP response unknown');
        return Response.json({ ...body, closedAt: new Date().toISOString() });
      } },
    });
    try {
      assert.equal((await transferApp.inject({ method: 'POST', url: activationPath,
        payload: activationBody })).statusCode, 401);
      assert.equal((await transferApp.inject({ method: 'POST', url: activationPath,
        headers: { cookie: outsider.cookie }, payload: activationBody })).statusCode, 404);
      assert.equal((await transferApp.inject({ method: 'POST', url: activationPath,
        headers: { cookie: owner.cookie }, payload: activationBody })).statusCode, 503);
      const pendingAfterLostResponse = await transferApp.inject({ url: ownerRoutePath,
        headers: { cookie: owner.cookie } });
      assert.equal(pendingAfterLostResponse.json().pendingTransferId, activationBody.transferId);
      assert.equal(pendingAfterLostResponse.json().pendingRevision, 2);
      const withdrawnDuringTransfer = await transferApp.inject({ method: 'POST',
        url: `${notificationRoutePath}/withdraw`,
        headers: { authorization: `Bearer ${activeReceiptKey}` },
        payload: { withdrawalId: randomUUID(), confirm: true } });
      assert.equal(withdrawnDuringTransfer.statusCode, 200, withdrawnDuringTransfer.body);
      assert.equal((await transferApp.inject({ method: 'POST', url: activationPath,
        headers: { cookie: owner.cookie }, payload: activationBody })).statusCode, 409);
      assert.equal(closeCalls, 1);
      const reconsentedDuringTransfer = await transferApp.inject({ method: 'POST',
        url: `${notificationRoutePath}/consent`,
        headers: { authorization: `Bearer ${activeReceiptKey}` },
        payload: { consentId: randomUUID(), consent: true } });
      assert.equal(reconsentedDuringTransfer.statusCode, 201, reconsentedDuringTransfer.body);
      assert.equal((await transferApp.inject({ url: ownerRoutePath,
        headers: { cookie: owner.cookie } })).json().pendingTransferId, activationBody.transferId);
      const gapEventId = randomUUID();
      await pool.query(`update field.reservations set revision = 4 where id = $1`,
        [accepted.json().reservationId]);
      await pool.query(`insert into field.reservation_events
        (id,reservation_id,organization_id,revision,actor_type,actor_user_id,
         event_type,previous_state,next_state,detail)
        values ($1,$2,$3,4,'owner',$4,'field.reservation.manual_review','canceled','canceled','{}')`,
      [gapEventId, accepted.json().reservationId, organizationId, ownerUserId]);
      await pool.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
        values ($1,$2,'field.reservation.manual_review',$3,$4::jsonb)`,
      [randomUUID(), organizationId, accepted.json().reservationId,
        JSON.stringify({ reservationId: accepted.json().reservationId, revision: 4,
          notification: 'manual_contact_required' })]);
      const gapRoute = await pool.query<{ notification_owner_product: string; route_generation: number }>(
        `select notification_owner_product,route_generation from field.reservation_events where id = $1`,
        [gapEventId]);
      assert.equal(gapRoute.rows[0]?.notification_owner_product, 'none');
      assert.equal(gapRoute.rows[0]?.route_generation, 1);
      assert.equal((await transferApp.inject({ url: notificationRoutePath,
        headers: { authorization: `Bearer ${activeReceiptKey}` } })).json().state, 'consented');
      closeUnavailable = false;
      const resumedBody = { transferId: randomUUID() };
      const beforeContact = await transferApp.inject({ method: 'POST', url: activationPath,
        headers: { cookie: owner.cookie }, payload: resumedBody });
      assert.equal(beforeContact.statusCode, 409, beforeContact.body);
      assert.equal(beforeContact.json().error, 'post_snapshot_manual_contact_required');
      assert.deepEqual(beforeContact.json().eventIds, [preTransferGapId, gapEventId]);
      assert.equal(closeBodies[1]?.transferId, activationBody.transferId);
      assert.equal(closeBodies[1]?.latestRevision, 2);
      const attemptedGapContact = await transferApp.inject({ method: 'POST',
        url: manualContactsPath, headers: { cookie: owner.cookie },
        payload: { contactAttemptId: randomUUID(), eventId: gapEventId,
          method: 'phone', outcome: 'attempted' } });
      assert.equal(attemptedGapContact.statusCode, 201, attemptedGapContact.body);
      assert.equal((await transferApp.inject({ method: 'POST', url: activationPath,
        headers: { cookie: owner.cookie }, payload: resumedBody })).statusCode, 409);
      const reachedPreTransferContact = await transferApp.inject({ method: 'POST',
        url: manualContactsPath, headers: { cookie: owner.cookie },
        payload: { contactAttemptId: randomUUID(), eventId: preTransferGapId,
          method: 'phone', outcome: 'reached' } });
      assert.equal(reachedPreTransferContact.statusCode, 201, reachedPreTransferContact.body);
      assert.equal((await transferApp.inject({ method: 'POST', url: activationPath,
        headers: { cookie: owner.cookie }, payload: resumedBody })).statusCode, 409);
      const reachedGapContact = await transferApp.inject({ method: 'POST',
        url: manualContactsPath, headers: { cookie: owner.cookie },
        payload: { contactAttemptId: randomUUID(), eventId: gapEventId,
          method: 'phone', outcome: 'reached' } });
      assert.equal(reachedGapContact.statusCode, 201, reachedGapContact.body);
      const activated = await transferApp.inject({ method: 'POST', url: activationPath,
        headers: { cookie: owner.cookie }, payload: resumedBody });
      assert.equal(activated.statusCode, 200, activated.body);
      assert.equal(activated.json().state, 'active');
      assert.equal(activated.json().routeGeneration, 2);
      assert.equal(activated.json().transferId, activationBody.transferId);
      assert.equal(closeCalls, 5);
      await reconcileApEventDeliveries(pool);
      const gapDelivery = await pool.query(
        `select event_id from field.ap_event_deliveries where event_id = $1`, [gapEventId]);
      assert.equal(gapDelivery.rowCount, 0);
      assert.equal((await transferApp.inject({ url: ownerRoutePath,
        headers: { cookie: owner.cookie } })).json().state, 'active');
      assert.equal((await transferApp.inject({ method: 'POST', url: activationPath,
        headers: { cookie: owner.cookie }, payload: activationBody })).statusCode, 200);
      assert.equal(closeCalls, 5);
      assert.equal((await transferApp.inject({ method: 'POST', url: activationPath,
        headers: { cookie: owner.cookie }, payload: { transferId: randomUUID() } })).statusCode, 409);
      assert.equal((await transferApp.inject({ url: notificationRoutePath,
        headers: { authorization: `Bearer ${activeReceiptKey}` } })).json().state, 'active');
      const withdrawnActive = await transferApp.inject({ method: 'POST',
        url: `${notificationRoutePath}/withdraw`,
        headers: { authorization: `Bearer ${activeReceiptKey}` },
        payload: { withdrawalId: randomUUID(), confirm: true } });
      assert.equal(withdrawnActive.statusCode, 200, withdrawnActive.body);
      assert.equal(withdrawnActive.json().state, 'suspended');
    } finally { await transferApp.close(); }
    let recoveryUnavailable = false;
    const recoveryApp = createFieldApp(async () => undefined, auth.handler, base, {
      pool, resolveUserId: async headers =>
        (await auth.api.getSession({ headers: fromNodeHeaders(headers) }))?.user.id ?? null,
      apConnector: { ...eventConnector, fetcher: async (input, init) => {
        if (recoveryUnavailable) throw new Error('AP disconnected');
        const url = new URL(String(input));
        const event = canceledEvents.json().events.find((item: { eventId: string }) =>
          url.pathname === `/integrations/v1/events/${item.eventId}/recovery-status`);
        assert.ok(event, url.pathname);
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('x-key-id'), eventKeyId);
        assert.equal(headers.get('x-connection-id'), connectionId);
        assert.equal(headers.get('x-signature'), createHmac('sha256', eventSecret)
          .update(`${headers.get('x-timestamp')}.${event.eventId}.${connectionId}.notification-status`)
          .digest('hex'));
        return Response.json({ eventId: event.eventId, connectionId,
          actionRequestId: externalBody.actionRequestId, reservationId: accepted.json().reservationId,
          revision: event.revision, receiptState: 'received', processingState: 'processed',
          receivedAt: event.occurredAt, processedAt: event.occurredAt, processingError: null,
          customerNotificationState: event.revision === 0 ? 'not_applicable' : 'blocked_integration',
          customerReadState: 'not_recorded' });
      } },
    });
    try {
      assert.equal((await recoveryApp.inject({ url: deliveryPath,
        headers: { cookie: outsider.cookie } })).statusCode, 404);
      const recoveredDelivery = await recoveryApp.inject({ url: deliveryPath,
        headers: { cookie: owner.cookie } });
      assert.equal(recoveredDelivery.statusCode, 200, recoveredDelivery.body);
      for (const event of recoveredDelivery.json().events as Array<{ revision: number;
        deliveryState: string; apState: string; customerNotificationState: string | null }>) {
        if (event.deliveryState === 'acked') {
          assert.equal(event.apState, 'processed');
          assert.equal(event.customerNotificationState,
            event.revision === 0 ? 'not_applicable' : 'blocked_integration');
        } else {
          assert.equal(event.apState, 'not_requested');
          assert.equal(event.customerNotificationState, null);
        }
      }
      recoveryUnavailable = true;
      const failedRecovery = await recoveryApp.inject({ url: deliveryPath,
        headers: { cookie: owner.cookie } });
      assert.equal(failedRecovery.statusCode, 200, failedRecovery.body);
      for (const event of failedRecovery.json().events as Array<{ deliveryState: string; apState: string }>)
        assert.equal(event.apState, event.deliveryState === 'acked' ? 'unavailable' : 'not_requested');
      assert.deepEqual(failedRecovery.json().events.map((event: { deliveryState: string }) =>
        event.deliveryState), recoveredDelivery.json().events.map((event: { deliveryState: string }) =>
        event.deliveryState));
    } finally { await recoveryApp.close(); }
    assert.equal((await app.inject({ method: 'POST', url: manualContactsPath,
      headers: { cookie: outsider.cookie }, payload: contactBody })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: manualContactsPath,
      headers: { cookie: owner.cookie }, payload: { ...contactBody, eventId: randomUUID() } })).statusCode, 404);
    const recordedContact = await app.inject({ method: 'POST', url: manualContactsPath,
      headers: { cookie: owner.cookie }, payload: contactBody });
    assert.equal(recordedContact.statusCode, 201, recordedContact.body);
    assert.equal(recordedContact.json().eventId, latestEventId);
    assert.equal(recordedContact.json().outcome, 'attempted');
    const repeatedContact = await app.inject({ method: 'POST', url: manualContactsPath,
      headers: { cookie: owner.cookie }, payload: contactBody });
    assert.equal(repeatedContact.statusCode, 200, repeatedContact.body);
    assert.equal(repeatedContact.json().id, recordedContact.json().id);
    assert.equal((await app.inject({ method: 'POST', url: manualContactsPath,
      headers: { cookie: owner.cookie }, payload: { ...contactBody, outcome: 'reached' } })).statusCode, 409);
    const contactsAfter = await app.inject({ url: manualContactsPath,
      headers: { cookie: owner.cookie } });
    assert.equal(contactsAfter.statusCode, 200, contactsAfter.body);
    assert.equal(contactsAfter.json().connectionStatus, 'revoked');
    assert.equal(contactsAfter.json().contacts.length, 4);
    assert.equal((await pool.query<{ count: string }>(`select count(*)::text as count
      from field.outbox where organization_id = $1 and event_type = 'field.reservation.manual_contact_recorded'
        and aggregate_id = $2`, [organizationId, accepted.json().reservationId])).rows[0]?.count, '4');
    const outsiderSession = await auth.api.getSession({ headers: new Headers({ cookie: outsider.cookie }) });
    assert.ok(outsiderSession);
    await pool.query(`insert into field.memberships(organization_id,user_id,role)
      values ($1,$2,'owner')`, [organizationId, outsiderSession.user.id]);
    const departingActorContactId = randomUUID();
    assert.equal((await app.inject({ method: 'POST', url: manualContactsPath,
      headers: { cookie: outsider.cookie }, payload: { ...contactBody,
        contactAttemptId: departingActorContactId } })).statusCode, 201);
    await pool.query('delete from "user" where id = $1', [outsiderSession.user.id]);
    const retained = await pool.query<{ actor_user_id: string | null }>(
      `select actor_user_id from field.external_reservation_manual_contacts where id = $1`,
      [departingActorContactId]);
    assert.equal(retained.rows[0]?.actor_user_id, null);
    assert.equal((await app.inject({ url: `/v1/reservations/${accepted.json().reservationId}`,
      headers: { authorization: `Bearer ${concurrentResults.find(result => result.statusCode === 200)!.json().receiptKey}` }
    })).statusCode, 200);
  } finally {
    await app.close();
    if (organizationId) {
      await pool.query(`delete from field.ap_event_deliveries where connection_id in
        (select id from field.ap_connections where organization_id = $1)`, [organizationId]);
      await pool.query('delete from field.organizations where id = $1', [organizationId]);
    }
    await pool.query('delete from "user" where email = any($1::text[])', [[owner.email, outsider.email]]);
  }
});
