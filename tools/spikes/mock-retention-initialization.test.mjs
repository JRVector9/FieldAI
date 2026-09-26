import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { promisify, parseEnv } from 'node:util';
import { test } from 'node:test';

test('first local setup initializes each journal but never recreates a lost keyed journal', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'retention-initialization-'));
  const script = resolve('tools/setup-mock-env.mjs');
  const run = () => promisify(execFile)(process.execPath, [script, 'agent', 'field'], { cwd: root });
  try {
    for (const product of ['agent', 'field']) await mkdir(resolve(root, 'infra', product), { recursive: true });
    await run();
    const initialAP=parseEnv(await readFile(resolve(root,'infra/agent/.env'),'utf8'));
    assert.ok(isAbsolute(initialAP.AP_REVOCATION_JOURNAL_DIRECTORY), 'generated AP journal must also work from the package script cwd');
    const revocationDirectory=resolve(root,initialAP.AP_REVOCATION_JOURNAL_DIRECTORY);
    assert.ok((await stat(revocationDirectory)).isDirectory());
    const revocationKey=initialAP.AP_REVOCATION_JOURNAL_SECRET;assert.ok(revocationKey);
    await rm(revocationDirectory,{recursive:true});
    const keys = [];
    for (const [product, prefix] of [['agent', 'AP'], ['field', 'FIELD']]) {
      const env = parseEnv(await readFile(resolve(root, 'infra', product, '.env'), 'utf8'));
      keys.push(env[`${prefix}_RETENTION_JOURNAL_SECRET`]);
      assert.ok(keys.at(-1));
      assert.ok((await stat(resolve(root, env[`${prefix}_RETENTION_JOURNAL_DIRECTORY`]))).isDirectory());
      await rm(resolve(root, env[`${prefix}_RETENTION_JOURNAL_DIRECTORY`]), { recursive: true });
    }
    await run();
    assert.equal(parseEnv(await readFile(resolve(root,'infra/agent/.env'),'utf8')).AP_REVOCATION_JOURNAL_SECRET,revocationKey);
    await assert.rejects(stat(revocationDirectory),{code:'ENOENT'});
    for (const [index, product] of ['agent', 'field'].entries()) {
      const prefix = product === 'agent' ? 'AP' : 'FIELD';
      const env = parseEnv(await readFile(resolve(root, 'infra', product, '.env'), 'utf8'));
      assert.equal(env[`${prefix}_RETENTION_JOURNAL_SECRET`], keys[index]);
      await assert.rejects(stat(resolve(root, env[`${prefix}_RETENTION_JOURNAL_DIRECTORY`])), { code: 'ENOENT' });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('existing AP relative journal is normalized without replacing its key or files', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'revocation-path-'));
  const script = resolve('tools/setup-mock-env.mjs');
  try {
    const packageCwd=resolve(root,'apps/agent-api');
    const directory=resolve(root,'infra/agent/revocation-journal');
    await mkdir(packageCwd,{recursive:true});
    await mkdir(directory,{recursive:true});
    await writeFile(resolve(directory,'preserved.json'),'existing signed metadata');
    const key='existing-synthetic-signing-key';
    const envPath=resolve(root,'infra/agent/.env');
    await writeFile(envPath,`AP_REVOCATION_JOURNAL_DIRECTORY=infra/agent/revocation-journal\nAP_REVOCATION_JOURNAL_SECRET=${key}\n`);
    await promisify(execFile)(process.execPath,[script,'agent'],{cwd:root});
    const env=parseEnv(await readFile(envPath,'utf8'));
    assert.equal(await realpath(env.AP_REVOCATION_JOURNAL_DIRECTORY),await realpath(directory));
    assert.equal(env.AP_REVOCATION_JOURNAL_SECRET,key);
    await promisify(execFile)(process.execPath,['--input-type=module','-e',
      "import{readFileSync}from'node:fs';if(readFileSync(process.env.AP_REVOCATION_JOURNAL_DIRECTORY+'/preserved.json','utf8')!=='existing signed metadata')process.exit(1)"],
      {cwd:packageCwd,env:{...process.env,AP_REVOCATION_JOURNAL_DIRECTORY:env.AP_REVOCATION_JOURNAL_DIRECTORY}});
  } finally {await rm(root,{recursive:true,force:true});}
});
