import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { createFieldApp } from '../src/app.js';
import { FieldRevocationJournal } from '../src/revocation-journal.js';
import { reapplyFieldRevocationJournal } from '../src/revocation-restore.js';

process.loadEnvFile(resolve('../../infra/field/.env'));

test('Field revocations survive a real pre-revoke PG17 restore without reviving permissions or removing customer work', async () => {
  const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });
  const root = await mkdtemp(resolve(tmpdir(), 'field-revocation-'));
  const journalRoot = resolve(root, 'journal'); await mkdir(journalRoot);
  const journal = new FieldRevocationJournal(journalRoot, 'synthetic-field-revocation-secret');
  const owner = randomUUID(), outsider = randomUUID(), session = randomUUID(), client = randomUUID(), org = randomUUID();
  const bearer = randomBytes(32).toString('base64url'), selection = randomUUID(), otherSelection = randomUUID();
  const connection = randomUUID(), incomingConnection = randomUUID(), incomingId = randomUUID();
  const tokenKey = randomBytes(32), eventSecret = randomBytes(32), eventKey = randomUUID();
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(tokenKey).update('field-ap-event-route-v1').digest(), iv);
  const eventCipher = Buffer.concat([iv, cipher.update(eventSecret.toString('base64url')), cipher.final(), cipher.getAuthTag()]);
  let rejectJournal = false;
  const runtime = { pool, revocationJournal: { append: async (intent: Parameters<typeof journal.append>[0]) => {
    if (rejectJournal) throw new Error('synthetic disk unavailable'); return journal.append(intent);
  } },
    resolveUserId: async (headers: Record<string, unknown>) => headers['x-test-user'] === outsider ? outsider : owner,
    resolveSession: async () => ({ id: session, userId: owner }),
    apConnector: { issuer: 'http://127.0.0.1:4311/api/auth', clientId: 'synthetic', clientSecret: 'synthetic', tokenKey,
      redirectUri: 'http://127.0.0.1:4321/v1/connections/ap/callback', webOrigin: 'http://localhost:3002' } };
  const app = createFieldApp(async () => undefined, undefined, undefined, runtime);
  const source = new URL(process.env.FIELD_DATABASE_URL!);
  assert.match(source.pathname, /^\/fieldai_field_test_[a-f0-9]+$/);
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString() });
  const restoreDb = `fieldai_field_restore_${randomUUID().replaceAll('-', '')}`;
  let restored: Pool | undefined, restoredApp: ReturnType<typeof createFieldApp> | undefined;
  try {
    for (const user of [owner, outsider]) await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)', [user, 'Synthetic restore actor', `${user}@example.invalid`]);
    await pool.query('insert into "session"(id,token,"userId","expiresAt","updatedAt") values($1,$2,$3,now()+interval \'1 day\',now())', [session, randomUUID(), owner]);
    await pool.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,$3)', [org, owner, '합성 회수 복원 조직']);
    await pool.query("insert into field.memberships(organization_id,user_id,role) values($1,$2,'owner')", [org, owner]);
    await pool.query('insert into field.catalog_drafts(organization_id,content,updated_by) values($1,$2::jsonb,$3)',
      [org, JSON.stringify({ businessName: '합성 회수 복원 조직', industry: '', introduction: '', region: '', openingHours: '',
        contactPhone: '', defaultBookingMode: 'request', services: [], faqs: [] }), owner]);
    await pool.query('insert into "oauthClient"(id,"clientId","redirectUris") values($1,$2,\'[]\')', [client, client]);
    for (const id of [selection, otherSelection]) {
      await pool.query(`insert into field.oauth_selections(id,session_id,actor_user_id,client_id,organization_id,requested_scopes,selection_expires_at)
        values($1,$2,$3,$4,$5,array['field.facts.read'],now()+interval '1 day')`, [id, session, owner, client, org]);
      await pool.query(`insert into "oauthConsent"(id,"clientId","userId","referenceId",scopes,"createdAt","updatedAt")
        values($1,$2,$3,$4,'["field.facts.read"]',now(),now())`, [randomUUID(), client, owner, id]);
      await pool.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","expiresAt","createdAt",scopes)
        values($1,$2,$3,$4,$5,now()+interval '1 day',now(),'["field.facts.read"]')`, [randomUUID(), randomUUID(), client, owner, id]);
    }
    await pool.query(`insert into "oauthAccessToken"(id,token,"clientId","userId","referenceId",resources,"expiresAt","createdAt",scopes)
      values($1,$2,$3,$4,$5,'["http://127.0.0.1:4321/integrations/v1"]',now()+interval '1 hour',now(),'["field.facts.read"]')`,
      [randomUUID(), createHash('sha256').update(bearer).digest('base64url'), client, owner, selection]);
    for (const id of [connection, incomingConnection]) await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,
      ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,ap_agent_revision,allowed_deployment_ids,scopes,
      access_token_cipher,refresh_token_cipher,access_expires_at,status,field_grant_id,field_actor_user_id,event_key_id,event_secret_cipher,route_generation)
      values($1,$2,$3,'http://127.0.0.1:4311/api/auth','synthetic','synthetic','synthetic','synthetic','synthetic',1,array[]::text[],array[]::text[],
        $4,$4,now()+interval '1 hour','review_required',$5,$3,$6,$7,$8)`, [id, org, owner, Buffer.from('synthetic-not-a-real-token'), selection,
        id === incomingConnection ? eventKey : null, id === incomingConnection ? eventCipher : null, id === incomingConnection ? 1 : null]);
    const service = randomUUID();
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', payload: { expectedRevision: 0,
      businessName: '합성 회수 복원 조직', introduction: '', region: '', openingHours: '', contactPhone: '',
      services: [{ id: service, name: '문의', description: '문의', bookingMode: 'request', durationMinutes: 30, priceAmount: null }],
    } })).statusCode, 200);
    await app.inject({ method: 'POST', url: '/v1/catalog/releases', payload: { expectedRevision: 1 } });
    const inquiry = await app.inject({ method: 'POST', url: `/v1/public/catalog/${org}/inquiries`, payload: {
      serviceId: service, name: 'PRESERVED_REVOKE_CUSTOMER', phone: '010-1234-5678', message: 'PRESERVED_REVOKE_MESSAGE', consent: true } });
    assert.equal(inquiry.statusCode, 201, inquiry.body);
    assert.equal((await app.inject({ url: '/integrations/v1/me', headers: { authorization: `Bearer ${bearer}` } })).statusCode, 200);
    const snapshot = await promisify(execFile)('docker', ['exec', 'fieldai-field-mock-db-1', 'pg_dump', '-U', 'field_local',
      '-d', source.pathname.slice(1), '-Fc', '--no-owner', '--no-acl'], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
    const localPath = `/v1/connections/ap/${connection}/revoke`;
    assert.equal((await app.inject({ method: 'POST', url: localPath, headers: { 'x-test-user': outsider } })).statusCode, 404);
    rejectJournal = true;
    assert.equal((await app.inject({ method: 'POST', url: localPath })).statusCode, 503);
    assert.equal((await pool.query('select status from field.ap_connections where id=$1', [connection])).rows[0].status, 'review_required');
    assert.equal((await journal.read()).length, 0);
    rejectJournal = false;
    const revoked = await app.inject({ method: 'POST', url: localPath });
    assert.equal(revoked.statusCode, 200, revoked.body);
    assert.equal((await app.inject({ method: 'POST', url: localPath })).json().revocationId, revoked.json().revocationId);
    assert.equal((await journal.read()).length, 1);
    const selectionPath = `/integrations/v1/authorization/selections/${otherSelection}/revoke`;
    const minting = await pool.connect(), lateToken = randomUUID();
    await minting.query('begin');
    await minting.query(`insert into "oauthRefreshToken"(id,token,"clientId","userId","referenceId","expiresAt","createdAt",scopes)
      values($1,$2,$3,$4,$5,now()+interval '1 day',now(),'["field.facts.read"]')`, [lateToken, randomUUID(), client, owner, otherSelection]);
    let revokeSettled = false;
    const concurrentRevoke = app.inject({ method: 'POST', url: selectionPath }).then(response => { revokeSettled = true; return response; });
    await new Promise(resolveObservation => setTimeout(resolveObservation, 40));
    const settledBeforeMintCommit = revokeSettled;
    await minting.query('commit'); minting.release();
    assert.equal((await concurrentRevoke).statusCode, 200);
    assert.equal(settledBeforeMintCommit, false);
    assert.ok((await pool.query('select revoked from "oauthRefreshToken" where id=$1', [lateToken])).rows[0].revoked);
    assert.equal((await app.inject({ method: 'POST', url: selectionPath })).statusCode, 200);
    assert.equal((await journal.read()).length, 2);
    const at = String(Math.floor(Date.now() / 1000));
    const remotePath = `/integrations/v1/connections/${incomingConnection}/revoke`;
    const remoteHeaders = { 'x-key-id': eventKey, 'x-revocation-id': incomingId, 'x-timestamp': at,
      'x-signature': createHmac('sha256', eventSecret).update(`${at}.${incomingId}.${incomingConnection}.revoke`).digest('hex') };
    assert.equal((await app.inject({ method: 'POST', url: remotePath, headers: { ...remoteHeaders, 'x-signature': 'a'.repeat(64) } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: remotePath, headers: remoteHeaders })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: remotePath, headers: remoteHeaders })).statusCode, 200);
    assert.equal((await journal.read()).length, 3);
    // 백업 이후 생긴 별도 원격 회수 의도도 복원 시 성공 ACK로 만들지 않는다.
    const pendingRestoreId = randomUUID();
    await journal.append({ organizationId: org, targetKind: 'connection', targetId: incomingConnection,
      selectionId: selection, source: 'owner', revocationId: pendingRestoreId });
    const entries = await journal.read(); assert.equal(entries.length, 4);
    const checkpoint = await journal.checkpoint();
    const checkpointFile = resolve(root, 'trusted-checkpoint');
    const cliEnv = { ...process.env, FIELD_PROFILE: 'mock', FIELD_REVOCATION_JOURNAL_DIRECTORY: journalRoot,
      FIELD_REVOCATION_JOURNAL_SECRET: 'synthetic-field-revocation-secret', FIELD_REVOCATION_CHECKPOINT_OUTPUT: checkpointFile };
    await promisify(execFile)(process.execPath, ['--import','tsx','src/revocation-checkpoint-cli.ts','--quiesced'], { env: cliEnv });
    assert.equal((await journal.verifiedEntries(await readFile(checkpointFile, 'utf8'))).length, 4);
    assert.doesNotMatch(JSON.stringify(entries), /synthetic-not-a-real-token|PRESERVED_REVOKE_MESSAGE|010-1234/);
    await admin.query(`create database "${restoreDb}"`);
    await new Promise<void>((resolveRestore, rejectRestore) => {
      const child = spawn('docker', ['exec', '-i', 'fieldai-field-mock-db-1', 'pg_restore', '-U', 'field_local', '-d', restoreDb,
        '--exit-on-error', '--no-owner', '--no-acl'], { stdio: ['pipe','ignore','pipe'] });
      let error = ''; child.stderr.on('data', data => { error += data.toString(); });
      child.once('error', rejectRestore); child.once('exit', code => code === 0 ? resolveRestore() : rejectRestore(new Error(error)));
      child.stdin.end(snapshot.stdout);
    });
    const restoreUrl = new URL(source); restoreUrl.pathname = `/${restoreDb}`;
    restored = new Pool({ connectionString: restoreUrl.toString() });
    restoredApp = createFieldApp(async () => undefined, undefined, undefined, { ...runtime, pool: restored });
    assert.equal((await restoredApp.inject({ url: '/integrations/v1/me', headers: { authorization: `Bearer ${bearer}` } })).statusCode, 200);
    const first = entries[0]!.id;
    await rename(resolve(journalRoot, `${first}.json`), resolve(root, 'removed-entry'));
    await assert.rejects(reapplyFieldRevocationJournal(restored, journal, checkpoint), /trusted checkpoint/);
    assert.equal((await restored.query('select status from field.ap_connections where id=$1', [connection])).rows[0].status, 'review_required');
    await rename(resolve(root, 'removed-entry'), resolve(journalRoot, `${first}.json`));
    const original = await readFile(resolve(journalRoot, `${first}.json`), 'utf8');
    await writeFile(resolve(journalRoot, `${first}.json`), original.replace('field', 'agent'));
    await assert.rejects(reapplyFieldRevocationJournal(restored, journal, checkpoint), /signature mismatch/);
    await writeFile(resolve(journalRoot, `${first}.json`), original);
    await rename(journalRoot, resolve(root, 'missing-journal'));
    await assert.rejects(reapplyFieldRevocationJournal(restored, journal, checkpoint), { code: 'ENOENT' });
    await rename(resolve(root, 'missing-journal'), journalRoot);
    const unmatchedEntry = await journal.append({ organizationId: org, targetKind: 'selection', targetId: selection,
      selectionId: selection, source: 'owner', revocationId: null });
    await assert.rejects(reapplyFieldRevocationJournal(restored, journal, checkpoint), /trusted checkpoint/);
    await rm(resolve(journalRoot, `${unmatchedEntry.id}.json`));
    await assert.rejects(reapplyFieldRevocationJournal(restored, journal, checkpoint.replace('revocation-checkpoint', 'wrong-purpose')), /signature mismatch/);
    await restored.query('create schema ap');
    await assert.rejects(reapplyFieldRevocationJournal(restored, journal, checkpoint), /isolated Field/);
    await restored.query('drop schema ap');
    await restored.query('update field.ap_connections set field_grant_id=$2 where id=$1', [connection, otherSelection]);
    await assert.rejects(reapplyFieldRevocationJournal(restored, journal, checkpoint), /binding mismatch/);
    assert.equal((await restored.query('select count(*)::integer as n from field.revocation_restore_audit')).rows[0].n, 0);
    await restored.query('update field.ap_connections set field_grant_id=$2 where id=$1', [connection, selection]);
    const activeAlias = new URL(source); activeAlias.hostname = 'localhost';
    await assert.rejects(promisify(execFile)(process.execPath, ['--import','tsx','src/revocation-restore-cli.ts','--offline-restored'], {
      env: { ...cliEnv, FIELD_REVOCATION_RESTORE_DATABASE_URL: activeAlias.toString(), FIELD_REVOCATION_RESTORE_CHECKPOINT_FILE: checkpointFile } }),
      (error: unknown) => Boolean(error && typeof error === 'object' && 'stderr' in error && String(error.stderr).includes('must differ from the active')));
    const wrongPort = new URL(restoreUrl); wrongPort.port = '1';
    await assert.rejects(promisify(execFile)(process.execPath, ['--import','tsx','src/revocation-restore-cli.ts','--offline-restored'], {
      env: { ...cliEnv, FIELD_REVOCATION_RESTORE_DATABASE_URL: wrongPort.toString(), FIELD_REVOCATION_RESTORE_CHECKPOINT_FILE: checkpointFile } }),
      (error: unknown) => Boolean(error && typeof error === 'object' && 'stderr' in error && String(error.stderr).includes('local Field mock')));
    const appliedCli = await promisify(execFile)(process.execPath, ['--import','tsx','src/revocation-restore-cli.ts','--offline-restored'], {
      env: { ...cliEnv, FIELD_REVOCATION_RESTORE_DATABASE_URL: restoreUrl.toString(), FIELD_REVOCATION_RESTORE_CHECKPOINT_FILE: checkpointFile } });
    assert.match(appliedCli.stdout, /applied: 4; entries: 4/);
    assert.equal((await reapplyFieldRevocationJournal(restored, journal, checkpoint)).applied, 0);
    for (const id of [connection, incomingConnection]) {
      const state: { status: string; access_token_cipher: Buffer | null; refresh_token_cipher: Buffer | null } =
        (await restored.query('select status,access_token_cipher,refresh_token_cipher from field.ap_connections where id=$1', [id])).rows[0];
      assert.deepEqual(state, { status: 'revoked', access_token_cipher: null, refresh_token_cipher: null });
    }
    assert.equal((await restored.query('select id from field.ap_received_connection_revocations where connection_id=$1', [incomingConnection])).rows[0]?.id, incomingId);
    const pendingRemote = (await restored.query('select id,state,last_error from field.ap_connection_revocations where connection_id=$1', [incomingConnection])).rows[0];
    assert.deepEqual(pendingRemote, { id: pendingRestoreId, state: 'blocked', last_error: 'restore_remote_reconciliation_required' });
    assert.equal((await restoredApp.inject({ method: 'POST', url: remotePath, headers: remoteHeaders })).statusCode, 200);
    assert.equal((await journal.read()).length, 4);
    assert.equal((await restoredApp.inject({ url: '/integrations/v1/me', headers: { authorization: `Bearer ${bearer}` } })).statusCode, 401);
    assert.equal((await restored.query('select count(*)::integer as n from "oauthRefreshToken" where "referenceId"=any($1::text[]) and revoked is null', [[selection, otherSelection]])).rows[0].n, 0);
    assert.equal((await restored.query('select count(*)::integer as n from "oauthConsent" where "referenceId"=any($1::text[])', [[selection, otherSelection]])).rows[0].n, 0);
    await assert.rejects(restored.query("update field.ap_connections set status='review_required',access_token_cipher=$2,refresh_token_cipher=$2 where id=$1", [connection, Buffer.from('late-synthetic-token')]), { code: 'PFR02' });
    await assert.rejects(restored.query('update field.oauth_selections set revoked_at=null where id=$1', [selection]), { code: 'PFR02' });
    const receipt = await restoredApp.inject({ url: `/v1/inquiries/${inquiry.json().id}`, headers: { authorization: `Bearer ${inquiry.json().receiptKey}` } });
    assert.equal(receipt.statusCode, 200); assert.match(receipt.body, /PRESERVED_REVOKE_CUSTOMER|PRESERVED_REVOKE_MESSAGE/);
  } finally {
    await restoredApp?.close(); await restored?.end(); await app.close();
    await admin.query(`drop database if exists "${restoreDb}" with (force)`); await admin.end();
    await pool.query('delete from field.organizations where id=$1', [org]);
    await pool.query('delete from "oauthClient" where "clientId"=$1', [client]);
    await pool.query('delete from "user" where id=any($1::text[])', [[owner, outsider]]);
    await pool.end(); await rm(root, { recursive: true, force: true });
  }
});
