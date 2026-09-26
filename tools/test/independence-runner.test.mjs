import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isolatedApiEnvironment, oppositePorts } from '../run-independence.mjs';

test('independent AP child receives only its own runtime settings', () => {
  const environment = isolatedApiEnvironment('agent', {
    AP_DATABASE_URL: 'postgresql://own', AP_AUTH_SECRET: 'own-secret',
    AP_REVOCATION_JOURNAL_DIRECTORY: '/synthetic/ap-journal', AP_REVOCATION_JOURNAL_SECRET: 'synthetic-own-journal-secret',
    FIELD_REVOCATION_JOURNAL_SECRET: 'synthetic-other-secret',
    AP_AUTH_BASE_URL: 'http://127.0.0.1:4311', AP_OPENAI_API_KEY: 'model-secret',
    AP_FIELD_CLIENT_SECRET: 'connector-secret', FIELD_DATABASE_URL: 'postgresql://other',
  }, { PATH: '/bin' });
  assert.equal(environment.AP_DATABASE_URL, 'postgresql://own');
  assert.equal(environment.AP_REVOCATION_JOURNAL_DIRECTORY, '/synthetic/ap-journal');
  assert.equal(environment.AP_REVOCATION_JOURNAL_SECRET, 'synthetic-own-journal-secret');
  assert.equal(environment.FIELD_REVOCATION_JOURNAL_SECRET, undefined);
  assert.equal(environment.AP_PROFILE, 'mock');
  assert.equal(environment.PATH, '/bin');
  assert.equal(environment.AP_FIELD_CLIENT_SECRET, undefined);
  assert.equal(environment.AP_OPENAI_API_KEY, undefined);
  assert.equal(environment.FIELD_DATABASE_URL, undefined);
  assert.deepEqual(oppositePorts('agent'), [4321, 3002, 55432, 56332]);
});

test('independent Field child drops AP connector and fails without own secret', () => {
  assert.throws(() => isolatedApiEnvironment('field', {
    FIELD_DATABASE_URL: 'postgresql://own', FIELD_AUTH_BASE_URL: 'http://127.0.0.1:4321',
  }), /FIELD_AUTH_SECRET/);
  const environment = isolatedApiEnvironment('field', {
    FIELD_DATABASE_URL: 'postgresql://own', FIELD_AUTH_SECRET: 'own-secret',
    FIELD_AUTH_BASE_URL: 'http://127.0.0.1:4321', FIELD_VALKEY_URL: 'valkey://own',
    FIELD_AP_CLIENT_SECRET: 'connector-secret', AP_DATABASE_URL: 'postgresql://other',
  });
  assert.equal(environment.FIELD_VALKEY_URL, 'valkey://own');
  assert.equal(environment.FIELD_AP_CLIENT_SECRET, undefined);
  assert.equal(environment.AP_DATABASE_URL, undefined);
  assert.deepEqual(oppositePorts('field'), [4311, 3001, 55431]);
});
