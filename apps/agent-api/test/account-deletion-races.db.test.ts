import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import { AgentAccountDeletionJournal, assertAccountDeletionServing, persistDeletionReceipt } from '../src/account-deletion-journal.js';
import { applyAccountDeletion, applyOrganizationDeletionCleanup } from '../src/account-deletion-apply.js';
import { reapplyAccountDeletionJournal } from '../src/account-deletion-restore.js';
const pool=new Pool({connectionString:process.env.AP_DATABASE_URL});
const journal=new AgentAccountDeletionJournal(await mkdtemp(resolve(tmpdir(),'agent-deletion-races-')),'synthetic-deletion-race-signing-key');
after(async()=>{await pool.end();});
const intent=(id:string,email:string)=>({targetKind:'account' as const,targetId:id,requestId:randomUUID(),ownerUserId:null,memberUserIds:[],sourceEmailHmac:journal.emailFingerprint(email),anonymousEmail:`deleted-${randomUUID()}@deleted.invalid`});

test('identity writes that read the user before deletion cannot create credentials, sessions, MFA or owned clients after commit',async()=>{
  const user=randomUUID(),email=`${user}@example.invalid`;
  await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'Original\',$2,true)',[user,email]);
  await pool.query('insert into "account"(id,"accountId","providerId","userId",password,"updatedAt") values($1,$2,\'credential\',$2,\'read-before-delete\',now())',[randomUUID(),user]);
  const observed=(await pool.query('select u.id,a.password from "user" u join "account" a on a."userId"=u.id where u.id=$1',[user])).rows[0];assert.equal(observed.password,'read-before-delete');
  const authority=await pool.connect();const entry=await journal.append(intent(user,email));
  try{
    await authority.query('begin');await applyAccountDeletion(authority,entry,journal);await persistDeletionReceipt(authority,entry);
    const writes=[
      pool.query('insert into "session"(id,"userId",token,"expiresAt","updatedAt") values($1,$2,$3,now()+interval \'1 day\',now())',[randomUUID(),user,randomUUID()]),
      pool.query('insert into "account"(id,"accountId","providerId","userId",password,"updatedAt") values($1,$2,\'credential\',$2,\'late\',now())',[randomUUID(),user]),
      pool.query('insert into "twoFactor"(id,"userId",secret,"backupCodes") values($1,$2,\'late-secret\',\'[]\')',[randomUUID(),user]),
      pool.query('insert into "oauthClient"(id,"clientId","redirectUris","userId",disabled) values($1,$1,\'[]\',$2,false)',[randomUUID(),user]),
      pool.query('update "user" set name=\'Original profile\',"twoFactorEnabled"=true where id=$1',[user]),
    ].map(promise=>promise.then(()=>null,error=>error as {code:string}));
    let waiting=0;for(let i=0;i<100&&waiting<5;i++){waiting=Number((await pool.query("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'")).rows[0].count);if(waiting<5)await new Promise(done=>setTimeout(done,10));}
    assert.equal(waiting,5,'all identity writers must wait on the same user lock');
    await authority.query('commit');
    assert.deepEqual((await Promise.all(writes)).map(error=>error?.code),Array(5).fill('PAD02'));
    await assertAccountDeletionServing(pool,journal);
  }finally{await authority.query('rollback');authority.release();
    await reapplyAccountDeletionJournal({pool,journal,checkpoint:await journal.checkpoint()});}
});

test('a target absent on the first partial restore is cleaned if it appears later; a healthy repeated replay remains zero',async()=>{
  const user=randomUUID(),email=`${user}@example.invalid`,entry=await journal.append(intent(user,email));
  const publisherOwner=randomUUID(),publisher=randomUUID();
  await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'Preserved\',$2,true)',[publisherOwner,`${publisherOwner}@example.invalid`]);
  await pool.query('insert into ap.publishers(id,owner_user_id,name) values($1,$2,\'Preserved publisher\')',[publisher,publisherOwner]);
  const checkpoint=await journal.checkpoint();
  assert.equal((await reapplyAccountDeletionJournal({pool,journal,checkpoint})).applied,1);
  const copier=await pool.connect();
  try{
    // pg_restore creates data before its post-data triggers. Reproduce that
    // administrative partial-copy stage without granting it to normal writes.
    await copier.query('begin');await copier.query("set local session_replication_role='replica'");
    await copier.query('insert into "user"(id,name,email,"emailVerified") values($1,\'RESTORED PRIVATE NAME\',$2,true)',[user,email]);
    await copier.query('insert into "account"(id,"accountId","providerId","userId",password,"updatedAt") values($1,$2,\'credential\',$2,\'RESTORED CREDENTIAL\',now())',[randomUUID(),user]);
    await copier.query('insert into ap.platform_admin_memberships(user_id,role) values($1,\'operator\')',[user]);
    await copier.query('insert into ap.publisher_memberships(publisher_id,user_id,role) values($1,$2,\'editor\')',[publisher,user]);
    await copier.query('commit');
  }finally{await copier.query('rollback');copier.release();}
  await assert.rejects(assertAccountDeletionServing(pool,new AgentAccountDeletionJournal(journal.root,'synthetic-deletion-race-signing-key')),/recovery required/);
  assert.equal((await reapplyAccountDeletionJournal({pool,journal,checkpoint})).applied,1);
  assert.equal((await pool.query('select email from "user" where id=$1',[user])).rows[0].email,entry.anonymousEmail);
  assert.equal((await pool.query('select 1 from "account" where "userId"=$1',[user])).rowCount,0);
  assert.equal((await pool.query('select 1 from ap.platform_admin_memberships where user_id=$1',[user])).rowCount,0);
  assert.equal((await pool.query('select 1 from ap.publisher_memberships where user_id=$1',[user])).rowCount,0);
  assert.equal((await reapplyAccountDeletionJournal({pool,journal,checkpoint})).applied,0);
});

