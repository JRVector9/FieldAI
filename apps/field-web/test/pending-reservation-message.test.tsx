import assert from "node:assert/strict";
import test from "node:test";
import { clearPendingReservationMessage, readPendingReservationMessage,
  writePendingReservationMessage } from "../src/pending-reservation-message";

const reservationId = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";

test("pending reservation message survives reload only for its valid receipt and reservation", () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  try {
    const attempt = { reservationId, receiptKey: "a".repeat(43), messageId,
      fingerprint: "b".repeat(64), createdAt: Date.now() };
    assert.equal(writePendingReservationMessage(attempt), true);
    assert.deepEqual(readPendingReservationMessage(reservationId), attempt);
    assert.equal(readPendingReservationMessage("33333333-3333-4333-8333-333333333333"), null);

    writePendingReservationMessage({ ...attempt, createdAt: Date.now() - 3_600_001 });
    assert.equal(readPendingReservationMessage(reservationId), null);
    assert.equal(values.size, 0);

    writePendingReservationMessage(attempt);
    clearPendingReservationMessage(reservationId);
    assert.equal(readPendingReservationMessage(reservationId), null);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "sessionStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
