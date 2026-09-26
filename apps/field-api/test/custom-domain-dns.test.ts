import assert from 'node:assert/strict';
import { test } from 'node:test';

test('custom domain normalization rejects platform hosts, private IPs, paths and wildcard hosts', async () => {
  const module = await import('../src/custom-domain-dns.js').catch(() => null);
  assert.ok(module, 'custom domain validation is not implemented');
  assert.equal(module.normalizeCustomHostname('SHOP.Example.COM', 'sites.platform.test'), 'shop.example.com');
  for (const value of ['127.0.0.1', '[::1]', 'localhost', 'shop.localhost', 'shop.example.com:443',
    '*.example.com', 'https://shop.example.com', 'shop.example.com/path', 'shop.example.com.',
    'field-012345abcdef.sites.platform.test', 'sites.platform.test', 'bad..example.com']) {
    assert.equal(module.normalizeCustomHostname(value, 'sites.platform.test'), null, value);
  }
});

test('DNS resolver requires exact ownership TXT and configured edge CNAME with public addresses', async () => {
  const module = await import('../src/custom-domain-dns.js').catch(() => null);
  assert.ok(module, 'custom domain DNS inspection is not implemented');
  const replies = { txt: [['field-domain=', 'synthetic-token']], cname: ['edge.platform.example.com'],
    addresses: ['93.184.216.34'] };
  const dns = module.createDomainDnsInspector('edge.platform.example.com', {
    resolveTxt: async () => replies.txt,
    resolveCname: async () => replies.cname,
    resolve4: async () => replies.addresses,
    resolve6: async () => [],
  });
  assert.deepEqual(await dns.inspect('shop.example.com', 'synthetic-token'), { ownership: true, routing: true });
  replies.txt = [['field-domain=other']];
  assert.deepEqual(await dns.inspect('shop.example.com', 'synthetic-token'), { ownership: false, routing: true });
  replies.cname = ['attacker.example'];
  assert.deepEqual(await dns.inspect('shop.example.com', 'synthetic-token'), { ownership: false, routing: false });
  replies.txt = [['field-domain=synthetic-token']];
  replies.cname = ['edge.platform.example.com'];
  replies.addresses = ['10.0.0.1'];
  assert.deepEqual(await dns.inspect('shop.example.com', 'synthetic-token'), { ownership: true, routing: false });
});
