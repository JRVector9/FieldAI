import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { purgeUnverifiedCredentialUsers } from '../src/retention-purge.js';

test('AP unverified cleanup advances past a full batch of FK-protected users using a timestamp/id cursor',async()=>{
  const pool=new Pool({connectionString:process.env.AP_DATABASE_URL});
  const owner=randomUUID(),prefix=randomUUID();
  try{
    await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'Owner\',$2,true)',[owner,`${owner}@example.invalid`]);
    for(let i=0;i<101;i++){
      const id=`${prefix}-${String(i).padStart(3,'0')}`;
      await pool.query('insert into "user"(id,name,email,"emailVerified","createdAt") values($1,\'Unverified\',$2,false,\'2020-01-01 00:00:00.123456Z\')',[id,`${id}@example.invalid`]);
      await pool.query('insert into "account"(id,"accountId","providerId","userId",password,"updatedAt") values($1,$2,\'credential\',$2,\'synthetic\',now())',[randomUUID(),id]);
      if(i<100){const org=randomUUID(),verifiedOwner=randomUUID();await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,\'Verified owner\',$2,true)',[verifiedOwner,`${verifiedOwner}@example.invalid`]);
        await pool.query('insert into ap.organizations(id,owner_user_id,name) values($1,$2,\'Synthetic retained owner\')',[org,verifiedOwner]);
        await pool.query('insert into ap.trial_subscriptions(id,organization_id,consent_version,started_by,ends_at) values($1,$2,\'synthetic\',$3,now()+interval \'1 day\')',[randomUUID(),org,id]);}
    }
    assert.equal(await purgeUnverifiedCredentialUsers(pool),0);
    assert.equal(await purgeUnverifiedCredentialUsers(pool),1,'the 101st user is not starved behind the retained first hundred');
    assert.equal((await pool.query('select 1 from "user" where id=$1',[`${prefix}-100`])).rowCount,0);
    assert.equal((await pool.query('select count(*)::int n from "user" where id like $1',[`${prefix}-%`])).rows[0].n,100);
    assert.equal(await purgeUnverifiedCredentialUsers(pool),0);
  }finally{await pool.end();}
});
