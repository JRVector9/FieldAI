import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createTossBillingProvider, type BillingProvider } from './toss-billing.js';

export type BillingContext = { provider: BillingProvider; credentialKey: Buffer; webOrigin: string };
export function sealBilling(value: string, key: Buffer, binding: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`AP/billing/v1/${binding}`));
  return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url');
}
export function unsealBilling(value: string, key: Buffer, binding: string) {
  const data = Buffer.from(value, 'base64url');
  if (data.length < 29) throw new Error('invalid_billing_ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(`AP/billing/v1/${binding}`)); decipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([decipher.update(data.subarray(12,-16)), decipher.final()]).toString('utf8');
}
export function billingContextFromEnvironment(env: Record<string, string | undefined> = process.env): BillingContext | undefined {
  const names = ['AP_TOSS_CLIENT_KEY','AP_TOSS_SECRET_KEY','AP_TOSS_MID','AP_BILLING_CREDENTIAL_KEY'];
  if (names.every(n => !env[n])) return undefined;
  if (names.some(n => !env[n])) throw new Error('incomplete_AP_billing_configuration');
  const profile = env.AP_PROFILE;
  if (!['mock','sandbox','live'].includes(profile ?? '') || env.NODE_ENV === 'production' && profile !== 'live')
    throw new Error('invalid_AP_billing_profile');
  const mode = profile === 'live' ? 'live' : 'test';
  const encoded = env.AP_BILLING_CREDENTIAL_KEY!;
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw new Error('invalid_AP_billing_credential_key');
  const credentialKey = Buffer.from(encoded, 'base64url');
  if (credentialKey.length !== 32) throw new Error('invalid_AP_billing_credential_key');
  const origin = new URL(env.AP_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3001');
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
    || !['http:','https:'].includes(origin.protocol)
    || origin.protocol === 'http:' && !['localhost','127.0.0.1'].includes(origin.hostname)
    || profile === 'live' && (origin.protocol !== 'https:' || ['localhost','127.0.0.1'].includes(origin.hostname)))
    throw new Error('invalid_AP_billing_web_origin');
  return { provider: createTossBillingProvider({ mode, mid: env.AP_TOSS_MID!, clientKey: env.AP_TOSS_CLIENT_KEY!, secretKey: env.AP_TOSS_SECRET_KEY! }),
    credentialKey, webOrigin: origin.origin };
}
