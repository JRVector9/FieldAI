import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCoverage } from './test/integrator-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(resolve(tmpdir(), 'fieldai-contract-coverage-'));
function run(args, environment = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: environment, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0) throw new Error(`contract command failed (${result.signal ?? result.status}): ${args.join(' ')}`);
}
try {
  // Unit samples exercise validation itself; only actual DB/API children can issue coverage receipts.
  const staticEnvironment = { ...process.env };
  delete staticEnvironment.INTEGRATOR_CONTRACT_COVERAGE_DIRECTORY;
  run(['--test', 'tools/test/agent-integrator-contract.test.mjs', 'tools/test/field-integrator-contract.test.mjs'], staticEnvironment);
  const environment = { ...process.env, INTEGRATOR_CONTRACT_COVERAGE_DIRECTORY: directory };
  // Preserve the existing consumer/lifecycle suites and add real HTTP installation writes.
  run(['tools/run-db-suite.mjs', 'agent', 'test/integrator.db.test.ts', 'test/integrator-public-write.db.test.ts',
    'test/field-connection.db.test.ts', 'test/field-actions.db.test.ts', 'test/field-customer-decisions.db.test.ts',
    'test/revocation-restore.db.test.ts'], environment);
  run(['tools/run-db-suite.mjs', 'field', 'test/integrator.db.test.ts', 'test/ap-connection.db.test.ts',
    'test/revocation-restore.db.test.ts'], environment);
  const receipts = readdirSync(directory).filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(resolve(directory, name), 'utf8')));
  const count = assertCoverage(receipts);
  process.stdout.write(`OpenAPI: ${count}/${count} declared success status/media responses verified against actual API bytes\n`);
  rmSync(directory, { recursive: true });
} catch (error) {
  process.stderr.write(`${String(error)}\nSynthetic contract coverage receipts preserved at ${directory}\n`);
  process.exitCode = 1;
}
