import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { adminOperation, assertSupportedPlatform, createSuiteSignalGuard, finishSuite, hasActiveGroup, run, selectSuiteTests } from '../run-db-suite.mjs';

const posixTest = process.platform === 'win32' ? test.skip : test;

test('targeted DB suite accepts only existing test files in its own product directory', () => {
  const available = ['integrator.db.test.ts', 'field-connection.db.test.ts'];
  assert.deepEqual(selectSuiteTests(available, []), ['test/field-connection.db.test.ts', 'test/integrator.db.test.ts']);
  assert.deepEqual(selectSuiteTests(available, ['test/integrator.db.test.ts']), ['test/integrator.db.test.ts']);
  assert.throws(() => selectSuiteTests(available, ['../field-api/test/integrator.db.test.ts']), /unknown database test/);
  assert.throws(() => selectSuiteTests(available, ['test/missing.db.test.ts']), /unknown database test/);
  assert.throws(() => selectSuiteTests(available, ['test/integrator.db.test.ts', 'test/integrator.db.test.ts']), /duplicate database test/);
});

test('DB suite refuses unsupported platforms before any database work', () => {
  assert.throws(() => assertSupportedPlatform('win32'), /requires macOS or Linux/);
  assert.doesNotThrow(() => assertSupportedPlatform('darwin'));
  assert.doesNotThrow(() => assertSupportedPlatform('linux'));
});

test('stalled admin operation is bounded and disconnects before deferred interruption exits', async () => {
  let destroyed = false;
  const admin = { connection: { stream: { destroy() { destroyed = true; } } } };
  const guard = createSuiteSignalGuard();
  try {
    const pending = adminOperation(admin, 'create database', () => new Promise(() => {}), 25);
    process.emit('SIGTERM');
    await assert.rejects(pending, /create database timed out/);
    assert.equal(destroyed, true);
    assert.throws(() => guard.check(), error => error.exitCode === 143);
  } finally { guard.close(); }
});

for (const [signal, operation, exitCode] of [
  ['SIGINT', 'create database', 130],
  ['SIGTERM', 'drop database', 143],
]) {
  test(`${signal} retains its exit code when ${operation} fails during cleanup`, () => {
    const guard = createSuiteSignalGuard();
    process.emit(signal);
    assert.throws(() => finishSuite(guard, new Error(`${operation} timed out`)), error =>
      error.exitCode === exitCode && error.message.includes(`${operation} timed out`));
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`${signal} is deferred across suite cleanup and stops the next file`, async () => {
    const guard = createSuiteSignalGuard();
    let cleaned = false;
    let nextStarted = false;
    try {
      process.emit(signal);
      try { await new Promise(resolveWait => setTimeout(resolveWait, 10)); }
      finally { cleaned = true; }
      guard.check();
      nextStarted = true;
    } catch (error) {
      assert.equal(error.interrupted, true);
      assert.equal(error.exitCode, signal === 'SIGINT' ? 130 : 143);
    } finally { guard.close(); }
    assert.equal(cleaned, true);
    assert.equal(nextStarted, false);
  });
}

test('zombie-only process groups have no active child work', () => {
  assert.equal(hasActiveGroup(' 42 Z\n 42 Z+\n', 42), false);
  assert.equal(hasActiveGroup(' 42 Z\n 42 S\n', 42), true);
  assert.equal(hasActiveGroup(' 41 S\n', 42), false);
});

posixTest('an unknown process-group probe preserves its database', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'db-suite-probe-test-'));
  const probe = resolve(directory, 'ps');
  writeFileSync(probe, '#!/bin/sh\nexit 2\n');
  chmodSync(probe, 0o755);
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = `${directory}:${previousPath}`;
    await assert.rejects(run(process.execPath, ['-e', ''], process.env, 1000),
    error => error.preserveDatabase === true && /cannot inspect child process group/.test(error.message));
  } finally {
    process.env.PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});

posixTest('timeout waits for the spawned test descendant to stop before returning', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'db-suite-process-test-'));
  const started = resolve(directory, 'started');
  const stopped = resolve(directory, 'stopped');
  const descendant = `
    const fs = require('node:fs');
    fs.writeFileSync(process.env.STARTED, 'started');
    process.on('SIGTERM', () => setTimeout(() => {
      fs.writeFileSync(process.env.STOPPED, 'stopped');
      process.exit(0);
    }, 100));
    setInterval(() => {}, 1000);
  `;
  const parent = `
    const { spawn } = require('node:child_process');
    spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'inherit' });
    setInterval(() => {}, 1000);
  `;
  try {
    await assert.rejects(run(process.execPath, ['-e', parent],
      { ...process.env, STARTED: started, STOPPED: stopped }, 3000), /timed out/);
    assert.equal(existsSync(started), true);
    assert.equal(readFileSync(stopped, 'utf8'), 'stopped');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

posixTest('timeout kills a descendant that ignores graceful termination', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'db-suite-force-test-'));
  const started = resolve(directory, 'started');
  const descendant = `
    const fs = require('node:fs');
    fs.writeFileSync(process.env.STARTED, String(process.pid));
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
  `;
  const parent = `
    const { spawn } = require('node:child_process');
    spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'inherit' });
    setInterval(() => {}, 1000);
  `;
  try {
    await assert.rejects(run(process.execPath, ['-e', parent],
      { ...process.env, STARTED: started }, 3000), /timed out/);
    assert.equal(existsSync(started), true);
    const pid = Number(readFileSync(started, 'utf8'));
    const probe = spawnSync('ps', ['-A', '-o', 'pid=,stat='], { encoding: 'utf8' });
    assert.equal(probe.status, 0);
    const state = probe.stdout.split('\n').map(line => line.trim().split(/\s+/))
      .find(([listedPid]) => Number(listedPid) === pid)?.[1];
    assert.ok(!state || state.startsWith('Z'), `descendant is still active: ${state}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  posixTest(`${signal} waits for the active child group and reports interruption`, async () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'db-suite-interrupt-test-'));
    const started = resolve(directory, 'started');
    const stopped = resolve(directory, 'stopped');
    const descendant = `
      const fs = require('node:fs');
      fs.writeFileSync(process.env.STARTED, 'started');
      process.on('SIGTERM', () => setTimeout(() => {
        fs.writeFileSync(process.env.STOPPED, 'stopped');
        process.exit(0);
      }, 100));
      setInterval(() => {}, 1000);
    `;
    const parent = `
      const { spawn } = require('node:child_process');
      spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'inherit' });
      setInterval(() => {}, 1000);
    `;
    try {
      const running = run(process.execPath, ['-e', parent],
        { ...process.env, STARTED: started, STOPPED: stopped }, 3000);
      const deadline = Date.now() + 2000;
      while (!existsSync(started) && Date.now() < deadline)
        await new Promise(resolveWait => setTimeout(resolveWait, 10));
      assert.equal(existsSync(started), true);
      process.emit(signal);
      await assert.rejects(running, /interrupted/);
      assert.equal(readFileSync(stopped, 'utf8'), 'stopped');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
