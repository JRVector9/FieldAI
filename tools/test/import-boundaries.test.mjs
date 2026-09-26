import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { findBoundaryViolations } from '../check-import-boundaries.mjs';

test('rejects AP import of Field internal module while allowing AP local import', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fieldai-boundary-'));
  try {
    const agent = join(root, 'apps/agent-api/src');
    const field = join(root, 'apps/field-api/src');
    await mkdir(agent, { recursive: true });
    await mkdir(field, { recursive: true });
    await writeFile(join(agent, 'local.ts'), 'export const value = 1;');
    await writeFile(join(field, 'secret.ts'), 'export const secret = 1;');
    await writeFile(join(agent, 'app.ts'), "import './local.js';\nimport '../../field-api/src/secret.js';\n");
    const violations = await findBoundaryViolations(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /field-api/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
