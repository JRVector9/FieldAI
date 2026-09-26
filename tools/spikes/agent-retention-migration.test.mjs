import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';

process.loadEnvFile(resolve('infra/agent/.env'));
const source=new URL(process.env.AP_DATABASE_URL);
assert.equal(source.hostname,'127.0.0.1'); assert.equal(source.port,'55431');
assert.equal(source.username,'agent_local'); assert.equal(source.pathname,'/fieldai_agent_mock');

test('AP retention migration preserves originals and uses only current matching legacy closure evidence',async()=>{
 const adminURL=new URL(source); adminURL.pathname='/postgres';
 const admin=new pg.Client({connectionString:adminURL.toString()}); await admin.connect();
 const name=`fieldai_ap_retention_migration_${randomUUID().replaceAll('-','')}`;
 let created=false,db;
 try{
  await admin.query(`create database "${name}"`); created=true;
  const target=new URL(source); target.pathname=`/${name}`;
  db=new pg.Client({connectionString:target.toString()}); await db.connect();
  const dir=resolve('apps/agent-api/migrations'),files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files.filter(f=>f<'000064_')) await db.query(await readFile(resolve(dir,file),'utf8'));
  const user=randomUUID(),org=randomUUID(),knowledge=randomUUID();
  await db.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[user,'Synthetic AP migration actor',`${user}@example.invalid`]);
  await db.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,user,'Synthetic AP migration organization']);
  await db.query("insert into ap.knowledge_releases(id,organization_id,revision,draft_revision,source_kind,content,content_hash,approved_by) values($1,$2,1,1,'native','{}',$3,$4)",[knowledge,org,'a'.repeat(64),user]);
  const inquiries=Array.from({length:3},()=>randomUUID());
  for(const id of inquiries) await db.query(`insert into ap.inquiries(id,organization_id,knowledge_release_id,knowledge_revision,
    customer_name,customer_phone,visitor_key_hash,consent_at,state,revision,updated_at)
    values($1,$2,$3,1,'PRIVATE_AP_LEGACY_CUSTOMER','010-3333-4444',$4,now(),'closed',2,now())`,[id,org,knowledge,randomUUID()]);
  const when='2025-09-01T10:00:00.000Z';
  await db.query(`insert into ap.inquiry_resolution_events(id,inquiry_id,event_type,revision,actor_user_id,created_at)
    values($1,$2,'closed',2,$3,$4),($5,$6,'closed',1,$3,$4)`,[randomUUID(),inquiries[0],user,when,randomUUID(),inquiries[1]]);
  const before=(await db.query('select * from ap.inquiries order by id')).rows;
  await db.query(await readFile(resolve(dir,'000064_work_retention_basis.sql'),'utf8'));
  assert.equal((await db.query('select retention_closed_at from ap.inquiries where id=$1',[inquiries[0]])).rows[0].retention_closed_at.toISOString(),when);
  for(const id of inquiries.slice(1)) assert.equal((await db.query('select retention_closed_at from ap.inquiries where id=$1',[id])).rows[0].retention_closed_at,null);
  const after=(await db.query('select * from ap.inquiries order by id')).rows.map(row=>{const original={...row};delete original.retention_closed_at;return original;});
  assert.deepEqual(after,before);
  await db.query("update ap.inquiries set state='needs_owner' where id=$1",[inquiries[0]]);
  assert.equal((await db.query('select retention_closed_at from ap.inquiries where id=$1',[inquiries[0]])).rows[0].retention_closed_at,null);
  await db.query("update ap.inquiries set state='closed' where id=$1",[inquiries[0]]);
  const closed=(await db.query('select retention_closed_at from ap.inquiries where id=$1',[inquiries[0]])).rows[0].retention_closed_at;
  assert.ok(closed.getTime()>Date.parse(when));
  await db.query("update ap.inquiries set state='closed' where id=$1",[inquiries[0]]);
  assert.equal((await db.query('select retention_closed_at from ap.inquiries where id=$1',[inquiries[0]])).rows[0].retention_closed_at.toISOString(),closed.toISOString());
 }finally{
  try{if(db) await db.end();}finally{
   try{if(created){await admin.query(`drop database "${name}" with(force)`);console.log('Removed isolated AP retention migration database');}}
   finally{await admin.end();}
  }
 }
});
