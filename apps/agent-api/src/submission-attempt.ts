import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export type SubmissionAttempt = {
  keyHash: string;
  requestHash: string;
  receiptKey: string;
  receiptHash: string;
};

export type MessageAttempt = { keyHash: string; requestHash: string };

export function messageAttempt(headers: IncomingHttpHeaders, request: Record<string, unknown>):
  MessageAttempt | null | undefined {
  const key = headers['idempotency-key'];
  if (key === undefined) return undefined;
  if (typeof key !== 'string' || !keyPattern.test(key)) return null;
  return { keyHash: hash(key), requestHash: hash(JSON.stringify(request)) };
}

export function submissionAttempt(headers: IncomingHttpHeaders, request: Record<string, unknown>):
  SubmissionAttempt | null | undefined {
  const key = headers['idempotency-key'];
  const receipt = headers['x-receipt-key'];
  if (key === undefined && receipt === undefined) return undefined;
  if (typeof key !== 'string' || typeof receipt !== 'string'
      || !keyPattern.test(key) || !keyPattern.test(receipt)) return null;
  return { keyHash: hash(key), receiptKey: receipt, receiptHash: hash(receipt),
    requestHash: hash(JSON.stringify(request)) };
}
