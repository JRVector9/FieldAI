export type BillingPayment = { paymentKey: string; orderId: string; status: string; totalAmount: number;
  balanceAmount: number; taxFreeAmount: number; suppliedAmount: number; vat: number; approvedAt: string | null };
export type BillingCharge = { billingKey: string; customerKey: string; orderId: string; orderName: string;
  amount: number; taxFreeAmount: number; requestKey: string };
export type BillingProvider = { mode: 'test' | 'live'; clientKey: string; mid: string;
  issue: (input: { authKey: string; customerKey: string; requestKey: string }) => Promise<string>;
  charge: (input: BillingCharge) => Promise<BillingPayment>;
  lookup: (orderId: string) => Promise<BillingPayment | null> };
export class BillingProviderError extends Error {
  readonly kind = 'unknown';
  constructor(readonly code: string) { super(`billing_provider_unknown:${code}`); }
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max;
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1000000000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validOrder = (value: string) => /^[A-Za-z0-9_-]{6,64}$/.test(value);

export function createTossBillingProvider(config: { mode: 'test' | 'live'; mid: string; clientKey: string; secretKey: string; fetcher?: typeof fetch }): BillingProvider {
  if (!['test','live'].includes(config.mode) || !config.secretKey.startsWith(`${config.mode}_sk_`)
    || !config.clientKey.startsWith(`${config.mode}_ck_`) || !/^[A-Za-z0-9_-]{1,14}$/.test(config.mid)
    || /\s/.test(config.secretKey + config.clientKey)) throw new Error('invalid_toss_billing_configuration');
  const fetcher = config.fetcher ?? fetch;
  async function request(path: string, method: 'GET' | 'POST', body?: object, key?: string) {
    if (key !== undefined && !uuid.test(key)) throw new Error('invalid_billing_request_key');
    try {
      const response = await fetcher(`https://api.tosspayments.com${path}`, { method,
        headers: { Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(65000), redirect: 'error' });
      const value = object(await response.json());
      if (method === 'GET' && response.status === 404 && value.code === 'NOT_FOUND_PAYMENT') return null;
      if (!response.ok) throw new BillingProviderError(typeof value.code === 'string' && /^[A-Z_]{1,100}$/.test(value.code) ? value.code : 'provider_error');
      return value;
    } catch (error) {
      if (error instanceof BillingProviderError) throw error;
      throw new BillingProviderError('transport_or_invalid_response');
    }
  }
  function payment(value: Record<string, unknown> | null, orderId: string): BillingPayment {
    const v = value ?? {}, statuses = ['READY','IN_PROGRESS','WAITING_FOR_DEPOSIT','DONE','CANCELED','PARTIAL_CANCELED','ABORTED','EXPIRED'];
    if (v.mId !== config.mid || v.orderId !== orderId || v.currency !== 'KRW' || v.type !== 'BILLING'
      || !str(v.paymentKey, 200) || !statuses.includes(String(v.status)) || !integer(v.totalAmount) || !Number(v.totalAmount)
      || !integer(v.balanceAmount) || Number(v.balanceAmount) > Number(v.totalAmount) || !integer(v.taxFreeAmount)
      || !integer(v.suppliedAmount) || !integer(v.vat) || Number(v.taxFreeAmount) > Number(v.totalAmount)
      || (v.approvedAt !== null && (!str(v.approvedAt, 40) || !Number.isFinite(Date.parse(String(v.approvedAt)))))
      || ['DONE','CANCELED','PARTIAL_CANCELED'].includes(String(v.status)) && !str(v.approvedAt, 40))
      throw new BillingProviderError('payment_binding_mismatch');
    return { paymentKey: v.paymentKey as string, orderId, status: v.status as string, totalAmount: Number(v.totalAmount),
      balanceAmount: Number(v.balanceAmount), taxFreeAmount: Number(v.taxFreeAmount), suppliedAmount: Number(v.suppliedAmount),
      vat: Number(v.vat), approvedAt: v.approvedAt as string | null };
  }
  return { mode: config.mode, clientKey: config.clientKey, mid: config.mid,
    async issue({ authKey, customerKey, requestKey }) {
      if (!str(authKey, 300) || !str(customerKey, 50)) throw new Error('invalid_billing_authorization');
      const v = await request('/v1/billing/authorizations/issue', 'POST', { authKey, customerKey }, requestKey);
      if (v?.mId !== config.mid || v.customerKey !== customerKey || !str(v.billingKey, 200)) throw new BillingProviderError('authorization_binding_mismatch');
      return v.billingKey as string;
    },
    async charge({ billingKey, customerKey, orderId, orderName, amount, taxFreeAmount, requestKey }) {
      if (!str(billingKey, 200) || !str(customerKey, 50) || !validOrder(orderId) || !str(orderName, 100)
        || !integer(amount) || amount < 1 || !integer(taxFreeAmount) || taxFreeAmount > amount) throw new Error('invalid_billing_charge');
      const v = payment(await request(`/v1/billing/${encodeURIComponent(billingKey)}`, 'POST',
        { customerKey, amount, orderId, orderName, taxFreeAmount }, requestKey), orderId);
      if (v.totalAmount !== amount || v.taxFreeAmount !== taxFreeAmount) throw new BillingProviderError('payment_amount_mismatch');
      return v;
    },
    async lookup(orderId) {
      if (!validOrder(orderId)) throw new Error('invalid_billing_order');
      const v = await request(`/v1/payments/orders/${encodeURIComponent(orderId)}`, 'GET');
      return v === null ? null : payment(v, orderId);
    },
  };
}
