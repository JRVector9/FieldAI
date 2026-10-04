import assert from 'node:assert/strict';
import { execFile,spawn } from 'node:child_process';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { mkdtemp,mkdir,readFile,rename,symlink,unlink,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { runOrganizationDeletionOnce } from '../src/account-deletion.js';
import { FieldFileMediaStore,runSiteAssetDeletionOnce } from '../src/site-media.js';
import { accountDeletionJournalFromEnvironment,assertAccountDeletionServing,AccountDeletionJournal,deletionDatabaseBinding } from '../src/account-deletion-journal.js';
import { reapplyFieldAccountDeletions } from '../src/account-deletion-restore.js';

test('actual pre-deletion backup is fenced until signed account/site cleanup is replayed; customers and billing survive',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'field-deletion-restore-')),activeMedia=resolve(root,'active'),restoredMedia=resolve(root,'restored');
  await mkdir(activeMedia);await mkdir(restoredMedia);
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),owner=randomUUID(),approver=randomUUID(),org=randomUUID(),site=randomUUID(),asset=randomUUID(),catalog=randomUUID(),request=randomUUID(),inquiry=randomUUID();
  const key=`${org}/${asset}.webp`,receipt=randomBytes(32).toString('base64url'),password='Synthetic-only-password-123!',email=`private-${owner}@example.invalid`;
  const media=new FieldFileMediaStore(activeMedia),restoreMedia=new FieldFileMediaStore(restoredMedia),journal=accountDeletionJournalFromEnvironment()!;
  const app=createFieldApp(async()=>undefined,undefined,undefined,{pool,resolveUserId:async()=>owner,siteMedia:media});
  const source=new URL(process.env.FIELD_DATABASE_URL!);assert.match(source.pathname,/^\/fieldai_field_test_[a-f0-9]+$/);
  const adminUrl=new URL(source);adminUrl.pathname='/postgres';const admin=new Pool({connectionString:adminUrl.toString()});
  const restoreName=`fieldai_field_restore_${randomUUID().replaceAll('-','')}`;let restored:Pool|undefined,restoredApp:ReturnType<typeof createFieldApp>|undefined,created=false;
  try {
    for(const user of [owner,approver])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$1,$2,true)',[user,user===owner?email:`${user}@example.invalid`]);
    await pool.query(`insert into "account"(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values($1,$2,'credential',$2,$3,now(),now())`,[randomUUID(),owner,await hashPassword(password)]);
    await pool.query(`insert into "session"(id,"userId",token,"createdAt","updatedAt","expiresAt") values($1,$2,$3,now(),now(),now()+interval '1 day')`,[randomUUID(),owner,randomUUID()]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,owner,'Signed deletion synthetic']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner')",[org,owner]);
    const content=JSON.stringify({businessName:'Signed deletion synthetic',industry:'PRIVATE_INDUSTRY',introduction:'PRIVATE_INTRO',region:'',openingHours:'',contactPhone:'010-1111-2222',defaultBookingMode:'request',services:[],faqs:[]});
    await pool.query('insert into field.catalog_drafts(organization_id,content,updated_by) values($1,$2,$3)',[org,content,owner]);
    await pool.query('insert into field.catalog_releases(id,organization_id,revision,content,content_hash,approved_by) values($1,$2,1,$3,\'synthetic\',$4)',[catalog,org,content,owner]);
    await pool.query('insert into field.sites(id,organization_id,slug) values($1,$2,$3)',[site,org,`field-${org.replaceAll('-','').slice(0,12)}`]);
    await pool.query('insert into field.site_drafts(site_id,content,updated_by) values($1,$2,$3)',[site,JSON.stringify({pages:[]}),owner]);
    await media.put(key,Buffer.from('synthetic-photo'));await restoreMedia.put(key,Buffer.from('synthetic-photo'));
    await pool.query(`insert into field.site_assets(id,organization_id,object_key,content_type,byte_size,width,height,sha256,uploaded_by)
      values($1,$2,$3,'image/webp',15,1,1,$4,$5)`,[asset,org,key,'a'.repeat(64),owner]);
    await pool.query(`insert into field.inquiries(id,organization_id,catalog_revision,service_id,service_snapshot,customer_name,customer_phone,visitor_key_hash,state,consent_at)
      values($1,$2,1,$3,'{}','PRESERVED_CUSTOMER','010-0000-0000',$4,'needs_owner',now())`,[inquiry,org,randomUUID(),createHash('sha256').update(receipt).digest('hex')]);
    await pool.query(`insert into field.email_outbox(id,"to",subject,text,purpose,state,sent_at) values($1,$2,'PRIVATE_SUBJECT',$2,'verify_email','sent',now())`,[randomUUID(),email]);
    const plan=randomUUID(),subscription=randomUUID();
    await pool.query(`insert into field.billing_plans(id,mode,name,total_amount,supply_amount,vat_amount,included_ai_units,grace_days,terms_version,terms_text,refund_version,refund_text,reference,requested_by,approved_by,approved_at)
      values($1,'test','Synthetic',11000,10000,1000,1,3,'v1','Synthetic','v1','Synthetic','SYNTHETIC',$2,$3,now())`,[plan,owner,approver]);
    await pool.query(`insert into field.paid_subscriptions(id,organization_id,plan_id,customer_key,state,created_by,terminated_at) values($1,$2,$3,$4,'canceled',$5,now())`,[subscription,org,plan,randomUUID(),owner]);
    const dump=await promisify(execFile)('docker',['exec','fieldai-field-mock-db-1','pg_dump','-U','field_local','-d',source.pathname.slice(1),'-Fc','--no-owner','--no-acl'],{encoding:'buffer',maxBuffer:32*1024*1024});
    await pool.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,requested_at,scheduled_at,next_attempt_at)
      values($1,$2,$3,'{}','scheduled',now()-interval '15 days',now()-interval '1 day',now())`,[request,org,owner]);
    assert.equal(await runOrganizationDeletionOnce({pool,siteMedia:media}),'blocked');await assertAccountDeletionServing(pool,journal);
    assert.equal((await runSiteAssetDeletionOnce({pool,siteMedia:media})).deleted,1);
    await pool.query('update field.organization_deletion_requests set next_attempt_at=now() where id=$1',[request]);
    assert.equal(await runOrganizationDeletionOnce({pool,siteMedia:media}),'executed');
    const deletion=await app.inject({method:'POST',url:'/v1/account/deletion-requests',payload:{acknowledgement:true,confirmText:email,password}});assert.equal(deletion.statusCode,200,deletion.body);
    const checkpoint=await journal.checkpoint();assert.doesNotMatch(JSON.stringify(await journal.read()),/private-|PRIVATE_|010-|SYNTHETIC-KEPT/);
    await admin.query(`create database "${restoreName}"`);created=true;const restoreUrl=new URL(source);restoreUrl.pathname='/'+restoreName;restored=new Pool({connectionString:restoreUrl.toString()});
    await new Promise<void>((done,fail)=>{const child=spawn('docker',['exec','-i','fieldai-field-mock-db-1','pg_restore','-U','field_local','-d',restoreName,'--exit-on-error','--no-owner','--no-acl'],{stdio:['pipe','ignore','pipe']});let err='';child.stderr.on('data',b=>err+=String(b));child.once('error',fail);child.once('exit',code=>code===0?done():fail(new Error(err)));child.stdin.end(dump.stdout);});
    restoredApp=createFieldApp(async()=>undefined,undefined,undefined,{pool:restored,resolveUserId:async()=>owner});
    assert.equal((await restoredApp.inject('/v1/account/deletion-eligibility')).statusCode,503);
    await assert.rejects(reapplyFieldAccountDeletions({pool:restored,journal,checkpoint,siteMedia:{...restoreMedia,put:async()=>undefined,get:async()=>Buffer.from('still-present'),delete:async()=>undefined}}),/unconfirmed/);
    assert.equal((await restored.query('select count(*)::int n from field.account_deletion_receipts')).rows[0].n,0);
    assert.equal((await reapplyFieldAccountDeletions({pool:restored,journal,checkpoint,siteMedia:restoreMedia})).applied,2);
    assert.equal((await reapplyFieldAccountDeletions({pool:restored,journal,checkpoint,siteMedia:restoreMedia})).applied,0);
    await assertAccountDeletionServing(restored,journal);
    assert.equal((await restored.query('select email from "user" where id=$1',[owner])).rows[0].email,`deleted-${(await journal.read()).find(e=>e.targetKind==='account')!.id}@deleted.invalid`);
    assert.equal((await restored.query('select count(*)::int n from "account" where "userId"=$1',[owner])).rows[0].n,0);
    assert.equal(await restoreMedia.get(key),null);
    assert.equal((await restored.query('select customer_name from field.inquiries where id=$1',[inquiry])).rows[0].customer_name,'PRESERVED_CUSTOMER');
    assert.equal((await restored.query('select count(*)::int n from field.paid_subscriptions where id=$1',[subscription])).rows[0].n,1);
    assert.equal((await restoredApp.inject({url:`/v1/inquiries/${inquiry}`,headers:{authorization:`Bearer ${receipt}`}})).statusCode,200);
    // Simulate a later partial pg_restore after the applied receipt survived.
    // Restore can recreate the deleted client's grants for a different actor.
    const client=randomUUID(),access=randomUUID(),refresh=randomUUID(),consent=randomUUID();
    const triggers=[['user','account_deletion_user_guard'],['account','account_deletion_credential_guard'],['oauthClient','account_deletion_client_guard'],
      ['oauthAccessToken','account_deletion_access_guard'],['oauthRefreshToken','account_deletion_refresh_guard'],['oauthConsent','account_deletion_consent_guard']];
    for(const [table,trigger] of triggers)await restored.query(`alter table "${table}" disable trigger ${trigger}`);
    try {
      await restored.query('update "user" set name=\'RESTORED_PRIVATE_NAME\',email=$2 where id=$1',[owner,email]);
      await restored.query(`insert into "account"(id,"accountId","providerId","userId",password,"updatedAt") values($1,$2,'credential',$2,'RESTORED_PASSWORD',now())`,[randomUUID(),owner]);
      await restored.query(`insert into "oauthClient"(id,"clientId","userId",disabled,"redirectUris",name) values($1,$1,$2,false,'[]','RESTORED_OWNED_CLIENT')`,[client,owner]);
      await restored.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId",scopes,"createdAt","expiresAt") values($1,$2,$3,$4,'[]',now(),now()+interval '1 day')`,[refresh,randomUUID(),client,approver]);
      await restored.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","refreshId",scopes,"createdAt","expiresAt") values($1,$2,$3,$4,$5,'[]',now(),now()+interval '1 day')`,[access,randomUUID(),client,approver,refresh]);
      await restored.query(`insert into "oauthConsent"(id,"clientId","userId",scopes,"createdAt","updatedAt") values($1,$2,$3,'[]',now(),now())`,[consent,client,approver]);
    }finally{for(const [table,trigger] of triggers)await restored.query(`alter table "${table}" enable trigger ${trigger}`);}
    await assert.rejects(assertAccountDeletionServing(restored,new AccountDeletionJournal(journal.root,process.env.FIELD_RETENTION_JOURNAL_SECRET!)),/deletion recovery required/);
    assert.equal((await reapplyFieldAccountDeletions({pool:restored,journal,checkpoint,siteMedia:restoreMedia})).applied,1,'an existing applied receipt must not skip partially restored identity data');
    assert.equal((await restored.query('select disabled from "oauthClient" where "clientId"=$1',[client])).rows[0].disabled,true);
    assert.ok((await restored.query('select revoked from "oauthAccessToken" where id=$1',[access])).rows[0].revoked);
    assert.ok((await restored.query('select revoked from "oauthRefreshToken" where id=$1',[refresh])).rows[0].revoked);
    assert.equal((await restored.query('select 1 from "oauthConsent" where id=$1',[consent])).rowCount,0);
    assert.equal((await restored.query('select 1 from "account" where "userId"=$1',[owner])).rowCount,0);
    assert.equal((await reapplyFieldAccountDeletions({pool:restored,journal,checkpoint,siteMedia:restoreMedia})).applied,0);
    const privateActive=resolve(root,'private-active'),privateRestored=resolve(root,'private-restored');await mkdir(privateActive);await mkdir(privateRestored);
    const retentionCheckpoint=resolve(root,'protected-retention'),deletionCheckpoint=resolve(root,'protected-identity');
    const cliEnv={...process.env,FIELD_PROFILE:'mock',FIELD_RETENTION_CHECKPOINT_OUTPUT:retentionCheckpoint,
      FIELD_ACCOUNT_DELETION_CHECKPOINT_OUTPUT:deletionCheckpoint,FIELD_RETENTION_RESTORE_CHECKPOINT_FILE:retentionCheckpoint,
      FIELD_ACCOUNT_DELETION_RESTORE_CHECKPOINT_FILE:deletionCheckpoint,FIELD_RETENTION_RESTORE_DATABASE_URL:restoreUrl.toString(),
      FIELD_INQUIRY_MEDIA_DIRECTORY:privateActive,FIELD_RETENTION_RESTORE_MEDIA_DIRECTORY:privateRestored,
      FIELD_MEDIA_DIRECTORY:activeMedia,FIELD_ACCOUNT_DELETION_RESTORE_SITE_MEDIA_DIRECTORY:restoredMedia};
    await promisify(execFile)(process.execPath,['--import','tsx','src/retention-checkpoint-cli.ts','--quiesced'],{env:cliEnv});
    assert.match((await promisify(execFile)(process.execPath,['--import','tsx','src/retention-restore-cli.ts','--offline-restored'],{env:cliEnv})).stdout,/identity\/site deletions: 0/);
    await media.put(key,Buffer.from('ACTIVE_PHOTO_MUST_SURVIVE'));
    await rename(resolve(restoredMedia,org),resolve(restoredMedia,org+'.held'));
    await symlink(resolve(activeMedia,org),resolve(restoredMedia,org),'dir');
    try{await assert.rejects(promisify(execFile)(process.execPath,['--import','tsx','src/retention-restore-cli.ts','--offline-restored'],{env:cliEnv}),/restore media path is not confined/);
      assert.deepEqual(await media.get(key),Buffer.from('ACTIVE_PHOTO_MUST_SURVIVE'));}
    finally{await unlink(resolve(restoredMedia,org));await rename(resolve(restoredMedia,org+'.held'),resolve(restoredMedia,org));}
    await assert.rejects(promisify(execFile)(process.execPath,['--import','tsx','src/retention-restore-cli.ts','--offline-restored'],{
      env:{...cliEnv,FIELD_ACCOUNT_DELETION_RESTORE_SITE_MEDIA_DIRECTORY:activeMedia}}),/must differ from active Field site media/);
    const currentBinding=(await restored.query('select id from field.account_deletion_journal_binding')).rows[0].id;
    await restored.query('update field.account_deletion_journal_binding set id=$1',[randomUUID()]);
    try{await assert.rejects(reapplyFieldAccountDeletions({pool:restored,journal,checkpoint,siteMedia:restoreMedia}),/database binding mismatch/);}
    finally{await restored.query('update field.account_deletion_journal_binding set id=$1',[currentBinding]);}
    await restored.query('create schema ap');try{await assert.rejects(reapplyFieldAccountDeletions({pool:restored,journal,checkpoint,siteMedia:restoreMedia}),/isolated Field/);}finally{await restored.query('drop schema ap');}
    const entry=(await journal.read())[0]!,file=resolve(journal.root,`${entry.id}.json`),original=await readFile(file,'utf8');
    await writeFile(file,original.replace('"signature":"','"signature":"0'));try{await assert.rejects(journal.verifiedEntries(checkpoint),/signature|envelope/);}finally{await writeFile(file,original);}
    await rename(file,file+'.held');try{await assert.rejects(journal.verifiedEntries(checkpoint),/checkpoint mismatch/);}finally{await rename(file+'.held',file);}
    await assert.rejects(new AccountDeletionJournal(journal.root,'wrong-synthetic-signing-secret').verifiedEntries(checkpoint),/signature mismatch/);
  }finally{await restoredApp?.close();await app.close();await restored?.end();if(created)await admin.query(`drop database "${restoreName}"`);await admin.end();await pool.end();}
});

