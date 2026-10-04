import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Unit HTTP fixtures still pass the real fail-closed deletion guard. This models
// an empty, independently provisioned Field journal and its own database binding.
export async function emptyDeletionProofFixture() {
  const root = await mkdtemp(join(tmpdir(), 'field-unit-deletion-'));
  await mkdir(join(root, 'account-deletion'), { mode: 0o700 });
  const binding = randomUUID();
  process.env.FIELD_RETENTION_JOURNAL_DIRECTORY = root;
  process.env.FIELD_RETENTION_JOURNAL_SECRET = 'synthetic-unit-deletion-secret-32-bytes';
  return {
    query(sql: string) {
      if (sql.includes('pg_database d where datname=current_database()'))
        return { rows: [{ identity: binding, state: '0:0' }], rowCount: 1 };
      if (sql.includes('from pg_namespace')) return { rows: [{ nspname: 'field' }], rowCount: 1 };
      if (sql.includes('select id from field.account_deletion_journal_binding'))
        return { rows: [{ id: binding }], rowCount: 1 };
      if (sql === 'select * from field.account_deletion_receipts') return { rows: [], rowCount: 0 };
      return undefined;
    },
    close: () => rm(root, { recursive: true, force: true }),
  };
}
