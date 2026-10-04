import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createAgentApp } from '../src/app.js';

test('AP raised webhook limit accepts traffic beyond 120 while keeping the configured abuse limit',async()=>{
  const pool=new Pool({connectionString:process.env.AP_DATABASE_URL});
  const previous=process.env.AP_BILLING_WEBHOOK_IP_LIMIT;process.env.AP_BILLING_WEBHOOK_IP_LIMIT='1002';
  const app=createAgentApp(async()=>undefined,undefined,undefined,undefined,{pool,resolveUserId:async()=>null});
  try{
    for(let i=1;i<=1005;i++){
      const response=await app.inject({method:'POST',url:'/v1/billing/webhooks/toss',remoteAddress:'203.0.113.112',payload:{eventType:'BILLING_DELETED',data:{billingKey:'synthetic'}}});
      assert.equal(response.statusCode,i<=1002?200:429,`attempt ${i}`);
      if(i>1002){assert.equal(response.json().error,'webhook_rate_limited');assert.ok(Number(response.headers['retry-after'])>0);}
    }
    assert.equal((await pool.query('select attempts from ap.billing_webhook_ip_windows')).rows[0].attempts,1003,'denials saturate at configured limit + 1');
  }finally{if(previous===undefined)delete process.env.AP_BILLING_WEBHOOK_IP_LIMIT;else process.env.AP_BILLING_WEBHOOK_IP_LIMIT=previous;await app.close();await pool.end();}
});