test('a deletion applied before the target user exists still fences and reapplies later partial identity restoration',async()=>{
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),owner=randomUUID(),email=`${owner}@example.invalid`,journal=accountDeletionJournalFromEnvironment()!;
  const siteMedia={put:async()=>undefined,get:async()=>null,delete:async()=>undefined};
  try {
    const entry=await journal.append({targetKind:'account',targetId:owner,databaseBinding:await deletionDatabaseBinding(pool),requestId:null,emailFingerprint:journal.emailFingerprint(email),memberIds:[],assets:[]});
    const checkpoint=await journal.checkpoint();
    assert.equal((await reapplyFieldAccountDeletions({pool,journal,checkpoint,siteMedia})).applied,1);
    await pool.query('alter table "user" disable trigger account_deletion_user_guard');
    try{await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'RESTORED_PRIVATE_NAME\',$2,true)',[owner,email]);}
    finally{await pool.query('alter table "user" enable trigger account_deletion_user_guard');}
    assert.equal((await reapplyFieldAccountDeletions({pool,journal,checkpoint,siteMedia})).applied,1);
    assert.equal((await pool.query('select email from "user" where id=$1',[owner])).rows[0].email,`deleted-${entry.id}@deleted.invalid`);
    assert.equal((await reapplyFieldAccountDeletions({pool,journal,checkpoint,siteMedia})).applied,0);
  }finally{await pool.end();}
});

test('signed site photos are removed even when the restored database predates the organization itself',async()=>{
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),root=await mkdtemp(resolve(tmpdir(),'field-absent-org-'));
  const org=randomUUID(),asset=randomUUID(),key=`${org}/${asset}.webp`,siteMedia=new FieldFileMediaStore(root),journal=accountDeletionJournalFromEnvironment()!;
  try {
    await siteMedia.put(key,Buffer.from('RESTORED_PRIVATE_PHOTO'));
    await journal.append({targetKind:'organization',targetId:org,databaseBinding:await deletionDatabaseBinding(pool),requestId:randomUUID(),emailFingerprint:null,memberIds:[],assets:[{id:asset,objectKey:key}]});
    const checkpoint=await journal.checkpoint();
    assert.equal((await reapplyFieldAccountDeletions({pool,journal,checkpoint,siteMedia})).applied,1);
    assert.equal(await siteMedia.get(key),null,'an absent database row must not bypass signed photo removal');
    assert.equal((await reapplyFieldAccountDeletions({pool,journal,checkpoint,siteMedia})).applied,0);
  }finally{await pool.end();}
});
