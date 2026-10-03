import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAbsolute, resolve } from 'node:path';
import { assertProductionProfile } from '../src/production-profile.js';
import { journalDirectoryFromEnvironment } from '../src/revocation-journal.js';

test('production requires FIELD_PROFILE to be exactly live', () => {
  assert.doesNotThrow(() => assertProductionProfile({ NODE_ENV: 'production', FIELD_PROFILE: 'live' }));
  // 누락·mock·sandbox·대소문자/공백 오타는 모두 거부한다.
  for (const FIELD_PROFILE of [undefined, '', 'mock', 'sandbox', 'Live', 'live ', 'prod'])
    assert.throws(() => assertProductionProfile({ NODE_ENV: 'production', FIELD_PROFILE }), /FIELD_PROFILE must be "live" in production/);
});

test('non-production profiles are not restricted by the production guard', () => {
  for (const FIELD_PROFILE of [undefined, 'mock', 'sandbox', 'live'])
    for (const NODE_ENV of [undefined, 'development', 'test'])
      assert.doesNotThrow(() => assertProductionProfile({ NODE_ENV, FIELD_PROFILE }));
});

// 원장 디렉터리는 절대 경로로 고정한다. 상대 경로는 mock에서만 현재 위치 기준 절대 경로로 바꾸고, 그 밖의 프로필은 기동을 멈춘다.
test('journal directories resolve to absolute paths and relative paths are refused outside mock', () => {
  const saved = { profile: process.env.FIELD_PROFILE, directory: process.env.FIELD_RETENTION_JOURNAL_DIRECTORY };
  try {
    delete process.env.FIELD_RETENTION_JOURNAL_DIRECTORY;
    assert.equal(journalDirectoryFromEnvironment('FIELD_RETENTION_JOURNAL_DIRECTORY'), undefined);
    process.env.FIELD_RETENTION_JOURNAL_DIRECTORY = '/var/lib/fieldai/field/retention-journal';
    for (const profile of ['mock', 'sandbox', 'live']) {
      process.env.FIELD_PROFILE = profile;
      assert.equal(journalDirectoryFromEnvironment('FIELD_RETENTION_JOURNAL_DIRECTORY'), '/var/lib/fieldai/field/retention-journal');
    }
    process.env.FIELD_RETENTION_JOURNAL_DIRECTORY = 'infra/field/retention-journal';
    process.env.FIELD_PROFILE = 'mock';
    const resolved = journalDirectoryFromEnvironment('FIELD_RETENTION_JOURNAL_DIRECTORY')!;
    assert.ok(isAbsolute(resolved));
    assert.equal(resolved, resolve('infra/field/retention-journal'));
    for (const profile of ['sandbox', 'live']) {
      process.env.FIELD_PROFILE = profile;
      assert.throws(() => journalDirectoryFromEnvironment('FIELD_RETENTION_JOURNAL_DIRECTORY'), /must be an absolute path/);
    }
  } finally {
    if (saved.profile === undefined) delete process.env.FIELD_PROFILE; else process.env.FIELD_PROFILE = saved.profile;
    if (saved.directory === undefined) delete process.env.FIELD_RETENTION_JOURNAL_DIRECTORY;
    else process.env.FIELD_RETENTION_JOURNAL_DIRECTORY = saved.directory;
  }
});
