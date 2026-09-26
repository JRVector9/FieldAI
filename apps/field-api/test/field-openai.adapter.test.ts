import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFieldOpenAIProvider } from '../src/field-openai.js';

test('Field Responses adapter uses its own credential and accepts only a layout plan', async () => {
  const previousKey = process.env.FIELD_OPENAI_API_KEY;
  const previousModel = process.env.FIELD_OPENAI_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.FIELD_OPENAI_API_KEY = 'synthetic-field-key';
  process.env.FIELD_OPENAI_MODEL = 'synthetic-field-model';
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(input, 'https://api.openai.com/v1/responses');
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer synthetic-field-key');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, 'synthetic-field-model');
    assert.equal(body.store, false);
    assert.deepEqual(body.tools, []);
    assert.equal((body.text as { format: { type: string } }).format.type, 'json_schema');
    assert.match(String(body.input), /실제 상호/);
    return new Response(JSON.stringify({ id: 'resp_field_synthetic', status: 'completed',
      output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [
        { type: 'output_text', text: JSON.stringify({ template: 'warm', palette: '#9a5335',
          pages: [{ kind: 'home', sections: ['hero', 'services'] }] }) },
      ] }], usage: { input_tokens: 32, output_tokens: 18 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const provider = createFieldOpenAIProvider();
    assert.ok(provider);
    const result = await provider.generate({ prompt: '따뜻한 소개', catalog: {
      businessName: '실제 상호', introduction: '사업자가 쓴 소개', region: '서울', openingHours: '평일',
      contactPhone: '010-1234-5678', services: [],
    } });
    assert.equal(result.plan.template, 'warm');
    assert.deepEqual([result.inputTokens, result.outputTokens], [32, 18]);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.FIELD_OPENAI_API_KEY;
    else process.env.FIELD_OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.FIELD_OPENAI_MODEL;
    else process.env.FIELD_OPENAI_MODEL = previousModel;
  }
});
