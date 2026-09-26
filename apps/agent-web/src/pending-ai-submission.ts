export type PendingAiSubmission = {
  engagementId: string;
  idempotencyKey: string;
  fingerprint: string;
  createdAt: number;
};

const prefix = 'fieldai:ap:pending-ai:';
const lifetimeMs = 60 * 60 * 1000;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function aiQuestionFingerprint(question: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(question));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readPendingAiSubmission(scope: string): PendingAiSubmission | null {
  try {
    const raw = sessionStorage.getItem(prefix + scope);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingAiSubmission;
    if (!value || !idPattern.test(value.engagementId) || !keyPattern.test(value.idempotencyKey)
      || !/^[a-f0-9]{64}$/.test(value.fingerprint)
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

export function writePendingAiSubmission(scope: string, attempt: PendingAiSubmission): boolean {
  try { sessionStorage.setItem(prefix + scope, JSON.stringify(attempt)); return true; }
  catch { return false; }
}

export function clearPendingAiSubmission(scope: string) {
  try { sessionStorage.removeItem(prefix + scope); } catch { /* Storage can be disabled. */ }
}
