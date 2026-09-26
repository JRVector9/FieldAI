import type { IncomingHttpHeaders } from 'node:http';
import type { PoolClient } from 'pg';

export type DistributionTrafficClass = 'unclassified' | 'live' | 'preview' | 'test' | 'bot';

export function distributionTrafficClass(headers: IncomingHttpHeaders, source: 'embed' | 'preview'): DistributionTrafficClass {
  if (source === 'preview') return 'preview';
  if (process.env.AP_PROFILE === 'mock' && headers['x-ap-test-traffic'] === 'true') return 'test';
  const agent = headers['user-agent'] ?? '';
  if (/bot|crawl|spider|slurp|preview|headlesschrome|lighthouse|synthetic/i.test(agent)) return 'bot';
  return 'live';
}

export async function recordDistributionEvent(client: PoolClient, inquiryId: string,
  placementId: string | null, eventType: 'engagement_started' | 'contact_submitted',
  trafficClass: DistributionTrafficClass) {
  if (!placementId) return;
  await client.query(
    `insert into ap.distribution_events(inquiry_id, event_type, placement_id, traffic_class)
     values ($1,$2,$3,$4) on conflict (inquiry_id, event_type) do nothing`,
    [inquiryId, eventType, placementId, trafficClass],
  );
}
