import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { anonymizeFieldAccount } from '../src/account-deletion.js';
import { accountDeletionJournalFromEnvironment,assertAccountDeletionServing,deletionDatabaseBinding,persistDeletionReceipt } from '../src/account-deletion-journal.js';
import { createFieldApp } from '../src/app.js';
import { reapplyFieldAccountDeletions } from '../src/account-deletion-restore.js';

test('a previously authenticated writer waits for deletion and cannot revive sessions, credentials, MFA, profile or clients',async()=>{
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),deleted=randomUUID(),healthy=randomUUID(),email=`${deleted}@example.invalid`;
  const deletion=await pool.connect(),writer=await pool.connect();let transaction=false;
  try {
    for(const id of [deleted,healthy])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$1,$2,true)',[id,`${id}@example.invalid`]);
    await deletion.query('begin');transaction=true;await deletion.query('select id from "user" where id=$1 for update',[deleted]);
    const pid=(await writer.query('select pg_backend_pid() as id')).rows[0].id;
    const late=writer.query(`insert into "session"(id,"userId",token,"updatedAt","expiresAt") values($1,$2,$3,now(),now()+interval '1 day')`,[randomUUID(),deleted,randomUUID()]).then(()=>null,error=>error);
    const deadline=Date.now()+3000;let waiting=false;
    while(Date.now()<deadline){waiting=(await pool.query("select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'",[pid])).rowCount!==0;if(waiting)break;await new Promise(done=>setImmediate(done));}
    assert.ok(waiting,'the concurrent authentication writer must actually wait on the deletion transaction');
    const journal=accountDeletionJournalFromEnvironment()!;
    const entry=await journal.append({targetKind:'account',targetId:deleted,databaseBinding:await deletionDatabaseBinding(deletion),requestId:null,emailFingerprint:journal.emailFingerprint(email),memberIds:[],assets:[]});
    await anonymizeFieldAccount(deletion,deleted,email,`deleted-${entry.id}@deleted.invalid`,entry.id);await persistDeletionReceipt(deletion,entry,'applied');
    await deletion.query('commit');transaction=false;
    const rejected=await late;assert.equal(rejected?.code,'PFA01','late sign-in currently recreates a live session after the deletion commits');
    const attempts=[
      {sql:'insert into "account"(id,"accountId","providerId","userId",password,"updatedAt") values($1,$2,\'credential\',$2,\'restored-secret\',now())',args:[randomUUID(),deleted]},
      {sql:'insert into "twoFactor"(id,"userId",secret,"backupCodes") values($1,$2,\'restored-secret\',\'[]\')',args:[randomUUID(),deleted]},
      {sql:'update "user" set name=\'restored private name\',email=$2 where id=$1',args:[deleted,email]},
      {sql:'update "user" set "twoFactorEnabled"=true where id=$1',args:[deleted]},
      {sql:'insert into "oauthClient"(id,"clientId","userId","redirectUris",name) values($1,$1,$2,\'[]\',\'restored client\')',args:[randomUUID(),deleted]},
    ];
    for(const attempt of attempts)await assert.rejects(pool.query(attempt.sql,attempt.args),error=>(error as {code:string}).code==='PFA01');
    await pool.query(`insert into "session"(id,"userId",token,"updatedAt","expiresAt") values($1,$2,$3,now(),now()+interval '1 day')`,[randomUUID(),healthy,randomUUID()]);
    await assertAccountDeletionServing(pool,journal);
    const metadataQueries:string[]=[];
    const tracing={query:async(sql:string)=>{metadataQueries.push(sql);return pool.query(sql);}} as unknown as Pick<Pool,'query'>;
    await assertAccountDeletionServing(tracing,journal);
    assert.equal(metadataQueries.length,1,'a warm serving check should only read its own binding/receipt epoch');
    assert.doesNotMatch(metadataQueries[0]!,/count\(\*\)|from field\.account_deletion_receipts/,'warm requests must not scan every historical receipt');
    const app=createFieldApp(async()=>undefined,undefined,undefined,{pool,resolveUserId:async()=>healthy});
    try{assert.equal((await app.inject('/health/ready')).statusCode,200);}finally{await app.close();}
  }finally{if(transaction)await deletion.query('rollback');writer.release();deletion.release();await pool.end();}
});

test('an in-flight deletion retry adopts the durable signed intent after its first transaction rolled back',async()=>{
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),owner=randomUUID(),email=`${owner}@example.invalid`,password='Synthetic-only-password-123!';
  const first=await pool.connect(),journal=accountDeletionJournalFromEnvironment()!,app=createFieldApp(async()=>undefined,undefined,undefined,{pool,resolveUserId:async()=>owner});let transaction=false;
  try {
    await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$1,$2,true)',[owner,email]);
    await pool.query(`insert into "account"(id,"accountId","providerId","userId",password,"updatedAt") values($1,$2,'credential',$2,$3,now())`,[randomUUID(),owner,await hashPassword(password)]);
    await first.query('begin');transaction=true;await first.query('select id from "user" where id=$1 for update',[owner]);
    const pending=app.inject({method:'POST',url:'/v1/account/deletion-requests',payload:{acknowledgement:true,confirmText:email,password}});
    const deadline=Date.now()+3000;let waiting=false;
    while(Date.now()<deadline){waiting=(await pool.query(`select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()
      and wait_event_type='Lock' and query like 'select email from "user" where id=%for update'`)).rowCount!==0;if(waiting)break;await new Promise(done=>setImmediate(done));}
    assert.ok(waiting,'the second request must pass HTTP guards and actually wait for the first deletion lock');
    const entry=await journal.append({targetKind:'account',targetId:owner,databaseBinding:await deletionDatabaseBinding(first),requestId:null,emailFingerprint:journal.emailFingerprint(email),memberIds:[],assets:[]});
    await first.query('rollback');transaction=false;
    const result=await pending;assert.equal(result.statusCode,200,result.body);
    assert.equal((await journal.read(true)).filter(e=>e.targetKind==='account'&&e.targetId===owner).length,1,'two signed ids for the same account cannot share the canonical anonymous email');
    assert.equal((await pool.query('select email from "user" where id=$1',[owner])).rows[0].email,`deleted-${entry.id}@deleted.invalid`);
    await assertAccountDeletionServing(pool,journal);
  }finally{if(transaction)await first.query('rollback');first.release();await app.close();await pool.end();}
});

