import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, symlink, writeFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createFieldApp } from '../src/app.js';
import { FieldFileMediaStore } from '../src/site-media.js';

process.loadEnvFile(resolve('../../infra/field/.env'));
const pool = new Pool({ connectionString: process.env.FIELD_DATABASE_URL });

test('Field executes only separately approved retention jobs and confirms file absence before removing private originals', async () => {
  const previous = process.env.FIELD_PROFILE; process.env.FIELD_PROFILE = 'mock';
  const root = await mkdtemp(resolve(tmpdir(), 'field-retention-purge-'));
  const media = new FieldFileMediaStore(resolve(root, 'photos'));
  const users = Array.from({ length: 4 }, () => randomUUID());
  const [owner, operator, approver, auditor] = users as [string, string, string, string];
  const app = createFieldApp(async () => undefined, undefined, undefined, { pool, inquiryMedia: media,
    resolveUserId: async headers => typeof headers['x-test-user'] === 'string' ? headers['x-test-user'] : null });
  const headers = (user = operator, key: string = randomUUID()) => ({ 'x-test-user': user, 'idempotency-key': key });
  const post = (url: string, body: Record<string, unknown>, user = operator, key?: string) => app.inject({ method: 'POST', url, headers: headers(user, key), payload: body });
  try {
    for (const user of users) await pool.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)', [user, 'Synthetic purge actor', `${user}@example.invalid`]);
    for (const [user, role] of [[operator, 'operator'], [approver, 'operator'], [auditor, 'auditor']])
      await pool.query('insert into field.platform_admin_memberships(user_id,role) values($1,$2)', [user, role]);
    const madeOrg = await post('/v1/organizations', { name: '합성 정리 검수 조직' }, owner);
    assert.equal(madeOrg.statusCode, 201, madeOrg.body); const org = madeOrg.json().id, service = randomUUID();
    assert.equal((await app.inject({ method: 'PUT', url: '/v1/business/draft', headers: headers(owner), payload: {
      expectedRevision: 0, businessName: '합성 정리 검수 조직', introduction: '', region: '', openingHours: '', contactPhone: '',
      services: [{ id: service, name: '상담', description: '상담', bookingMode: 'request', durationMinutes: 30, priceAmount: null }],
    } })).statusCode, 200);
    await post('/v1/catalog/releases', { expectedRevision: 1 }, owner);
    const made = await app.inject({ method: 'POST', url: `/v1/public/catalog/${org}/inquiries`, payload: {
      serviceId: service, name: 'PRIVATE_PURGE_CUSTOMER', phone: '010-4567-7890', visitRegion: 'PRIVATE_PURGE_REGION', message: 'PRIVATE_PURGE_BODY', consent: true,
    } });
    assert.equal(made.statusCode, 201, made.body); const inquiry = made.json();
    const customerHeaders = { authorization: `Bearer ${inquiry.receiptKey}` };
    const original = (await app.inject({ url: `/v1/inquiries/${inquiry.id}`, headers: customerHeaders })).json();
    const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#245588' } }).png().toBuffer();
    const photo = await app.inject({ method: 'POST', url: `/v1/inquiries/${inquiry.id}/messages/${original.messages[0].id}/attachments`,
      headers: { ...customerHeaders, 'content-type': 'application/octet-stream' }, payload: png });
    assert.equal(photo.statusCode, 201, photo.body);
    const photoId = photo.json().id, key = (await pool.query('select object_key from field.inquiry_attachments where id=$1', [photoId])).rows[0].object_key;
    assert.ok(await media.get(key));
    await post(`/v1/owner/inquiries/${inquiry.id}/close`, { expectedRevision: 0 }, owner);
    await pool.query("update field.inquiries set retention_closed_at=now()-interval '200 days' where id=$1", [inquiry.id]);
    await pool.query("update field.inquiry_messages set created_at=now()-interval '201 days' where inquiry_id=$1", [inquiry.id]);
    await pool.query("update field.inquiry_attachments set created_at=now()-interval '201 days' where inquiry_id=$1", [inquiry.id]);
    const policy = (await post('/v1/admin/retention/policies', { workDays: 180, photoDays: 90, reference: 'SYNTHETIC-PURGE-POLICY', reason: '합성 자료 정리 검수용 기준 요청입니다.' })).json().id;
    await post(`/v1/admin/retention/policies/${policy}/approve`, { reason: '합성 자료에 대한 보존 기준을 승인합니다.' }, approver);
    const preview = (await app.inject({ url: `/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}`, headers: headers(auditor) })).json().items[0];
    assert.equal(preview.reason, 'due');
    const body = { organizationId: org, targetKind: 'inquiry', targetId: inquiry.id, policyId: policy, scope: 'work',
      expectedRevision: preview.revision, expectedAnchorAt: preview.anchorAt, reason: '합성 고객 자료의 실제 정리 검수를 요청합니다.' };
    const jobKey = randomUUID();
    const requested = await post('/v1/admin/retention/jobs', body, operator, jobKey);
    assert.equal(requested.statusCode, 201, requested.body); const job = requested.json().id;
    assert.equal((await post('/v1/admin/retention/jobs', body, operator, jobKey)).json().id, job);
    assert.equal((await post('/v1/admin/retention/jobs', { ...body, scope: 'photos' }, operator, jobKey)).statusCode, 409);
    assert.equal((await post('/v1/admin/retention/jobs', { ...body, organizationId: randomUUID() })).statusCode, 404);
    assert.equal((await post('/v1/admin/retention/jobs', { ...body, expectedRevision: 999 })).statusCode, 409);
    assert.equal((await post('/v1/admin/retention/jobs', body, auditor)).statusCode, 403);
    const approval = { reason: '이 합성 업무의 사진과 개인정보 정리를 승인합니다.' };
    assert.equal((await post(`/v1/admin/retention/jobs/${job}/approve`, approval, operator)).statusCode, 403);
    assert.equal((await post(`/v1/admin/retention/jobs/${job}/approve`, approval, approver)).statusCode, 200);
    const lateAccess = await post('/v1/admin/support-access', { targetKind: 'inquiry', targetId: inquiry.id, purpose: 'security_incident',
      reference: 'SYNTHETIC-LATE-APPROVAL', reason: '합성 업무 정리 중 지원 승인 경합 검수입니다.', minutes: 15, scopes: ['conversation'], minimumNecessary: true });
    assert.equal(lateAccess.statusCode, 201);
    const sourceDatabase = new URL(process.env.FIELD_DATABASE_URL!);
    assert.match(sourceDatabase.pathname, /^\/fieldai_field_test_[a-f0-9]+$/);
    // 별도 임시 DB의 실제 PG17 dump만 사용한다. 원래 mock/운영 DB는 복원하지 않는다.
    const snapshot = await promisify(execFile)('docker', ['exec', 'fieldai-field-mock-db-1', 'pg_dump', '-U', 'field_local',
      '-d', sourceDatabase.pathname.slice(1), '-Fc', '--no-owner', '--no-acl'], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
    const originalPhoto = (await media.get(key))!;
    const purgeModule = await import('../src/retention-purge.js');
    const journalModule = await import('../src/retention-journal.js');
    await mkdir(resolve(root,'journal'));
    const journal = new journalModule.FieldRetentionJournal(resolve(root, 'journal'), 'synthetic-field-journal-secret');
    let failure = true, receiptFailure = true;
    let releaseDeletion!: () => void, enteredDeletion!: () => void;
    const entered = new Promise<void>(resolveEntry => { enteredDeletion = resolveEntry; });
    const continueDeletion = new Promise<void>(resolveContinue => { releaseDeletion = resolveContinue; });
    const runtime = { pool, journal: { read: journal.read.bind(journal), append: async (entry: Parameters<typeof journal.append>[0]) => {
      if (entry.action === 'completed' && receiptFailure) throw new Error('synthetic final receipt failure');
      return journal.append(entry);
    } }, media: { put: media.put.bind(media), get: media.get.bind(media), delete: async (objectKey: string) => {
      if (failure) throw new Error('synthetic file provider failure');
      enteredDeletion(); await continueDeletion; await media.delete(objectKey);
    } } };
    assert.equal(await purgeModule.runFieldRetentionJobOnce(runtime), 'retry');
    assert.ok(await media.get(key));
    assert.equal((await pool.query('select body from field.inquiry_messages where inquiry_id=$1', [inquiry.id])).rows[0].body, 'PRIVATE_PURGE_BODY');
    failure = false;
    await pool.query('update field.work_retention_jobs set next_attempt_at=now() where id=$1', [job]);
    const deleting = purgeModule.runFieldRetentionJobOnce(runtime);
    await entered;
    let approvalSettled = false;
    const concurrentApproval = post(`/v1/admin/support-access/${lateAccess.json().id}/approve`, approval, approver).finally(() => { approvalSettled = true; });
    await new Promise(resolveObservation => setTimeout(resolveObservation, 40));
    const settledBeforeDeletion = approvalSettled;
    releaseDeletion();
    assert.equal(await deleting, 'receipt_pending');
    assert.equal((await concurrentApproval).statusCode, 410);
    assert.equal(settledBeforeDeletion, false);
    const committed = (await pool.query('select state,last_error from field.work_retention_jobs where id=$1', [job])).rows[0];
    assert.equal(committed.state, 'completed'); assert.equal(committed.last_error, 'completion_receipt_pending');
    receiptFailure = false;
    await pool.query('update field.work_retention_jobs set next_attempt_at=now() where id=$1', [job]);
    assert.equal(await purgeModule.runFieldRetentionJobOnce(runtime), 'completed');
    assert.equal(await media.get(key), null);
    const result = await app.inject({ url: `/v1/inquiries/${inquiry.id}`, headers: customerHeaders });
    assert.equal(result.statusCode, 200);
    assert.doesNotMatch(result.body, /PRIVATE_PURGE|010-4567|object_key|sha256/);
    assert.ok(result.json().retention?.workPurgedAt);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/inquiries/${inquiry.id}/messages`, headers: customerHeaders, payload: { body: 'MUST_NOT_REHYDRATE' } })).statusCode, 410);
    const exported = await app.inject({ url: `/v1/owner/inquiries/${inquiry.id}/export`, headers: headers(owner) });
    assert.equal(exported.statusCode, 200); assert.doesNotMatch(exported.body, /PRIVATE_PURGE|010-4567/);
    await assert.rejects(pool.query("update field.inquiries set customer_name='MUST_NOT_REHYDRATE' where id=$1", [inquiry.id]),
      (error: unknown) => (error as { code?: string }).code === 'PFR01');
    await assert.rejects(pool.query("update field.inquiry_messages set body='MUST_NOT_REHYDRATE' where inquiry_id=$1", [inquiry.id]),
      (error: unknown) => (error as { code?: string }).code === 'PFR01');
    await assert.rejects(pool.query("update field.work_retention_jobs set expected_revision=999 where id=$1", [job]),
      (error: unknown) => (error as { code?: string }).code === '23514');
    const support = await post('/v1/admin/support-access', { targetKind: 'inquiry', targetId: inquiry.id,
      purpose: 'security_incident', reference: 'SYNTHETIC-ENDED', reason: '이미 정리된 합성 업무 접근 차단 검수입니다.', minutes: 15, scopes: ['conversation'], minimumNecessary: true });
    assert.equal(support.statusCode, 410);
    assert.equal(await purgeModule.runFieldRetentionJobOnce(runtime), 'empty');
    await assert.rejects(pool.query("update field.retention_journal_receipts set sha256=repeat('0',64)"),{code:'PJR01'});
  await assert.rejects(pool.query('delete from field.retention_journal_receipts'),{code:'PJR01'});
  const ledgerPath=resolve(root,'journal'), ledgerBackup=resolve(root,'journal-backup');
    const lostName=(await readdir(ledgerPath)).find(name=>name.endsWith('.json'))!;
    const lostFile=resolve(ledgerPath,lostName), lostBytes=await readFile(lostFile);
    await rm(lostFile);
    try { await assert.rejects(purgeModule.runFieldRetentionJobOnce(runtime), /journal_continuity/); }
    finally { await writeFile(lostFile,lostBytes); }
    await rename(ledgerPath,ledgerBackup); await mkdir(ledgerPath);
    try { await assert.rejects(purgeModule.runFieldRetentionJobOnce(runtime), /journal_continuity/); }
    finally { await rm(ledgerPath,{recursive:true}); await rename(ledgerBackup,ledgerPath); }
    await rename(ledgerPath,ledgerBackup);
    try { await assert.rejects(journal.append({jobId:job,organizationId:org,targetKind:'inquiry',targetId:inquiry.id,scope:'work',action:'completed'}),{code:'ENOENT'}); }
    finally { await rename(ledgerBackup,ledgerPath); }

    const queue = await app.inject({ url: '/v1/admin/retention/jobs', headers: headers(auditor) });
    assert.equal(queue.statusCode, 200); assert.match(queue.body, /completed/); assert.doesNotMatch(queue.body, /PRIVATE_PURGE|object_key|sha256/);
    const proof = await journal.read(); assert.ok(proof.length); assert.equal(proof[0]!.product, 'field');
    const checkpoint = await journal.checkpoint();
    assert.ok(proof.some(p => p.action === 'file_prepared')); assert.ok(proof.some(p => p.action === 'purge_prepared'));
    await mkdir(resolve(root,'unconfirmed-journal'));
    const uncertainJournal = new journalModule.FieldRetentionJournal(resolve(root, 'unconfirmed-journal'), 'synthetic-field-journal-secret');
    await uncertainJournal.append({ jobId: randomUUID(), organizationId: org, targetKind: 'inquiry', targetId: inquiry.id,
      scope: 'photos', action: 'file_prepared', attachmentId: photoId, objectKey: key });
    const tampered = await uncertainJournal.append({ jobId: randomUUID(), organizationId: org, targetKind: 'inquiry', targetId: inquiry.id, scope: 'work', action: 'purge_prepared' });
    const restoreDatabase = `fieldai_field_restore_${randomUUID().replaceAll('-', '')}`;
    const adminUrl = new URL(sourceDatabase); adminUrl.pathname = '/postgres';
    const admin = new Pool({ connectionString: adminUrl.toString() });
    let restored: Pool | undefined;
    try {
      await admin.query(`create database "${restoreDatabase}"`);
      await new Promise<void>((resolveRestore, reject) => {
        const child = spawn('docker', ['exec', '-i', 'fieldai-field-mock-db-1', 'pg_restore', '-U', 'field_local', '-d', restoreDatabase,
          '--exit-on-error', '--no-owner', '--no-acl'], { stdio: ['pipe','ignore','pipe'] });
        let error = ''; child.stderr.on('data', chunk => { error += String(chunk); });
        child.once('error', reject); child.once('close', code => code === 0 ? resolveRestore() : reject(new Error(error)));
        child.stdin.end(snapshot.stdout);
      });
      const restoreUrl = new URL(sourceDatabase); restoreUrl.pathname = `/${restoreDatabase}`;
      restored = new Pool({ connectionString: restoreUrl.toString() });
      assert.equal((await restored.query('select customer_name from field.inquiries where id=$1', [inquiry.id])).rows[0].customer_name, 'PRIVATE_PURGE_CUSTOMER');
      const restoreMedia = new FieldFileMediaStore(resolve(root, 'restored-photos'));
      await restoreMedia.put(key, originalPhoto);
      const recovery = await import('../src/retention-restore.js');
      await assert.rejects(recovery.reapplyFieldRetentionJournal({ pool: restored, media: restoreMedia, journal: uncertainJournal,
        checkpoint: await uncertainJournal.checkpoint() }), /retention_file_intent_unconfirmed/);
      assert.ok(await restoreMedia.get(key));
      const missingJournal = new journalModule.FieldRetentionJournal(resolve(root, 'missing-journal'), 'synthetic-field-journal-secret');
      await assert.rejects(recovery.reapplyFieldRetentionJournal({ pool: restored, media: restoreMedia, journal: missingJournal, checkpoint }), /ENOENT|checkpoint/);
      assert.ok(await restoreMedia.get(key));
      assert.equal((await restored.query('select customer_name from field.inquiries where id=$1', [inquiry.id])).rows[0].customer_name, 'PRIVATE_PURGE_CUSTOMER');
      const journalRoot = resolve(root,'journal'), removed = proof[0]!.id;
      await rename(resolve(journalRoot,`${removed}.json`), resolve(root,'removed-deletion-entry'));
      await assert.rejects(recovery.reapplyFieldRetentionJournal({ pool: restored, media: restoreMedia, journal, checkpoint }), /trusted checkpoint/);
      assert.ok(await restoreMedia.get(key));
      assert.equal((await restored.query('select customer_name from field.inquiries where id=$1', [inquiry.id])).rows[0].customer_name, 'PRIVATE_PURGE_CUSTOMER');
      await rename(resolve(root,'removed-deletion-entry'), resolve(journalRoot,`${removed}.json`));
      const unmatched = await journal.append({ jobId: randomUUID(), organizationId: org, targetKind: 'inquiry', targetId: inquiry.id, scope: 'work', action: 'purge_prepared' });
      await assert.rejects(recovery.reapplyFieldRetentionJournal({ pool: restored, media: restoreMedia, journal, checkpoint }), /trusted checkpoint/);
      await rm(resolve(journalRoot,`${unmatched.id}.json`));
      await assert.rejects(recovery.reapplyFieldRetentionJournal({ pool: restored, media: restoreMedia, journal,
        checkpoint: checkpoint.replace('retention-checkpoint','revocation-checkpoint') }), /signature mismatch/);
      const checkpointFile = resolve(root,'trusted-retention-checkpoint');
      const cliEnv = { ...process.env, FIELD_PROFILE: 'mock', FIELD_RETENTION_JOURNAL_DIRECTORY: journalRoot,
        FIELD_RETENTION_JOURNAL_SECRET: 'synthetic-field-journal-secret', FIELD_RETENTION_CHECKPOINT_OUTPUT: checkpointFile,
        FIELD_RETENTION_RESTORE_CHECKPOINT_FILE: checkpointFile, FIELD_RETENTION_RESTORE_DATABASE_URL: restoreUrl.toString(),
        FIELD_INQUIRY_MEDIA_DIRECTORY: resolve(root,'photos'), FIELD_RETENTION_RESTORE_MEDIA_DIRECTORY: resolve(root,'restored-photos') };
      await promisify(execFile)(process.execPath, ['--import','tsx','src/retention-checkpoint-cli.ts','--quiesced'], { env: cliEnv });
      assert.equal((await journal.verifiedEntries(await readFile(checkpointFile,'utf8'))).length, proof.length);
      const deniedCli = (script: string, flag: string, overrides: Record<string,string>, message: string) =>
        assert.rejects(promisify(execFile)(process.execPath, ['--import','tsx',`src/${script}`,flag], { env: { ...cliEnv, ...overrides } }),
          (error: unknown) => Boolean(error && typeof error === 'object' && 'stderr' in error && String(error.stderr).includes(message)));
      const activeAlias = new URL(sourceDatabase); activeAlias.hostname='localhost';
      await deniedCli('retention-restore-cli.ts','--offline-restored', { FIELD_RETENTION_RESTORE_DATABASE_URL: activeAlias.toString() }, 'must differ from the active Field database');
      const wrongPort = new URL(restoreUrl); wrongPort.port='1';
      await deniedCli('retention-restore-cli.ts','--offline-restored', { FIELD_RETENTION_RESTORE_DATABASE_URL: wrongPort.toString() }, 'local Field mock');
      await symlink(resolve(root,'photos'), resolve(root,'active-media-alias'));
      await deniedCli('retention-restore-cli.ts','--offline-restored', { FIELD_RETENTION_RESTORE_MEDIA_DIRECTORY: resolve(root,'active-media-alias') }, 'must differ from the active Field private media');
      await deniedCli('retention-checkpoint-cli.ts','--quiesced', { FIELD_RETENTION_CHECKPOINT_OUTPUT: resolve(journalRoot,'invalid-checkpoint') }, 'outside the retention journal');
      assert.ok(await restoreMedia.get(key));
      const applyCli = await promisify(execFile)(process.execPath, ['--import','tsx','src/retention-restore-cli.ts','--offline-restored'], { env: cliEnv });
      assert.match(applyCli.stdout,/Field restored deletion journal applied: [1-9]/);
      assert.equal(await restoreMedia.get(key), null);
      assert.equal((await restored.query('select customer_name,customer_phone from field.inquiries where id=$1', [inquiry.id])).rows[0].customer_phone, '');
      assert.equal((await restored.query('select body from field.inquiry_messages where inquiry_id=$1', [inquiry.id])).rows[0].body, '[보존 기간 종료]');
      assert.ok((await restored.query('select retention_work_purged_at from field.inquiries where id=$1', [inquiry.id])).rows[0].retention_work_purged_at);
      assert.equal((await recovery.reapplyFieldRetentionJournal({ pool: restored, media: restoreMedia, journal, checkpoint })).applied, 0);
      await assert.rejects(restored.query("update field.inquiries set customer_name='RESTORED_PRIVATE_DATA' where id=$1", [inquiry.id]),
        (error: unknown) => (error as { code?: string }).code === 'PFR01');
      await writeFile(resolve(root, 'unconfirmed-journal', `${tampered.id}.json`), JSON.stringify({ data: JSON.stringify({ ...tampered, product: 'agent' }), signature: 'f'.repeat(64) }));
      await assert.rejects(uncertainJournal.read(), /signature mismatch/);
    } finally {
      await restored?.end();
      await admin.query(`drop database if exists "${restoreDatabase}"`); await admin.end();
    }
    const requestTarget = async (kind: string, id: string, scope = 'work') => {
      const candidate = (await app.inject({ url: `/v1/admin/retention/preview?organizationId=${org}&policyId=${policy}`, headers: headers(auditor) })).json().items
        .find((row: { targetKind: string; targetId: string }) => row.targetKind === kind && row.targetId === id);
      assert.equal(candidate.reason, 'due');
      const made = await post('/v1/admin/retention/jobs', { ...body, targetKind: kind, targetId: id, scope, expectedRevision: candidate.revision, expectedAnchorAt: candidate.anchorAt });
      assert.equal(made.statusCode, 201, made.body);
      assert.equal((await post(`/v1/admin/retention/jobs/${made.json().id}/approve`, approval, approver)).statusCode, 200);
      return made.json().id as string;
    };
    const reservation = randomUUID(), reservationKey = randomBytes(32).toString('base64url');
    const serviceSnapshot = JSON.stringify({ id: service, name: '상담', description: '상담', bookingMode: 'request', durationMinutes: 30, priceAmount: null });
    await pool.query(`insert into field.reservations(id,organization_id,catalog_revision,service_id,service_snapshot,booking_mode,customer_name,customer_phone,
      visitor_key_hash,timezone,state,consent_at,preferred_time_text,request_message,visit_region)
      values($1,$2,1,$3,$4::jsonb,'request','PRIVATE_RESERVATION','010-4567-7891',$5,'Asia/Seoul','requested',now(),'PRIVATE_TIME','PRIVATE_REQUEST','PRIVATE_REGION')`,
    [reservation, org, service, serviceSnapshot, createHash('sha256').update(reservationKey).digest('hex')]);
    await pool.query("update field.reservations set state='canceled',revision=1 where id=$1", [reservation]);
    await pool.query("update field.reservations set retention_closed_at=now()-interval '200 days' where id=$1", [reservation]);
    const event = randomUUID();
    await pool.query(`insert into field.reservation_events(id,reservation_id,organization_id,revision,actor_type,actor_user_id,event_type,previous_state,next_state,detail)
      values($1,$2,$3,1,'owner',$4,'canceled','requested','canceled','{"reason":"PRIVATE_EVENT_REASON"}')`, [event, reservation, org, owner]);
    await pool.query(`insert into field.occupancies(id,organization_id,reservation_id,source,label,occupied,created_by)
      values($1,$2,$3,'reservation','PRIVATE_OCCUPANCY',tstzrange(now()-interval '201 days',now()-interval '201 days'+interval '30 minutes','[)'),$4)`,
    [randomUUID(), org, reservation, owner]);
    await requestTarget('reservation', reservation);
    assert.equal(await purgeModule.runFieldRetentionJobOnce({ pool, media, journal }), 'completed');
    const reservationReceipt = await app.inject({ url: `/v1/reservations/${reservation}`, headers: { authorization: `Bearer ${reservationKey}` } });
    assert.equal(reservationReceipt.statusCode, 200, reservationReceipt.body); assert.doesNotMatch(reservationReceipt.body, /PRIVATE_|010-4567/);
    assert.equal((await pool.query('select label from field.occupancies where reservation_id=$1', [reservation])).rows[0].label, null);
    assert.equal((await pool.query('select id,detail from field.reservation_events where id=$1', [event])).rows[0].id, event);
    await assert.rejects(pool.query("update field.reservation_events set detail='{\"reason\":\"PRIVATE_RESTORED\"}' where id=$1", [event]),
      (error: unknown) => (error as { code?: string }).code === 'PFR01');
    const connection = randomUUID(), external = randomUUID();
    await pool.query(`insert into field.ap_connections(id,organization_id,initiator_user_id,ap_issuer,ap_client_id,ap_grant_id,ap_organization_id,ap_agent_id,ap_agent_name,
      ap_agent_revision,allowed_deployment_ids,scopes,access_token_cipher,refresh_token_cipher,access_expires_at,status)
      values($1,$2,$3,'https://ap.example.invalid/api/auth','synthetic-purge',$4,$5,$6,'Synthetic AI',1,'{}','{}',$7,$7,now(),'revoked')`,
    [connection, org, owner, randomUUID(), randomUUID(), randomUUID(), Buffer.from('synthetic-unusable')]);
    await pool.query(`insert into field.external_work_requests(id,organization_id,provider,connection_id,client_id,field_grant_id,action_request_id,body_hash,origin_conversation_id,
      source_deployment_id,kind,service_id,catalog_revision,policy_revision,service_snapshot,customer_snapshot,request_snapshot,summary,consent_record_id,consent_confirmed_at,conditions_hash,is_test,status)
      values($1,$2,'agent-platform',$3,'synthetic',$4,$5,$6,$7,$8,'inquiry',$9,1,1,$10::jsonb,'{"name":"PRIVATE_EXTERNAL","phone":"010-4567-7892"}',
      '{"message":"PRIVATE_EXTERNAL_REQUEST"}','PRIVATE_EXTERNAL_SUMMARY',$11,now(),$6,true,'requested')`,
    [external, org, connection, randomUUID(), randomUUID(), 'c'.repeat(64), randomUUID(), randomUUID(), service, serviceSnapshot, randomUUID()]);
    assert.equal((await post(`/v1/owner/external-requests/${external}/close`, { expectedRevision: 0 }, owner)).statusCode, 200);
    await pool.query("update field.external_work_requests set retention_closed_at=now()-interval '200 days',received_at=now()-interval '201 days' where id=$1", [external]);
    await requestTarget('external_request', external);
    assert.equal(await purgeModule.runFieldRetentionJobOnce({ pool, media, journal }), 'completed');
    const externalView = await app.inject({ url: `/v1/owner/external-requests/${external}`, headers: headers(owner) });
    assert.equal(externalView.statusCode, 200); assert.doesNotMatch(externalView.body, /PRIVATE_|010-4567/); assert.ok(externalView.json().retention.workPurgedAt);
    await assert.rejects(pool.query(`insert into field.ap_reply_drafts(id,external_request_id,organization_id,actor_user_id,submission_key,request_hmac,body_cipher,expected_revision,state)
      values($1,$2,$3,$4,$5,$6,$7,0,'pending')`, [randomUUID(), external, org, owner, randomBytes(32).toString('base64url'), 'd'.repeat(64), Buffer.from('PRIVATE_LATE_REPLY')]),
    (error: unknown) => (error as { code?: string }).code === 'PFR01');
    const photoOnly = randomUUID(), oldMessage = randomUUID(), oldPhoto = randomUUID(), photoKey = `${org}/${oldPhoto}.webp`;
    await pool.query(`insert into field.inquiries(id,organization_id,catalog_revision,service_id,service_snapshot,customer_name,customer_phone,visitor_key_hash,state,consent_at)
      values($1,$2,1,$3,$4::jsonb,'PRIVATE_PHOTO_ONLY','010-4567-7893',$5,'needs_owner',now())`, [photoOnly, org, service, serviceSnapshot, randomUUID()]);
    await pool.query("update field.inquiries set state='closed',revision=1 where id=$1", [photoOnly]);
    await pool.query("update field.inquiries set retention_closed_at=now()-interval '200 days' where id=$1", [photoOnly]);
    await pool.query(`insert into field.inquiry_messages(id,inquiry_id,sender,body,delivery_state,created_at)
      values($1,$2,'customer','PRIVATE_PHOTO_ONLY_BODY','pending',now()-interval '201 days')`, [oldMessage, photoOnly]);
    await media.put(photoKey, originalPhoto);
    await pool.query(`insert into field.inquiry_attachments(id,organization_id,inquiry_id,message_id,object_key,content_type,byte_size,width,height,sha256,created_at)
      values($1,$2,$3,$4,$5,'image/webp',$6,3,2,$7,now()-interval '201 days')`,
    [oldPhoto, org, photoOnly, oldMessage, photoKey, originalPhoto.length, createHash('sha256').update(originalPhoto).digest('hex')]);
    await requestTarget('inquiry', photoOnly, 'photos');
    assert.equal(await purgeModule.runFieldRetentionJobOnce({ pool, media, journal }), 'completed');
    assert.equal(await media.get(photoKey), null);
    assert.equal((await pool.query('select body from field.inquiry_messages where inquiry_id=$1', [photoOnly])).rows[0].body, 'PRIVATE_PHOTO_ONLY_BODY');
    const photosEnded = (await pool.query('select retention_work_purged_at,retention_photos_purged_at from field.inquiries where id=$1', [photoOnly])).rows[0];
    assert.equal(photosEnded.retention_work_purged_at, null); assert.ok(photosEnded.retention_photos_purged_at);
    await assert.rejects(pool.query("update field.inquiry_attachments set state='ready',purged_at=null,object_key=$2,sha256=$3,byte_size=$4,width=3,height=2 where id=$1",
      [oldPhoto, photoKey, createHash('sha256').update(originalPhoto).digest('hex'), originalPhoto.length]),
    (error: unknown) => (error as { code?: string }).code === 'PFR01');
    const blockedJob = await requestTarget('inquiry', photoOnly);
    const newHold = await post('/v1/admin/retention/holds', { organizationId: org, targetKind: 'inquiry', targetId: photoOnly, reasonCode: 'dispute',
      reason: '합성 정리 승인 뒤 새 분쟁 보류를 검수합니다.', reference: 'SYNTHETIC-POST-APPROVAL-HOLD', reviewDueAt: new Date(Date.now()+86400000).toISOString() });
    assert.equal(newHold.statusCode, 201);
    assert.equal(await purgeModule.runFieldRetentionJobOnce({ pool, media, journal }), 'blocked');
    assert.equal((await pool.query('select state,last_error from field.work_retention_jobs where id=$1', [blockedJob])).rows[0].last_error, 'active_hold');
    assert.equal((await pool.query('select customer_name from field.inquiries where id=$1', [photoOnly])).rows[0].customer_name, 'PRIVATE_PHOTO_ONLY');
    const worker = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'src/retention-purge-worker.ts', '--once'], {
      env: { PATH: process.env.PATH, FIELD_PROFILE: 'mock', FIELD_DATABASE_URL: process.env.FIELD_DATABASE_URL,
        FIELD_INQUIRY_MEDIA_DIRECTORY: resolve(root, 'photos'), FIELD_RETENTION_JOURNAL_DIRECTORY: resolve(root, 'journal'),
        FIELD_RETENTION_JOURNAL_SECRET: 'synthetic-field-journal-secret' }, timeout: 10000,
    });
    assert.match(worker.stdout, /field retention worker ready/); assert.match(worker.stdout, /empty/);
    await assert.rejects(promisify(execFile)(process.execPath, ['--import','tsx','src/retention-purge-worker.ts','--once'], {
      env:{PATH:process.env.PATH,FIELD_PROFILE:'mock',FIELD_DATABASE_URL:process.env.FIELD_DATABASE_URL,
        FIELD_INQUIRY_MEDIA_DIRECTORY:resolve(root,'photos'),FIELD_RETENTION_JOURNAL_DIRECTORY:resolve(root,'missing-startup-journal'),
        FIELD_RETENTION_JOURNAL_SECRET:'synthetic-field-journal-secret'},timeout:10000,
    }),/ENOENT/);

  } finally {
    process.env.FIELD_PROFILE = previous; await app.close();
    await pool.query('delete from field.organizations where owner_user_id=any($1::text[])', [users]);
    await pool.query('delete from field.work_retention_policies where requested_by=any($1::text[])', [users]);
    await pool.query('delete from "user" where id=any($1::text[])', [users]); await pool.end();
    await rm(root, { recursive: true, force: true });
  }
});
