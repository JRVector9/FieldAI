import { resolve } from 'node:path';
import pg from 'pg';

const [action, email] = process.argv.slice(2);
if (!['grant', 'revoke'].includes(action) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  process.stderr.write('usage: pnpm mock:admin:field grant|revoke <existing-field-account-email>\n');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production') throw new Error('mock admin command is forbidden in production');
process.loadEnvFile(resolve('infra/field/.env'));
const url = new URL(process.env.FIELD_DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.username !== 'field_local'
  || url.pathname !== '/fieldai_field_mock')
  throw new Error('mock admin command requires the exact local Field mock database');
const pool = new pg.Pool({ connectionString: url.toString() });
try {
  const user = await pool.query('select id from "user" where email = $1', [email]);
  if (!user.rows[0]) throw new Error('Field account not found; create the Field account first');
  if (action === 'grant') {
    await pool.query(`insert into field.platform_admin_memberships(user_id, role) values ($1, 'operator')
      on conflict (user_id) do nothing`, [user.rows[0].id]);
  } else {
    await pool.query('delete from field.platform_admin_memberships where user_id = $1', [user.rows[0].id]);
  }
  process.stdout.write(`Field mock admin ${action} completed for ${email}\n`);
} finally { await pool.end(); }
