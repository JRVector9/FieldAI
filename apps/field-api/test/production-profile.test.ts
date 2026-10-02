import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertProductionProfile } from '../src/production-profile.js';

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
