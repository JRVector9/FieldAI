import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { organizationDeletionScheduled, subscriptionAccess } from '../src/subscription-access.js';

test('Field entitlement and organization guard query required deletion schema without per-call discovery',async()=>{
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),owner=randomUUID(),org=randomUUID();
  const statements:string[]=[];
  const observed={query:async(sql:string,values?:unknown[])=>{statements.push(sql);return pool.query(sql,values);}} as unknown as PoolClient;
  try {
    await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$1,$2,true)',[owner,`${owner}@example.invalid`]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,$3)',[org,owner,'Synthetic schema query count']);
    assert.equal((await subscriptionAccess(observed,org)).canStartNew,true);
    assert.equal(await organizationDeletionScheduled(observed,org),false);
    assert.equal(statements.some(sql=>sql.includes('to_regclass')),false);
    assert.equal(statements.length,7);
    await pool.query(`insert into field.organization_deletion_requests(id,organization_id,requested_by,confirmation,status,scheduled_at,next_attempt_at)
      values($1,$2,$3,'{}','scheduled',now()+interval '14 days',now()+interval '14 days')`,[randomUUID(),org,owner]);
    assert.equal((await subscriptionAccess(observed,org)).reason,'deletion_scheduled');
    assert.equal(await organizationDeletionScheduled(observed,org),true);
  }finally{await pool.end();}
});
