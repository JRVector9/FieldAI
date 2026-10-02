import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertProductionProfile } from '../src/production-profile.js';

test('AP production boot requires exactly the live profile', () => {
  for (const profile of [undefined, '', 'mock', 'sandbox', 'Live', 'live ', 'prod'])
    assert.throws(() => assertProductionProfile({ NODE_ENV: 'production', AP_PROFILE: profile }), /AP_PROFILE must be live in production/);
  assert.doesNotThrow(() => assertProductionProfile({ NODE_ENV: 'production', AP_PROFILE: 'live' }));
});

test('AP non-production profile selection is unchanged by the production guard', () => {
  for (const profile of [undefined, 'mock', 'sandbox', 'live'])
    for (const nodeEnv of [undefined, 'development', 'test'])
      assert.doesNotThrow(() => assertProductionProfile({ NODE_ENV: nodeEnv, AP_PROFILE: profile }));
});
