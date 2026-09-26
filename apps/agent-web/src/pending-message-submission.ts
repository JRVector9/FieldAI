export type PendingMessageSubmission = {
  inquiryId: string;
  receiptKey: string;
  idempotencyKey: string;
  fingerprint: string;
  createdAt: number;
};

const prefix = 'fieldai:ap:pending-message:';
const lifetimeMs = 60 * 60 * 1000;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function messageSubmissionFingerprint(value: unknown): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readPendingMessageSubmission(inquiryId: string): PendingMessageSubmission | null {
  if (!idPattern.test(inquiryId)) return null;
  try {
    const raw = sessionStorage.getItem(prefix + inquiryId);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingMessageSubmission;
    if (!value || value.inquiryId !== inquiryId || !keyPattern.test(value.receiptKey)
      || !keyPattern.test(value.idempotencyKey) || !/^[0-9a-f]{64}$/.test(value.fingerprint)
      || !Number.isSafeInteger(value.createdAt) || value.createdAt > Date.now() + 60_000
      || Date.now() - value.createdAt > lifetimeMs) {
      sessionStorage.removeItem(prefix + inquiryId);
      return null;
    }
    return value;
  } catch {
    try { sessionStorage.removeItem(prefix + inquiryId); } catch { /* Storage can be disabled. */ }
    return null;
  }
}

export function writePendingMessageSubmission(attempt: PendingMessageSubmission): boolean {
  try { sessionStorage.setItem(prefix + attempt.inquiryId, JSON.stringify(attempt)); return true; }
  catch { return false; }
}

export function clearPendingMessageSubmission(inquiryId: string) {
  try { sessionStorage.removeItem(prefix + inquiryId); } catch { /* Storage can be disabled. */ }
}
