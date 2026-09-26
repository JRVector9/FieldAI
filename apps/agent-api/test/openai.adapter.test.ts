import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpenAIProvider } from '../src/openai.js';

test('Responses adapter sends approved facts without tools or provider storage and reads the message item', async () => {
  const previousKey = process.env.AP_OPENAI_API_KEY;
  const previousModel = process.env.AP_OPENAI_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.AP_OPENAI_API_KEY = 'synthetic-test-key';
  process.env.AP_OPENAI_MODEL = 'synthetic-test-model';
  let seen = 0;
  globalThis.fetch = async (input, init) => {
    seen += 1;
    assert.equal(input, 'https://api.openai.com/v1/responses');
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer synthetic-test-key');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, 'synthetic-test-model');
    assert.equal(body.store, false);
    assert.deepEqual(body.tools, []);
    assert.equal(body.max_output_tokens, 768);
    assert.equal((body.text as { format: { type: string } }).format.type, 'json_schema');
    assert.match(String(body.input), /service:0/);
    assert.deepEqual((JSON.parse(String(body.input)) as { conversationHistory: unknown }).conversationHistory,
      [{ role: 'customer', text: '상담 서비스가 무엇인가요?' },
        { role: 'assistant', text: '상담 서비스를 안내합니다.' }]);
    assert.match(String(body.instructions), /대화.*사실.*아닙니다/);
    return new Response(JSON.stringify({
      id: 'resp_synthetic', status: 'completed',
      output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [
        { type: 'output_text', text: JSON.stringify({ answer: '상담을 안내합니다.', evidenceIds: ['service:0'],
          unknowns: [], handoffRecommended: false }) },
      ] }], usage: { input_tokens: 55, output_tokens: 20 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const provider = createOpenAIProvider();
    assert.ok(provider);
    const result = await provider.generate({ question: '무엇을 하나요?',
      facts: [{ id: 'service:0', text: '서비스: 상담' }],
      history: [{ role: 'customer', text: '상담 서비스가 무엇인가요?' },
        { role: 'assistant', text: '상담 서비스를 안내합니다.' }],
      agent: { name: '상담 AI', tone: 'clear', guideScope: '서비스 안내', handoffText: '담당자에게 문의' },
      maxOutputTokens: 768 });
    assert.equal(result.output.answer, '상담을 안내합니다.');
    assert.deepEqual([result.inputTokens, result.outputTokens], [55, 20]);
    assert.equal(seen, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.AP_OPENAI_API_KEY;
    else process.env.AP_OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.AP_OPENAI_MODEL;
    else process.env.AP_OPENAI_MODEL = previousModel;
  }
});
