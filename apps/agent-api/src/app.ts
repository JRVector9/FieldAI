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
  const app = Fastify();
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
  app.get('/health/ready', async (_request, reply) => {
    try {
      await probe();
      return { product: 'agent', status: 'ready' };
    } catch {
      return reply.code(503).send({ product: 'agent', status: 'unavailable' });
    }
  });
  return app;
}
