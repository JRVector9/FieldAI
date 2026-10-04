import { registerCustomDomainRoutes } from './custom-domain-routes.js';
import { registerFieldDeliveryRoutes } from './notification-delivery-routes.js';
import { registerFieldBillingConsentRoutes } from './billing-consent-routes.js';
import Fastify from 'fastify';
import { loggingOptionsFromEnvironment, sendPublicError } from './logging.js';
import { fromNodeHeaders } from 'better-auth/node';
import { registerFieldBusinessRoutes, type FieldBusinessRuntime } from './business.js';
import { registerInquiryRoutes } from './inquiries.js';
import { registerInquiryAttachmentRoutes } from './inquiry-attachments.js';
import { registerFieldNotificationRoutes } from './notifications.js';
import { registerSiteRoutes } from './sites.js';
import { registerApPublicInstallationRoutes } from './ap-public-installation-routes.js';
import { registerSiteGenerationRoutes } from './site-generation.js';
import { registerBookingRoutes } from './bookings.js';
import { registerReservationExportRoute } from './reservation-export.js';
import { registerReservationAttachmentRoutes } from './reservation-attachments.js';
import { registerOperationsArchiveRoute } from './operations-archive.js';
import { registerFieldReceiptAbuseGuard } from './receipt-abuse.js';
import { registerFieldReceiptRotationRoutes } from './receipt-rotation.js';
import { registerFieldIntegratorRoutes } from './integrator-routes.js';
import { registerApConnectorRoutes } from './ap-connector.js';
import { registerApSourceRefreshRoutes } from './ap-source-refresh.js';
import { registerFieldCustomerHandoffRoutes } from './customer-handoffs.js';
import { registerApConversationRoutes } from './ap-conversations.js';
import { registerApEventStatusRoutes } from './ap-event-status.js';
import { registerApConnectionRevokeReceiver } from './ap-connection-revoke-receiver.js';
import { registerExternalReservationContactRoutes } from './external-reservation-contacts.js';
import { registerExternalReservationNotificationRoute } from './external-reservation-notification-route.js';
import { registerFieldUsageRoutes } from './usage.js';
import { registerFieldSubscriptionRoutes } from './subscription.js';
import { registerFieldAccountDeletionRoutes } from './account-deletion.js';
import { registerFieldBillingRoutes } from './billing-routes.js';
import { registerBillingRefundRoutes } from './billing-refund-routes.js';
import { registerAdminBillingRoutes } from './admin-billing-routes.js';
import { registerApRouteKeyLifecycleRoutes } from './ap-route-key-lifecycle.js';
import { registerExternalRequestAttachmentRoutes } from './external-request-attachments.js';
import { registerFieldAdminRoutes } from './admin.js';
import { registerFieldModerationRoutes } from './site-moderation.js';
import { registerFieldCustomerSupportRoutes } from './customer-support.js';
import { registerFieldRetentionRoutes } from './retention-routes.js';
import { registerFieldRetentionPurgeRoutes } from './retention-purge-routes.js';
import { registerFieldRetentionConsumers } from './retention-consumers.js';
import { fieldRevocationJournalFromEnvironment } from './revocation-journal.js';
import { registerAuthProviderRoutes } from './kakao-provider.js';
import { containsNul } from './invalid-text.js';
import { assertAccountDeletionServing } from './account-deletion-journal.js';

// 브라우저 요청은 Next rewrite를 거쳐 오므로 앞단 프록시가 보낸 X-Forwarded-For로 고객 IP를 구한다.
// 기본값은 같은 장비의 프록시(loopback)만 신뢰해 외부에서 직접 보낸 헤더로 IP를 바꿀 수 없게 한다.
// 앞단 주소가 다르면 FIELD_TRUST_PROXY에 true/false 또는 쉼표로 구분한 IP·CIDR·이름(loopback 등)을 지정한다.
function trustProxyFromEnvironment(value = process.env.FIELD_TRUST_PROXY): boolean | string {
  if (value === undefined || value.trim() === '') return 'loopback';
  if (value === 'true' || value === 'false') return value === 'true';
  return value;
}

// 요청 전체(본문 수신 포함) 제한 시간(Security #11). 느린 본문으로 연결을 오래 잡지 못하게 한다. 기본 30초.
function requestTimeoutFromEnvironment(value = process.env.FIELD_REQUEST_TIMEOUT_MS) {
  if (value === undefined || value.trim() === '') return 30_000;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600_000)
    throw new Error('FIELD_REQUEST_TIMEOUT_MS must be an integer from 1000 to 600000');
  return timeout;
}

