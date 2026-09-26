import { resolve } from 'node:path';
import pg from 'pg';

const [action, email] = process.argv.slice(2);
if (!['grant', 'revoke'].includes(action) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  process.stderr.write('usage: pnpm mock:admin:agent grant|revoke <existing-ap-account-email>\n');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production') throw new Error('mock admin command is forbidden in production');
process.loadEnvFile(resolve('infra/agent/.env'));
const url = new URL(process.env.AP_DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.port !== '55431' || url.username !== 'agent_local'
  || url.pathname !== '/fieldai_agent_mock')
  throw new Error('mock admin command requires the exact local AP mock database');
const pool = new pg.Pool({ connectionString: url.toString() });
try {
  const user = await pool.query('select id from "user" where email = $1', [email]);
  if (!user.rows[0]) throw new Error('AP account not found; create the AP account first');
  if (action === 'grant') {
    await pool.query(`insert into ap.platform_admin_memberships(user_id, role) values ($1, 'operator')
      on conflict (user_id) do nothing`, [user.rows[0].id]);
  } else {
    await pool.query('delete from ap.platform_admin_memberships where user_id = $1', [user.rows[0].id]);
  }
  process.stdout.write(`AP mock admin ${action} completed for ${email}\n`);
} finally { await pool.end(); }
