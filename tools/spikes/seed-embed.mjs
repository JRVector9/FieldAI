import { resolve } from 'node:path';
import { Pool } from 'pg';

process.loadEnvFile(resolve('infra/agent/.env'));
const connectionString = process.env.AP_DATABASE_URL;
if (!connectionString) throw new Error('AP_DATABASE_URL is required');
const pool = new Pool({ connectionString });
try {
  await pool.query(
    `INSERT INTO spike.widget_installations (id, allowed_origin, active)
     VALUES ('spike-external-site', 'http://127.0.0.1:4381', true)
     ON CONFLICT (id) DO UPDATE SET allowed_origin = excluded.allowed_origin, active = true`,
  );
  process.stdout.write('Synthetic AP installation ready for http://127.0.0.1:4381\n');
} finally { await pool.end(); }
