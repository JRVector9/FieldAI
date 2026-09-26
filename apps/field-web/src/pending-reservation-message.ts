export type PendingReservationMessage = {
  reservationId: string;
  receiptKey: string;
  messageId: string;
  fingerprint: string;
  createdAt: number;
};

const prefix = 'fieldai:field:pending-reservation-message:';
const lifetimeMs = 60 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const receipt = /^[A-Za-z0-9_-]{43}$/;

export function readPendingReservationMessage(reservationId: string): PendingReservationMessage | null {
  if (!uuid.test(reservationId)) return null;
  try {
    const raw = sessionStorage.getItem(prefix + reservationId);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingReservationMessage;
    if (!value || value.reservationId !== reservationId || !receipt.test(value.receiptKey)
      || !uuid.test(value.messageId) || !/^[0-9a-f]{64}$/.test(value.fingerprint)
      || !Number.isSafeInteger(value.createdAt) || value.createdAt > Date.now() + 60_000
      || Date.now() - value.createdAt > lifetimeMs) {
      sessionStorage.removeItem(prefix + reservationId);
      return null;
    }
    return value;
  } catch {
    try { sessionStorage.removeItem(prefix + reservationId); } catch { /* Storage can be disabled. */ }
    return null;
  }
}

export function writePendingReservationMessage(attempt: PendingReservationMessage): boolean {
  try { sessionStorage.setItem(prefix + attempt.reservationId, JSON.stringify(attempt)); return true; }
  catch { return false; }
}

export function clearPendingReservationMessage(reservationId: string) {
  try { sessionStorage.removeItem(prefix + reservationId); } catch { /* Storage can be disabled. */ }
}
