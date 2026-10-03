import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ipLimitBucket } from '../src/ip-bucket.js';

// Security #4: IP 한도 키. IPv4·IPv4-mapped는 그대로, IPv6는 /64로 묶는다(주소만 바꿔 한도를 늘리지 못하게).
test('IP limit buckets keep IPv4 and group IPv6 addresses by /64', () => {
  assert.equal(ipLimitBucket('203.0.113.7'), '203.0.113.7');
  assert.equal(ipLimitBucket('::ffff:203.0.113.7'), '203.0.113.7');
  for (const address of ['2001:db8:1:2:3:4:5:6', '2001:0db8:0001:0002::1', '2001:DB8:1:2:ffff::', '2001:db8:1:2::ffff:1.2.3.4'])
    assert.equal(ipLimitBucket(address), '2001:db8:1:2::/64', address);
  assert.notEqual(ipLimitBucket('2001:db8:1:3::1'), ipLimitBucket('2001:db8:1:2::1'));
  assert.equal(ipLimitBucket('2001:db8::'), '2001:db8:0:0::/64');
  assert.equal(ipLimitBucket('fe80::1%en0'), 'fe80:0:0:0::/64');
  assert.equal(ipLimitBucket('not-an-ip'), 'not-an-ip');
});
