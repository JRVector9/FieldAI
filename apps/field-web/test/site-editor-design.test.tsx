import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteTemplateCards } from '../src/site-editor-design.js';
import { SiteEditorFrame } from '../src/site-editor-frame.js';

test('template choices show the current business safely and identify exactly one selected layout', () => {
  const html = renderToStaticMarkup(<SiteTemplateCards template="warm" businessName={'내 사업 <script>alert(1)</script>'} onChange={() => {}} />);
  assert.equal((html.match(/type="button"/g) ?? []).length, 3);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2);
  assert.equal((html.match(/내 사업 &lt;script&gt;alert\(1\)&lt;\/script&gt;/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<script>|클린드라이브|스튜디오 여백|모아 피아노/);
  for (const name of ['Essential', 'Editorial', 'Warm']) assert.ok(html.includes(name));
  assert.match(html, /aria-label="Warm · 따뜻한 분위기" aria-pressed="true"/);
});

test('blank business name has a neutral fallback, not a made up business', () => {
  const html = renderToStaticMarkup(<SiteTemplateCards template="essential" businessName="  " onChange={() => {}} />);
  assert.equal((html.match(/내 브랜드/g) ?? []).length, 3);
});

test('frame preserves direct-child editor controls and preview for the completed pages layout', () => {
  const nav = <nav aria-label="사이트 제작 단계">단계</nav>;
  const children = <><section className="site-editor-inputs">입력</section><section className="site-editor-preview">초안</section></>;
  const pages = renderToStaticMarkup(<SiteEditorFrame step="pages" mobileView="preview" navigation={nav}>{children}</SiteEditorFrame>);
  assert.match(pages, /<main[^>]+site-editor-pages[^>]+site-editor-view-preview[^>]*><nav/);
  assert.match(pages, /<\/nav><section class="site-editor-inputs"/);
  assert.doesNotMatch(pages, /site-editor-stage|site-editor-stepbar/);
  const design = renderToStaticMarkup(<SiteEditorFrame step="design" mobileView="edit" navigation={nav}>{children}</SiteEditorFrame>);
  assert.match(design, /<aside[^>]*>.*<nav/s);
  assert.match(design, /<section class="site-editor-stage">/);
});
