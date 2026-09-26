import type { FastifyReply } from 'fastify';
import type { PoolClient } from 'pg';

/** Keep a read transaction's locks until its response bytes leave the server. */
export function retainReadGuardThroughResponse(reply: FastifyReply, db: PoolClient) {
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try { await db.query('rollback'); db.release(); }
    catch { db.release(new Error('retention_read_guard_release_failed')); }
  };
  reply.raw.once('finish', () => { void release(); });
  reply.raw.once('close', () => { void release(); });
  reply.raw.once('error', () => { void release(); });
  if (reply.raw.destroyed || reply.raw.writableFinished) void release();
}