test('a preauthenticated retry waiting on a rolled-back deletion reuses its durable approved intent and anonymous binding',async()=>{
  const user=randomUUID(),email=`${user}@example.invalid`;
  await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'Original\',$2,true)',[user,email]);
  const first=await pool.connect(),second=await pool.connect();
  try{
    await first.query('begin');await first.query('select id from "user" where id=$1 for update',[user]);
    const approved=await journal.append(intent(user,email));await applyAccountDeletion(first,approved,journal);
    const retry=(async()=>{
      await second.query('begin');const observed=(await second.query('select email from "user" where id=$1 for update',[user])).rows[0];
      assert.equal(observed.email,email);
      const reused=await journal.append(intent(user,observed.email));
      await applyAccountDeletion(second,reused,journal);await persistDeletionReceipt(second,reused);await second.query('commit');return reused;
    })();
    let waiting=0;for(let i=0;i<100&&!waiting;i++){waiting=Number((await pool.query("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'")).rows[0].count);if(!waiting)await new Promise(done=>setTimeout(done,10));}
    assert.equal(waiting,1,'authenticated retry must wait for the prior deletion transaction');
    await assert.rejects(assertAccountDeletionServing(pool,journal),/recovery required/,'the signed decision without a commit remains recovery-required');
    await first.query('rollback');const reused=await retry;
    assert.deepEqual(reused,approved);
    assert.equal((await journal.read(true)).filter(entry=>entry.targetId===user).length,1);
    assert.equal((await pool.query('select email from "user" where id=$1',[user])).rows[0].email,approved.anonymousEmail);
    await assertAccountDeletionServing(pool,journal);
  }finally{await first.query('rollback');await second.query('rollback');first.release();second.release();}
});

test('a preauthenticated request cannot grant new organization, publisher or administrator access after account deletion',async()=>{
  const user=randomUUID(),email=`${user}@example.invalid`,other=randomUUID(),org=randomUUID(),publisher=randomUUID(),newOrg=randomUUID(),newPublisher=randomUUID();
  for(const id of [user,other])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'Original\',$2,true)',[id,id===user?email:`${id}@example.invalid`]);
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,\'Existing\')',[org,other]);
  await pool.query('insert into ap.publishers(id,owner_user_id,name) values($1,$2,\'Existing\')',[publisher,other]);
  const authority=await pool.connect(),entry=await journal.append(intent(user,email));
  try{
    await authority.query('begin');await applyAccountDeletion(authority,entry,journal);await persistDeletionReceipt(authority,entry);
    const writes=[
      pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,\'Late\')',[newOrg,user]),
      pool.query('insert into ap.memberships(organization_id,user_id,role) values($1,$2,\'editor\')',[org,user]),
      pool.query('insert into ap.publishers(id,owner_user_id,name) values($1,$2,\'Late\')',[newPublisher,user]),
      pool.query('insert into ap.publisher_memberships(publisher_id,user_id,role) values($1,$2,\'editor\')',[publisher,user]),
      pool.query('insert into ap.platform_admin_memberships(user_id,role) values($1,\'operator\')',[user]),
    ].map(promise=>promise.then(()=>null,error=>error as {code:string}));
    let waiting=0;for(let i=0;i<100&&waiting<5;i++){waiting=Number((await pool.query("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'")).rows[0].count);if(waiting<5)await new Promise(done=>setTimeout(done,10));}
    assert.equal(waiting,5);await authority.query('commit');
    assert.deepEqual((await Promise.all(writes)).map(error=>error?.code),Array(5).fill('PAD02'));
    await assertAccountDeletionServing(pool,journal);
  }finally{
    await authority.query('rollback');authority.release();
    await pool.query('delete from ap.organizations where id=$1',[newOrg]);await pool.query('delete from ap.publishers where id=$1',[newPublisher]);
    await pool.query('delete from ap.platform_admin_memberships where user_id=$1',[user]);await pool.query('delete from ap.publisher_memberships where user_id=$1',[user]);
    await reapplyAccountDeletionJournal({pool,journal,checkpoint:await journal.checkpoint()});
  }
});

