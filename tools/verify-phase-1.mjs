import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const commands = [
  ['install', '--frozen-lockfile'],
  ['lint'],
  ['typecheck'],
  ['test:unit'],
  ['build:agent'],
  ['build:field'],
  ['test:spike:imports'],
  ['test:spike:db:isolation'],
  ['test:spike:db:field'],
  ['test:spike:oauth:agent'],
  ['test:spike:oauth:field'],
  ['test:spike:oauth:issuers'],
  ['test:spike:embed:agent'],
  ['test:spike:conversation:agent'],
];

const report = {
  scope: 'local_mock_partial_spikes_only',
  startedAt: new Date().toISOString(),
  nodeVersion: process.version,
  commit: existsSync(resolve('.git')) ? spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim() : null,
  commands: [],
  notCovered: [
    'AP-only and Field-only tests with the other database stopped',
    'official contract, independence, faults, E2E, security and release gates',
    'external providers and production behavior',
  ],
};

for (const args of commands) {
  const started = Date.now();
  const result = spawnSync('pnpm', args, {
    cwd: resolve('.'),
    stdio: 'inherit',
    timeout: 600_000,
  });
  const item = {
    command: `pnpm ${args.join(' ')}`,
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - started,
  };
  report.commands.push(item);
  if (result.error || result.status !== 0) {
    report.status = 'failed';
    report.error = result.error?.message ?? null;
    break;
  }
}

report.finishedAt = new Date().toISOString();
report.status ??= 'passed';
report.notRun = commands.slice(report.commands.length).map((args) => `pnpm ${args.join(' ')}`);
writeFileSync(resolve('quality_checks/phase_1_execution.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Phase 1 partial verifier: ${report.status}; ${report.commands.length}/${commands.length} commands executed\n`);
if (report.status !== 'passed') process.exitCode = 1;