test('session renewal holding a child row fails promptly rather than making the deletion transaction a deadlock victim',async()=>{
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),owner=randomUUID(),session=randomUUID(),email=`${owner}@example.invalid`;
  const deletion=await pool.connect(),renewal=await pool.connect(),journal=accountDeletionJournalFromEnvironment()!;
  try {
    await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$1,$2,true)',[owner,email]);
    await pool.query(`insert into "session"(id,"userId",token,"updatedAt","expiresAt") values($1,$2,$3,now(),now()+interval '1 day')`,[session,owner,randomUUID()]);
    await renewal.query('begin');await renewal.query('select id from "session" where id=$1 for update',[session]);
    await deletion.query('begin');await deletion.query('select id from "user" where id=$1 for update',[owner]);
    const pid=(await deletion.query('select pg_backend_pid() as id')).rows[0].id;
    const entry=await journal.append({targetKind:'account',targetId:owner,databaseBinding:await deletionDatabaseBinding(deletion),requestId:null,emailFingerprint:journal.emailFingerprint(email),memberIds:[],assets:[]});
    const finishing=(async()=>{await anonymizeFieldAccount(deletion,owner,email,`deleted-${entry.id}@deleted.invalid`,entry.id);await persistDeletionReceipt(deletion,entry,'applied');})().then(()=>null,error=>error);
    const deadline=Date.now()+3000;let waiting=false;
    while(Date.now()<deadline){waiting=(await pool.query("select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'",[pid])).rowCount!==0;if(waiting)break;await new Promise(done=>setImmediate(done));}
    assert.ok(waiting,'deletion must actually wait on the existing session row');
    const result=await renewal.query(`update "session" set "expiresAt"=now()+interval '2 days',"updatedAt"=now() where id=$1`,[session]).then(()=>null,error=>error);
    await renewal.query('rollback');const deleted=await finishing;
    if(deleted)await deletion.query('rollback');else await deletion.query('commit');
    assert.equal(result?.code,'55P03','the auth writer must fail on the user lock before PostgreSQL chooses a deletion deadlock victim');
    assert.equal(deleted,null,'an approved deletion must finish without leaving an orphan signed intent');
    await assertAccountDeletionServing(pool,journal);
  }finally{
    await renewal.query('rollback');await deletion.query('rollback');renewal.release();deletion.release();
    await reapplyFieldAccountDeletions({pool,journal,checkpoint:await journal.checkpoint()});await pool.end();
  }
});

test('already authenticated organization creation and new membership/admin grants cannot survive account deletion',async()=>{
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),owner=randomUUID(),healthy=randomUUID(),otherOrg=randomUUID(),email=`${owner}@example.invalid`;
  const deletion=await pool.connect(),journal=accountDeletionJournalFromEnvironment()!,app=createFieldApp(async()=>undefined,undefined,undefined,{pool,resolveUserId:async()=>owner});let transaction=false;
  try {
    for(const id of [owner,healthy])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$1,$2,true)',[id,`${id}@example.invalid`]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,\'Healthy business\')',[otherOrg,healthy]);
    await deletion.query('begin');transaction=true;await deletion.query('select id from "user" where id=$1 for update',[owner]);
    const pending=app.inject({method:'POST',url:'/v1/organizations',payload:{name:'Late business'}});
    const deadline=Date.now()+3000;let waiting=false;
    while(Date.now()<deadline){waiting=(await pool.query(`select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock'
      and query like 'insert into field.organizations%'`)).rowCount!==0;if(waiting)break;await new Promise(done=>setImmediate(done));}
    assert.ok(waiting,'the already authenticated organization insert must wait for the account deletion');
    const entry=await journal.append({targetKind:'account',targetId:owner,databaseBinding:await deletionDatabaseBinding(deletion),requestId:null,emailFingerprint:journal.emailFingerprint(email),memberIds:[],assets:[]});
    await anonymizeFieldAccount(deletion,owner,email,`deleted-${entry.id}@deleted.invalid`,entry.id);await persistDeletionReceipt(deletion,entry,'applied');await deletion.query('commit');transaction=false;
    assert.notEqual((await pending).statusCode,201,'a deleted account currently creates a new owner organization after its FK wait');
    assert.equal((await pool.query('select 1 from field.organizations where owner_user_id=$1',[owner])).rowCount,0);
    await assert.rejects(pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner')",[otherOrg,owner]),error=>(error as {code:string}).code==='PFA01');
    await assert.rejects(pool.query("insert into field.platform_admin_memberships(user_id,role) values($1,'operator')",[owner]),error=>(error as {code:string}).code==='PFA01');
    await assertAccountDeletionServing(pool,journal);
  }finally{if(transaction)await deletion.query('rollback');deletion.release();await app.close();await pool.end();}
});
