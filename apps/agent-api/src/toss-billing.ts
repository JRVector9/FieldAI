import { createHash } from 'node:crypto';

export type BillingCancellation = { transactionKey:string; cancelAmount:number; taxFreeAmount:number; cancelReason:string; canceledAt:string; cancelStatus:string; refundableAmount:number };
export type BillingRefund = { paymentKey:string; orderId:string; amount:number; taxFreeAmount:number; reason:string; requestKey:string };
export type BillingPayment = { paymentKey: string; orderId: string; status: string; totalAmount: number;
  balanceAmount: number; taxFreeAmount: number; suppliedAmount: number; vat: number; approvedAt: string | null; cancels?: BillingCancellation[]; isPartialCancelable?:boolean };
export type BillingCharge = { billingKey: string; customerKey: string; orderId: string; orderName: string;
  amount: number; taxFreeAmount: number; requestKey: string };
export type BillingProvider = { mode: 'test' | 'live'; clientKey: string; mid: string; keyFingerprint?: string;
  issue: (input: { authKey: string; customerKey: string; requestKey: string }) => Promise<string>;
  charge: (input: BillingCharge) => Promise<BillingPayment>;
  lookup: (orderId: string) => Promise<BillingPayment | null>;
  refund?: (input: BillingRefund) => Promise<BillingPayment> };
export class BillingProviderError extends Error {
  constructor(readonly code: string, readonly kind: 'unknown'|'declined'='unknown') { super(`billing_provider_${kind}:${code}`); }
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
  async function request(path: string, method: 'GET' | 'POST', body?: object, key?: string, operation?:'charge'|'issue') {
    if (key !== undefined && !uuid.test(key)) throw new Error('invalid_billing_request_key');
    try {
      const response = await fetcher(`https://api.tosspayments.com${path}`, { method,
        headers: { Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(65000), redirect: 'error' });
      const value = object(await response.json());
      if (method === 'GET' && response.status === 404 && value.code === 'NOT_FOUND_PAYMENT') return null;
      if (!response.ok) {
        const code=typeof value.code==='string'&&/^[A-Z_]{1,100}$/.test(value.code)?value.code:'provider_error';
        // Core /v1/billing/{billingKey} card approval errors, not Brandpay errors.
        const declined=operation==='charge'&&(response.status===403&&['REJECT_CARD_PAYMENT','REJECT_ACCOUNT_PAYMENT','REJECT_CARD_COMPANY'].includes(code)
          ||response.status===400&&['INVALID_STOPPED_CARD','INVALID_REJECT_CARD','INVALID_CARD_LOST_OR_STOLEN','INVALID_CARD_EXPIRATION','INVALID_CARD_NUMBER'].includes(code))
          // 카드 인증(billingKey 발급)의 HTTP 4xx 응답은 공급사의 확정 거절이다. 429와 5xx·전송 오류는 결과 미상으로 둔다
          ||operation==='issue'&&response.status>=400&&response.status<500&&response.status!==429;
        throw new BillingProviderError(code,declined?'declined':'unknown');
      }
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
    let cancels:BillingCancellation[]|undefined;
    if(v.cancels===null)cancels=[];
    else if(Array.isArray(v.cancels)&&v.cancels.length<=1000) {
      cancels=v.cancels.map(raw=>{
        const c=object(raw);
        if(!str(c.transactionKey,64)||!integer(c.cancelAmount)||Number(c.cancelAmount)<1||!integer(c.taxFreeAmount)
          ||Number(c.taxFreeAmount)>Number(c.cancelAmount)||!str(c.cancelReason,200)||!str(c.canceledAt,40)
          ||!Number.isFinite(Date.parse(String(c.canceledAt)))||!str(c.cancelStatus,30)||!integer(c.refundableAmount))throw new BillingProviderError('cancel_binding_mismatch');
        return {transactionKey:String(c.transactionKey),cancelAmount:Number(c.cancelAmount),taxFreeAmount:Number(c.taxFreeAmount),cancelReason:String(c.cancelReason),
          canceledAt:String(c.canceledAt),cancelStatus:String(c.cancelStatus),refundableAmount:Number(c.refundableAmount)};
      });
      if(new Set(cancels.map(c=>c.transactionKey)).size!==cancels.length)throw new BillingProviderError('cancel_binding_mismatch');
    }else if(v.cancels!==undefined)throw new BillingProviderError('cancel_binding_mismatch');
    if(v.isPartialCancelable!==undefined&&typeof v.isPartialCancelable!=='boolean')throw new BillingProviderError('cancel_binding_mismatch');
    return { paymentKey: v.paymentKey as string, orderId, status: v.status as string, totalAmount: Number(v.totalAmount),
      balanceAmount: Number(v.balanceAmount), taxFreeAmount: Number(v.taxFreeAmount), suppliedAmount: Number(v.suppliedAmount),
      vat: Number(v.vat), approvedAt: v.approvedAt as string | null, ...(cancels===undefined?{}:{cancels}),
      ...(v.isPartialCancelable===undefined?{}:{isPartialCancelable:v.isPartialCancelable as boolean}) };
  }
  return { mode: config.mode, clientKey: config.clientKey, mid: config.mid,
    keyFingerprint: createHash('sha256').update(config.secretKey).digest('hex'),
    async issue({ authKey, customerKey, requestKey }) {
      if (!str(authKey, 300) || !str(customerKey, 50)) throw new Error('invalid_billing_authorization');
      const v = await request('/v1/billing/authorizations/issue', 'POST', { authKey, customerKey }, requestKey, 'issue');
      if (v?.mId !== config.mid || v.customerKey !== customerKey || !str(v.billingKey, 200)) throw new BillingProviderError('authorization_binding_mismatch');
      return v.billingKey as string;
    },
    async charge({ billingKey, customerKey, orderId, orderName, amount, taxFreeAmount, requestKey }) {
      if (!str(billingKey, 200) || !str(customerKey, 50) || !validOrder(orderId) || !str(orderName, 100)
        || !integer(amount) || amount < 1 || !integer(taxFreeAmount) || taxFreeAmount > amount) throw new Error('invalid_billing_charge');
      const v = payment(await request(`/v1/billing/${encodeURIComponent(billingKey)}`, 'POST',
        { customerKey, amount, orderId, orderName, taxFreeAmount }, requestKey, 'charge'), orderId);
      if (v.totalAmount !== amount || v.taxFreeAmount !== taxFreeAmount) throw new BillingProviderError('payment_amount_mismatch');
      return v;
    },
    async refund({paymentKey,orderId,amount,taxFreeAmount,reason,requestKey}) {
      if(!str(paymentKey,200)||!validOrder(orderId)||!integer(amount)||amount<1||!integer(taxFreeAmount)||taxFreeAmount>amount||!str(reason,200))throw new Error('invalid_billing_refund');
      const v=payment(await request(`/v1/payments/${encodeURIComponent(paymentKey)}/cancel`,'POST',
        {cancelAmount:amount,taxFreeAmount,cancelReason:reason,currency:'KRW'},requestKey),orderId);
      if(v.paymentKey!==paymentKey||v.cancels===undefined)throw new BillingProviderError('refund_payment_binding_mismatch');
      return v;
    },
    async lookup(orderId) {
      if (!validOrder(orderId)) throw new Error('invalid_billing_order');
      const v = await request(`/v1/payments/orders/${encodeURIComponent(orderId)}`, 'GET');
      return v === null ? null : payment(v, orderId);
    },
  };
}
