import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer, type SiteDraft } from '../src/field-site.js';
import type { Catalog } from '../src/field-api.js';

const site: SiteDraft = {
  siteId: 'site-id', slug: 'field-123456789abc', revision: 1, template: 'editorial', palette: '#264653',
  pages: [{ id: 'page-id', slug: 'home', title: '홈', sections: [
    { id: 'section-id', kind: 'hero', heading: '소개', body: '직접 쓴 소개',
      assetId: 'asset-id', alt: '작업대 앞의 사업자 사진' },
  ] }],
};
const catalog: Catalog = {
  organizationId: 'org-id', revision: 1, businessName: '사업체', introduction: '', region: '서울',
  openingHours: '', contactPhone: '', services: [], faqs: [],
};

test('Field preview and public site render the same saved photo with alt through separate access routes', () => {
  const preview = renderToStaticMarkup(<SiteRenderer site={site} catalog={catalog} preview />);
  assert.match(preview, /alt="작업대 앞의 사업자 사진"/);
  assert.match(preview, /src="\/v1\/sites\/assets\/asset-id"/);
  const publicSite = renderToStaticMarkup(<SiteRenderer site={site} catalog={catalog} />);
  assert.match(publicSite, /src="\/v1\/public\/site-assets\/asset-id"/);
});

test('Field site renders the supplied industry and leaves legacy missing values unfilled', () => {
  const registered = renderToStaticMarkup(<SiteRenderer site={site}
    catalog={{ ...catalog, industry: '사진·촬영' }} />);
  assert.match(registered, /사진·촬영 · 서울/);
  const legacy = renderToStaticMarkup(<SiteRenderer site={site} catalog={catalog} />);
  assert.doesNotMatch(legacy, /사진·촬영/);
  assert.match(legacy, /field-site-section-index">서울</);
});
