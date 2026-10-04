import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { FieldRevocationJournal } from '../src/revocation-journal.js';

test('live baseline CLI dry-run is unchanged and apply binds confirmed database and snapshot', async () => {
  const root=await mkdtemp(resolve(tmpdir(),'field-live-baseline-'));
  await mkdir(resolve(root,'oauth-lifecycle'));
  const env={...process.env,NODE_ENV:'production',FIELD_PROFILE:'live',
    FIELD_REVOCATION_JOURNAL_DIRECTORY:root,FIELD_REVOCATION_JOURNAL_SECRET:'synthetic-live-baseline-secret'};
  const cli=(...args:string[])=>promisify(execFile)(process.execPath,['--import','tsx','src/oauth-lifecycle-cli.ts','--baseline-quiesced',...args],{env,maxBuffer:1024*1024});
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL});
  try {
    const before=await pool.query('select count(*)::int n from field.oauth_lifecycle_receipts');
    const plan=JSON.parse((await cli('--dry-run')).stdout) as {product:string;databaseFingerprint:string;planDigest:string};
    assert.equal(plan.product,'field');assert.match(plan.databaseFingerprint,/^[a-f0-9]{64}$/);assert.match(plan.planDigest,/^[a-f0-9]{64}$/);
    assert.deepEqual(await readdir(root),['oauth-lifecycle']);assert.deepEqual(await readdir(resolve(root,'oauth-lifecycle')),[]);
    assert.equal((await pool.query('select count(*)::int n from field.oauth_lifecycle_receipts')).rows[0].n,before.rows[0].n);
    const flags=['--confirm-product=field',`--confirm-database=${plan.databaseFingerprint}`,'--confirm-writers-stopped',`--expected-plan=${plan.planDigest}`];
    await assert.rejects(cli(...flags.filter(f=>f!=='--confirm-writers-stopped')),/live baseline requires/);
    await assert.rejects(cli(...flags.map(f=>f.startsWith('--confirm-product=')?'--confirm-product=agent':f)),/live baseline requires/);
    await assert.rejects(cli(...flags.map(f=>f.startsWith('--confirm-database=')?`--confirm-database=${'0'.repeat(64)}`:f)),/database confirmation mismatch/);
    await assert.rejects(cli(...flags.map(f=>f.startsWith('--expected-plan=')?`--expected-plan=${'0'.repeat(64)}`:f)),/baseline plan changed/);
    assert.deepEqual(await readdir(resolve(root,'oauth-lifecycle')),[]);
    const writer=await pool.connect();
    try {await writer.query('begin');await writer.query('lock table "oauthAccessToken" in row exclusive mode');
      await assert.rejects(cli('--dry-run'),/active OAuth writers/);
    } finally {await writer.query('rollback');writer.release();}
    await pool.query('create schema ap');
    try {await assert.rejects(cli('--dry-run'),/isolated field database/);} finally {await pool.query('drop schema ap');}
    assert.match((await cli(...flags)).stdout,/legacy lifecycle baseline recorded/);
    assert.equal((await pool.query('select count(*)::int n from field.oauth_lifecycle_receipts')).rows[0].n,before.rows[0].n+1);
    await assert.rejects(cli(...flags),/baseline plan changed/);
    const after=JSON.parse((await cli('--dry-run')).stdout) as typeof plan;
    assert.equal(after.databaseFingerprint,plan.databaseFingerprint);assert.notEqual(after.planDigest,plan.planDigest);
    assert.match((await cli('--confirm-product=field',`--confirm-database=${after.databaseFingerprint}`,'--confirm-writers-stopped',`--expected-plan=${after.planDigest}`)).stdout,/baseline recorded/);
    assert.equal((await pool.query('select count(*)::int n from field.oauth_lifecycle_receipts')).rows[0].n,before.rows[0].n+1);
    for(const [script,mode,key] of [['oauth-lifecycle-cli.ts','--checkpoint-quiesced','FIELD_OAUTH_LIFECYCLE_CHECKPOINT_OUTPUT'],
      ['revocation-checkpoint-cli.ts','--quiesced','FIELD_REVOCATION_CHECKPOINT_OUTPUT']]){
      const destination=resolve(root,'..',`${root.split('/').at(-1)}-${script}.checkpoint`);
      const exportCli=(args:string[],output=destination)=>promisify(execFile)(process.execPath,['--import','tsx',`src/${script}`,...args],{env:{...env,[key!]:output},maxBuffer:1024*1024});
      const exportFlags=[mode!,'--confirm-product=field',`--confirm-database=${after.databaseFingerprint}`,'--confirm-writers-stopped'];
      await assert.rejects(exportCli(exportFlags.slice(0,-1)),/live checkpoint requires/);
      await assert.rejects(exportCli(exportFlags,resolve(root,'inside.checkpoint')),/outside the journal/);
      assert.match((await exportCli(exportFlags)).stdout,/checkpoint exported/);
      assert.equal((await stat(destination)).mode&0o777,0o600);
      assert.match(await readFile(destination,'utf8'),/signature/);
      await assert.rejects(exportCli(exportFlags),/EEXIST/);
    }
    const selection=randomUUID(),native=new FieldRevocationJournal(root,env.FIELD_REVOCATION_JOURNAL_SECRET);
    const entry=await native.append({targetKind:'selection',targetId:selection,selectionId:selection,organizationId:randomUUID(),source:'owner',revocationId:null});
    await pool.query(`insert into field.revocation_restore_audit(entry_id,organization_id,target_kind,target_id,outcome)
      values($1,$2,'selection',$3,'target_absent')`,[entry.id,entry.organizationId,entry.targetId]);
    await unlink(resolve(root,`${entry.id}.json`));
    await assert.rejects(cli('--dry-run'),/native revocation journal continuity lost/);
  } finally {await pool.end();}
});
