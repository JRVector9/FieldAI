export type PendingPublicSubmission = {
  path: string;
  destination?: 'field';
  photoSelected?: boolean;
  fingerprint: string;
  idempotencyKey: string;
  receiptKey: string;
  createdAt: number;
};

const prefix = 'fieldai:ap:pending-public:';
const lifetimeMs = 60 * 60 * 1000;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const pathPattern = /^\/v1\/(?:public\/organizations\/[0-9a-f-]{36}\/inquiries|conversations\/[0-9a-f-]{36}\/submissions)$/i;

export async function publicSubmissionFingerprint(value: unknown): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readPendingPublicSubmission(scope: string): PendingPublicSubmission | null {
  try {
    const raw = sessionStorage.getItem(prefix + scope);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingPublicSubmission;
    if (!value || !pathPattern.test(value.path)
      || (value.destination !== undefined && value.destination !== 'field')
      || (value.photoSelected !== undefined && typeof value.photoSelected !== 'boolean')
      || !/^[0-9a-f]{64}$/.test(value.fingerprint)
      || !keyPattern.test(value.idempotencyKey) || !keyPattern.test(value.receiptKey)
      || !Number.isSafeInteger(value.createdAt) || value.createdAt > Date.now() + 60_000
      || Date.now() - value.createdAt > lifetimeMs) {
      sessionStorage.removeItem(prefix + scope);
      return null;
    }
    return value;
  } catch {
    try { sessionStorage.removeItem(prefix + scope); } catch { /* Storage can be disabled. */ }
    return null;
  }
}

export function writePendingPublicSubmission(scope: string, attempt: PendingPublicSubmission): boolean {
  try { sessionStorage.setItem(prefix + scope, JSON.stringify(attempt)); return true; }
  catch { return false; }
}

export function clearPendingPublicSubmission(scope: string) {
  try { sessionStorage.removeItem(prefix + scope); } catch { /* Storage can be disabled. */ }
}
