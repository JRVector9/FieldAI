import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const module = await import('../src/ap-public-write-client.js').catch(() => null);
const contract = { organizationId: randomUUID(), agentId: randomUUID(),
  externalOrganizationId: randomUUID(), origin: 'https://site.example.test' };
const connection = { ...contract, id: randomUUID(), revision: 1, createdAt: new Date().toISOString(),
  state: 'installation_only', request_id: 'request-1', operation_id: randomUUID(), retryable: false };

test('Field public installation HTTP consumer uses pinned contract, UUID key and exact origin without AP domain imports', async () => {
  assert.equal(typeof module?.ApPublicWriteClient, 'function', 'public write consumer is missing');
  const calls: { url: string; init: RequestInit }[] = [];
  const client = new module!.ApPublicWriteClient({ apiOrigin: 'https://ap.example.test', accessToken: 'synthetic_bearer_only',
    organizationId: contract.organizationId, agentId: contract.agentId,
    fetcher: (async (url, init) => { calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(connection), { status: 201, headers: { 'content-type': 'application/json' } }); }) as typeof fetch });
  const key = randomUUID();
  const result = await client.createConnection({ externalOrganizationId: contract.externalOrganizationId,
    origin: contract.origin }, key);
  assert.equal(result.id, connection.id);
  assert.equal(calls[0]!.url, 'https://ap.example.test/integrations/v1/connections');
  assert.equal(new Headers(calls[0]!.init.headers).get('idempotency-key'), key);
  assert.equal(new Headers(calls[0]!.init.headers).get('authorization'), 'Bearer synthetic_bearer_only');
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), contract);
  assert.equal(client.contractVersion, '1.0.0-preview.9');
});

test('consumer rejects mismatched AP organization/agent/origin and ambiguous responses instead of claiming connected', async () => {
  assert.equal(typeof module?.ApPublicWriteClient, 'function');
  for (const replacement of [{ organizationId: randomUUID() }, { agentId: randomUUID() },
    { origin: 'https://different.example.test' }, { externalOrganizationId: randomUUID() },
    { state: 'connected' }, { revision: 0 }]) {
    const client = new module!.ApPublicWriteClient({ apiOrigin: 'https://ap.example.test', accessToken: 'synthetic_bearer_only',
      organizationId: contract.organizationId, agentId: contract.agentId,
      fetcher: (async () => new Response(JSON.stringify({ ...connection, ...replacement }), { status: 201 })) as typeof fetch });
    await assert.rejects(client.createConnection({ externalOrganizationId: contract.externalOrganizationId,
      origin: contract.origin }, randomUUID()), /ap_public_write_result_unknown/);
  }
});

test('consumer preserves supplied key after timeout, scopes errors and revision preconditions', async () => {
  assert.equal(typeof module?.ApPublicWriteClient, 'function');
  let calls = 0;
  const keys: string[] = [];
  const client = new module!.ApPublicWriteClient({ apiOrigin: 'https://ap.example.test', accessToken: 'synthetic_bearer_only',
    organizationId: contract.organizationId, agentId: contract.agentId,
    fetcher: (async (_url, init) => { calls++; keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      if (calls === 1) throw new Error('timeout');
      return new Response(JSON.stringify(connection), { status: 200 }); }) as typeof fetch });
  const key = randomUUID();
  await assert.rejects(client.createConnection({ externalOrganizationId: contract.externalOrganizationId,
    origin: contract.origin }, key), /ap_public_write_result_unknown/);
  assert.equal(calls, 1);
  await client.createConnection({ externalOrganizationId: contract.externalOrganizationId, origin: contract.origin }, key);
  assert.deepEqual(keys, [key, key]);
  const declined = new module!.ApPublicWriteClient({ apiOrigin: 'https://ap.example.test', accessToken: 'synthetic_bearer_only',
    organizationId: contract.organizationId, agentId: contract.agentId,
    fetcher: (async () => new Response(JSON.stringify({ error: 'insufficient_scope', request_id: 'r', state: 'rejected',
      retryable: false }), { status: 403 })) as typeof fetch });
  await assert.rejects(declined.createConnection({ externalOrganizationId: contract.externalOrganizationId,
    origin: contract.origin }, randomUUID()), (e: unknown) => e instanceof module!.ApPublicWriteError
      && e.status === 403 && e.code === 'insufficient_scope' && !e.retryable);
});

test('mock Field site exact origin has the same narrow localhost policy as AP while live refuses it', async () => {
  assert.equal(typeof module?.ApPublicWriteClient, 'function');
  const origin = 'http://field-site.localhost:3002';
  const fixture = { ...connection, origin };
  const config = { apiOrigin: 'http://127.0.0.1:4311', accessToken: 'synthetic_bearer_only',
    organizationId: contract.organizationId, agentId: contract.agentId,
    fetcher: (async () => new Response(JSON.stringify(fixture), { status: 201 })) as typeof fetch };
  const mock = new module!.ApPublicWriteClient({ ...config, mock: true });
  const result = await mock.createConnection({ externalOrganizationId: contract.externalOrganizationId, origin }, randomUUID());
  assert.equal(result.origin, origin);
  const live = new module!.ApPublicWriteClient({ ...config, apiOrigin: 'https://ap.example.test' });
  await assert.rejects(live.createConnection({ externalOrganizationId: contract.externalOrganizationId, origin }, randomUUID()), /invalid_public_connection/);
  await assert.rejects(mock.createConnection({ externalOrganizationId: contract.externalOrganizationId,
    origin: 'http://127.0.0.1:3002' }, randomUUID()), /invalid_public_connection/);
});

test('malformed committed write response remains unknown and retains the caller UUID for recovery', async () => {
  assert.equal(typeof module?.ApPublicWriteClient, 'function');
  const keys: string[] = [];
  let malformed = true;
  const client = new module!.ApPublicWriteClient({ apiOrigin: 'https://ap.example.test', accessToken: 'synthetic_bearer_only',
    organizationId: contract.organizationId, agentId: contract.agentId,
    fetcher: (async (_url, init) => { keys.push(new Headers(init?.headers).get('idempotency-key')!);
      return new Response(JSON.stringify(malformed ? { ...connection, operation_id: undefined } : connection), { status: 201 }); }) as typeof fetch });
  const key = randomUUID();
  await assert.rejects(client.createConnection({ externalOrganizationId: contract.externalOrganizationId, origin: contract.origin }, key),
    (e: unknown) => e instanceof module!.ApPublicWriteError && e.retryable && e.status === 503 && e.code === 'ap_public_write_result_unknown');
  malformed = false;
  assert.equal((await client.createConnection({ externalOrganizationId: contract.externalOrganizationId, origin: contract.origin }, key)).id, connection.id);
  assert.deepEqual(keys, [key, key]);
});
