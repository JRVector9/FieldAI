const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ListKind = 'inquiry' | 'external_request';

export function decodeOwnerListCursor(value: unknown, organizationId: string, kind: ListKind):
  { timestamp: string; id: string } | null {
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const cursor = parsed as Record<string, unknown>;
    const timestamp = cursor.timestamp;
    if (cursor.organizationId !== organizationId || cursor.kind !== kind
      || typeof cursor.id !== 'string' || !uuid.test(cursor.id)
      || typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(timestamp))
      return null;
    const instant = new Date(timestamp);
    if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 19) !== timestamp.slice(0, 19))
      return null;
    return { timestamp, id: cursor.id };
  } catch { return null; }
}

export function encodeOwnerListCursor(organizationId: string, kind: ListKind,
  timestamp: string, id: string): string {
  return Buffer.from(JSON.stringify({ organizationId, kind, timestamp, id })).toString('base64url');
}
