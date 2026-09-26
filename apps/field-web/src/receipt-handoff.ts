type ReceiptKind = "inquiry" | "reservation";
type Handoff = { kind: ReceiptKind; id: string; key: string; createdAt: number };
const storageKey = "field.receipt-handoff";
const maxAgeMs = 2 * 60 * 1000;

export function writeReceiptHandoff(kind: ReceiptKind, id: string, key: string) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ kind, id, key, createdAt: Date.now() } satisfies Handoff));
  } catch { /* The visible key remains available for manual entry. */ }
}

export function consumeReceiptHandoff(kind: ReceiptKind, id: string): string | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    sessionStorage.removeItem(storageKey);
    const handoff = JSON.parse(raw) as Partial<Handoff>;
    if (handoff.kind !== kind || handoff.id !== id || typeof handoff.key !== "string"
      || !handoff.key || typeof handoff.createdAt !== "number"
      || Date.now() - handoff.createdAt > maxAgeMs || handoff.createdAt > Date.now()) return null;
    return handoff.key;
  } catch { return null; }
}
