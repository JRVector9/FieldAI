import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';

export function normalizeCustomHostname(value: unknown, baseDomain = process.env.FIELD_SITE_BASE_DOMAIN): string | null {
  if (typeof value !== 'string' || value.length > 253 || !/^[a-zA-Z0-9.-]+$/.test(value)) return null;
  const hostname = value.toLowerCase();
  const labels = hostname.split('.');
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    || !/^[a-z]{2,63}$|^xn--[a-z0-9-]+$/.test(labels.at(-1)!) || isIP(hostname)
    || /(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/.test(hostname)
    || baseDomain && (hostname === baseDomain.toLowerCase() || hostname.endsWith(`.${baseDomain.toLowerCase()}`))) return null;
  return hostname;
}

type ResolverPort = Pick<Resolver, 'resolveTxt' | 'resolveCname'> & {
  resolve4: (hostname: string) => Promise<string[]>;
  resolve6: (hostname: string) => Promise<string[]>;
};
export type DomainDnsInspector = { inspect: (hostname: string, token: string) => Promise<{ ownership: boolean; routing: boolean }> };

function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a! < 224
      && !(a === 100 && b! >= 64 && b! <= 127) && !(a === 169 && b === 254)
      && !(a === 172 && b! >= 16 && b! <= 31) && !(a === 192 && (b === 168 || b === 0 || b === 2))
      && !(a === 198 && (b === 18 || b === 19 || b === 51 && c === 100))
      && !(a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
  return false;
}

export function createDomainDnsInspector(target: string, resolver: ResolverPort = new Resolver({ timeout: 3000, tries: 1 })): DomainDnsInspector {
  const expected = target.toLowerCase().replace(/\.$/, '');
  if (!normalizeCustomHostname(expected)) throw new Error('Field custom domain DNS target is invalid');
  const records = async <T>(read: () => Promise<T[]>) => {
    try { return await read(); } catch (error) {
      if (['ENODATA', 'ENOTFOUND'].includes((error as { code?: string }).code ?? '')) return [];
      throw error;
    }
  };
  return { async inspect(hostname, token) {
    const [txt, cname, ipv4, ipv6] = await Promise.all([
      records(() => resolver.resolveTxt(`_field-site.${hostname}`)),
      records(() => resolver.resolveCname(hostname)),
      records(() => resolver.resolve4(hostname)), records(() => resolver.resolve6(hostname)),
    ]);
    const addresses = [...ipv4, ...ipv6];
    return { ownership: txt.some(parts => parts.join('') === `field-domain=${token}`),
      routing: cname.length === 1 && cname[0]!.toLowerCase().replace(/\.$/, '') === expected
        && addresses.length > 0 && addresses.every(publicAddress) };
  } };
}
