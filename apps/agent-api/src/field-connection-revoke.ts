import { recordAgentRevocation } from './revocation-journal.js';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { BusinessRuntime } from './business.js';
import { unsealFieldEventSecret } from './field-connector.js';
import { fieldToApSignaturePrefix } from './field-signature.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerFieldConnectionRevokeRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  app.post<{ Params: { id: string } }>('/integrations/v1/connections/:id/revoke', async (request, reply) => {
    const connectionId = request.params.id;
    const keyId = request.headers['x-key-id'];
    const revocationId = request.headers['x-revocation-id'];
    const timestamp = request.headers['x-timestamp'];
    const signature = request.headers['x-signature'];
    const signaturePrefix = fieldToApSignaturePrefix(request.headers['x-signature-version']);
    if (signaturePrefix === null || !uuid.test(connectionId) || typeof keyId !== 'string' || !uuid.test(keyId)
      || typeof revocationId !== 'string' || !uuid.test(revocationId)
      || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)
      || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
      || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature))
      return reply.code(401).send({ error: 'invalid_revoke_signature' });
    const config = runtime.fieldConnector;
    if (!config) return reply.code(503).send({ error: 'blocked_integration' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const selected = await db.query<{ id: string; ap_grant_id: string; ap_organization_id: string;
        status: string; event_secret_cipher: Buffer; event_key_id: string }>(
        `select id,ap_grant_id,ap_organization_id,status,event_secret_cipher,event_key_id
         from ap.field_connections where id = $1 and event_key_id = $2
           and event_secret_cipher is not null for update`, [connectionId, keyId]);
      const connection = selected.rows[0];
      if (!connection) {
        await db.query('rollback'); return reply.code(401).send({ error: 'invalid_revoke_signature' });
      }
      let secret: Buffer;
      try { secret = Buffer.from(unsealFieldEventSecret(connection.event_secret_cipher,
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
      const prior = await db.query<{ id: string }>(
        'select id from ap.field_connection_revocations where connection_id = $1', [connectionId]);
      if (prior.rows[0] && prior.rows[0].id !== revocationId) {
        await db.query('rollback'); return reply.code(409).send({ error: 'revocation_id_conflict' });
      }
      await recordAgentRevocation(db, runtime.revocationJournal, { organizationId: connection.ap_organization_id,
        targetKind: 'connection', targetId: connection.id, selectionId: connection.ap_grant_id, source: 'remote', revocationId });
      if (!prior.rows[0]) {
        await db.query(`insert into ap.field_connection_revocations(id,connection_id)
          values ($1,$2)`, [revocationId, connectionId]);
        await db.query(`update ap.field_connections set status = 'revoked',updated_at = now()
          where id = $1`, [connectionId]);
        await db.query(`update ap.knowledge_sources set state = 'revoked',updated_at = now()
          where connection_id = $1`, [connectionId]);
        await db.query(`update ap.oauth_selections set revoked_at = now()
          where id = $1 and revoked_at is null`, [connection.ap_grant_id]);
        await db.query(`update "oauthAccessToken" set revoked = now()
          where "referenceId" = $1 and revoked is null`, [connection.ap_grant_id]);
        await db.query(`update "oauthRefreshToken" set revoked = now()
          where "referenceId" = $1 and revoked is null`, [connection.ap_grant_id]);
        await db.query(`delete from "oauthConsent" where "referenceId" = $1`,
          [connection.ap_grant_id]);
        await db.query(`insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload)
          values ($1,$2,'ap.field_connection.revoked',$3,$4::jsonb)`,
        [randomUUID(), connection.ap_organization_id, connectionId,
          JSON.stringify({ connectionId, revocationId })]);
      }
      await db.query('commit');
      return reply.header('Cache-Control', 'no-store').send({
        connectionId, status: 'revoked', revocationId,
      });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}
