import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import pg from 'pg';

const product = process.argv[2];
if (product !== 'agent' && product !== 'field') throw new Error('usage: independence-flow.mjs agent|field');
const isAgent = product === 'agent';
const web = isAgent ? 'http://localhost:3001' : 'http://127.0.0.1:3002';
const database = process.env[isAgent ? 'AP_DATABASE_URL' : 'FIELD_DATABASE_URL'];
assert.ok(database, `${product} own DB URL required`);
assert.equal(process.env[isAgent ? 'FIELD_DATABASE_URL' : 'AP_DATABASE_URL'], undefined);
assert.equal(process.env[isAgent ? 'AP_FIELD_CLIENT_SECRET' : 'FIELD_AP_CLIENT_SECRET'], undefined);
const pool = new pg.Pool({ connectionString: database });

async function request(path, method = 'GET', body, cookie) {
  const response = await fetch(`${web}${path}`, { method, headers: {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(cookie ? { cookie } : {}),
    ...(method === 'GET' ? {} : { origin: web }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, data: await response.clone().json().catch(() => ({})) };
}

function status(result, expected) {
  assert.equal(result.response.status, expected, JSON.stringify(result.data));
  return result.data;
}

let email;
let externalSite;
let revocationClient;
try {
  assert.equal((await request('/workspace')).response.status, 200);
  email = `independence-${product}-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString('base64url')}A1!`;
  status(await request('/api/auth/sign-up/email', 'POST', { email, password,
    name: `${product} independent owner` }), 200);
  const login = await request('/api/auth/sign-in/email', 'POST', { email, password });
  status(login, 200);
  const cookie = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.match(cookie, /session_token/);
  const organizationId = status(await request('/v1/organizations', 'POST',
    { name: `${product} independent organization` }, cookie), 201).id;
  assert.match(organizationId, /^[0-9a-f-]{36}$/);
  const trial = status(await request('/v1/subscription/trial', 'POST',
    { consentVersion: 'mock-trial-v1', termsAccepted: true }, cookie), 201);
  assert.equal(trial.product, product);
  assert.equal(status(await request('/v1/subscription', 'GET', undefined, cookie), 200).state, 'trialing');
  assert.equal(status(await request('/v1/subscription/checkout', 'POST', {}, cookie), 503).error,
    'paid_checkout_not_configured');

  if (isAgent) {
    status(await request('/v1/knowledge/draft', 'PUT', {
      expectedRevision: 0, businessName: '독립 AP 상담', introduction: '',
      services: [{ name: '상담', description: '직접 문의' }], faqs: [],
    }, cookie), 200);
    status(await request('/v1/knowledge/releases', 'POST', { expectedRevision: 1 }, cookie), 201);
    const inquiryId = status(await request(`/v1/public/organizations/${organizationId}/inquiries`,
      'POST', { name: '합성 고객', phone: '010-1234-5678', message: 'AP 단독 문의', consent: true }), 201).id;
    const reply = status(await request(`/v1/owner/inquiries/${inquiryId}/replies`, 'POST',
      { body: 'AP 단독 답변' }, cookie), 201);
    assert.equal(reply.delivery, 'blocked_integration');
    const exported = status(await request(`/v1/owner/inquiries/${inquiryId}/export`, 'GET', undefined, cookie), 200);
    assert.equal(exported.inquiry.id, inquiryId);
    assert.equal(exported.messages.length, 2);
    assert.equal((await request('/sdk/v1.js')).response.status, 200);

    status(await request('/v1/agents/draft', 'PUT', {
      expectedRevision: 0, name: '독립 AP 상담 AI', tone: 'clear',
      guideScope: '승인된 정보만 안내', handoffText: '담당자가 답변합니다.',
    }, cookie), 200);
    status(await request('/v1/agents/releases', 'POST', {
      expectedRevision: 1, expectedKnowledgeRevision: 1,
    }, cookie), 201);
    // The independent launcher must provide AP's own durable revocation journal without any Field settings.
    assert.ok(process.env.AP_REVOCATION_JOURNAL_DIRECTORY);assert.ok(process.env.AP_REVOCATION_JOURNAL_SECRET);
    const actor=(await pool.query('select id from "user" where email=$1',[email])).rows[0].id;
    const actorSession=(await pool.query('select id from "session" where "userId"=$1 order by "createdAt" desc limit 1',[actor])).rows[0].id;
    const agentId=(await pool.query('select agent_id from ap.agent_releases where organization_id=$1 order by revision desc limit 1',[organizationId])).rows[0].agent_id;
    revocationClient=randomUUID();const selectionId=randomUUID(),token=randomBytes(32).toString('base64url');
    await pool.query('insert into "oauthClient"(id,"clientId","redirectUris") values($1,$1,\'[]\')',[revocationClient]);
    await pool.query(`insert into ap.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,agent_id,requested_scopes,selection_expires_at)
      values($1,$2,$3,$4,$5,$6,array['ap.agent.read'],now()+interval '1 day')`,[selectionId,actorSession,actor,revocationClient,organizationId,agentId]);
    await pool.query(`insert into "oauthConsent"(id,"clientId","userId","referenceId",scopes,"createdAt","updatedAt")
      values($1,$2,$3,$4,'["ap.agent.read"]',now(),now())`,[randomUUID(),revocationClient,actor,selectionId]);
    await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId",resources,"expiresAt","createdAt",scopes)
      values($1,$2,$3,$4,$5,'["http://127.0.0.1:4311/integrations/v1"]',now()+interval '1 hour',now(),'["ap.agent.read"]')`,
      [randomUUID(),createHash('sha256').update(token).digest('base64url'),revocationClient,actor,selectionId]);
    const access=()=>fetch(`${web}/integrations/v1/me`,{headers:{authorization:`Bearer ${token}`}});
    assert.equal((await access()).status,200);
    status(await request(`/integrations/v1/authorization/selections/${selectionId}/revoke`,'POST',undefined,cookie),200);
    assert.equal((await access()).status,401);
    assert.ok((await pool.query('select revoked_at from ap.oauth_selections where id=$1',[selectionId])).rows[0].revoked_at);
    let proof = '';
    externalSite = createServer((incoming, outgoing) => {
      if (incoming.url === '/.well-known/ap-site-verification' && proof) {
        outgoing.writeHead(200, { 'content-type': 'text/plain' }).end(`ap-site-verification=${proof}`);
      } else outgoing.writeHead(404).end();
    });
    await new Promise((resolveListen, rejectListen) => {
      externalSite.once('error', rejectListen);
      externalSite.listen(0, resolveListen);
    });
    const address = externalSite.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://ap-alone.localhost:${address.port}`;
    const embed = status(await request('/v1/deployments', 'POST',
      { kind: 'owned_embed', origin }, cookie), 201);
    assert.equal(status(await request(`/v1/deployments/${embed.id}/verify`, 'POST', undefined, cookie), 409).error,
      'domain_not_verified');
    proof = embed.verificationProof;
    assert.match(proof, /^[A-Za-z0-9_-]{32}$/);
    status(await request(`/v1/deployments/${embed.id}/verify`, 'POST', undefined, cookie), 200);
    status(await request(`/v1/deployments/${embed.id}/activate`, 'POST', undefined, cookie), 200);
    const frame = await fetch(`${web}/embed/v1/${embed.publicId}/frame`, {
      headers: { referer: `${origin}/` },
    });
    assert.equal(frame.status, 200);
    const nonce = (await frame.text()).match(/const handshakeNonce = "([A-Za-z0-9_-]+)";/)?.[1];
    assert.ok(nonce);
    const session = status(await request('/v1/embed/sessions', 'POST', { nonce }), 201);
    const handoffResponse = await fetch(`${web}/v1/embed/handoffs`, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ question: 'Field 없이 상담 가능한가요?' }),
    });
    assert.equal(handoffResponse.status, 201);
    const ticket = (await handoffResponse.json()).ticket;
    const continued = await request('/v1/embed/continue', 'POST', { ticket });
    status(continued, 200);
    const cookies = continued.response.headers.getSetCookie().map(value => value.split(';')[0]);
    const contextCookie = cookies.find(value => value.startsWith('ap_embed_context='));
    const consultCookie = cookies.find(value => value.startsWith('ap_consult_session='));
    assert.ok(contextCookie && consultCookie);
    const context = status(await request('/v1/embed/context', 'GET', undefined, contextCookie), 200);
    assert.equal(context.publicId, embed.publicId);
    assert.equal(context.question, 'Field 없이 상담 가능한가요?');
    assert.match(context.conversationId, /^[0-9a-f-]{36}$/);
    const current = status(await request(`/v1/public/deployments/${embed.publicId}/engagements/current`,
      'GET', undefined, consultCookie), 200);
    assert.equal(current.engagement?.id, context.conversationId);
    const submitted = status(await request(`/v1/conversations/${context.conversationId}/submissions`, 'POST',
      { name: '외부 사이트 고객', phone: '010-2345-6789',
        message: 'Field 없이 상담 가능한가요?', consent: true }, consultCookie), 201);
    assert.equal(submitted.id, context.conversationId);
    status(await request(`/v1/owner/inquiries/${submitted.id}/replies`, 'POST',
      { body: 'AP만으로 상담 가능합니다.' }, cookie), 201);
    const receipt = await fetch(`${web}/v1/inquiries/${submitted.id}`, {
      headers: { authorization: `Bearer ${submitted.receiptKey}` },
    });
    assert.equal(receipt.status, 200);
    assert.ok((await receipt.json()).messages.some(message => message.body === 'AP만으로 상담 가능합니다.'));
  } else {
    const serviceId = randomUUID();
    status(await request('/v1/business/draft', 'PUT', {
      expectedRevision: 0, businessName: '독립 Field 사업장', introduction: '',
      region: '서울', openingHours: '평일', contactPhone: '', defaultBookingMode: 'request',
      services: [{ id: serviceId, name: '상담', description: '직접 문의',
        bookingMode: 'request', durationMinutes: 30, priceAmount: null }],
    }, cookie), 200);
    status(await request('/v1/catalog/releases', 'POST', { expectedRevision: 1 }, cookie), 201);
    const site = status(await request('/v1/sites', 'POST', {}, cookie), 201);
    const draft = status(await request('/v1/sites/draft', 'GET', undefined, cookie), 200);
    status(await request('/v1/sites/draft', 'PUT', {
      expectedRevision: 0, template: draft.template, palette: draft.palette, pages: draft.pages,
    }, cookie), 200);
    status(await request('/v1/sites/releases', 'POST', { expectedRevision: 1 }, cookie), 201);
    assert.equal((await request(`/site/${site.slug}`)).response.status, 200);
    const inquiryId = status(await request(`/v1/public/catalog/${organizationId}/inquiries`, 'POST',
      { serviceId, name: '합성 고객', phone: '010-1234-5678', message: 'Field 단독 문의', consent: true }), 201).id;
    status(await request(`/v1/owner/inquiries/${inquiryId}/replies`, 'POST',
      { body: 'Field 단독 답변' }, cookie), 201);
    status(await request('/v1/booking-policy', 'PUT', {
      expectedRevision: 0, timezone: 'Asia/Seoul', weekly: { mon: { open: '10:00', close: '18:00' } },
      beforeMinutes: 0, afterMinutes: 0, minLeadMinutes: 0, horizonDays: 30,
    }, cookie), 200);
    const reservationId = status(await request(`/v1/public/catalog/${organizationId}/reservations`, 'POST',
      { serviceId, name: '합성 고객', phone: '010-1234-5679',
        preferredTimeText: '다음 주 평일', consent: true }), 201).id;
    const exported = status(await request(`/v1/owner/reservations/${reservationId}/export`,
      'GET', undefined, cookie), 200);
    assert.equal(exported.reservation.id, reservationId);
    assert.deepEqual(exported.events.map(event => event.revision), [0]);
  }
} finally {
  try {
    if (externalSite) await new Promise(resolveClose => externalSite.close(resolveClose));
    if (email) {
      if (!isAgent) await pool.query(`delete from field.sites
        where organization_id = (select id from field.organizations
          where owner_user_id = (select id from "user" where email = $1))`, [email]);
      await pool.query(`delete from ${isAgent ? 'ap' : 'field'}.trial_subscriptions
        where organization_id = (select id from ${isAgent ? 'ap' : 'field'}.organizations
          where owner_user_id = (select id from "user" where email = $1))`, [email]);
      await pool.query(`delete from ${isAgent ? 'ap' : 'field'}.organizations
        where owner_user_id = (select id from "user" where email = $1)`, [email]);
      if (revocationClient) await pool.query('delete from "oauthClient" where "clientId"=$1',[revocationClient]);
      await pool.query('delete from "user" where email = $1', [email]);
    }
  } finally { await pool.end(); }
}
process.stdout.write(`${product}: own sign-up, approval, intake, response${isAgent ? ', external owned widget and durable selection revocation' : ''} and mock trial passed\n`);
