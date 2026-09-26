import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client } from 'pg';

process.loadEnvFile(resolve('infra/agent/.env'));
process.loadEnvFile(resolve('infra/field/.env'));

const agent = new URL(process.env.AP_DATABASE_URL);
const field = new URL(process.env.FIELD_DATABASE_URL);

async function connect(url) {
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return { ok: true };
  } catch (error) {
    return { ok: false, code: error.code };
  } finally {
    await client.end().catch(() => undefined);
  }
}

assert.equal((await connect(agent)).ok, true, 'AP credential must access AP DB');
assert.equal((await connect(field)).ok, true, 'Field credential must access Field DB');

const agentAtField = new URL(field);
agentAtField.username = agent.username;
agentAtField.password = agent.password;
const fieldAtAgent = new URL(agent);
fieldAtAgent.username = field.username;
fieldAtAgent.password = field.password;

const deniedByField = await connect(agentAtField);
const deniedByAgent = await connect(fieldAtAgent);
assert.equal(deniedByField.ok, false, 'AP credential must not access Field DB');
assert.equal(deniedByAgent.ok, false, 'Field credential must not access AP DB');
assert.equal(deniedByField.code, '28P01');
assert.equal(deniedByAgent.code, '28P01');
process.stdout.write('Two own-DB connections succeeded; two cross-DB credential connections were denied (28P01).\n');
