export type Service = {
  id: string;
  name: string;
  description: string;
  bookingMode: "request" | "slot";
  durationMinutes: number;
  priceAmount: number | null;
};
export type DraftService = Omit<Service, "bookingMode"> & { bookingMode: Service["bookingMode"] | "inherit" };
export type Faq = { question: string; answer: string };
export type Catalog = {
  organizationId: string;
  revision: number;
  businessName: string;
  industry?: string;
  introduction: string;
  region: string;
  openingHours: string;
  contactPhone: string;
  defaultBookingMode?: "request" | "slot";
  services: Service[];
  faqs: Faq[];
};
export type DraftCatalog = Omit<Catalog, "services" | "defaultBookingMode"> & {
  defaultBookingMode: "request" | "slot";
  services: DraftService[];
};
export type FallbackInput = { origin: "ap_customer_reported"; actionRequestId?: string };
export type RequestFallback = { origin: "ap_customer_reported"; actionRequestId: string | null; declaredAt: string };
export type FallbackCandidate = { externalRequestId: string; kind: "inquiry" | "reservation_request";
  reservationId: string | null; state: string; serviceName: string; receivedAt: string };
export type FallbackReview = { candidates: FallbackCandidate[]; hasMore: boolean };
export type ReceivedWorkRecord = { receivedAt: string;
  source: { provider: string; connectionId: string; actionRequestId: string };
  purpose: 'inquiry_reply' | 'reservation_fulfillment' | null;
  consent: { recordId: string; confirmedAt: string; version: string | null; items: string[] | null };
  retention: { policyVersion: string; state: 'proposed' | 'approved';
    startsAfter: 'field_work_closed'; workDays: number; photoDays: number } | null };
export type Inquiry = {
  id: string;
  state: string;
  revision?: number;
  organizationId?: string;
  businessName?: string;
  isTest?: boolean;
  testSiteRevision?: number | null;
  customerName: string;
  customerPhone?: string;
  visitRegion?: string | null;
  fallback?: RequestFallback | null;
  fallbackReview?: FallbackReview;
  service: Service;
  messages: { id: string; sender: "customer" | "owner"; visibility: "customer" | "internal";
    body: string; delivery_state: string }[];
  attachments: { id: string; messageId: string; contentType: "image/webp";
    byteSize: number; width: number; height: number; createdAt: string }[];
};
export type BookingPolicy = {
  revision: number; timezone: string; weekly: Record<string, { open: string; close: string }>;
  closedDates: string[]; specialDates: Record<string, { open: string; close: string }>;
  beforeMinutes: number; afterMinutes: number; minLeadMinutes: number; horizonDays: number;
};
export type Reservation = {
  id: string; organizationId: string; catalogRevision: number; service: Service;
  businessName?: string;
  fallback?: RequestFallback | null;
  fallbackReview?: FallbackReview;
  receivedRecord?: ReceivedWorkRecord | null;
  bookingMode: "request" | "slot"; name: string; phone: string;
  preferredTimeText: string | null; requestMessage: string | null; visitRegion: string | null;
  requestedStartAt: string | null;
  confirmedStartAt: string | null; confirmedEndAt: string | null;
  proposalStartAt: string | null; proposalEndAt: string | null; proposalAcceptedAt: string | null;
  changePreferredText: string | null; source: "public" | "owner_manual" | "external_ap";
  timezone: string; state: string; revision: number; createdAt: string;
  attachments?: { id: string; contentType: "image/webp"; byteSize: number;
    width: number; height: number; createdAt: string }[];
  messages?: { id: string; sender: "customer" | "owner"; body: string;
    createdAt: string; notificationState: string | null }[];
  events?: { revision: number; actorType: "customer" | "owner"; eventType: string;
    previousState: string | null; nextState: string; detail: Record<string, unknown>; occurredAt: string }[];
};
export type ReservationListPage = { reservations: Reservation[]; nextCursor?: string | null };
export type ReservationEventDelivery = {
  eventId: string; revision: number; eventType: string; reservationState: string; occurredAt: string;
  deliveryState: string; attempts: number; acknowledgedAt: string | null;
  lastHttpStatus: number | null; lastError: string | null;
  apState: string; apReceiptState: string | null; apProcessedAt: string | null;
  customerNotificationState: string | null; customerReadState: string | null;
};
export type ReservationEventDeliveries = {
  reservationId: string; hasEarlierEvents: boolean; events: ReservationEventDelivery[];
};
export type ManualReservationContacts = {
  reservationId: string; connectionStatus: string;
  contacts: { id: string; eventId: string; method: "phone" | "in_person";
    outcome: "attempted" | "reached"; recordedAt: string }[];
};

export async function requestJson(path: string, method = "GET", body?: unknown, receiptKey?: string,
  extraHeaders?: Record<string, string>) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(receiptKey ? { authorization: `Bearer ${receiptKey}` } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
