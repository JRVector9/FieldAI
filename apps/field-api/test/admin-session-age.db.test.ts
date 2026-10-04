import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

test('Field MFA administrator session expires after eight hours despite sliding renewal',async()=>{
  const pool=new Pool({connectionString:process.env.FIELD_DATABASE_URL}),owner=randomUUID(),session=randomUUID(),prior=process.env.FIELD_PROFILE;
  process.env.FIELD_PROFILE='mock';
  const app=createFieldApp(async()=>undefined,undefined,undefined,{pool,resolveUserId:async()=>owner,resolveSession:async()=>({id:session,userId:owner})});
  try {
    await pool.query('insert into "user"(id,name,email,"emailVerified","twoFactorEnabled") values($1,$1,$2,true,true)',[owner,`${owner}@example.invalid`]);
    await pool.query(`insert into "session"(id,"userId",token,"expiresAt","createdAt","updatedAt","twoFactorVerified")
      values($1,$2,$3,now()+interval '1 day',now(),now(),true)`,[session,owner,randomUUID()]);
    await pool.query("insert into field.platform_admin_memberships(user_id,role) values($1,'operator')",[owner]);
    const call=()=>app.inject('/v1/admin/overview');
    process.env.FIELD_PROFILE='live';assert.equal((await call()).statusCode,200);
    const count=async()=>(await pool.query('select count(*)::int n from field.admin_access_audit where actor_user_id=$1',[owner])).rows[0].n;
    await pool.query(`update "session" set "createdAt"=now()-interval '8 hours',"updatedAt"=now(),"expiresAt"=now()+interval '1 day' where id=$1`,[session]);
    const expired=await call();assert.equal(expired.statusCode,403);assert.deepEqual(expired.json(),{error:'mfa_required'});assert.equal(await count(),1);
    await pool.query(`update "session" set "createdAt"=now()+interval '1 minute' where id=$1`,[session]);
    assert.equal((await call()).json().error,'mfa_required');
    await pool.query('update "session" set "createdAt"=now() where id=$1',[session]);
    assert.equal((await call()).statusCode,200);
    process.env.FIELD_PROFILE='sandbox';assert.equal((await call()).statusCode,200);
  }finally{await app.close();await pool.end();if(prior===undefined)delete process.env.FIELD_PROFILE;else process.env.FIELD_PROFILE=prior;}
});
