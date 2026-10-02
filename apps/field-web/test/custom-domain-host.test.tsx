import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
import { customHostMapping, customHostResource, platformHost } from '../src/custom-domain-host';
import { GET as verification } from '../src/app/.well-known/ap-site-verification/route';

const slug='field-012345abcdef',org='11111111-1111-4111-8111-111111111111';
function request(path:string,host='shop.example.com'){return new NextRequest(`https://${host}${path}`,{headers:{host}});}

test('custom Host requires active exact Field mapping and exposes only that tenant public paths',async()=>{
  const fetcher=globalThis.fetch,profile=process.env.APP_PROFILE,platform=process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN;
  process.env.APP_PROFILE='live';process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN='https://field.platform.com';
  try{
    globalThis.fetch=async()=>new Response('',{status:404});
    assert.equal((await proxy(request('/workspace'))).status,404);
    assert.equal((await proxy(request('/'))).status,404);
    globalThis.fetch=async()=>Response.json({slug,organizationId:org,origin:'https://shop.example.com'});
    const home=await proxy(request('/'));assert.match(home.headers.get('x-middleware-rewrite')??'',new RegExp(`/site/${slug}$`));
    const page=await proxy(request('/about'));assert.match(page.headers.get('x-middleware-rewrite')??'',new RegExp(`/site/${slug}/about$`));
    assert.equal((await proxy(request(`/site/${slug}`))).status,200);
    assert.equal((await proxy(request('/site/field-ffffffffffff'))).status,404);
    assert.equal((await proxy(request(`/public/${org}`))).status,200);
    assert.equal((await proxy(request(`/v1/public/catalog/${org}/inquiries/recover`))).status,200);
    assert.equal((await proxy(request(`/v1/public/catalog/${org}/reservations/recover`))).status,200);
    assert.equal((await proxy(request(`/v1/public/sites/${slug}/reports`))).status,200);
    assert.equal((await proxy(request('/public/22222222-2222-4222-8222-222222222222'))).status,404);
    for(const path of ['/workspace','/login','/v1/organizations','/api/auth/session','/admin'])assert.equal((await proxy(request(path))).status,404,path);
    assert.equal((await proxy(request('/_next/static/test.js'))).status,200);
    globalThis.fetch=async()=>Response.json({slug,organizationId:org,origin:'https://shop.xn--p1ai'});
    assert.equal((await proxy(request('/','shop.xn--p1ai'))).status,200);
    globalThis.fetch=async()=>Response.json({slug,organizationId:org,origin:'https://other.example.com'});
    assert.equal((await proxy(request('/'))).status,404);
    globalThis.fetch=async()=>new Response('private failure',{status:503});const unavailable=await proxy(request('/'));assert.equal(unavailable.status,503);assert.doesNotMatch(await unavailable.text(),/private failure/);
    assert.equal((await proxy(request('/workspace','field.platform.com'))).status,200);
  }finally{
    globalThis.fetch=fetcher;
    if(profile===undefined)delete process.env.APP_PROFILE;else process.env.APP_PROFILE=profile;
    if(platform===undefined)delete process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN;else process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN=platform;
  }
});

test('custom AP proof is returned only for exact connected origin and cannot replay a base host proof',async()=>{
  const fetcher=globalThis.fetch,profile=process.env.APP_PROFILE;process.env.APP_PROFILE='live';
  const proof='a'.repeat(43),urls:string[]=[];
  try{
    globalThis.fetch=async(input)=>{
      urls.push(String(input));
      return String(input).includes('/site-hosts/')?Response.json({slug,organizationId:org,origin:'https://shop.example.com'}):Response.json({origin:'https://shop.example.com',proof});
    };
    const ready=await verification(request('/.well-known/ap-site-verification'));assert.equal(ready.status,200);assert.equal(await ready.text(),`ap-site-verification=${proof}`);assert.ok(urls.some(url=>url.includes('host=shop.example.com')));
    globalThis.fetch=async(input)=>String(input).includes('/site-hosts/')?Response.json({slug,organizationId:org,origin:'https://shop.example.com'}):Response.json({origin:`https://${slug}.sites.platform.com`,proof});
    assert.equal((await verification(request('/.well-known/ap-site-verification'))).status,404);
    process.env.APP_PROFILE='mock';
    globalThis.fetch=async(input)=>String(input).includes('/site-hosts/')?Response.json({slug,organizationId:org,origin:'https://shop.example.com'}):Response.json({origin:'https://shop.example.com',proof});
    assert.equal((await verification(request('/.well-known/ap-site-verification'))).status,200);
    globalThis.fetch=async()=>new Response('',{status:404});assert.equal((await verification(request('/.well-known/ap-site-verification'))).status,404);
  }finally{globalThis.fetch=fetcher;if(profile===undefined)delete process.env.APP_PROFILE;else process.env.APP_PROFILE=profile;}
});

test('uppercase Host resolves the same platform host, custom mapping and scoped resource',async()=>{
  const fetcher=globalThis.fetch,profile=process.env.APP_PROFILE,platform=process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN;
  process.env.APP_PROFILE='live';process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN='https://field.platform.com';
  const urls:string[]=[];
  try{
    assert.equal(platformHost('Field.Platform.COM'),true);
    globalThis.fetch=async(input)=>{
      urls.push(String(input));
      return String(input).includes('/resources/')?Response.json({allowed:true}):Response.json({slug,organizationId:org,origin:'https://shop.example.com'});
    };
    assert.deepEqual(await customHostMapping('SHOP.Example.com'),{slug,organizationId:org,origin:'https://shop.example.com'});
    assert.equal(await customHostResource('SHOP.Example.com','inquiries',org),true);
    assert.ok(urls.every(url=>url.includes('/site-hosts/shop.example.com')));
    const home=await proxy(request('/','SHOP.Example.com'));assert.match(home.headers.get('x-middleware-rewrite')??'',new RegExp(`/site/${slug}$`));
  }finally{
    globalThis.fetch=fetcher;
    if(profile===undefined)delete process.env.APP_PROFILE;else process.env.APP_PROFILE=profile;
    if(platform===undefined)delete process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN;else process.env.NEXT_PUBLIC_FIELD_WEB_ORIGIN=platform;
  }
});
