import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { Pool } from 'pg';

test('live AP baseline plans without writes and applies only the confirmed unchanged own database', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'agent-live-baseline-'));
  await mkdir(resolve(root, 'oauth-lifecycle'));
  const env = { ...process.env, NODE_ENV: 'production', AP_PROFILE: 'live',
    AP_REVOCATION_JOURNAL_DIRECTORY: root, AP_REVOCATION_JOURNAL_SECRET: 'synthetic-live-baseline-agent-secret' };
  const cli = (...args: string[]) => promisify(execFile)(process.execPath,
    ['--import', 'tsx', 'src/oauth-lifecycle-cli.ts', '--baseline-quiesced', ...args], { env, maxBuffer: 1024 * 1024 });
  const pool = new Pool({ connectionString: process.env.AP_DATABASE_URL });
  const planOf = async () => JSON.parse((await cli('--dry-run')).stdout) as {
    product: string; databaseFingerprint: string; planDigest: string; counts: Record<string, number> };
  const flagsOf = (plan: Awaited<ReturnType<typeof planOf>>) => ['--confirm-product=agent',
    `--confirm-database=${plan.databaseFingerprint}`, '--confirm-writers-stopped', `--expected-plan=${plan.planDigest}`];
  try {
    const before = (await pool.query('select count(*)::int n from ap.oauth_lifecycle_receipts')).rows[0].n;
    const plan = await planOf();
    assert.equal(plan.product, 'agent');
    assert.match(plan.databaseFingerprint, /^[a-f0-9]{64}$/); assert.match(plan.planDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(await planOf(), plan, 'unchanged state has a stable plan');
    assert.deepEqual(await readdir(root), ['oauth-lifecycle']);
    assert.deepEqual(await readdir(resolve(root, 'oauth-lifecycle')), []);
    assert.equal((await pool.query('select count(*)::int n from ap.oauth_lifecycle_receipts')).rows[0].n, before);
    const flags = flagsOf(plan);
    await assert.rejects(cli(...flags.filter(f => f !== '--confirm-writers-stopped')), /live baseline requires/);
    await assert.rejects(cli('--dry-run', ...flags), /live baseline requires/);
    await assert.rejects(cli(...flags.map(f => f.startsWith('--confirm-product=') ? '--confirm-product=field' : f)), /live baseline requires/);
    await assert.rejects(cli(...flags.map(f => f.startsWith('--confirm-database=') ? `--confirm-database=${'0'.repeat(64)}` : f)), /database confirmation mismatch/);
    await assert.rejects(cli(...flags.map(f => f.startsWith('--expected-plan=') ? `--expected-plan=${'0'.repeat(64)}` : f)), /baseline plan changed/);
    assert.deepEqual(await readdir(resolve(root, 'oauth-lifecycle')), []);
    const writer = await pool.connect();
    try {
      await writer.query('begin'); await writer.query('lock table "oauthAccessToken" in row exclusive mode');
      await assert.rejects(cli('--dry-run'), /active OAuth writers/);
      await assert.rejects(cli(...flags), /lock timeout|active OAuth writers/);
    } finally { await writer.query('rollback'); writer.release(); }
    await pool.query('create schema field');
    try { await assert.rejects(cli('--dry-run'), /isolated agent database/); }
    finally { await pool.query('drop schema field'); }
    // A later client registration also changes the baseline snapshot; the old plan cannot apply.
    await pool.query('insert into "oauthClient"(id,"clientId","redirectUris") values($1,$2,\'[]\'::jsonb)', [randomUUID(), randomUUID()]);
    await assert.rejects(cli(...flags), /baseline plan changed/);
    const fresh = await planOf(); assert.notEqual(fresh.planDigest, plan.planDigest);
    assert.match((await cli(...flagsOf(fresh))).stdout, /legacy lifecycle baseline recorded/);
    assert.equal((await pool.query('select count(*)::int n from ap.oauth_lifecycle_receipts')).rows[0].n, before + 1);
    await assert.rejects(cli(...flagsOf(fresh)), /baseline plan changed/);
    const after = await planOf(); assert.equal(after.databaseFingerprint, plan.databaseFingerprint);
    assert.match((await cli(...flagsOf(after))).stdout, /baseline recorded/);
    assert.equal((await pool.query('select count(*)::int n from ap.oauth_lifecycle_receipts')).rows[0].n, before + 1);
    const checkpointFlags = ['--confirm-product=agent', `--confirm-database=${after.databaseFingerprint}`, '--confirm-writers-stopped'];
    const exportCli = (file: string, mode: string, outputKey: string, output: string, flags: string[]) => promisify(execFile)(process.execPath,
      ['--import', 'tsx', `src/${file}`, mode, ...flags], { env: { ...env, [outputKey]: output } });
    for (const [file, mode, key, name] of [
      ['revocation-checkpoint-cli.ts', '--quiesced', 'AP_REVOCATION_CHECKPOINT_OUTPUT', 'native-checkpoint.json'],
      ['oauth-lifecycle-cli.ts', '--checkpoint-quiesced', 'AP_OAUTH_LIFECYCLE_CHECKPOINT_OUTPUT', 'lifecycle-checkpoint.json'],
    ]) {
      const output = resolve(root, '..', `${root.split('/').at(-1)}-${name}`);
      await assert.rejects(exportCli(file!, mode!, key!, output, checkpointFlags.slice(0, 2)), /live checkpoint requires/);
      await assert.rejects(exportCli(file!, mode!, key!, output, checkpointFlags.map(f => f.startsWith('--confirm-database=') ? `--confirm-database=${'0'.repeat(64)}` : f)), /database confirmation mismatch/);
      assert.match((await exportCli(file!, mode!, key!, output, checkpointFlags)).stdout, /checkpoint exported/);
      assert.equal((await stat(output)).mode & 0o777, 0o600);
      assert.ok(JSON.parse(await readFile(output, 'utf8')).signature);
      await assert.rejects(exportCli(file!, mode!, key!, output, checkpointFlags), /EEXIST/);
      await assert.rejects(exportCli(file!, mode!, key!, resolve(root, name!), checkpointFlags), /outside/);
    }
    // Stall the CLI's actual FileHandle.sync, then race a baseline. The fence
    // must remain held until file and directory fsync both finish.
    const gate=await mkdtemp(resolve(tmpdir(),'agent-baseline-fsync-')),preload=resolve(gate,'preload.mjs');
    const output=resolve(gate,'protected.json'),ready=resolve(gate,'ready'),release=resolve(gate,'release');
    await writeFile(preload,`import fs from 'node:fs/promises';
const sample=await fs.open(process.env.TEST_SYNC_TARGET+'.probe','w'),prototype=Object.getPrototypeOf(sample),sync=prototype.sync;await sample.close();
prototype.sync=async function(){await fs.writeFile(process.env.TEST_SYNC_READY,'ready');for(let i=0;i<200;i++){try{await fs.stat(process.env.TEST_SYNC_RELEASE);return sync.call(this);}catch{}await new Promise(r=>setTimeout(r,25));}throw new Error('test fsync gate timeout');};`);
    const child=spawn(process.execPath,['--import','tsx','--import',preload,'src/oauth-lifecycle-cli.ts','--checkpoint-quiesced',...checkpointFlags],{
      env:{...env,AP_OAUTH_LIFECYCLE_CHECKPOINT_OUTPUT:output,TEST_SYNC_TARGET:output,TEST_SYNC_READY:ready,TEST_SYNC_RELEASE:release},stdio:['ignore','pipe','pipe']});
    let stderr='';child.stderr.on('data',value=>{stderr+=value;});
    const finished=new Promise<void>((done,fail)=>{child.on('error',fail);child.on('close',code=>code===0?done():fail(new Error(stderr)));});
    try{
      let reached=false;for(let i=0;i<200&&!reached;i++){try{await stat(ready);reached=true;}catch{await new Promise(r=>setTimeout(r,10));}}
      assert.equal(reached,true,'export must reach fsync');
      await assert.rejects(cli(...flagsOf(after)),/another live baseline is already running/);
    }finally{await writeFile(release,'release');await finished;}
  } finally { await pool.end(); }
});
