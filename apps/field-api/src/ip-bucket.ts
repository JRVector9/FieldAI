import { isIPv6 } from 'node:net';

// 접속 IP 한도의 묶음 단위(Security #4). IPv6는 한 가입자가 /64 안의 주소를 마음대로 바꿀 수 있으므로 /64로 묶는다.
// IPv4·IPv4-mapped IPv6(::ffff:a.b.c.d)는 그대로 쓴다(기존 IPv4 창 키와 같다).
export function ipLimitBucket(ip: string): string {
  if (!isIPv6(ip)) return ip;
  const address = ip.split('%', 1)[0]!.toLowerCase();
  if (/^::ffff:\d{1,3}(\.\d{1,3}){3}$/.test(address)) return address.slice(7);
  const [head = '', tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = address.includes('::') ? (tail ? tail.split(':') : []) : [];
  // 끝에 IPv4 표기가 붙은 주소는 마지막 두 그룹을 차지하므로 /64 앞부분에는 영향이 없다.
  const groups = address.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length - (right.at(-1)?.includes('.') ? 1 : 0))).fill('0'), ...right]
    : left;
  return `${groups.slice(0, 4).map(group => (group || '0').replace(/^0+(?=.)/, '')).join(':')}::/64`;
}
