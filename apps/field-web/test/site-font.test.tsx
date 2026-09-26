import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer, type SiteDraft } from '../src/field-site.js';
import type { Catalog } from '../src/field-api.js';

const site: SiteDraft = {siteId:'00000000-0000-4000-8000-000000000001',slug:'field-123456789abc',revision:1,
  template:'editorial',palette:'#264653',pages:[{id:'00000000-0000-4000-8000-000000000002',slug:'home',title:'홈',
    sections:[{id:'00000000-0000-4000-8000-000000000003',kind:'hero',heading:'실제 상호',body:'사업자 소개'}]}]};
const catalog: Catalog = {organizationId:'00000000-0000-4000-8000-000000000004',revision:1,businessName:'실제 상호',
  industry:'서비스',introduction:'사업자 소개',region:'서울',openingHours:'평일',contactPhone:'',services:[],faqs:[],defaultBookingMode:'request'};
function markup(font?: unknown) {return renderToStaticMarkup(React.createElement(SiteRenderer,{site:{...site,...(font===undefined?{}:{font})} as SiteDraft,catalog,preview:true}));}
test('selected font applies to public site and editorial headings while absence preserves current typography', () => {
  const serif=markup('system-serif'),sans=markup('system-sans');
  assert.match(serif,/font-family:Georgia/);assert.match(sans,/font-family:system-ui/);
  assert.match(sans,/<h1 style="font-family:system-ui/);
  assert.doesNotMatch(markup(),/font-family:/);
  for(const font of ['__proto__','url(https://font.invalid)','system-serif; color:red'])assert.doesNotMatch(markup(font),/font-family:|font.invalid|color:red/);
});
test('font selection is added in existing design controls and draft equivalence detects font-only edits', async () => {
  const m=await import('../src/site-editor.js');
  assert.equal(typeof m.SiteFontSelect,'function','font selection is missing');
  const html=renderToStaticMarkup(React.createElement(m.SiteFontSelect,{font:undefined,onChange:()=>{}}));
  for(const label of ['사이트 글꼴 (추가)','기존 글자 유지','system-sans','system-serif'])assert.ok(html.includes(label),label);
  assert.equal(m.sameDraftContent(site,{...site,font:'system-serif'}),false);
  assert.equal(m.sameDraftContent({...site,font:'system-serif'},{...site,font:'system-serif'}),true);
});
