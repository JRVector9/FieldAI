import type { FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { subscriptionAccess } from './subscription-access.js';

export async function rejectExpiredTrial(reply: FastifyReply, db: Pool | PoolClient, organizationId: string) {
  const access=await subscriptionAccess(db,organizationId);
  if(access.canStartNew)return false;
  reply.header('Cache-Control','no-store').code(403).send({error:access.reason,accessMode:'cleanup_only'});
  return true;
}
