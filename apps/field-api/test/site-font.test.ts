import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { parseContent } from '../src/sites.js';
import { preserveSitePhotos } from '../src/site-generation.js';

const content = () => ({ template: 'essential', palette: '#264653', pages: [
  { id: randomUUID(), slug: 'home', title: '홈', sections: [] },
] });
test('only allowed font IDs survive site JSON and legacy absence stays absent', () => {
  for (const font of ['system-sans', 'system-serif']) assert.equal((parseContent({ ...content(), font }) as {font?:string})?.font, font);
  for (const font of ['', null, 1, 'Georgia', 'inherit', '__proto__', 'url(https://font.invalid)', 'system-serif; color:red'])
    assert.equal(parseContent({ ...content(), font }), null, String(font));
  assert.equal(Object.hasOwn(parseContent(content())!, 'font'), false);
});
test('site creation AI preserves the selected font and cannot choose a new font', () => {
  const proposal = parseContent({ ...content(), font: 'system-sans' })!;
  const draft = parseContent({ ...content(), font: 'system-serif' })!;
  assert.equal((preserveSitePhotos(proposal, draft) as {font?:string})?.font, 'system-serif');
  assert.equal(Object.hasOwn(preserveSitePhotos(proposal, parseContent(content())!)!, 'font'), false);
});
