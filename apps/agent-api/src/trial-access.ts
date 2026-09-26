import type { FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';

export async function rejectExpiredTrial(reply: FastifyReply, db: Pool | PoolClient, organizationId: string) {
  if (process.env.AP_PROFILE !== 'mock') return false;
  const expired = await db.query(
    'select 1 from ap.trial_subscriptions where organization_id=$1 and ends_at<=now()', [organizationId]);
  if (!expired.rowCount) return false;
  reply.header('Cache-Control', 'no-store').code(403)
    .send({ error: 'trial_ended', accessMode: 'cleanup_only' });
  return true;
}
