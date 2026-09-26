import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { confirmReservation } from '../src/reservations.js';

process.loadEnvFile(resolve('../../infra/field/.env'));

test('concurrent confirmations occupy a resource once and emit one event', async () => {
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL, max: 3 });
  const resourceId = randomUUID();
  const firstId = randomUUID();
  const secondId = randomUUID();
  const ids = [firstId, secondId];
  try {
    await pool.query('INSERT INTO spike.resources (id) VALUES ($1)', [resourceId]);
    for (const id of ids) {
      await pool.query(
        `INSERT INTO spike.reservations
         (id, resource_id, start_at, end_at, before_minutes, after_minutes)
         VALUES ($1, $2, $3, $4, 15, 15)`,
        [id, resourceId, '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z'],
      );
    }

    const results = await Promise.all(ids.map((reservationId) => confirmReservation(pool, reservationId)));
    assert.deepEqual(results.map((result) => result.status).sort(), ['confirmed', 'conflict']);

    const occupancy = await pool.query('SELECT count(*)::int AS count FROM spike.occupancies WHERE resource_id = $1', [resourceId]);
    const confirmed = await pool.query("SELECT count(*)::int AS count FROM spike.reservations WHERE resource_id = $1 AND state = 'confirmed'", [resourceId]);
    const events = await pool.query('SELECT count(*)::int AS count FROM spike.outbox WHERE reservation_id = ANY($1::text[])', [ids]);
    assert.equal(occupancy.rows[0]?.count, 1);
    assert.equal(confirmed.rows[0]?.count, 1);
    assert.equal(events.rows[0]?.count, 1);
  } finally {
    await pool.query('DELETE FROM spike.outbox WHERE reservation_id = ANY($1::text[])', [ids]).catch(() => undefined);
    await pool.query('DELETE FROM spike.occupancies WHERE reservation_id = ANY($1::text[])', [ids]).catch(() => undefined);
    await pool.query('DELETE FROM spike.reservations WHERE id = ANY($1::text[])', [ids]).catch(() => undefined);
    await pool.query('DELETE FROM spike.resources WHERE id = $1', [resourceId]).catch(() => undefined);
    await pool.end();
  }
});
