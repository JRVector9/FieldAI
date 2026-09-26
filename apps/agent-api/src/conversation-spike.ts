import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

type Conversation = { id: string; mode: 'ai' | 'human'; revision: number; next_sequence: string };
type Event = { sequence: string; kind: string; body: { text?: string } };

const validUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function registerConversationSpikeRoutes(app: FastifyInstance, pool: Pool) {
  app.post<{ Params: { conversationId: string }; Body: { text?: string } }>(
    '/spike/conversations/:conversationId/messages', async (request, reply) => {
      const { conversationId } = request.params;
      const text = request.body?.text;
      const key = request.headers['idempotency-key'];
      if (!validUuid(conversationId) || typeof text !== 'string' || text.length < 1 || text.length > 4000 ||
          typeof key !== 'string' || key.length < 1 || key.length > 120) {
        return reply.code(400).send({ error: 'INVALID_MESSAGE' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const conversation = await client.query<Conversation>(
          'SELECT id, mode, revision, next_sequence FROM spike.conversations WHERE id = $1 FOR UPDATE', [conversationId],
        );
        const row = conversation.rows[0];
        if (!row) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });
        }
        const existing = await client.query<Event>(
          'SELECT sequence, kind, body FROM spike.conversation_events WHERE conversation_id = $1 AND idempotency_key = $2',
          [conversationId, key],
        );
        const previous = existing.rows[0];
        if (previous) {
          await client.query('ROLLBACK');
          if (previous.kind !== 'customer_message' || previous.body.text !== text) {
            return reply.code(409).send({ error: 'IDEMPOTENCY_CONFLICT' });
          }
          return reply.code(200).send({ sequence: previous.sequence });
        }
        await client.query(
          `INSERT INTO spike.conversation_events (id, conversation_id, sequence, kind, body, idempotency_key)
           VALUES ($1, $2, $3, 'customer_message', $4::jsonb, $5)`,
          [randomUUID(), conversationId, row.next_sequence, JSON.stringify({ text }), key],
        );
        await client.query('UPDATE spike.conversations SET next_sequence = next_sequence + 1 WHERE id = $1', [conversationId]);
        await client.query('COMMIT');
        return reply.code(201).send({ sequence: row.next_sequence });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  );

  app.post<{ Params: { conversationId: string } }>(
    '/spike/conversations/:conversationId/handoff', async (request, reply) => {
      const { conversationId } = request.params;
      if (!validUuid(conversationId)) return reply.code(400).send({ error: 'INVALID_CONVERSATION' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await client.query<Conversation>(
          'SELECT id, mode, revision, next_sequence FROM spike.conversations WHERE id = $1 FOR UPDATE', [conversationId],
        );
        const row = current.rows[0];
        if (!row) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });
        }
        if (row.mode === 'human') {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'ALREADY_HUMAN' });
        }
        await client.query(
          'UPDATE spike.conversations SET mode = $1, revision = revision + 1, next_sequence = next_sequence + 1 WHERE id = $2',
          ['human', conversationId],
        );
        await client.query(
          `INSERT INTO spike.conversation_events (id, conversation_id, sequence, kind, body)
           VALUES ($1, $2, $3, 'human_handoff', '{}'::jsonb)`,
          [randomUUID(), conversationId, row.next_sequence],
        );
        await client.query('COMMIT');
        return { sequence: row.next_sequence };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  );

  app.post<{ Params: { conversationId: string }; Body: { expectedRevision?: number; text?: string } }>(
    '/spike/conversations/:conversationId/ai-commit', async (request, reply) => {
      const { conversationId } = request.params;
      const { expectedRevision, text } = request.body ?? {};
      if (!validUuid(conversationId) || !Number.isInteger(expectedRevision) ||
          typeof text !== 'string' || text.length < 1 || text.length > 4000) {
        return reply.code(400).send({ error: 'INVALID_AI_COMMIT' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await client.query<Conversation>(
          'SELECT id, mode, revision, next_sequence FROM spike.conversations WHERE id = $1 FOR UPDATE', [conversationId],
        );
        const row = current.rows[0];
        if (!row) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });
        }
        if (row.mode !== 'ai' || row.revision !== expectedRevision) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ suppressed: true });
        }
        await client.query(
          `INSERT INTO spike.conversation_events (id, conversation_id, sequence, kind, body)
           VALUES ($1, $2, $3, 'ai_message', $4::jsonb)`,
          [randomUUID(), conversationId, row.next_sequence, JSON.stringify({ text })],
        );
        await client.query('UPDATE spike.conversations SET next_sequence = next_sequence + 1 WHERE id = $1', [conversationId]);
        await client.query('COMMIT');
        return reply.code(201).send({ sequence: row.next_sequence });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  );

  app.get<{ Params: { conversationId: string }; Querystring: { cursor?: string } }>(
    '/spike/conversations/:conversationId/events', async (request, reply) => {
      const { conversationId } = request.params;
      const startCursor = request.headers['last-event-id'] ?? request.query.cursor ?? '0';
      if (!validUuid(conversationId) || typeof startCursor !== 'string' || !/^(0|[1-9][0-9]*)$/.test(startCursor)) {
        return reply.code(400).send({ error: 'INVALID_CURSOR' });
      }
      const exists = await pool.query('SELECT 1 FROM spike.conversations WHERE id = $1', [conversationId]);
      if (!exists.rowCount) return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });
      reply.raw.flushHeaders();
      let cursor = startCursor;
      let active = true;
      reply.raw.on('close', () => { active = false; });
      try {
        while (active) {
          const events = await pool.query<Event>(
            `SELECT sequence, kind, body FROM spike.conversation_events
             WHERE conversation_id = $1 AND sequence > $2::bigint ORDER BY sequence LIMIT 100`,
            [conversationId, cursor],
          );
          for (const event of events.rows) {
            if (!active) break;
            reply.raw.write(`id: ${event.sequence}\nevent: ${event.kind}\ndata: ${JSON.stringify(event.body)}\n\n`);
            cursor = event.sequence;
          }
          if (active) await delay(75);
        }
      } catch (error) {
        reply.raw.destroy(error instanceof Error ? error : undefined);
      }
    },
  );
}
