import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { test } from 'node:test';
import { Pool } from 'pg';
import { requireAdmin } from '../src/admin-auth.js';

test('AP administrator MFA has an eight-hour absolute createdAt age limit independent of sliding expiry',async()=>{
  const pool=new Pool({connectionString:process.env.AP_DATABASE_URL}),actor=randomUUID(),session=randomUUID();
  const previous=process.env.AP_PROFILE;process.env.AP_PROFILE='sandbox';
  const app=Fastify();
  app.get('/admin',async(request,reply)=>{const admin=await requireAdmin(request,reply,{pool,resolveUserId:async()=>actor,resolveSession:async()=>({id:session,userId:actor})});return admin??reply;});
  try{
    await pool.query('insert into "user"(id,name,email,"emailVerified","twoFactorEnabled") values($1,\'Admin\',$2,true,true)',[actor,`${actor}@example.invalid`]);
    await pool.query("insert into ap.platform_admin_memberships(user_id,role) values($1,'operator')",[actor]);
    await pool.query('insert into "session"(id,"userId",token,"expiresAt","createdAt","updatedAt","twoFactorVerified") values($1,$2,$3,now()+interval \'7 days\',now()-interval \'7 hours\',now(),true)',[session,actor,randomUUID()]);
    assert.equal((await app.inject('/admin')).statusCode,200);
    for(const age of ["now()-interval '8 hours 1 second'","now()+interval '1 minute'"]){
      await pool.query(`update "session" set "createdAt"=${age},"updatedAt"=now(),"expiresAt"=now()+interval '7 days' where id=$1`,[session]);
      const response=await app.inject('/admin');assert.equal(response.statusCode,403);assert.deepEqual(response.json(),{error:'mfa_required'});
    }
    process.env.AP_PROFILE='mock';assert.equal((await app.inject('/admin')).statusCode,200);
  }finally{process.env.AP_PROFILE=previous;await app.close();await pool.end();}
});
