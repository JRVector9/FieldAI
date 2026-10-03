import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { FieldBusinessRuntime } from './business.js';
import { unsealApEventSecret } from './integrator-routes.js';
import { apToFieldSignaturePrefix } from './ap-signature.js';
import { recordFieldRevocation } from './revocation-journal.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReceivedConnection = { id: string; organization_id: string; field_grant_id: string | null };
// 서명 검증을 통과한 AP 연결 해제를 같은 트랜잭션에서 로컬 반영한다. 서명 해제 경로와 AP 사건 수신함이 함께 쓴다.
// 같은 해제 ID 재수신은 'replayed', 다른 해제 ID가 이미 반영됐으면 'conflict'를 돌려주고 아무것도 바꾸지 않는다.
export async function commitReceivedApRevocation(db: PoolClient, runtime: FieldBusinessRuntime,
  connection: ReceivedConnection, revocationId: string): Promise<'committed' | 'replayed' | 'conflict'> {
  const connectionId = connection.id;
  const prior = await db.query<{ id: string }>(
    `select id from field.ap_received_connection_revocations where connection_id = $1`,
    [connectionId]);
  if (prior.rows[0]) return prior.rows[0].id === revocationId ? 'replayed' : 'conflict';
  await recordFieldRevocation(runtime.revocationJournal, { targetKind: 'connection', targetId: connectionId,
    organizationId: connection.organization_id, selectionId: connection.field_grant_id && uuid.test(connection.field_grant_id) ? connection.field_grant_id : null,
    source: 'remote', revocationId });
  await db.query(`insert into field.ap_received_connection_revocations(id,connection_id)
    values ($1,$2)`, [revocationId, connectionId]);
  await db.query(`update field.ap_connections set status = 'revoked',updated_at = now()
    where id = $1`, [connectionId]);
  await db.query(`update field.site_ap_installations set status = 'paused',updated_at = now()
    where connection_id = $1 and status = 'active'`, [connectionId]);
  if (connection.field_grant_id && uuid.test(connection.field_grant_id)) {
    await db.query(`update field.oauth_selections set revoked_at = now()
      where id = $1 and revoked_at is null`, [connection.field_grant_id]);
    await db.query(`update "oauthAccessToken" set revoked = now()
      where "referenceId" = $1 and revoked is null`, [connection.field_grant_id]);
    await db.query(`update "oauthRefreshToken" set revoked = now()
      where "referenceId" = $1 and revoked is null`, [connection.field_grant_id]);
    await db.query(`delete from "oauthConsent" where "referenceId" = $1`,
      [connection.field_grant_id]);
  }
  await db.query(`insert into field.outbox(id,organization_id,event_type,aggregate_id,payload)
    values ($1,$2,'field.ap_connection.remote_revoked',$3,$4::jsonb)`,
  [randomUUID(), connection.organization_id, connectionId,
    JSON.stringify({ connectionId, revocationId })]);
  return 'committed';
}

export function registerApConnectionRevokeReceiver(app: FastifyInstance, runtime: FieldBusinessRuntime) {
  app.post<{ Params: { id: string } }>('/integrations/v1/connections/:id/revoke', async (request, reply) => {
    const connectionId = request.params.id;
    const keyId = request.headers['x-key-id'];
    const revocationId = request.headers['x-revocation-id'];
    const timestamp = request.headers['x-timestamp'];
    const signature = request.headers['x-signature'];
    const signaturePrefix = apToFieldSignaturePrefix(request.headers['x-signature-version']);
    if (signaturePrefix === null || !uuid.test(connectionId) || typeof keyId !== 'string' || !uuid.test(keyId)
      || typeof revocationId !== 'string' || !uuid.test(revocationId)
      || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)
      || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
      || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature))
      return reply.code(401).send({ error: 'invalid_revoke_signature' });
    const config = runtime.apConnector;
    if (!config) return reply.code(503).send({ error: 'blocked_integration' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const selected = await db.query<{ id: string; organization_id: string;
        field_grant_id: string | null; event_secret_cipher: Buffer }>(
        `select id,organization_id,field_grant_id,event_secret_cipher
         from field.ap_connections where id = $1 and event_key_id = $2
           and event_secret_cipher is not null for update`, [connectionId, keyId]);
      const connection = selected.rows[0];
      if (!connection) {
        await db.query('rollback'); return reply.code(401).send({ error: 'invalid_revoke_signature' });
      }
      let secret: Buffer;
      try { secret = Buffer.from(unsealApEventSecret(connection.event_secret_cipher,
        config.tokenKey), 'base64url'); }
      catch {
        await db.query('rollback'); return reply.code(503).send({ error: 'revoke_key_unavailable' });
      }
      if (secret.length !== 32) {
        await db.query('rollback'); return reply.code(503).send({ error: 'revoke_key_unavailable' });
      }
      const expected = createHmac('sha256', secret)
        .update(`${signaturePrefix}${timestamp}.${revocationId}.${connectionId}.revoke`).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
        await db.query('rollback'); return reply.code(401).send({ error: 'invalid_revoke_signature' });
      }
      if (await commitReceivedApRevocation(db, runtime, connection, revocationId) === 'conflict') {
        await db.query('rollback'); return reply.code(409).send({ error: 'revocation_id_conflict' });
      }
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').send({
        connectionId, status: 'revoked', revocationId,
      });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
