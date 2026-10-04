import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

test('approved account and organization deletion survives PG17 backup restore and gates serving until replay', async () => {
  const { AgentAccountDeletionJournal, assertAccountDeletionServing } = await import('../src/account-deletion-journal.js');
  const { reapplyAccountDeletionJournal } = await import('../src/account-deletion-restore.js');
  const source = new URL(process.env.AP_DATABASE_URL!);
  assert.match(source.pathname, /^\/fieldai_agent_test_[a-f0-9]+$/);
  const pool = new Pool({ connectionString: source.toString() });
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString() });
  const restoredName = `fieldai_agent_restore_${randomUUID().replaceAll('-', '')}`;
  const root = await mkdtemp(resolve(tmpdir(), 'agent-account-deletion-'));
  const journalRoot=resolve(root,'account-deletion');await mkdir(journalRoot);
  const journal = new AgentAccountDeletionJournal(journalRoot, 'synthetic-account-deletion-signing-key');
  const owner = randomUUID(), member = randomUUID(), account = randomUUID(), org = randomUUID(), otherOrg = randomUUID();
  const email = `${account}@EXAMPLE.invalid`;
  let restored: Pool | undefined;
  let app: ReturnType<typeof createAgentApp> | undefined;
  try {
    for (const id of [owner, member, account]) await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'PRIVATE ACCOUNT NAME\',$2,true)', [id, id === account ? email : `${id}@example.invalid`]);
    await pool.query('insert into "session"(id,"userId",token,"expiresAt","createdAt","updatedAt") values($1,$2,$3,now()+interval \'1 day\',now(),now())', [randomUUID(), account, randomUUID()]);
    await pool.query('insert into "account"(id,"accountId","providerId","userId",password,"updatedAt") values($1,$2,\'credential\',$2,\'PRIVATE PASSWORD HASH\',now())', [randomUUID(), account]);
    await pool.query('insert into ap.email_outbox("to",subject,text,purpose) values($1,\'auth\',\'PRIVATE AUTH LINK\',\'verify_email\')', [email.toLowerCase()]);
    for (const [id, actor] of [[org, owner], [otherOrg, member]]) await pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,\'Preserved business\')', [id, actor]);
    await pool.query("insert into ap.memberships(organization_id,user_id,role) values($1,$2,'owner'),($1,$3,'editor'),($4,$3,'owner')", [org, owner, member, otherOrg]);
    await pool.query('insert into ap.knowledge_drafts(organization_id,content,updated_by) values($1,$2::jsonb,$3)', [org, JSON.stringify({ businessName: 'Preserved business', introduction: 'PRIVATE BUSINESS INFO', services: [], faqs: [] }), owner]);
    const release = randomUUID(), inquiry = randomUUID();
    await pool.query('insert into ap.knowledge_releases(id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by) values($1,$2,1,1,\'native\',\'{}\',\'synthetic\',$3)', [release, org, owner]);
    await pool.query('insert into ap.inquiries(id,organization_id,knowledge_release_id,knowledge_revision,customer_name,customer_phone,visitor_key_hash,state,consent_at) values($1,$2,$3,1,\'PRESERVED CUSTOMER\',\'01000000000\',\'synthetic\',\'needs_owner\',now())', [inquiry, org, release]);
    // U owned a client that another organization authorized. The old backup
    // predates its deactivation, which is still required by the native blocker.
    const ownedClient=randomUUID(),otherSession=randomUUID(),otherGrant=randomUUID(),otherToken=randomUUID(),otherRefresh=randomUUID();
    await pool.query('insert into "oauthClient"(id,"clientId","redirectUris","userId",disabled) values($1,$1,\'[]\',$2,false)',[ownedClient,account]);
    await pool.query('insert into "session"(id,"userId",token,"expiresAt","updatedAt") values($1,$2,$3,now()+interval \'1 day\',now())',[otherSession,member,randomUUID()]);
    await pool.query('insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at) values($1,$2,$3,$4,$5,$6,array[\'ap.agent.read\'],now()+interval \'1 day\')',[otherGrant,otherSession,member,ownedClient,otherOrg,randomUUID()]);
    await pool.query('insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId","expiresAt","createdAt",scopes) values($1,$2,$3,$4,$5,now()+interval \'1 day\',now(),\'["ap.agent.read"]\')',[otherToken,randomUUID(),ownedClient,member,otherGrant]);
    await pool.query('insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","expiresAt","createdAt",scopes,"rotationReplayResponse","rotationReplayExpiresAt") values($1,$2,$3,$4,$5,now()+interval \'1 day\',now(),\'["ap.agent.read"]\',\'old replay\',now()+interval \'1 minute\')',[otherRefresh,randomUUID(),ownedClient,member,otherGrant]);
    await pool.query('insert into "oauthConsent"(id,"clientId","userId","referenceId",scopes,"createdAt","updatedAt") values($1,$2,$3,$4,\'["ap.agent.read"]\',now(),now())',[randomUUID(),ownedClient,member,otherGrant]);
    const snapshot = await promisify(execFile)('docker', ['exec', 'fieldai-agent-mock-db-1', 'pg_dump', '-U', 'agent_local', '-d', source.pathname.slice(1), '-Fc', '--no-owner', '--no-acl'], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
    await pool.query('update "oauthClient" set disabled=true where "clientId"=$1',[ownedClient]);
    const accountEntry = await journal.append({ targetKind: 'account', targetId: account, requestId: randomUUID(), ownerUserId: null, memberUserIds: [], sourceEmailHmac: journal.emailFingerprint(email), anonymousEmail: `deleted-${randomUUID()}@deleted.invalid` });
    await journal.append({ targetKind: 'organization', targetId: org, requestId: randomUUID(), ownerUserId: owner, memberUserIds: [owner, member], sourceEmailHmac: null, anonymousEmail: null });
    // An approved durable intent is not a completion claim. Until its DB commit
    // proof exists, even the original database must fail closed after a crash.
    await assert.rejects(assertAccountDeletionServing(pool, journal), /recovery required/);
    const checkpoint = await journal.checkpoint();
    assert.equal((await reapplyAccountDeletionJournal({ pool, journal, checkpoint })).applied, 2);
    await assertAccountDeletionServing(pool, journal);
    await admin.query(`create database "${restoredName}"`);
    await new Promise<void>((done, fail) => {
      const child = spawn('docker', ['exec', '-i', 'fieldai-agent-mock-db-1', 'pg_restore', '-U', 'agent_local', '-d', restoredName, '--no-owner', '--no-acl'], { stdio: ['pipe', 'ignore', 'pipe'] });
      let error = ''; child.stderr.on('data', value => { error += value; }); child.on('error', fail); child.on('close', code => code === 0 ? done() : fail(new Error(error))); child.stdin.end(snapshot.stdout);
    });
    const target = new URL(source); target.pathname = `/${restoredName}`;
    restored = new Pool({ connectionString: target.toString() });
    await assert.rejects(assertAccountDeletionServing(restored, journal), /recovery required/);
    app = createAgentApp(async () => undefined, undefined, undefined, undefined, { pool: restored, resolveUserId: async () => account, accountDeletionGuard: () => assertAccountDeletionServing(restored!, journal) });
    assert.equal((await app.inject('/health/ready')).statusCode, 503);
    assert.equal((await app.inject('/v1/organizations/current')).statusCode, 503);
    await assert.rejects(promisify(execFile)(process.execPath,['--import','tsx','src/billing-charge-worker.ts','--once'],{
      env:{...process.env,AP_PROFILE:'mock',AP_DATABASE_URL:target.toString(),AP_RETENTION_JOURNAL_DIRECTORY:root,
        AP_RETENTION_JOURNAL_SECRET:'synthetic-account-deletion-signing-key'}}),/recovery required/);
    await restored.query('update "user" set email=\'OTHER OWNER EMAIL@example.invalid\' where id=$1',[account]);
    await assert.rejects(reapplyAccountDeletionJournal({pool:restored,journal,checkpoint}),/binding_conflict/);
    assert.equal((await restored.query('select 1 from ap.memberships where organization_id=$1',[org])).rowCount,2,'binding mismatch rejects before any cleanup');
    await restored.query('update "user" set email=$2 where id=$1',[account,email]);
    const applied = await reapplyAccountDeletionJournal({ pool: restored, journal, checkpoint });
    assert.equal(applied.applied, 2);
    assert.equal((await reapplyAccountDeletionJournal({ pool: restored, journal, checkpoint })).applied, 0);
    await assertAccountDeletionServing(restored, journal);
    const user = (await restored.query('select name,email,"twoFactorEnabled" from "user" where id=$1', [account])).rows[0];
    assert.equal(user.name, '삭제된 사용자'); assert.equal(user.email, accountEntry.anonymousEmail); assert.equal(user.twoFactorEnabled, false);
    assert.equal((await restored.query('select 1 from "account" where "userId"=$1', [account])).rowCount, 0);
    assert.equal((await restored.query('select 1 from ap.memberships where organization_id=$1', [org])).rowCount, 0);
    assert.equal((await restored.query('select 1 from ap.memberships where organization_id=$1 and user_id=$2', [otherOrg, member])).rowCount, 1);
    assert.equal((await restored.query('select "to" from ap.email_outbox')).rows[0].to, accountEntry.anonymousEmail);
    assert.doesNotMatch(JSON.stringify((await restored.query('select content from ap.knowledge_drafts where organization_id=$1', [org])).rows), /PRIVATE BUSINESS INFO/);
    assert.equal((await restored.query('select customer_name from ap.inquiries where id=$1', [inquiry])).rows[0].customer_name, 'PRESERVED CUSTOMER');
    assert.equal((await restored.query('select name from ap.organizations where id=$1', [org])).rows[0].name, 'Preserved business');
    assert.equal((await restored.query('select disabled from "oauthClient" where "clientId"=$1',[ownedClient])).rows[0].disabled,true);
    assert.ok((await restored.query('select revoked from "oauthAccessToken" where id=$1',[otherToken])).rows[0].revoked);
    const refresh=(await restored.query('select revoked,"rotationReplayResponse","rotationReplayExpiresAt" from "oauthRefreshToken" where id=$1',[otherRefresh])).rows[0];
    assert.ok(refresh.revoked);assert.equal(refresh.rotationReplayResponse,null);assert.equal(refresh.rotationReplayExpiresAt,null);
    assert.ok((await restored.query('select revoked_at from ap.oauth_selections where id=$1',[otherGrant])).rows[0].revoked_at);
    assert.equal((await restored.query('select 1 from "oauthConsent" where "clientId"=$1',[ownedClient])).rowCount,0);
    await assert.rejects(restored.query('insert into "oauthAccessToken"(id,token,"clientId","userId","expiresAt","createdAt",scopes) values($1,$2,$3,$4,now()+interval \'1 day\',now(),\'[]\')',[randomUUID(),randomUUID(),ownedClient,member]),{code:'PAD02'},'another surviving user cannot issue a token through the deleted owner client');
    // Warm serving checks use only identity/receipt epoch plus the directory
    // stamp; they never rescan every file or target on each request.
    let queries=0;
    const counting=new Proxy(restored,{get(target,key){if(key==='query')return(...args:unknown[])=>{queries++;assert.doesNotMatch(String(args[0]),/count\(\*\)/i,'warm proof must use the singleton epoch rather than aggregate receipts');return Reflect.apply(target.query,target,args);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
    await assertAccountDeletionServing(counting,journal);assert.equal(queries,1);
    for (const table of ['ap.deletion_journal_receipts', 'ap.deletion_restore_audit','ap.deletion_replay_audit','ap.deletion_receipt_epoch']) await assert.rejects(restored.query(`truncate ${table}`), { code: 'PAD01' });
    await assert.rejects(restored.query('update ap.deletion_receipt_epoch set generation=generation+1'),{code:'PAD01'});
    await assert.rejects(restored.query('delete from ap.deletion_receipt_epoch'),{code:'PAD01'});
    const files = (await readdir(journalRoot)).filter(name => name.endsWith('.json'));
    const path = resolve(journalRoot, files[0]!), saved = await readFile(path, 'utf8');
    try { await writeFile(path, saved.replace(/"signature":"(.)/, (_match, digit: string) => `"signature":"${digit === '0' ? '1' : '0'}`));
      await assert.rejects(reapplyAccountDeletionJournal({ pool: restored, journal, checkpoint }), /signature/);
    } finally { await writeFile(path, saved); }
  } finally {
    await app?.close(); await restored?.end(); await pool.end();
    await admin.query(`drop database if exists "${restoredName}" with(force)`); await admin.end();
  }
});
