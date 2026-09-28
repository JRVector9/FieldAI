import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createSuiteEnv } from '../run-db-suite.mjs';

test('Field suite loads its own env before cloning, forces mock, and removes AP settings', () => {
  const previous = { ...process.env };
  try {
    delete process.env.FIELD_AUTH_SECRET;
    process.env.FIELD_PROFILE = 'live';
    process.env.AP_DATABASE_URL = 'postgres://peer.invalid/peer';
    const env = createSuiteEnv('field');
    assert.ok(env.FIELD_AUTH_SECRET);
    assert.equal(env.FIELD_PROFILE, 'mock');
    assert.equal(env.AP_DATABASE_URL, undefined);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test('AP suite loads its own env before cloning, forces mock, and removes Field settings', () => {
  const previous = { ...process.env };
  try {
    delete process.env.AP_AUTH_SECRET;
    process.env.AP_PROFILE = 'live';
    process.env.FIELD_DATABASE_URL = 'postgres://peer.invalid/peer';
    const env = createSuiteEnv('agent');
    assert.ok(env.AP_AUTH_SECRET);
    assert.equal(env.AP_PROFILE, 'mock');
    assert.equal(env.FIELD_DATABASE_URL, undefined);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test('Field billing lifecycle fixture loads only its own product env file', () => {
  const source = readFileSync(resolve('apps/field-api/test/billing-lifecycle.db.test.ts'), 'utf8');
  assert.match(source, /process\.loadEnvFile\(resolve\('\.\.\/\.\.\/infra\/field\/\.env'\)\)/);
});
