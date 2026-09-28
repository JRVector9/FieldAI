import assert from "node:assert/strict";
import test from "node:test";
import { ownerReservationDeliveryNotice, reservationMessageNotificationLabel } from "../src/booking-notification-state";

test("direct reservation ACK never treats pending as a failed provider send", () => {
  const notice = ownerReservationDeliveryNotice("pending");
  assert.match(notice, /발송 결과.*확인/);
  assert.doesNotMatch(notice, /미발송|공급사 미연결|발송 완료/);
});

test("settled unavailable delivery and no-notification actions remain distinct", () => {
  assert.match(ownerReservationDeliveryNotice("blocked_integration"), /미발송.*공급사/);
  assert.match(ownerReservationDeliveryNotice("not_applicable"), /자동 알림.*없/);
});

test("follow-up message shows its refreshed event state without a fixed integration claim", () => {
  assert.match(reservationMessageNotificationLabel("blocked_integration"), /미발송/);
  assert.match(reservationMessageNotificationLabel("pending"), /결과.*확인/);
  assert.match(reservationMessageNotificationLabel("accepted"), /수신.*미확인/);
  assert.match(reservationMessageNotificationLabel("sent"), /발송 확인.*열람.*미확인/);
});
