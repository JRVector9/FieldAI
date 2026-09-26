import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';

const source=new URL(process.env.FIELD_DATABASE_URL!);
assert.equal(source.hostname,'127.0.0.1');assert.equal(source.port,'55432');assert.equal(source.username,'field_local');
assert.match(source.pathname,/^\/fieldai_field_test_[a-f0-9]+$/);
process.env.FIELD_PROFILE='mock';
const pool=new Pool({connectionString:source.toString()});after(async()=>{await pool.end();});
test('own site fonts roundtrip through draft, immutable public releases, restore and legacy AI apply',async()=>{
  const owner=randomUUID(),other=randomUUID();let actor=owner;
  for(const id of [owner,other])await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)',[id,'Synthetic font owner',`${id}@example.invalid`]);
  const app=createFieldApp(async()=>undefined,undefined,'http://127.0.0.1:4321',{pool,resolveUserId:async()=>actor});
  try{
    const org=await app.inject({method:'POST',url:'/v1/organizations',payload:{name:'Synthetic font business'}});
    assert.equal(org.statusCode,201,org.body);const organizationId=org.json().id as string;
    const call=(method:'GET'|'POST'|'PUT',url:string,payload?:object)=>app.inject({method,url,payload,headers:{'x-organization-id':organizationId}});
    const catalog={expectedRevision:0,businessName:'Synthetic font business',introduction:'Intro',region:'Seoul',openingHours:'Weekdays',contactPhone:'010-1234-5678',services:[{id:randomUUID(),name:'Service',description:'Actual',bookingMode:'request',durationMinutes:30,priceAmount:10000}]};
    assert.equal((await call('PUT','/v1/business/draft',catalog)).statusCode,200);
    assert.equal((await call('POST','/v1/catalog/releases',{expectedRevision:1})).statusCode,201);
    const created=await call('POST','/v1/sites');assert.equal(created.statusCode,201,created.body);
    const {slug,id:siteId}=created.json() as {slug:string;id:string};
    const content={template:'editorial',palette:'#264653',pages:[{id:randomUUID(),slug:'home',title:'Home',sections:[]}]};
    assert.equal(Object.hasOwn((await call('GET','/v1/sites/draft')).json(),'font'),false);
    const saved=await call('PUT','/v1/sites/draft',{...content,expectedRevision:0,font:'system-serif'});
    assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().font,'system-serif');
    assert.equal((await call('GET','/v1/sites/draft')).json().font,'system-serif');
    const first=await call('POST','/v1/sites/releases',{expectedRevision:1});assert.equal(first.statusCode,201,first.body);
    assert.equal((await app.inject(`/v1/public/sites/${slug}`)).json().font,'system-serif');
    assert.equal((await call('PUT','/v1/sites/draft',{...content,expectedRevision:1,font:'system-sans'})).statusCode,200);
    assert.equal((await app.inject(`/v1/public/sites/${slug}`)).json().font,'system-serif','draft font must not leak before publish');
    for(const font of ['font-family:Georgia','__proto__',null])assert.equal((await call('PUT','/v1/sites/draft',{...content,expectedRevision:2,font})).statusCode,400);
    assert.equal((await call('GET','/v1/sites/draft')).json().revision,2);
    assert.equal((await call('POST','/v1/sites/releases',{expectedRevision:2})).statusCode,201);
    const restored=await call('POST','/v1/sites/restore',{expectedRevision:2,releaseId:first.json().releaseId});
    assert.equal(restored.statusCode,200,restored.body);assert.equal(restored.json().font,'system-serif');
    assert.equal((await app.inject(`/v1/public/sites/${slug}`)).json().font,'system-sans');
    assert.equal((await call('POST','/v1/sites/releases',{expectedRevision:3})).statusCode,201);
    assert.equal((await app.inject(`/v1/public/sites/${slug}`)).json().font,'system-serif');
    // A proposal stored before font support must preserve the current selected font when applied.
    const job=randomUUID();
    await pool.query(`insert into field.site_generation_jobs(id,organization_id,site_id,requested_by,prompt,base_revision,catalog_revision,catalog_snapshot,status,proposal,model)
      values($1,$2,$3,$4,'Synthetic font preservation',3,1,$5,'proposed',$6,'synthetic-font')`,[job,organizationId,siteId,owner,JSON.stringify(catalog),JSON.stringify(content)]);
    const applied=await call('POST',`/v1/sites/generation-jobs/${job}/apply`);
    assert.equal(applied.statusCode,200,applied.body);assert.equal(applied.json().font,'system-serif');
    const legacy=await call('PUT','/v1/sites/draft',{...content,expectedRevision:4});
    assert.equal(legacy.statusCode,200,legacy.body);assert.equal(Object.hasOwn(legacy.json(),'font'),false);
    assert.equal((await call('POST','/v1/sites/releases',{expectedRevision:5})).statusCode,201);
    assert.equal(Object.hasOwn((await app.inject(`/v1/public/sites/${slug}`)).json(),'font'),false);
    actor=other;assert.equal((await call('GET','/v1/sites/draft')).statusCode,404);
    assert.equal((await call('PUT','/v1/sites/draft',{...content,expectedRevision:5,font:'system-serif'})).statusCode,404);
  }finally{await app.close();}
});
