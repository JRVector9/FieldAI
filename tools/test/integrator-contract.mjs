import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import ts from 'typescript';

const root = fileURLToPath(new URL('../..', import.meta.url));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const verified = new Set();
const failures = [];
const contracts = new Map();
export function loadContract(product) {
  assert.ok(['agent', 'field'].includes(product), 'own product must be agent or field');
  if (!contracts.has(product)) contracts.set(product, JSON.parse(readFileSync(
    resolve(root, `contracts/${product}-integrator-v1.openapi.json`), 'utf8')));
  return contracts.get(product);
}
export const normalizeRoute = path => path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}');
const responseKey = (product, method, path, status, media) =>
  `${product} ${method.toUpperCase()} ${path} ${status} ${media}`;
function responseDeclaration(document, path, method, status) {
  let response = document.paths[path]?.[method]?.responses?.[String(status)];
  if (response?.$ref) response = document.components.responses[response.$ref.split('/').at(-1)];
  assert.ok(response, `OpenAPI does not declare ${method.toUpperCase()} ${path} ${status}`);
  return response;
}
export function successResponseKeys(product) {
  const keys = [];
  for (const [path, operations] of Object.entries(loadContract(product).paths))
    for (const [method, operation] of Object.entries(operations)) if (methods.has(method))
      for (const status of Object.keys(operation.responses)) if (/^2\d\d$/.test(status))
        for (const media of Object.keys(responseDeclaration(loadContract(product), path, method, status).content ?? {}))
          keys.push(responseKey(product, method, path, status, media));
  return keys.sort();
}
export function assertCoverage(records, products = ['agent', 'field']) {
  const errors = records.flatMap(record => record.failures ?? []);
  assert.deepEqual(errors, [], 'actual OpenAPI response mismatches');
  const actual = new Set(records.flatMap(record => record.verified));
  const expected = products.flatMap(successResponseKeys);
  const missing = expected.filter(key => !actual.has(key));
  assert.deepEqual(missing, [], 'OpenAPI success responses without actual API verification');
  return expected.length;
}
export function createContractVerifier(product) {
  const document = loadContract(product);
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
  addFormats(ajv);
  ajv.addFormat('binary', true);
  const compiled = new Map();
  const definitions = JSON.parse(JSON.stringify(document.components.schemas)
    .replaceAll('#/components/schemas/', '#/$defs/'));
  function check(schema, value, location) {
    const key = JSON.stringify(schema);
    let validate = compiled.get(key);
    if (!validate) {
      const rewritten = JSON.parse(key.replaceAll('#/components/schemas/', '#/$defs/'));
      validate = ajv.compile({ ...rewritten, $defs: definitions });
      compiled.set(key, validate);
    }
    assert.ok(validate(value), `${location}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
  }
  return {
    assertResponse(path, method, status, value, options = {}) {
      method = method.toLowerCase();
      path = normalizeRoute(path);
      const response = responseDeclaration(document, path, method, status);
      const media = (options.contentType ?? 'application/json').split(';')[0].trim().toLowerCase();
      const schema = response.content?.[media]?.schema;
      assert.ok(schema, `OpenAPI ${method.toUpperCase()} ${path} ${status} does not declare ${media}`);
      const location = `${product} ${method.toUpperCase()} ${path} ${status}`;
      if (schema.format === 'binary') {
        assert.ok(Buffer.isBuffer(value) && value.length > 0, `${location}: binary bytes required`);
      } else check(schema, value, location);
      if (options.headers) for (const [name, header] of Object.entries(response.headers ?? {})) {
        const actual = options.headers[name.toLowerCase()];
        assert.ok(actual !== undefined, `${location}: missing ${name} header`);
        check(header.schema, String(actual), `${location} header ${name}`);
      }
    },
  };
}

// QA158: validate the bytes actually emitted by Fastify, including HTTP tests using fetch.
// Adding the hook before ready keeps validation in tests and out of production responses.
export function observeContractResponses(app, product) {
  const document = loadContract(product);
  const verifier = createContractVerifier(product);
  app.addHook('onReady', async () => { assertSourceRoutes(product, app); });
  app.addHook('onSend', async (request, reply, payload) => {
    const url = request.routeOptions.url;
    if (typeof url !== 'string') return payload;
    const path = normalizeRoute(url);
    const method = request.method.toLowerCase();
    if (!document.paths[path]?.[method] || reply.statusCode < 200 || reply.statusCode >= 300) return payload;
    const contentType = String(reply.getHeader('content-type') ?? '');
    try {
      const value = contentType.split(';')[0] === 'application/json'
        ? JSON.parse(Buffer.isBuffer(payload) ? payload.toString('utf8') : payload) : payload;
      verifier.assertResponse(path, method, reply.statusCode, value,
        { contentType, headers: reply.getHeaders() });
      verified.add(responseKey(product, method, path, reply.statusCode,
        contentType.split(';')[0].trim().toLowerCase()));
    } catch (error) {
      failures.push(String(error));
      process.stderr.write(`OpenAPI response mismatch: ${String(error)}\n`);
      throw error;
    }
    return payload;
  });
  return verifier;
}

// These are owner-session selection controls and supplier callbacks, not §4.12
// delegated resource operations. Exact exceptions make new undocumented routes fail.
const nonIntegratorRoutes = [
  'GET /integrations/v1/authorization/options',
  'POST /integrations/v1/authorization/selections',
  'GET /integrations/v1/authorization/current',
  'POST /integrations/v1/authorization/selections/{id}/revoke',
  'POST /integrations/v1/notifications/solapi',
];
function literalValues(node) {
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return literalValues(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(literalValues);
  if (ts.isTemplateExpression(node)) {
    let values = [node.head.text];
    for (const span of node.templateSpans) {
      let choices = [];
      if (ts.isIdentifier(span.expression)) for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isForOfStatement(parent) && ts.isVariableDeclarationList(parent.initializer)
          && parent.initializer.declarations.some(declaration => declaration.name.getText() === span.expression.text)) {
          choices = literalValues(parent.expression); break;
        }
      }
      assert.ok(choices.length, `unresolved public route expression ${node.getText()}`);
      values = values.flatMap(value => choices.map(choice => value + choice + span.literal.text));
    }
    return values;
  }
  return [];
}
export function sourceRoutes(product, extraSources = []) {
  const routes = [];
  const directory = resolve(root, `apps/${product}-api/src`);
  const sources = readdirSync(directory).filter(name => name.endsWith('.ts'))
    .map(name => ({ name, text: readFileSync(resolve(directory, name), 'utf8') }))
    .concat(extraSources.map((text, index) => ({ name: `extra-${index}.ts`, text })));
  function publicPaths(node) {
    const head = ts.isTemplateExpression(node) ? node.head.text
      : ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : '';
    return head.startsWith('/integrations/v1/') || head === '/v1/customer-handoffs/exchange'
      ? literalValues(node) : [];
  }
  for (const { name, text } of sources) {
    const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const registration = node.expression.name.text;
        const first = node.arguments[0];
        if (first && (methods.has(registration) || registration === 'all')) {
          for (const path of publicPaths(first))
            for (const method of registration === 'all' ? methods : [registration])
              routes.push({ method: method.toUpperCase(), path });
        } else if (registration === 'route' && first && ts.isObjectLiteralExpression(first)) {
          const property = key => first.properties.find(item => ts.isPropertyAssignment(item)
            && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === key);
          const url = property('url'), method = property('method');
          if (url) for (const path of publicPaths(url.initializer)) {
            assert.ok(method, `missing public route method ${node.getText()}`);
            const names = literalValues(method.initializer);
            assert.ok(names.length, `unresolved public route method ${node.getText()}`);
            for (const name of names) routes.push({ method: name.toUpperCase(), path });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return routes;
}
export function assertSourceRoutes(product, app, extraSources = []) {
  const declared = Object.entries(loadContract(product).paths).flatMap(([path, operations]) =>
    Object.keys(operations).filter(method => methods.has(method)).map(method => `${method.toUpperCase()} ${path}`));
  const routes = sourceRoutes(product, extraSources);
  const actual = routes.map(({ method, path }) => `${method} ${normalizeRoute(path)}`);
  assert.equal(new Set(actual).size, actual.length, `${product}: duplicate public route declaration`);
  assert.deepEqual(actual.filter(route => !nonIntegratorRoutes.includes(route)).sort(), declared.sort(),
    `${product}: registered public route declarations must match OpenAPI methods/paths`);
  if (app) for (const route of routes) assert.ok(app.hasRoute({ method: route.method, url: route.path }),
    `${product}: declared route is absent at runtime: ${route.method} ${route.path}`);
}

process.once('exit', () => {
  const directory = process.env.INTEGRATOR_CONTRACT_COVERAGE_DIRECTORY;
  if (!directory) return;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(directory, `${process.pid}.json`), JSON.stringify({ verified: [...verified].sort(), failures }) + '\n');
});
