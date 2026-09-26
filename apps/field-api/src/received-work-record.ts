export type ReceivedWorkPolicy = {
  purpose: 'inquiry_reply' | 'reservation_fulfillment';
  consentVersion: 'transfer-v1'; consentItems: string[];
  retention: { policyVersion: string; state: 'proposed' | 'approved';
    startsAfter: 'field_work_closed'; workDays: number; photoDays: number };
};
export type ReceivedWorkRow = { provider: string; connection_id: string; action_request_id: string;
  consent_record_id: string; consent_confirmed_at: Date; received_at: Date;
  processing_policy: ReceivedWorkPolicy | null };

export function receivedWorkPolicy(kind: 'inquiry' | 'reservation_request', consentItems: string[]): ReceivedWorkPolicy {
  return { purpose: kind === 'inquiry' ? 'inquiry_reply' : 'reservation_fulfillment',
    consentVersion: 'transfer-v1', consentItems: [...consentItems],
    retention: { policyVersion: 'field-work-snapshot-v3.0-proposal', state: 'proposed',
      startsAfter: 'field_work_closed', workDays: 180, photoDays: 90 } };
}

export function receivedWorkRecord(row: ReceivedWorkRow) {
  return { receivedAt: row.received_at.toISOString(),
    source: { provider: row.provider, connectionId: row.connection_id, actionRequestId: row.action_request_id },
    purpose: row.processing_policy?.purpose ?? null,
    consent: { recordId: row.consent_record_id, confirmedAt: row.consent_confirmed_at.toISOString(),
      version: row.processing_policy?.consentVersion ?? null, items: row.processing_policy?.consentItems ?? null },
    retention: row.processing_policy?.retention ?? null };
}
