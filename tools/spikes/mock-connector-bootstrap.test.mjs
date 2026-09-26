import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client } from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const value = (content, key) => content.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1];

function runSetup(temporary, name) {
  const result = spawnSync(process.execPath, [join(root, 'tools', name)], {
    cwd: temporary, encoding: 'utf8', timeout: 30_000,
    env: Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].filter(key => process.env[key])
      .map(key => [key, process.env[key]])),
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
}

async function removeSyntheticClient(databaseUrl, clientId, expectedName) {
  if (!clientId) return;
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const result = await db.query(`select "userId",name from "oauthClient"
      where "clientId" = $1`, [clientId]);
    const client = result.rows[0];
    if (!client) return;
    assert.equal(client.name, expectedName);
    assert.ok(client.userId);
    const deleted = await db.query('delete from "user" where id = $1 returning id', [client.userId]);
    assert.equal(deleted.rowCount, 1);
    const remaining = await db.query('select 1 from "oauthClient" where "clientId" = $1', [clientId]);
    assert.equal(remaining.rowCount, 0);
  } finally { await db.end(); }
}

test('fresh local OAuth clients register through both product APIs', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'fieldai-connectors-'));
  const agentSource = readFileSync(join(root, 'infra/agent/.env'), 'utf8');
  const fieldSource = readFileSync(join(root, 'infra/field/.env'), 'utf8');
  const agentEnv = agentSource.split('\n').filter(line => !line.startsWith('AP_FIELD_')).join('\n');
  const fieldEnv = fieldSource.split('\n').filter(line => !line.startsWith('FIELD_AP_')).join('\n');
  const agentPath = join(temporary, 'infra/agent/.env');
  const fieldPath = join(temporary, 'infra/field/.env');
  let apClientId;
  let fieldClientId;
  try {
    mkdirSync(dirname(agentPath), { recursive: true });
    mkdirSync(dirname(fieldPath), { recursive: true });
    writeFileSync(agentPath, agentEnv, { mode: 0o600 });
    writeFileSync(fieldPath, fieldEnv, { mode: 0o600 });
    runSetup(temporary, 'setup-mock-ap-connector.mjs');
    apClientId = value(readFileSync(fieldPath, 'utf8'), 'FIELD_AP_CLIENT_ID');
    assert.ok(apClientId);
    runSetup(temporary, 'setup-mock-field-connector.mjs');
    fieldClientId = value(readFileSync(agentPath, 'utf8'), 'AP_FIELD_CLIENT_ID');
    assert.ok(fieldClientId);
    assert.equal(value(readFileSync(fieldPath, 'utf8'), 'FIELD_AP_REVERSE_CLIENT_ID'), fieldClientId);
    assert.ok(value(readFileSync(fieldPath, 'utf8'), 'FIELD_AP_CLIENT_SECRET'));
    assert.ok(value(readFileSync(agentPath, 'utf8'), 'AP_FIELD_CLIENT_SECRET'));
  } finally {
    try {
      await Promise.all([
        removeSyntheticClient(value(agentSource, 'AP_DATABASE_URL'), apClientId,
          'Local Field BFF connector'),
        removeSyntheticClient(value(fieldSource, 'FIELD_DATABASE_URL'), fieldClientId,
          'Local AP BFF connector'),
      ]);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
});
