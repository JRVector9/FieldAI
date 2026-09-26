globalThis.fetch = async (url, options) => {
  if (url !== 'https://api.openai.com/v1/responses') throw new Error('unexpected_model_url');
  const request = JSON.parse(String(options?.body));
  if (request.model !== 'synthetic-field-layout' || request.store !== false || request.tools?.length)
    throw new Error('unexpected_model_request');
  return new Response(JSON.stringify({
    id: 'synthetic_worker_response', status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
      template: 'warm', palette: '#9a5335', pages: [{ kind: 'home', sections: ['hero', 'services'] }],
    }) }] }],
    usage: { input_tokens: 20, output_tokens: 12 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
