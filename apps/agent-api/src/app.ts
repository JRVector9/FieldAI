import { registerIntegratorPublicWriteRoutes } from './integrator-public-write.js';
import { registerAgentDeliveryRoutes } from './notification-delivery-routes.js';
import { registerAgentBillingConsentRoutes } from './billing-consent-routes.js';
import Fastify from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { Pool } from 'pg';
import { registerAgentRetentionRoutes } from './retention-routes.js';
import { registerAgentRetentionPurgeRoutes } from './retention-purge-routes.js';
import { registerAgentRetentionConsumers } from './retention-consumers.js';
import { registerEmbedSpikeRoutes } from './embed.js';
import { registerConversationSpikeRoutes } from './conversation-spike.js';
import { registerBusinessRoutes, type BusinessRuntime } from './business.js';
import { registerAgentInquiryRoutes } from './inquiries.js';
import { registerInquiryArchiveRoutes } from './inquiry-archive.js';
import { registerAgentRoutes } from './agents.js';
import { registerDeploymentRoutes } from './deployments.js';
import { registerCustomerConsultationRoutes } from './customer-consultations.js';
import { registerInquiryAttachmentRoutes } from './inquiry-attachments.js';
import { registerAgentReceiptAbuseGuard } from './receipt-abuse.js';
import { registerAgentReceiptRotationRoutes } from './receipt-rotation.js';
import { registerCampaignRoutes } from './campaigns.js';
import { registerPublisherRoutes } from './publishers.js';
import { registerPlacementRoutes } from './placements.js';
import { registerDistributionMetricsRoutes } from './distribution-metrics.js';
import { registerIntegratorRoutes } from './integrator-routes.js';
import { registerFieldConnectorRoutes } from './field-connector.js';
import { registerFieldSourceRoutes } from './field-sources.js';
import { registerFieldActionRoutes } from './field-actions.js';
import { registerFieldEventInboxRoutes } from './field-event-inbox.js';
import { registerFieldEventRecoveryRoutes } from './field-event-recovery.js';
import { registerFieldNotificationRouteClose } from './field-notification-route-close.js';
import { registerFieldConnectionRevokeRoutes } from './field-connection-revoke.js';
import { registerAgentUsageRoutes } from './usage.js';
import { registerAgentSubscriptionRoutes } from './subscription.js';
import { registerAgentBillingRoutes } from './billing-routes.js';
import { registerBillingRefundRoutes } from './billing-refund-routes.js';
import { registerAdminBillingRoutes } from './admin-billing-routes.js';
import { registerAgentAdminRoutes } from './admin.js';
import { registerAgentModerationRoutes } from './deployment-moderation.js';
import { registerCustomerSupportRoutes } from './customer-support.js';
import { registerSourceRefreshRoutes } from './source-refreshes.js';

export function createAgentApp(
  probe: () => Promise<void>,
  authHandler?: (request: Request) => Promise<Response>,
  authBaseURL = 'http://127.0.0.1:4311',
  embedSpikePool?: Pool,
  businessRuntime?: BusinessRuntime,
) {
  // 신뢰할 프록시 hop만 X-Forwarded-For를 반영한다. 기본은 같은 호스트의 Next rewrite(loopback)
  const app = Fastify({ trustProxy: process.env.AP_TRUST_PROXY ?? 'loopback' });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });
  app.addContentTypeParser('application/vnd.field-event+json', { parseAs: 'buffer', bodyLimit: 65_536 },
    (_request, body, done) => done(null, body));
  if (embedSpikePool) {
    if (!businessRuntime) registerEmbedSpikeRoutes(app, embedSpikePool);
    registerConversationSpikeRoutes(app, embedSpikePool);
  }
  if (businessRuntime) {
    registerAgentRetentionRoutes(app, businessRuntime);
    registerAgentRetentionPurgeRoutes(app, businessRuntime);
    registerAgentRetentionConsumers(app, businessRuntime);
    registerAgentReceiptAbuseGuard(app, businessRuntime);
    registerAgentReceiptRotationRoutes(app, businessRuntime);
    registerBusinessRoutes(app, businessRuntime);
    registerAgentInquiryRoutes(app, businessRuntime);
    registerAgentDeliveryRoutes(app, businessRuntime, businessRuntime.notification);
    registerInquiryArchiveRoutes(app, businessRuntime);
    registerAgentRoutes(app, businessRuntime);
    registerDeploymentRoutes(app, businessRuntime);
    registerCustomerConsultationRoutes(app, businessRuntime);
    registerInquiryAttachmentRoutes(app, businessRuntime);
    registerCampaignRoutes(app, businessRuntime);
    registerPublisherRoutes(app, businessRuntime);
    registerPlacementRoutes(app, businessRuntime);
    registerDistributionMetricsRoutes(app, businessRuntime);
    registerIntegratorRoutes(app, businessRuntime);
    registerIntegratorPublicWriteRoutes(app, businessRuntime);
    registerSourceRefreshRoutes(app, businessRuntime);
    registerFieldConnectorRoutes(app, businessRuntime);
    registerFieldSourceRoutes(app, businessRuntime);
    registerFieldActionRoutes(app, businessRuntime);
    registerFieldEventInboxRoutes(app, businessRuntime);
    registerFieldEventRecoveryRoutes(app, businessRuntime);
    registerFieldNotificationRouteClose(app, businessRuntime);
    registerFieldConnectionRevokeRoutes(app, businessRuntime);
    registerAgentUsageRoutes(app, businessRuntime);
    registerAgentSubscriptionRoutes(app, businessRuntime);
    registerAgentBillingRoutes(app, businessRuntime);
    registerBillingRefundRoutes(app, businessRuntime);
    registerAdminBillingRoutes(app, businessRuntime);
    registerAgentBillingConsentRoutes(app, businessRuntime);
    registerAgentAdminRoutes(app, businessRuntime);
    registerAgentModerationRoutes(app, businessRuntime);
    registerCustomerSupportRoutes(app, businessRuntime);
  }
  if (authHandler) {
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
    app.get('/v1/auth/email-delivery', async () => ({ product: 'agent', state: emailDeliveryState() }));
  }
  app.get('/health/ready', async (_request, reply) => {
    try {
      await probe();
      // 메일 미연결은 치명 장애가 아니므로 ready를 유지하고 세부 정보로만 알린다.
      const email = businessRuntime?.emailDeliveryState?.();
      return { product: 'agent', status: 'ready', ...(email ? { integrations: { email } } : {}) };
    } catch {
      return reply.code(503).send({ product: 'agent', status: 'unavailable' });
    }
  });
  return app;
}