export function createFieldApp(
  probe: () => Promise<void>,
  authHandler?: (request: Request) => Promise<Response>,
  authBaseURL = 'http://127.0.0.1:4321',
  businessRuntime?: FieldBusinessRuntime,
) {
  // 구조화 로그(FIELD_LOG_LEVEL)와 PII 가림·requestId는 logging.ts가 정한다.
  const app = Fastify({ trustProxy: trustProxyFromEnvironment(), requestTimeout: requestTimeoutFromEnvironment(),
    ...loggingOptionsFromEnvironment() });
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 },
    (_request, body, done) => done(null, body));
  app.addHook('preValidation',async(request,reply)=>{
    const body=typeof request.body==='string'&&request.headers['content-type']?.split(';')[0]==='application/x-www-form-urlencoded'
      ? [...new URLSearchParams(request.body)] : request.body;
    if(containsNul(body)||containsNul(request.query)||containsNul(request.params))
      return reply.header('Cache-Control','no-store').code(400).send({error:'invalid_text'});
  });
  // 업무 라우트가 있으면 retention-consumers.ts가 같은 공통 처리를 포함한 오류 처리기를 등록한다(범위당 하나만 허용).
  if (!businessRuntime) app.setErrorHandler(sendPublicError);
  if (businessRuntime) {
    const pool=businessRuntime.pool;
    app.addHook('preHandler',async(request,reply)=>{
      if(request.url==='/health')return;
      try{await assertAccountDeletionServing(pool);}catch{return reply.header('Cache-Control','no-store').code(503).send({error:'deletion_recovery_required'});}
    });
    businessRuntime = { ...businessRuntime, revocationJournal: businessRuntime.revocationJournal ?? fieldRevocationJournalFromEnvironment() };
    registerFieldAdminRoutes(app, businessRuntime);
    registerFieldModerationRoutes(app, businessRuntime);
    registerFieldCustomerSupportRoutes(app, businessRuntime);
    registerFieldRetentionRoutes(app, businessRuntime);
    registerFieldRetentionPurgeRoutes(app, businessRuntime);
    registerFieldRetentionConsumers(app, businessRuntime);
    registerFieldReceiptAbuseGuard(app, businessRuntime);
    registerFieldReceiptRotationRoutes(app, businessRuntime);
    registerFieldBusinessRoutes(app, businessRuntime);
    registerInquiryRoutes(app, businessRuntime);
    registerInquiryAttachmentRoutes(app, businessRuntime);
    registerFieldNotificationRoutes(app, businessRuntime);
    registerFieldDeliveryRoutes(app, businessRuntime, businessRuntime.notification);
    registerSiteRoutes(app, businessRuntime);
    registerApPublicInstallationRoutes(app, businessRuntime);
    registerCustomDomainRoutes(app, businessRuntime, businessRuntime.customDomain);
    registerSiteGenerationRoutes(app, businessRuntime);
    registerBookingRoutes(app, businessRuntime);
    registerReservationAttachmentRoutes(app, businessRuntime);
    registerExternalRequestAttachmentRoutes(app, businessRuntime);
    registerReservationExportRoute(app, businessRuntime);
    registerOperationsArchiveRoute(app, businessRuntime);
    registerFieldCustomerHandoffRoutes(app, businessRuntime);
    registerFieldIntegratorRoutes(app, businessRuntime);
    registerApConnectorRoutes(app, businessRuntime);
    registerApSourceRefreshRoutes(app, businessRuntime);
    registerApConversationRoutes(app, businessRuntime);
    registerApEventStatusRoutes(app, businessRuntime);
    registerApConnectionRevokeReceiver(app, businessRuntime);
    registerExternalReservationContactRoutes(app, businessRuntime);
    registerExternalReservationNotificationRoute(app, businessRuntime);
    registerFieldUsageRoutes(app, businessRuntime);
    registerFieldSubscriptionRoutes(app, businessRuntime);
    registerFieldAccountDeletionRoutes(app, businessRuntime);
    registerFieldBillingRoutes(app, businessRuntime);
    registerBillingRefundRoutes(app, businessRuntime);
    registerAdminBillingRoutes(app, businessRuntime);
    registerApRouteKeyLifecycleRoutes(app, businessRuntime);
    registerFieldBillingConsentRoutes(app, businessRuntime);
  }
  if (authHandler) {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
      done(null, body);
    });
    app.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      async handler(request, reply) {
        const body = typeof request.body === 'string' ? request.body
          : request.body === undefined ? undefined : JSON.stringify(request.body);
        const response = await authHandler(new Request(new URL(request.url, authBaseURL), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(body === undefined ? {} : { body }),
        }));
        response.headers.forEach((value, key) => {
          if (key !== 'set-cookie') reply.header(key, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) reply.header('set-cookie', cookies);
        return reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
      },
    });
  }
  if (businessRuntime?.emailDeliveryState) {
    const emailDeliveryState = businessRuntime.emailDeliveryState;
    // 웹 인증 화면이 메일 미연결을 정직하게 안내하도록 상태만 공개한다(계정 존재 여부와 무관).
    app.get('/v1/auth/email-delivery', async () => ({ product: 'field', state: emailDeliveryState() }));
  }
  registerAuthProviderRoutes(app);
  app.get('/health/ready', async (_request, reply) => {
    try {
      await probe();
      // 메일 미연결은 치명 장애가 아니므로 ready를 유지하고 세부 정보로만 알린다.
      const email = businessRuntime?.emailDeliveryState?.();
      return { product: 'field', status: 'ready', ...(email ? { integrations: { email } } : {}) };
    } catch {
      return reply.code(503).send({ product: 'field', status: 'unavailable' });
    }
  });
  return app;
}
