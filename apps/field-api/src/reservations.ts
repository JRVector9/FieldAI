import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export async function confirmReservation(pool: Pool, reservationId: string): Promise<{ status: 'confirmed' | 'conflict' }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reservation = await client.query<{ state: string }>(
      'SELECT state FROM spike.reservations WHERE id = $1 FOR UPDATE',
      [reservationId],
    );
    if (reservation.rowCount !== 1) throw new Error('reservation not found');
    if (reservation.rows[0]?.state === 'confirmed') {
      await client.query('COMMIT');
      return { status: 'confirmed' };
    }
    if (reservation.rows[0]?.state !== 'requested') throw new Error('reservation cannot be confirmed');

    await client.query(
      `INSERT INTO spike.occupancies (reservation_id, resource_id, period)
       SELECT id, resource_id,
              tstzrange(start_at - before_minutes * interval '1 minute',
                        end_at + after_minutes * interval '1 minute', '[)')
       FROM spike.reservations WHERE id = $1`,
      [reservationId],
    );
    await client.query("UPDATE spike.reservations SET state = 'confirmed' WHERE id = $1", [reservationId]);
    await client.query(
      'INSERT INTO spike.outbox (event_id, reservation_id, event_type) VALUES ($1, $2, $3)',
      [randomUUID(), reservationId, 'field.reservation.confirmed'],
    );
    await client.query('COMMIT');
    return { status: 'confirmed' };
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23P01') return { status: 'conflict' };
    throw error;
  } finally {
    client.release();
  }
}
