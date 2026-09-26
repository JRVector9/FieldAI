import { registerCustomDomainRoutes } from './custom-domain-routes.js';
import { registerFieldDeliveryRoutes } from './notification-delivery-routes.js';
import { registerFieldBillingConsentRoutes } from './billing-consent-routes.js';
import Fastify from 'fastify';
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

export function createFieldApp(
  probe: () => Promise<void>,
  authHandler?: (request: Request) => Promise<Response>,
  authBaseURL = 'http://127.0.0.1:4321',
  businessRuntime?: FieldBusinessRuntime,
) {
  const app = Fastify();
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 },
    (_request, body, done) => done(null, body));
  if (businessRuntime) {
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
  app.get('/health/ready', async (_request, reply) => {
    try {
      await probe();
      return { product: 'field', status: 'ready' };
    } catch {
      return reply.code(503).send({ product: 'field', status: 'unavailable' });
    }
  });
  return app;
}
