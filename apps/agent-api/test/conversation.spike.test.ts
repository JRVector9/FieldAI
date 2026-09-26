import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

process.loadEnvFile(resolve('../../infra/agent/.env'));

test('POST idempotency, SSE replay and human handoff suppress stale AI commit', async () => {
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const conversationId = randomUUID();
  const app = createAgentApp(async () => undefined, undefined, 'http://127.0.0.1:4311', pool);
  const abort = new AbortController();
  try {
    await pool.query('INSERT INTO spike.conversations (id) VALUES ($1)', [conversationId]);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const base = `${address}/spike/conversations/${conversationId}`;
    const post = (path: string, body: object, key?: string) => fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body),
    });
    const first = await post('/messages', { text: '안녕하세요' }, 'same-key');
    assert.equal(first.status, 201);
    assert.equal((await first.json() as { sequence: string }).sequence, '1');
    const duplicate = await post('/messages', { text: '안녕하세요' }, 'same-key');
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json() as { sequence: string }).sequence, '1');
    const changed = await post('/messages', { text: '다른 내용' }, 'same-key');
    assert.equal(changed.status, 409);

    const stream = await fetch(`${base}/events`, {
      headers: { 'Last-Event-ID': '0' }, signal: abort.signal,
    });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    async function nextEvent() {
      while (!buffer.includes('\n\n')) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false);
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      const end = buffer.indexOf('\n\n');
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      return event;
    }
    assert.match(await nextEvent(), /id: 1\nevent: customer_message/);
    const second = await post('/messages', { text: '예약 가능한가요?' }, 'second-key');
    assert.equal(second.status, 201);
    assert.match(await nextEvent(), /id: 2\nevent: customer_message/);
    abort.abort();

    const handoff = await post('/handoff', {});
    assert.equal(handoff.status, 200);
    assert.equal((await handoff.json() as { sequence: string }).sequence, '3');
    const staleAi = await post('/ai-commit', { expectedRevision: 0, text: 'AI 답변' });
    assert.equal(staleAi.status, 409);
    assert.deepEqual(await staleAi.json(), { suppressed: true });
    const eventRows = await pool.query<{ kind: string }>(
      'SELECT kind FROM spike.conversation_events WHERE conversation_id = $1 ORDER BY sequence', [conversationId],
    );
    assert.deepEqual(eventRows.rows.map((row) => row.kind), ['customer_message', 'customer_message', 'human_handoff']);

    const replay = await fetch(`${base}/events`, { headers: { 'Last-Event-ID': '2' } });
    assert.equal(replay.status, 200);
    const replayReader = replay.body!.getReader();
    const replayChunk = await replayReader.read();
    assert.match(decoder.decode(replayChunk.value), /id: 3\nevent: human_handoff/);
    await replayReader.cancel();
  } finally {
    abort.abort();
    await app.close();
    await pool.query('DELETE FROM spike.conversations WHERE id = $1', [conversationId]);
    await pool.end();
  }
});