test('a child session refresh that already owns the session row aborts without cancelling the approved deletion',async()=>{
  const user=randomUUID(),email=`${user}@example.invalid`,session=randomUUID();
  await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'Original\',$2,true)',[user,email]);
  await pool.query('insert into "session"(id,"userId",token,"expiresAt","updatedAt") values($1,$2,$3,now()+interval \'1 day\',now())',[session,user,randomUUID()]);
  const refresher=await pool.connect(),authority=await pool.connect();
  try{
    await refresher.query('begin');await refresher.query('select id from "session" where id=$1 for update',[session]);
    await authority.query('begin');await authority.query("set local deadlock_timeout='100ms'");await authority.query('select id from "user" where id=$1 for update',[user]);
    const entry=await journal.append(intent(user,email));
    const deleting=applyAccountDeletion(authority,entry,journal).then(()=>null,error=>error as {code:string});
    let waiting=0;for(let i=0;i<100&&!waiting;i++){waiting=Number((await pool.query("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'")).rows[0].count);if(!waiting)await new Promise(done=>setTimeout(done,10));}
    assert.equal(waiting,1,'deletion must be waiting for the already held child row');
    const refreshed=await refresher.query('update "session" set "expiresAt"=now()+interval \'2 days\',"updatedAt"=now() where id=$1',[session]).then(()=>null,error=>error as {code:string});
    await refresher.query('rollback');
    const deletionFailure=await deleting;assert.equal(deletionFailure,null,'the approved deletion must not be chosen as a deadlock victim');
    await persistDeletionReceipt(authority,entry);await authority.query('commit');
    assert.equal(refreshed?.code,'55P03','child update must fail NOWAIT rather than form the reverse lock cycle');
    assert.equal((await pool.query('select "expiresAt"<=now() as expired from "session" where id=$1',[session])).rows[0].expired,true);
    await assertAccountDeletionServing(pool,journal);
  }finally{await refresher.query('rollback');await authority.query('rollback');refresher.release();authority.release();await reapplyAccountDeletionJournal({pool,journal,checkpoint:await journal.checkpoint()});}
});

test('organization deletion terminally expires an MFA session while a legitimate profile writer owns its user row',async()=>{
  const user=randomUUID(),organization=randomUUID(),session=randomUUID();
  await pool.query('insert into "user"(id,name,email,"emailVerified","twoFactorEnabled") values($1,\'Preserved account\',$2,true,true)',[user,`${user}@example.invalid`]);
  await pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,\'Deleted business\')',[organization,user]);
  await pool.query('insert into ap.memberships(organization_id,user_id,role) values($1,$2,\'owner\')',[organization,user]);
  await pool.query('insert into "session"(id,"userId",token,"expiresAt","updatedAt","twoFactorVerified") values($1,$2,$3,now()+interval \'1 day\',now(),true)',[session,user,randomUUID()]);
  const profile=await pool.connect(),authority=await pool.connect();
  try{
    await profile.query('begin');await profile.query('select id from "user" where id=$1 for update',[user]);
    await authority.query('begin');await authority.query('select id from ap.organizations where id=$1 for update',[organization]);
    const entry=await journal.append({targetKind:'organization',targetId:organization,requestId:randomUUID(),ownerUserId:user,memberUserIds:[user],sourceEmailHmac:null,anonymousEmail:null});
    await applyOrganizationDeletionCleanup(authority,organization,new Date(entry.createdAt),[user]);
    await persistDeletionReceipt(authority,entry);await authority.query('commit');
    const terminal=(await pool.query('select "expiresAt"<=now() as expired,"twoFactorVerified" from "session" where id=$1',[session])).rows[0];
    assert.equal(terminal.expired,true);assert.equal(terminal.twoFactorVerified,false);
    await assertAccountDeletionServing(pool,journal);
  }finally{await authority.query('rollback');await profile.query('rollback');authority.release();profile.release();await reapplyAccountDeletionJournal({pool,journal,checkpoint:await journal.checkpoint()});}
});
